import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, ListTodo, Megaphone, CalendarDays, AlertTriangle, TrendingUp } from "lucide-react";
import { loadKey, onSettingsChange } from "../lib/shoot";
import { won } from "../lib/sales";
import { dayTitle } from "../lib/journal";

/**
 * 보고 › 매일 보고 (2026-10-19, 위키 topics/보고-체계-설계.md).
 * 사무실 PC 가 아침 8시 30분에 poclo-cafe24/daily_report.py 로 만든다 → settings 'report_<날짜>' + 목록 'reports'.
 * 쇼만마 주간 보고 항목(매출·주문·광고비·광고비율·ROAS·CPC·상품별 광고 기여·소재)을 매일, 우리 숫자로.
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
function Vs({ now, prev, good = "up" }) {
  const c = change(now, prev);
  if (c == null || !Number.isFinite(c)) return <div className="font-mono text-[11px] text-stone-300">— vs 지난 7일</div>;
  const up = c >= 0;
  const ok = good === "up" ? up : !up;
  return (
    <div className={"font-mono text-[11px] " + (ok ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {(c * 100).toFixed(1)}% <span className="text-stone-400">vs 지난 7일</span>
    </div>
  );
}

function Kpi({ label, value, unit, sub, now, prev, good, mark }) {
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
      <Vs now={now} prev={prev} good={good} />
    </div>
  );
}

/** 쇼만마 주간 보고 카드 12칸 — 최근 7일, 지난 7일 대비 */
function KpiGrid({ w, pw, target }) {
  const rows = [
    // [이름, 값, 단위?, 보조, 지금, 지난, 좋은 쪽]
    ["매출", ...man(w.revenue), `순매출 ${man((w.revenue || 0) - (w.refund || 0)).join("")}`, w.revenue, pw.revenue, "up"],
    ["CPA", ...man(ratio(w.ads, w.orders)), `주문수 ${w.orders || 0}건`, ratio(w.ads, w.orders), ratio(pw.ads, pw.orders), "down"],
    ["ROAS", ratio(w.revenue, w.ads)?.toFixed(2) ?? "—", "x", "총매출 ÷ 광고비", ratio(w.revenue, w.ads), ratio(pw.revenue, pw.ads), "up"],
    ["객단가", ...man(ratio(w.revenue, w.orders)), "매출 ÷ 주문수", ratio(w.revenue, w.orders), ratio(pw.revenue, pw.orders), "up"],
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
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 px-4 pt-3.5 pb-2.5">
        <h3 className="text-sm font-bold text-stone-900">최근 7일</h3>
        <span className="text-[11px] text-stone-400">광고 숫자는 메타 기준(7일 클릭) · 1일 클릭은 광고를 누르고 하루 안에 산 것만</span>
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

/** 쇼만마 '상품별 광고 기여(AD-ORDER PRODUCT MATCH)' — 유형 · 상품 · 광고비 · 광고 구매 비율 · 광고구매수(1일) · 판매 · 광고 수 */
function ProductTable({ products, waste }) {
  const top = new Set([...products].sort((a, b) => b.q7 - a.q7).slice(0, 5).map((p) => p.code));
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 px-4 pt-3.5 pb-2.5">
        <h3 className="text-sm font-bold text-stone-900">상품별 광고 기여 · 최근 7일</h3>
        <span className="text-[11px] text-stone-400">광고 이름의 상품명으로 이어요 · 광고 구매 비율 = 광고로 산 건수 ÷ 판매 장수(대략)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] font-semibold text-stone-500">
              <th className="px-4 py-2 font-semibold">유형</th>
              <th className="px-2 py-2 font-semibold">상품</th>
              <th className="px-2 py-2 text-right font-semibold">광고비</th>
              <th className="px-2 py-2 text-right font-semibold">광고 구매 비율</th>
              <th className="px-2 py-2 text-right font-semibold">광고 구매 (1일 클릭)</th>
              <th className="px-2 py-2 text-right font-semibold">판매</th>
              <th className="px-4 py-2 text-right font-semibold">광고 수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 tabular-nums">
            {products.map((p) => {
              const share = p.q7 ? Math.min(100, Math.round(((p.adPurchases7 || 0) / p.q7) * 100)) : 0;
              return (
                <tr key={p.code} className="hover:bg-stone-50/70">
                  <td className="px-4 py-2.5 align-middle">
                    <div className="flex flex-col items-start gap-1">
                      {top.has(p.code) && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200">판매 상위</span>}
                      {p.kind && <span className={"rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 " + (KIND_TONE[p.kind] || "")}>{p.kind}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-stone-100">{p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium text-stone-900">{p.name}</span>
                        <span className="text-[11px] text-stone-400">30일 {p.q30 ?? 0}장</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-stone-900">{p.adSpend7 ? `${man(p.adSpend7).join("")}` : <span className="text-stone-300">0</span>}</td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="ml-auto flex w-24 items-center justify-end gap-1.5">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-100">
                        <span className="block h-full rounded-full bg-rose-600" style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-9 text-right text-stone-700">{share}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-stone-700">
                    {p.adPurchases7 ? (
                      <>
                        {p.adPurchases7}건 <span className="text-stone-400">({p.adPurchases1d7 ?? 0})</span>
                        <span className="block text-[11px] text-stone-400">{man(p.adValue7).join("")}</span>
                      </>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-stone-900">{p.q7}장</td>
                  <td className="px-4 py-2.5 text-right text-stone-500">{p.adCount || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {waste.length > 0 && (
        <p className="border-t border-stone-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-900">
          7일에 1만 원 넘게 썼는데 광고 구매 0: {waste.map((x) => `${x.code} ${won(x.spend)}원`).join(" · ")}
        </p>
      )}
    </section>
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

function Report({ r }) {
  const y = r.yesterday || {};
  const w = r.week || {};
  const pw = r.prevWeek || {};
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

      <KpiGrid w={w} pw={pw} target={r.target || 10} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
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

      <ProductTable products={r.products || []} waste={r.waste || []} />

      <div className="grid gap-4 lg:grid-cols-2">
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

export default function ReportPage({ online }) {
  const [list, setList] = useState([]);
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

  const i = useMemo(() => list.findIndex((x) => x.date === day), [list, day]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">매일 보고</h2>
          <p className="mt-0.5 text-sm text-stone-500">매일 아침 9시 전에 어제 매출·광고·상품을 정리해 둬요. 오늘 광고 예산과 할 일까지.</p>
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
      {state === "ready" && rep && <Report r={rep} />}
    </div>
  );
}
