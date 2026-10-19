import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, ListTodo, Megaphone, Package, CalendarDays, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
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

function Delta({ now, prev, good = "up" }) {
  const c = change(now, prev);
  if (c == null || !Number.isFinite(c)) return null;
  const up = c >= 0;
  const ok = good === "up" ? up : !up;
  return (
    <span className={"inline-flex items-center gap-0.5 text-[11px] font-semibold " + (ok ? "text-emerald-700" : "text-rose-700")}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}
      {Math.round(c * 100)}%
    </span>
  );
}

function Card({ label, value, sub, children, tone = "" }) {
  return (
    <div className={"rounded-2xl border border-stone-200 bg-white px-4 py-3 " + tone}>
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold tracking-tight text-stone-900 tabular-nums">{value}</div>
      {(sub || children) && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500 tabular-nums">{sub}{children}</div>}
    </div>
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

      {off && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> 어제 메타 광고비가 0원이에요 — 광고가 꺼져 있었어요.
        </p>
      )}

      {/* 어제 숫자 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="어제 매출" value={`${won(y.revenue)}원`} sub={`주문 ${y.orders || 0}건`} />
        <Card label="어제 광고비" value={`${won(y.ads)}원`} sub={y.adRate != null ? `매출의 ${pct(y.adRate)}` : "매출 없음"} />
        <Card label="7일 매출" value={`${won(w.revenue)}원`}>
          <span>하루 {won(w.perDay)}원</span>
          <Delta now={w.revenue} prev={pw.revenue} />
        </Card>
        <Card label="7일 광고비율" value={pct(w.adRate)} tone={w.adRate != null && w.adRate <= (r.target || 10) ? "ring-1 ring-emerald-200" : ""}>
          <span>목표 {r.target || 10}%</span>
          <Delta now={w.adRate} prev={pw.adRate} good="down" />
        </Card>
        <Card label="7일 메타 ROAS" value={w.metaRoas ?? "—"}>
          <span>구매 {won(w.metaValue)}원</span>
          <Delta now={w.metaRoas} prev={pw.metaRoas} />
        </Card>
        <Card label="7일 CPC · CTR" value={`${won(w.cpc)}원`}>
          <span>CTR {pct(w.ctr, 2)}</span>
          <Delta now={w.cpc} prev={pw.cpc} good="down" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Box icon={Megaphone} title="오늘 광고 예산" right={<span className="text-[11px] text-stone-400">지난 7일 하루 평균 {won(r.budget?.avg7Spend)}원</span>}>
          <p className="text-2xl font-bold text-stone-900 tabular-nums">
            {won(r.budget?.base)}원{r.budget?.max > r.budget?.base && <span className="text-base font-semibold text-stone-500"> ~ {won(r.budget.max)}원</span>}
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

      <Box icon={Package} title="상품별 광고 — 최근 7일" right={<span className="text-[11px] text-stone-400">광고 이름의 상품명으로 이어요</span>}>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-[11px] text-stone-400">
                <th className="px-1 py-1.5 font-medium">상품</th>
                <th className="px-1 py-1.5 text-right font-medium">7일 판매</th>
                <th className="px-1 py-1.5 text-right font-medium">30일</th>
                <th className="px-1 py-1.5 text-right font-medium">7일 광고비</th>
                <th className="px-1 py-1.5 text-right font-medium">광고 구매</th>
                <th className="px-1 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 tabular-nums">
              {(r.products || []).map((p) => (
                <tr key={p.code}>
                  <td className="max-w-[16rem] truncate px-1 py-1.5 text-stone-800" title={p.name}>
                    {p.name}
                  </td>
                  <td className="px-1 py-1.5 text-right font-semibold text-stone-900">{p.q7}장</td>
                  <td className="px-1 py-1.5 text-right text-stone-500">{p.q30 ?? "—"}</td>
                  <td className="px-1 py-1.5 text-right text-stone-700">{p.adSpend7 ? `${won(p.adSpend7)}원` : "0"}</td>
                  <td className="px-1 py-1.5 text-right text-stone-700">{p.adPurchases7 ? `${p.adPurchases7}건 · ${won(p.adValue7)}원` : "—"}</td>
                  <td className="px-1 py-1.5">
                    {p.kind && (
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (p.kind === "광고 추천" ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-600")}>{p.kind}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.waste?.length > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            7일에 1만 원 넘게 썼는데 구매 0: {r.waste.map((x) => `${x.code} ${won(x.spend)}원`).join(" · ")}
          </p>
        )}
      </Box>

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
