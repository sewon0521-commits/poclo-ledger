import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Sparkles, ListTodo, Megaphone, CalendarDays, AlertTriangle, TrendingUp } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { dayKey, PEOPLE, loadJournal, routinesOn } from "../lib/journal";
import { SPANS, rangeOf, rangeLabel, vsLabel, spanStats, productRows, adCountsIn, addDays } from "../lib/reportPeriod";
import { won } from "../lib/sales";
import { dayTitle } from "../lib/journal";
import { MarketBrief, AdsBrief } from "./ReportMarket";

/**
 * 보고 › 매일 보고 (2026-10-19, 위키 topics/보고-체계-설계.md).
 * 사무실 PC 가 아침 8시 30분에 poclo-cafe24/daily_report.py 로 만든다 → settings 'report_<날짜>' + 목록 'reports'.
 * 쇼만마 주간 보고 항목(매출·주문·광고비·광고비율·ROAS·CPC·상품별 광고 기여·소재)을 매일, 우리 숫자로.
 * 10/19 저녁: 숫자 격자·상품 표는 기간을 바꿔 본다(하루·7일·한 달·3개월·6개월·직접 — lib/reportPeriod.js),
 * 광고 수는 '전체(만든 것) · 지금 켜짐 · 이 기간에 만든 것'으로 나눠 보여 준다.
 */

const pct = (v, d = 1) => (v == null ? "—" : `${Number(v).toFixed(d)}%`);
const change = (a, b) => (a == null || !b ? null : (a - b) / b);

/** 큰 숫자 — 쇼만마처럼 만 단위로 짧게(204만 · 1.2만), 단위는 작게 */
const man = (v) => {
  if (v == null || !Number.isFinite(v)) return ["—", ""];
  const a = Math.abs(v);
  if (a >= 1e5) return [String(Math.round(v / 1e4)).replace(/\B(?=(\d{3})+(?!\d))/g, ","), "만원"];
  if (a >= 1e4) return [(v / 1e4).toFixed(1).replace(/\.0$/, ""), "만원"];
  return [won(v), "원"];
};
const ratio = (a, b) => (b ? a / b : null);

/** 지난 7일 대비 한 줄 — 좋아진 쪽이 초록 */
function Vs({ now, prev, good = "up", vs = "vs 지난 7일" }) {
  const c = change(now, prev);
  if (c == null || !Number.isFinite(c)) return <div className="text-[11px] text-stone-300">— {vs}</div>;
  const up = c >= 0;
  const ok = good === "up" ? up : !up;
  return (
    <div className={"font-mono text-[11px] " + (ok ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {(c * 100).toFixed(1)}% <span className="font-sans text-stone-400">{vs}</span>
    </div>
  );
}

function Kpi({ label, value, unit, sub, now, prev, good, mark, vs }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-stone-200 px-4 py-4 sm:border-r [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <span className="pt-1 text-sm font-bold text-stone-900">{label}</span>
        <span className="text-right tabular-nums">
          <b className="text-[28px] font-bold leading-none tracking-tight text-stone-900">{value}</b>
          {unit && <span className="ml-0.5 text-xs text-stone-500">{unit}</span>}
        </span>
      </div>
      <div className="min-h-[18px] text-xs text-stone-500 tabular-nums">{mark || sub}</div>
      <Vs now={now} prev={prev} good={good} vs={vs} />
    </div>
  );
}

/** '지금 켜짐 N개' — 누르면 켜진 광고 이름 (사무실 PC ads_live.py 가 1시간마다 settings meta_ads 를 새로 쓴다) */
function ActiveAds({ counts }) {
  const [open, setOpen] = useState(false);
  const list = counts.list || [];
  return (
    <span className="relative">
      <button type="button" disabled={!list.length} onClick={() => setOpen(!open)} className="rounded px-0.5 hover:bg-stone-100 disabled:hover:bg-transparent">
        지금 켜짐 <b className={counts.active ? "text-emerald-700" : "text-stone-900"}>{counts.active}개</b>
        {list.length > 0 && <ChevronDown size={11} className={"ml-0.5 inline align-[-1px] " + (open ? "rotate-180" : "")} />}
      </button>
      {open && (
        <span className="absolute top-full left-0 z-20 mt-1 block w-[min(26rem,80vw)] rounded-xl border border-stone-200 bg-white p-2 text-left shadow-lg">
          {list.map((a) => (
            <span key={a.name} className="block truncate rounded px-1.5 py-1 text-[11px] text-stone-700 hover:bg-stone-50" title={a.name}>
              <b className="mr-1 text-emerald-700">{a.code}</b>
              {a.name}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** 쇼만마 주간 보고 카드 12칸 — 고른 기간, 바로 앞 같은 길이 대비 */
function KpiGrid({ w, pw, target, title = "최근 7일", vs, picker, counts, note }) {
  const rows = [
    // [이름, 값, 단위?, 보조, 지금, 지난, 좋은 쪽]
    ["매출", ...man(w.revenue), `순매출 ${man((w.revenue || 0) - (w.refund || 0)).join("")}`, w.revenue, pw.revenue, "up"],
    ["CPA", ...man(ratio(w.adsOrd ?? w.ads, w.orders)), `주문수 ${w.orders || 0}건`, ratio(w.adsOrd ?? w.ads, w.orders), ratio(pw.adsOrd ?? pw.ads, pw.orders), "down"],
    ["ROAS", ratio(w.revenue, w.ads)?.toFixed(2) ?? "—", "x", "총매출 ÷ 광고비", ratio(w.revenue, w.ads), ratio(pw.revenue, pw.ads), "up"],
    ["객단가", ...man(ratio(w.revOrd ?? w.revenue, w.orders)), "매출 ÷ 주문수", ratio(w.revOrd ?? w.revenue, w.orders), ratio(pw.revOrd ?? pw.revenue, pw.orders), "up"],
    ["환불", ...man(w.refund), w.revenue ? `매출 대비 ${pct(((w.refund || 0) / w.revenue) * 100)}` : "", w.refund, pw.refund, "down"],
    ["광고 CPA", ...man(ratio(w.metaSpend, w.metaPurchases)), `광고구매수 ${w.metaPurchases ?? 0}건`, ratio(w.metaSpend, w.metaPurchases), ratio(pw.metaSpend, pw.metaPurchases), "down"],
    ["광고 ROAS", ratio(w.metaValue, w.metaSpend)?.toFixed(2) ?? "—", "x", `광고매출 ${man(w.metaValue).join("")}`, ratio(w.metaValue, w.metaSpend), ratio(pw.metaValue, pw.metaSpend), "up"],
    ["광고 객단가", ...man(ratio(w.metaValue, w.metaPurchases)), "광고매출 ÷ 광고구매수", ratio(w.metaValue, w.metaPurchases), ratio(pw.metaValue, pw.metaPurchases), "up"],
    ["광고비", ...man(w.ads), null, w.ads, pw.ads, "down"],
    ["광고 CPA · 1일 클릭", ...man(ratio(w.metaSpend, w.metaPurchases1d)), `1일 클릭 구매수 ${w.metaPurchases1d ?? 0}건`, ratio(w.metaSpend, w.metaPurchases1d), ratio(pw.metaSpend, pw.metaPurchases1d), "down"],
    ["광고 ROAS · 1일 클릭", ratio(w.metaValue1d, w.metaSpend)?.toFixed(2) ?? "—", "x", `1일 클릭 광고매출 ${man(w.metaValue1d).join("")}`, ratio(w.metaValue1d, w.metaSpend), ratio(pw.metaValue1d, pw.metaSpend), "up"],
    ["광고 객단가 · 1일 클릭", ...man(ratio(w.metaValue1d, w.metaPurchases1d)), "", ratio(w.metaValue1d, w.metaPurchases1d), ratio(pw.metaValue1d, pw.metaPurchases1d), "up"],
  ];
  const over = w.adRate != null && w.adRate > target;
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="space-y-2 border-b-2 border-stone-900 px-4 pt-3.5 pb-2.5">
        {picker}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-stone-900">{title}</h3>
          <span className="text-[11px] text-stone-400">광고 숫자는 메타 기준(7일 클릭) · 1일 클릭은 광고를 누르고 하루 안에 산 것만</span>
        </div>
        {counts && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-600 tabular-nums">
            <span>
              광고 <b className="text-stone-900">전체 {counts.total}개</b>
            </span>
            <ActiveAds counts={counts} />
            <span>
              이 기간에 만든 것 <b className="text-stone-900">{counts.made}개</b>
            </span>
            {counts.at && <span className="text-stone-400">켜짐은 {counts.at.slice(5, 10).replace("-", "/")} {counts.at.slice(11, 16)} 기준 · 1시간마다 새로</span>}
          </p>
        )}
        {note && <p className="text-[11px] text-stone-400">{note}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value, unit, sub, now, prev, good]) => (
          <Kpi
            key={label}
            label={label}
            value={value}
            unit={unit}
            sub={sub}
            now={now}
            prev={prev}
            good={good}
            vs={vs}
            mark={
              label === "광고비" ? (
                <span className={"rounded px-1.5 py-0.5 font-semibold " + (over ? "bg-amber-200 text-amber-950" : "bg-emerald-100 text-emerald-800")}>
                  매출 대비 {pct(w.adRate)} · 목표 {target}%
                </span>
              ) : null
            }
          />
        ))}
      </div>
    </section>
  );
}

function Box({ icon: Icon, title, right, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Icon size={15} className="text-rose-700" /> {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Trend({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <div className="flex h-28 items-end gap-1">
      {rows.map((r) => (
        <div key={r.date} className="flex h-full flex-1 flex-col items-center gap-0.5" title={`${r.date.slice(5)} · 매출 ${won(r.revenue)}원 · 광고 ${won(r.ads)}원`}>
          <div className="flex w-full flex-1 items-end">
            <div className="relative w-full overflow-hidden rounded-t bg-stone-200" style={{ height: `${Math.max(2, (r.revenue / max) * 100)}%` }}>
              <div className="absolute inset-x-0 bottom-0 bg-rose-600/80" style={{ height: `${r.revenue ? Math.min(100, (r.ads / r.revenue) * 100) : r.ads ? 100 : 0}%` }} />
            </div>
          </div>
          <span className="text-[9px] text-stone-400 tabular-nums">{Number(r.date.slice(8))}</span>
        </div>
      ))}
    </div>
  );
}

const KIND_TONE = {
  "광고 구매": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "광고 추천": "bg-rose-700 text-white ring-rose-700",
  "광고 비효율": "bg-amber-50 text-amber-800 ring-amber-200",
};

/** 쇼만마 '상품별 광고 기여(AD-ORDER PRODUCT MATCH)' — 유형 · 상품 · 광고비 · 광고 구매 비율 · 광고 구매(1일) · 판매 · 광고 수
 *  줄 = lib/reportPeriod.productRows 모양 {code, name, image, q, spend, value, pu, pu1, adsTotal, adsActive, adsMade, kind, top} */
function ProductTable({ rows, waste, title }) {
  const [n, setN] = useState(15);
  const shown = rows.slice(0, n);
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 px-4 pt-3.5 pb-2.5">
        <h3 className="text-sm font-bold text-stone-900">상품별 광고 기여 · {title}</h3>
        <span className="text-[11px] text-stone-400">광고 이름의 상품명으로 이어요 · 광고 구매 비율 = 광고로 산 건수 ÷ 판매 장수(대략)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] font-semibold text-stone-500">
              <th className="px-4 py-2 font-semibold">유형</th>
              <th className="px-2 py-2 font-semibold">상품</th>
              <th className="px-2 py-2 text-right font-semibold">광고비</th>
              <th className="px-2 py-2 text-right font-semibold">광고 구매 비율</th>
              <th className="px-2 py-2 text-right font-semibold">광고 구매 (1일 클릭)</th>
              <th className="px-2 py-2 text-right font-semibold">판매</th>
              <th className="px-4 py-2 text-right font-semibold">
                광고 수<span className="block font-normal text-stone-400">켜짐 / 전체</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 tabular-nums">
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-stone-400">
                  이 기간에 팔린 상품·광고가 없어요.
                </td>
              </tr>
            )}
            {shown.map((p) => {
              // 광고 구매가 판매 장수보다 많을 수 있다(광고를 누르고 다른 상품을 같이 산 것) — 100% 넘으면 '100%+'
              const raw = p.q ? ((p.pu || 0) / p.q) * 100 : 0;
              const share = Math.min(100, Math.round(raw));
              return (
                <tr key={p.code} className="hover:bg-stone-50/70">
                  <td className="px-4 py-2.5 align-middle">
                    <div className="flex flex-col items-start gap-1">
                      {p.top && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200">판매 상위</span>}
                      {p.kind && <span className={"rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 " + (KIND_TONE[p.kind] || "")}>{p.kind}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100">{p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium text-stone-900">{p.name}</span>
                        {!p.q && !p.image && <span className="text-[11px] text-stone-400">광고 이름으로만 알아요</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-stone-900">{p.spend ? man(p.spend).join("") : <span className="text-stone-300">0</span>}</td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="ml-auto flex w-24 items-center justify-end gap-1.5">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-100">
                        <span className="block h-full rounded-full bg-rose-600" style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-10 text-right text-stone-700" title={raw > 100 ? "광고를 누르고 다른 상품을 같이 산 것도 들어가서 100%를 넘어요" : undefined}>
                        {raw > 100 ? "100%+" : `${share}%`}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-stone-700">
                    {p.pu ? (
                      <>
                        {p.pu}건 <span className="text-stone-400">({p.pu1 ?? 0})</span>
                        <span className="block text-[11px] text-stone-400">{man(p.value).join("")}</span>
                      </>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-stone-900">{p.q}장</td>
                  <td className="px-4 py-2.5 text-right text-stone-500">
                    {p.adsTotal ? (
                      <>
                        <b className={p.adsActive ? "text-emerald-700" : "text-stone-400"}>{p.adsActive}</b> / {p.adsTotal}
                        {p.adsMade > 0 && <span className="block text-[11px] text-stone-400">이 기간 {p.adsMade}개 만듦</span>}
                      </>
                    ) : (
                      <span className="text-stone-300">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > n && (
        <button type="button" onClick={() => setN(n + 20)} className="w-full border-t border-stone-100 py-2 text-xs text-stone-500 hover:text-rose-700">
          {rows.length - n}개 더 보기
        </button>
      )}
      {waste.length > 0 && (
        <p className="border-t border-stone-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-900">
          1만 원 넘게 썼는데 광고 구매 0: {waste.map((x) => `${x.name || x.code} ${won(x.spend)}원`).join(" · ")}
        </p>
      )}
    </section>
  );
}

/** 하루 단위 기록이 아직 없을 때 — 아침 보고에 담긴 7일 상품 표를 같은 모양으로 */
function fromReport(products) {
  const list = products || [];
  const top = new Set([...list].sort((a, b) => b.q7 - a.q7).slice(0, 5).map((p) => p.code));
  return list.map((p) => ({
    code: p.code,
    name: p.name,
    image: p.image,
    q: p.q7 || 0,
    spend: p.adSpend7 || 0,
    value: p.adValue7 || 0,
    pu: p.adPurchases7 || 0,
    pu1: p.adPurchases1d7 || 0,
    adsTotal: p.adsTotal ?? p.adCount ?? 0,
    adsActive: p.adsActive ?? 0,
    adsMade: 0,
    kind: p.kind,
    top: top.has(p.code),
  }));
}

const SPAN_KEY = "poclo_report_span";
const readSpan = () => {
  try {
    return localStorage.getItem(SPAN_KEY) || "7";
  } catch {
    return "7";
  }
};

function SpanPicker({ spanId, setSpanId, custom, setCustom, end }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 overflow-x-auto rounded-full bg-stone-100 p-0.5 [scrollbar-width:none]">
        {SPANS.map((x) => (
          <button key={x.id} type="button" onClick={() => setSpanId(x.id)} className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (spanId === x.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
            {x.label}
          </button>
        ))}
      </div>
      {spanId === "custom" && (
        <span className="flex items-center gap-1 text-xs text-stone-500">
          <input type="date" value={custom.start} max={end} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800" />
          ~
          <input type="date" value={custom.end} max={end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800" />
        </span>
      )}
    </div>
  );
}

function AdList({ list, empty }) {
  if (!list?.length) return <p className="text-xs text-stone-400">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {list.map((a) => (
        <li key={a.name} className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
          <div className="truncate font-medium text-stone-800" title={a.name}>
            {a.name}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-stone-500 tabular-nums">
            <span>광고비 {won(a.spend)}원</span>
            <span>구매 {a.purchases}건 · {won(a.value)}원</span>
            <span>ROAS {a.roas || 0}</span>
            <span>CTR {a.ctr}% · CPC {won(a.cpc)}원</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 오늘 루틴 — 업무일지(journal_<사람>.routines) 중 오늘 것. 10/21 홈 캘린더의 반복 할 일을 루틴으로 옮겨서 여기도 루틴을 본다 */
function TodayRoutines({ journals }) {
  const today = dayKey();
  const rows = PEOPLE.map(([id, name], i) => {
    const j = journals?.[i] || {};
    const list = routinesOn(j.routines, today).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    return { id, name, list, done: new Set(j.routineDone?.[today] || []) };
  }).filter((p) => p.list.length);
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-stone-900">오늘 루틴</h3>
        <span className="text-[11px] text-stone-400">업무일지에서 체크·고치기</span>
      </div>
      <div className="space-y-2">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-stone-500">
              {p.name} <span className="font-normal tabular-nums">{p.list.filter((r) => p.done.has(r.id)).length}/{p.list.length}</span>
            </span>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {p.list.map((r) => {
                const ok = p.done.has(r.id);
                return (
                  <li key={r.id} title={r.how || ""} className={"rounded-full border px-2.5 py-0.5 text-xs " + (ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-700")}>
                    {ok ? "✓ " : ""}
                    {r.time && <span className="text-[10px] text-stone-400 tabular-nums">{r.time} </span>}
                    {r.text}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Report({ r, hist, rows, journals }) {
  const y = r.yesterday || {};
  const [spanId, setSpanIdState] = useState(readSpan);
  const [custom, setCustom] = useState(() => ({ start: addDays(r.date, -29), end: r.date }));
  const setSpanId = (v) => {
    setSpanIdState(v);
    try {
      localStorage.setItem(SPAN_KEY, v);
    } catch {
      /* 무시 */
    }
  };
  const rg = rangeOf(spanId, r.date, custom);
  // 하루 단위 기록(메타·판매)이 있으면 어떤 기간이든 센다. 없으면 아침 보고에 담긴 7일 숫자만.
  const canSpan = !!hist?.meta?.days && rows?.length > 0;
  const w = canSpan ? spanStats(rows, hist.meta.days, rg.start, rg.end) : r.week || {};
  // 앞 기간이 매출 장부 첫 기록(2/21)보다 앞이면 비교하지 않는다(6개월 vs 그 전 6개월 +20,000% 같은 숫자가 나와서)
  const pwRaw = canSpan ? spanStats(rows, hist.meta.days, rg.prevStart, rg.prevEnd) : r.prevWeek || {};
  const pw = canSpan && pwRaw.noData ? {} : pwRaw;
  const prodRows = canSpan && hist.prod?.days ? productRows({ prod: hist.prod, metaProd: hist.metaProd, metaAds: hist.ads, s: rg.start, e: rg.end }) : fromReport(r.products);
  const wasteLine = canSpan && hist.prod?.days ? prodRows.filter((p) => p.spend >= Math.max(5000, Math.round((10000 * rg.n) / 7)) && !p.pu) : r.waste || [];
  const counts = hist?.ads ? adCountsIn(hist.ads, rg.start, rg.end) : r.adCounts ? { ...r.adCounts, made: r.adCounts.made7 } : null;
  const spanName = { 1: "하루", 7: "최근 7일", 30: "최근 한 달", 90: "최근 3개월", 180: "최근 6개월" }[spanId] || `직접 지정 ${rg.n}일`;
  const title = canSpan || spanId === "7" ? `${spanName} · ${rangeLabel(rg)}` : "최근 7일";
  const m = y.meta || {};
  const off = !m.spend;
  const evs = r.events || {};
  return (
    <div className="space-y-4">
      {/* Claude 코멘트 */}
      <section className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-white p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="mt-1 shrink-0 text-rose-700" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-snug text-stone-900">{r.headline || "숫자 보고 (코멘트는 못 썼어요)"}</p>
            {r.comment?.length > 0 && r.market_take && <div className="mt-2 text-xs font-semibold text-stone-500">매출 흐름</div>}
            {r.comment?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm leading-relaxed text-stone-700">
                {r.comment.map((c, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-rose-400">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.note && <p className="mt-2 text-xs text-amber-700">{r.note}</p>}
          </div>
        </div>
        {r.todo?.length > 0 && (
          <div className="mt-3 rounded-xl bg-white/80 p-3 ring-1 ring-rose-100">
            <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-rose-800">
              <ListTodo size={13} /> 오늘 할 일
            </div>
            <ol className="space-y-1 text-sm text-stone-800">
              {r.todo.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold text-rose-700 tabular-nums">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* 10/22 — 시장(기온·트렌드) → 소싱·콘텐츠·판매·소재 → 광고(쇼만마) */}
      <MarketBrief r={r} />
      <AdsBrief r={r} />

      <TodayRoutines journals={journals} />

      {off && !y.weekend && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> 어제 메타 광고비가 0원이에요 — 광고가 꺼져 있었어요.
        </p>
      )}

      {/* 어제 한 줄 */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-2.5 text-sm ring-1 ring-stone-200 tabular-nums">
        <b className="text-stone-900">어제</b>
        <span>매출 <b className="text-stone-900">{won(y.revenue)}원</b></span>
        <span>주문 {y.orders || 0}건</span>
        <span>광고비 {won(y.ads)}원{y.adRate != null ? ` (매출의 ${pct(y.adRate)})` : ""}</span>
        {y.weekend && !m.spend && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">주말 광고 쉬는 날</span>}
      </p>

      <KpiGrid
        w={w}
        pw={pw}
        target={r.target || 10}
        title={title}
        vs={canSpan ? vsLabel(rg, spanId) : "vs 지난 7일"}
        counts={counts}
        note={
          canSpan
            ? [
                w.adsFromMeta ? `광고비 중 ${w.adsFromMeta}일은 매출 장부에 안 적혀 있어서 메타 값으로 셌어요.` : "",
                w.ordPartial ? `주문 수는 ${w.firstOrd.slice(5).replace("-", "/")}부터 있어서 CPA·객단가는 그 뒤만 셌어요.` : "",
                pwRaw.noData ? "그 전 기간은 매출 장부 기록(2/21부터)이 모자라 비교하지 않아요." : "",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        picker={
          <>
            <SpanPicker spanId={spanId} setSpanId={setSpanId} custom={custom} setCustom={setCustom} end={r.date} />
            {!canSpan && spanId !== "7" && <p className="text-xs text-amber-700">기간 바꿔 보기는 하루 단위 기록이 들어온 뒤부터 돼요 — 지금은 최근 7일만 보여요.</p>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Box icon={Megaphone} title="오늘 광고 예산" right={<span className="text-[11px] text-stone-400">지난 7일 하루 평균 {won(r.budget?.avg7Spend)}원</span>}>
          <p className="text-2xl font-bold text-stone-900 tabular-nums">
            {r.budget?.weekend ? "쉬는 날" : `${won(r.budget?.base)}원`}{!r.budget?.weekend && r.budget?.max > r.budget?.base && <span className="text-base font-semibold text-stone-500"> ~ {won(r.budget.max)}원</span>}
          </p>
          <p className="mt-1 text-xs text-stone-500">{r.budget?.rule}</p>
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-3 text-[10px] text-stone-400">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-stone-200" /> 매출
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-rose-600/80" /> 광고비(매출 대비)
              </span>
              <span>최근 14일</span>
            </div>
            <Trend rows={r.trend || []} />
          </div>
        </Box>
        <Box icon={CalendarDays} title="이벤트">
          {[
            ["진행 중", evs.now],
            ["일주일 안에 시작", evs.soon],
            ["상시", evs.always],
          ].map(([t, list]) =>
            list?.length ? (
              <div key={t} className="mb-2 last:mb-0">
                <div className="text-[11px] font-semibold text-stone-400">{t}</div>
                {list.map((e) => (
                  <div key={e.title + e.start} className="mt-0.5 text-sm text-stone-800">
                    {e.title} {e.start && <span className="text-xs text-stone-400">{e.start.slice(5)}{e.end && e.end !== e.start ? `~${e.end.slice(5)}` : ""}</span>}
                    {e.todo?.length > 0 && <span className="block text-[11px] text-stone-500">남은 할 일: {e.todo.join(" · ")}</span>}
                  </div>
                ))}
              </div>
            ) : null,
          )}
          {!evs.now?.length && !evs.soon?.length && !evs.always?.length && <p className="text-xs text-stone-400">이벤트 캘린더에 잡힌 일정이 없어요.</p>}
        </Box>
      </div>

      <ProductTable rows={prodRows} waste={wasteLine} title={title} />

      {r.competitors?.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 px-4 pt-3.5 pb-2.5">
            <h3 className="text-sm font-bold text-stone-900">경쟁몰에서 뜨는 상품</h3>
            <span className="text-[11px] text-stone-400">사입 트래커 {r.trackerDate || ""} · 자세히는 보고 › 사입 트래커</span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto p-3 [scrollbar-width:thin]">
            {r.competitors.map((c) => (
              <a key={c.url + c.tag} href={c.url} target="_blank" rel="noreferrer" className="w-32 shrink-0">
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                  {c.img && <img src={c.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  <span className={"absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold " + (c.tag === "NEW" ? "bg-rose-700 text-white" : c.tag.startsWith("▲") ? "bg-emerald-600 text-white" : "bg-white/90 text-stone-700")}>{c.tag}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-stone-500">
                  {c.mall} {c.rank}위
                </div>
                <div className="line-clamp-2 text-xs font-medium text-stone-800">{c.name}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Box icon={TrendingUp} title="어제 잘 된 소재">
          <AdList list={r.topAds} empty="어제 구매가 잡힌 소재가 없어요." />
        </Box>
        <Box icon={AlertTriangle} title="어제 돈만 쓴 소재 (5천 원↑ · 구매 0)">
          <AdList list={r.weakAds} empty="없어요." />
        </Box>
      </div>

      <p className="px-1 text-[11px] text-stone-400">
        {r.made && `만든 시각 ${r.made.replace("T", " ")}`}
        {r.cost?.won != null && ` · Claude 약 ${r.cost.won}원`}
        {r.filledAds?.length > 0 && ` · 매출 장부에 비어 있던 광고비를 메타 값으로 채움: ${r.filledAds.map((f) => `${f.date.slice(5)} ${won(f.ads)}원`).join(", ")}`}
      </p>
    </div>
  );
}

export default function ReportPage({ online, rows }) {
  const [list, setList] = useState([]);
  const [hist, setHist] = useState(null);
  const [journals, setJournals] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all(PEOPLE.map(([w]) => loadJournal(w, online)))
        .then((v) => alive && setJournals(v))
        .catch(() => {});
    load();
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", vis);
    };
  }, [online]);
  const [day, setDay] = useState("");
  const [rep, setRep] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | empty | error

  const loadList = useCallback(async () => {
    try {
      const items = (await loadKey("reports", online, { items: [] })).items || [];
      setList(items);
      setDay((d) => d || items[0]?.date || "");
      if (!items.length) setState("empty");
    } catch {
      setState("error");
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadList();
    return onSettingsChange((k) => k === "reports" && loadList());
  }, [loadList]);
  useEffect(() => {
    if (!day) return;
    let alive = true;
    loadKey(`report_${day}`, online, null)
      .then((r) => {
        if (!alive) return;
        setRep(r);
        setState(r ? "ready" : "empty");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [day, online]);

  // 기간 바꿔 보기용 하루 단위 기록 — 아침 보고가 같이 올린다(lib/reportPeriod.js 머리말)
  useEffect(() => {
    let alive = true;
    Promise.all(["meta_daily", "meta_prod_daily", "meta_ads", "prod_daily"].map((k) => loadKey(k, online, null).catch(() => null))).then(([meta, metaProd, ads, prod]) => {
      if (alive) setHist({ meta, metaProd, ads, prod });
    });
    // 광고 켜짐은 1시간마다 바뀐다 — 화면이 떠 있으면 다시 읽는다
    const reAds = () => loadKey("meta_ads", online, null).then((ads) => alive && ads && setHist((h) => ({ ...(h || {}), ads })));
    const off1 = onSettingsChange((k) => k === "meta_ads" && reAds());
    const off2 = watchKeys(["meta_ads"], reAds, 60000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);

  const i = useMemo(() => list.findIndex((x) => x.date === day), [list, day]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">매일 보고</h2>
          <p className="mt-0.5 text-sm text-stone-500">매일 아침 기온·뉴스·경쟁몰 신상·경쟁사 인스타를 모아 소싱·콘텐츠·판매·광고 소재까지 판단해 둬요. 광고는 쇼만마에 요청할 것으로.</p>
        </div>
        {list.length > 0 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={i < 0 || i >= list.length - 1} onClick={() => setDay(list[i + 1].date)} aria-label="이전 보고" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30">
              <ChevronLeft size={18} />
            </button>
            <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-semibold text-stone-800">
              {list.map((x) => (
                <option key={x.date} value={x.date}>
                  {dayTitle(x.date)}
                </option>
              ))}
            </select>
            <button type="button" disabled={i <= 0} onClick={() => setDay(list[i - 1].date)} aria-label="다음 보고" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-30">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {state === "loading" && <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>}
      {state === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">보고를 불러오지 못했어요. 인터넷을 확인해 주세요.</p>}
      {state === "empty" && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
          아직 보고가 없어요. 사무실 PC 가 매일 아침 8시 30분에 만들어요{online ? "." : " (공유 장부로 로그인해야 보여요)."}
        </div>
      )}
      {state === "ready" && rep && <Report key={rep.date} r={rep} hist={hist} rows={rows} journals={journals} />}
    </div>
  );
}
