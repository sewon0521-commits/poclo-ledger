import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Pencil, RefreshCw, RotateCcw, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { newId } from "../lib/id";
import {
  ORDERS_KEY, RULES_KEY, CHANNELS, CH, BASIS, HOLIDAYS, plan, ahead, c24Month, bankByDay, compare, monthGrid, shiftMonth,
  todayKey, md, mdw, weekday, isBiz, ruleText, plusDays,
} from "../lib/settle";
import { INDEX_KEY, monthKey } from "../lib/finance";

/**
 * 돈 › 정산·세무 › 정산 달력 (11/8, lib/settle.js 머리말).
 * 세원: "카페24 페이먼츠, 네이버페이(주문형, 결제형), 카카오 정산주기 계산 — 돈이 언제 들어오고 언제 도는지 정확하게."
 * 주문 자료는 사무실 PC 가 새벽 1시에(settle_feed.py), '지금 새로 받기'를 누르면 릴스 분석기가 바로(reels_queue target settle).
 */

const won = (v) => Math.round(v || 0).toLocaleString("ko-KR");
const man = (v) => {
  const n = Math.round((v || 0) / 10000);
  return n >= 1 ? `${n.toLocaleString("ko-KR")}만` : v > 0 ? `${Math.round(v / 1000)}천` : "";
};

function Dot({ k, size = 8 }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: CH[k]?.color || "#a8a29e" }} />;
}

/** 채널 조각 막대 — 칸마다 2px 틈 (dataviz) */
function StackBar({ ch, total, className = "h-1.5" }) {
  if (!total) return <div className={"rounded-full bg-stone-100 " + className} />;
  return (
    <div className={"flex gap-[2px] overflow-hidden rounded-full " + className}>
      {CHANNELS.filter((c) => (ch[c.k]?.net || 0) > 0).map((c) => (
        <span key={c.k} style={{ width: `${(ch[c.k].net / total) * 100}%`, background: c.color }} />
      ))}
    </div>
  );
}

function useSettle(online) {
  const [feed, setFeed] = useState(null);
  const [rules, setRules] = useState({});
  const [bank, setBank] = useState({});
  const [hasBank, setHasBank] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const readFeed = useCallback(async () => setFeed(await loadKey(ORDERS_KEY, online, null)), [online]);
  const readRules = useCallback(async () => setRules((await loadKey(RULES_KEY, online, {})) || {}), [online]);
  const readBank = useCallback(async () => {
    // 재무 비서 통장 줄 — 최근 두 달만(예상 ↔ 실제 맞춰 보기)
    const idx = await loadKey(INDEX_KEY, online, { months: [] });
    const months = (idx.months || []).sort().slice(-2);
    const rows = (await Promise.all(months.map((m) => loadKey(monthKey(m), online, { rows: [] })))).flatMap((v) => v.rows || []);
    setHasBank(rows.some((r) => r.s === "bank"));
    setBank(bankByDay(rows));
  }, [online]);
  useEffect(() => {
    let alive = true;
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    Promise.all([readFeed(), readRules(), readBank().catch(() => {})])
      .catch(() => alive && setMsg("정산 자료를 불러오지 못했어요. 인터넷을 확인해 주세요."))
      .finally(() => alive && setLoaded(true));
    const off = onSettingsChange((k) => (k === RULES_KEY ? readRules() : k === ORDERS_KEY ? readFeed() : null));
    const stop = watchKeys([RULES_KEY, ORDERS_KEY], (k) => (k === RULES_KEY ? readRules() : readFeed()));
    return () => {
      alive = false;
      off();
      stop();
    };
  }, [readFeed, readRules, readBank]);
  const saveRules = async (fn) => {
    try {
      setRules(await changeKey(RULES_KEY, online, (v) => fn(v || {}), {}));
    } catch (e) {
      setMsg(e.message || "규칙을 저장하지 못했어요.");
    }
  };
  return { feed, rules, bank, hasBank, loaded, msg, setMsg, saveRules, readFeed };
}

export default function SettlePage({ online, onPage }) {
  const S = useSettle(online);
  const today = todayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pick, setPick] = useState("");
  const [refresh, setRefresh] = useState(""); // "" | "queued" | 메시지
  const p = useMemo(() => plan(S.feed, S.rules), [S.feed, S.rules]);
  const a = useMemo(() => ahead(p, today), [p, today]);
  // 자료 첫날 + 3주부터 — 그 전 날은 카카오처럼 늦게 들어오는 몫의 주문이 자료에 없어서 예상이 모자란다
  const since = S.feed?.from ? plusDays(S.feed.from, 21) : "";
  const cmp = useMemo(() => compare(p, S.bank, today, since), [p, S.bank, today, since]);
  const c24 = useMemo(() => c24Month(S.feed, today), [S.feed, today]);
  const day = pick || a.next?.day || today;
  const sel = p.days[day];
  // 자료가 며칠 묵었나 — 날짜끼리만 빼서(렌더 중 지금 시각을 안 부른다)
  const feedAge = S.feed?.updated ? Math.round((new Date(`${today}T00:00:00`) - new Date(`${S.feed.updated.slice(0, 10)}T00:00:00`)) / 86400000) : null;

  // 지금 새로 받기 — 사무실 PC 릴스 분석기에 일감
  const askRefresh = async () => {
    setRefresh("queued");
    const before = S.feed?.updated || "";
    try {
      await changeKey("reels_queue", online, (v) => ({ items: [...((v && v.items) || []).filter((j) => j.target !== "settle"), { id: newId("st"), target: "settle", status: "queued", step: "", at: new Date().toISOString() }] }), { items: [] });
    } catch {
      setRefresh("사무실 PC 에 부탁하지 못했어요. 인터넷을 확인해 주세요.");
      return;
    }
    // 2분까지 10초마다 새 자료가 왔나 본다
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const v = await loadKey(ORDERS_KEY, online, null).catch(() => null);
      if (v?.updated && v.updated !== before) {
        await S.readFeed();
        setRefresh("");
        return;
      }
    }
    setRefresh("아직 새 자료가 안 왔어요 — 사무실 PC(릴스 분석기)가 켜져 있는지 확인해 주세요.");
  };

  if (!S.loaded) return null;
  if (!S.feed?.rows) {
    return (
      <div>
        <Head />
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
          <CalendarDays size={22} className="mx-auto text-stone-300" />
          <p className="mt-2">아직 주문 자료가 없어요. 사무실 PC 가 새벽 1시에 올려요 — 지금 받으려면 아래 단추를 눌러 주세요.</p>
          <button type="button" onClick={askRefresh} disabled={refresh === "queued"} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700">
            <RefreshCw size={14} className={refresh === "queued" ? "animate-spin" : ""} /> 지금 새로 받기
          </button>
          {refresh && refresh !== "queued" && <p className="mt-2 text-amber-700">{refresh}</p>}
        </div>
      </div>
    );
  }

  const nextBiz = isBiz(today, p.hol) ? today : null;
  return (
    <div>
      <Head
        right={
          <div className="flex flex-col items-end gap-1 text-right">
            <button type="button" onClick={askRefresh} disabled={refresh === "queued"} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60">
              <RefreshCw size={14} className={refresh === "queued" ? "animate-spin" : ""} /> {refresh === "queued" ? "받는 중 (1분쯤)" : "지금 새로 받기"}
            </button>
            <span className={"text-xs " + (feedAge >= 2 ? "text-amber-700" : "text-stone-400")}>
              주문 {S.feed.updated.replace("T", " ").slice(5, 16).replace("-", "/")} 기준{feedAge >= 2 ? ` · ${feedAge}일 전 자료` : ""}
            </span>
          </div>
        }
      />
      {S.msg && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{S.msg}</p>}
      {refresh && refresh !== "queued" && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{refresh}</p>}

      {/* 이 화면이 답하는 질문 — 언제 얼마 들어오나 */}
      <section className="mb-3 grid gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-[1.25fr_1fr_1fr]">
        <div className="bg-white px-5 py-4">
          <span className="text-xs font-semibold text-stone-500">앞으로 들어올 돈</span>
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <b className="text-3xl font-bold tracking-tight text-stone-900">{won(a.total)}</b>
            <span className="text-sm text-stone-500">원</span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            수수료 빼고 · 이미 결제·발송된 주문만{a.est > 0 ? ` · 그중 ${won(a.est)}원은 자동 구매확정일로 센 것(더 빨리 올 수 있어요)` : ""}
          </p>
        </div>
        <button type="button" onClick={() => a.next && setPick(a.next.day)} className="bg-white px-5 py-4 text-left hover:bg-stone-50">
          <span className="text-xs font-semibold text-stone-500">{a.next ? (a.next.day === today ? "오늘 들어올 돈" : `다음 입금 · ${mdw(a.next.day)}`) : "다음 입금"}</span>
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <b className="text-2xl font-bold text-rose-700">{a.next ? won(a.next.net) : "-"}</b>
            {a.next && <span className="text-sm text-stone-500">원</span>}
          </div>
          {a.next && (
            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
              {CHANNELS.filter((c) => a.next.ch[c.k]?.net).map((c) => (
                <span key={c.k} className="inline-flex items-center gap-1">
                  <Dot k={c.k} size={6} /> {c.name.replace("네이버페이 ", "네이버 ")} {man(a.next.ch[c.k].net)}
                </span>
              ))}
            </div>
          )}
          {!nextBiz && <p className="mt-1 text-[11px] text-stone-400">오늘({WDname(today)})은 정산이 안 들어와요</p>}
        </button>
        <div className="bg-stone-50 px-5 py-4">
          <span className="text-xs font-semibold text-stone-500">이번 주 (~{md(a.sun)})</span>
          <div className="mt-1 text-xl font-bold tabular-nums text-stone-900">{won(a.week)}원</div>
          <span className="mt-2 block text-xs font-semibold text-stone-500">다음 주 ({md(plusDays(a.sun, 1))}~{md(a.nextSun)})</span>
          <div className="text-base font-semibold tabular-nums text-stone-700">{won(a.nextWeek)}원</div>
        </div>
      </section>

      {a.waitN > 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
          <span className="mt-0.5 shrink-0 whitespace-nowrap font-semibold text-stone-500">발송 전</span>
          <span>
            주문 {a.waitN}건 · 약 {won(a.waitNet)}원은 아직 날짜를 못 정해요 —{" "}
            {CHANNELS.filter((c) => p.wait[c.k]).map((c, i) => (
              <span key={c.k}>
                {i > 0 && " · "}
                {c.name} {p.wait[c.k].n}건 {won(p.wait[c.k].net)}원
              </span>
            ))}
            . 네이버 주문형은 발송하면 다음 영업일, 카카오는 배송완료 + 8일 뒤 다음 영업일에 들어와요.
          </span>
        </p>
      )}
      {c24 >= CH.c24.limit * 0.8 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            이번 달 카페24 페이먼츠 결제가 {won(c24)}원이에요. 처음 계약한 월 정산 한도는 1,000만 원 — 넘으면 다음 달로 미뤄질 수 있어요(카페24 관리자 › 카페24 페이먼츠에서 한도 확인).
          </span>
        </p>
      )}

      {/* 달력 */}
      <section className="mb-3 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="지난달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
              <ChevronLeft size={18} />
            </button>
            <h3 className="min-w-[6.5rem] text-center font-semibold text-stone-900">
              {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월
            </h3>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
              <ChevronRight size={18} />
            </button>
            {month !== today.slice(0, 7) && (
              <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="ml-1 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100">
                이번 달
              </button>
            )}
          </div>
          <Legend byCh={a.byCh} />
        </div>
        <Calendar month={month} p={p} today={today} day={day} onPick={setPick} bank={S.bank} />
        <p className="mt-2 text-[11px] text-stone-400">금액은 수수료 뺀 예상 입금 · 지난 날은 같은 규칙으로 센 값(통장 입금이 있으면 아래 '맞춰 보기')</p>
      </section>

      <DayDetail day={day} sel={sel} p={p} today={today} bank={S.bank[day]} />

      <Rules p={p} rules={S.rules} save={S.saveRules} />

      <Compare rows={cmp} hasBank={S.hasBank} onPage={onPage} />
    </div>
  );
}

const WDname = (d) => "일월화수목금토"[weekday(d)] + "요일";

function Head({ right }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-bold text-stone-900">정산 달력</h2>
        <p className="mt-0.5 text-sm text-stone-500">카페24 페이먼츠 · 네이버페이 · 토스 · 카카오 판매대금이 통장에 언제, 얼마 들어오는지.</p>
      </div>
      {right}
    </div>
  );
}

function Legend({ byCh }) {
  return (
    <div className="flex w-full flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600 sm:w-auto sm:justify-end">
      {CHANNELS.map((c) => (
        <span key={c.k} className="inline-flex items-center gap-1" title={`앞으로 ${won(byCh[c.k] || 0)}원`}>
          <Dot k={c.k} /> {c.name.replace("네이버페이 ", "네이버 ").replace("카카오 톡체크아웃", "카카오")}
        </span>
      ))}
    </div>
  );
}

function Calendar({ month, p, today, day, onPick, bank }) {
  const cells = monthGrid(month);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-stone-400">
        {"일월화수목금토".split("").map((w, i) => (
          <span key={w} className={i === 0 ? "text-rose-400" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.startsWith(month);
          const biz = isBiz(d, p.hol);
          const x = p.days[d];
          const v = x?.net || 0;
          const holiday = !biz && weekday(d) !== 0 && weekday(d) !== 6;
          const actual = bank?.[d] ? Object.values(bank[d]).reduce((s, n) => s + n, 0) : 0;
          const tip = x
            ? CHANNELS.filter((c) => x.ch[c.k]?.net)
                .map((c) => `${c.name} ${won(x.ch[c.k].net)}원`)
                .join("\n") + `\n합계 ${won(v)}원${actual ? `\n통장 실제 ${won(actual)}원` : ""}`
            : biz
              ? "들어올 돈 없음"
              : holiday
                ? "공휴일 — 정산 없음"
                : "주말 — 정산 없음";
          return (
            <button
              key={d}
              type="button"
              title={tip}
              onClick={() => onPick(d)}
              className={
                "flex min-h-[3.6rem] flex-col rounded-lg border px-1 py-1 text-left sm:min-h-[4.6rem] sm:px-1.5 " +
                (d === day ? "border-rose-400 bg-rose-50/60 " : "border-stone-100 hover:border-stone-300 ") +
                (inMonth ? "" : "opacity-35 ") +
                (biz ? "bg-white" : "bg-stone-50")
              }
            >
              <span className={"flex items-center gap-1 text-[11px] tabular-nums " + (d === today ? "font-bold text-rose-700" : weekday(d) === 0 || holiday ? "text-rose-400" : "text-stone-500")}>
                {Number(d.slice(8, 10))}
                {d === today && <span className="rounded bg-rose-700 px-1 text-[9px] font-semibold leading-tight text-white">오늘</span>}
              </span>
              {biz ? (
                v !== 0 && (
                  <>
                    <span className={"mt-auto text-[11px] font-semibold tabular-nums sm:text-[13px] " + (d < today ? "text-stone-400" : "text-stone-900")}>{man(v)}</span>
                    <StackBar ch={x.ch} total={Math.max(v, 1)} className="mt-0.5 h-1" />
                  </>
                )
              ) : (
                <span className="mt-auto text-[10px] text-stone-300">{holiday ? "휴일" : ""}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDetail({ day, sel, p, today, bank }) {
  const biz = isBiz(day, p.hol);
  const fromText = (c) => {
    const ks = Object.keys(c.from).sort();
    if (!ks.length) return "";
    const head = ks.slice(0, 3).map((k) => `${md(k)} ${c.from[k]}건`).join(" · ");
    return head + (ks.length > 3 ? ` 외 ${ks.length - 3}일` : "");
  };
  return (
    <section className="mb-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-stone-900">
          {mdw(day)} {day === today ? "· 오늘" : day < today ? "· 지난 날" : ""}
        </h3>
        {sel && <b className="text-lg tabular-nums text-stone-900">{won(sel.net)}원</b>}
      </div>
      {!biz ? (
        <p className="mt-1 text-sm text-stone-500">주말·공휴일이라 정산이 안 들어와요. 이날 몫은 다음 영업일에 같이 들어와요.</p>
      ) : !sel ? (
        <p className="mt-1 text-sm text-stone-500">이날 들어올 정산은 없어요.</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100">
          {CHANNELS.filter((c) => sel.ch[c.k]).map((c) => {
            const x = sel.ch[c.k];
            const r = p.rules[c.k];
            return (
              <li key={c.k} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="flex min-w-[9rem] items-center gap-2 font-medium text-stone-800">
                  <Dot k={c.k} /> {c.name}
                </span>
                <span className="min-w-0 flex-1 text-xs text-stone-500">
                  {BASIS[r.basis].short} {fromText(x)} 몫 · {ruleText(r)} · 수수료 {r.fee}% 빼고
                  {x.refund > 0 && <span className="text-rose-600"> · 취소 {won(x.refund)}원 차감</span>}
                  {x.est > 0 && <span className="text-amber-700"> · 자동 구매확정으로 셈(더 빨리 올 수 있어요)</span>}
                </span>
                <span className="text-right">
                  <b className="tabular-nums text-stone-900">{won(x.net)}원</b>
                  {bank?.[c.k] != null && <span className="block text-[11px] tabular-nums text-stone-400">통장 {won(bank[c.k])}원</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {biz && sel && (
        <p className="mt-1 text-[11px] text-stone-400">들어오는 시각(통장 기준): 네이버 주문형 새벽 2시쯤 · 결제형 새벽 4시쯤 · 카페24 오전 9시쯤 · 토스·카카오 오전 10~11시쯤</p>
      )}
    </section>
  );
}

function Rules({ p, rules, save }) {
  const [edit, setEdit] = useState("");
  const [holOpen, setHolOpen] = useState(false);
  return (
    <section className="mb-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-stone-900">채널별 정산 규칙</h3>
        <span className="text-xs text-stone-400">공식 안내 + 우리 국민은행 통장(7~9월)으로 맞춰 본 것</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNELS.map((c) => (
          <RuleCard key={c.k} c={c} r={p.rules[c.k]} changed={!!rules[c.k]} open={edit === c.k} onOpen={() => setEdit(edit === c.k ? "" : c.k)} save={save} />
        ))}
        <div className="rounded-xl border border-dashed border-stone-200 px-3 py-2.5 text-xs text-stone-500">
          <b className="text-stone-700">무통장입금</b>은 손님이 우리 통장에 바로 넣어서 정산이 없어요. 이 달력에는 안 들어가요.
        </div>
      </div>
      <button type="button" onClick={() => setHolOpen(!holOpen)} className="mt-3 text-xs font-medium text-stone-500 underline-offset-2 hover:underline">
        쉬는 날(주말 말고) {holOpen ? "접기" : "보기 · 더하기"}
      </button>
      {holOpen && <Holidays rules={rules} save={save} />}
    </section>
  );
}

function RuleCard({ c, r, changed, open, onOpen, save }) {
  const [basis, setBasis] = useState(r.basis);
  const [n, setN] = useState(String(r.n));
  const [fee, setFee] = useState(String(r.fee));
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setBasis(r.basis);
    setN(String(r.n));
    setFee(String(r.fee));
  }, [r.basis, r.n, r.fee, open]);
  const put = (v) => save((cur) => ({ ...cur, [c.k]: v }));
  const reset = () =>
    save((cur) => {
      const next = { ...cur };
      delete next[c.k];
      return next;
    });
  return (
    <div className="rounded-xl border border-stone-200 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-stone-900">
            <Dot k={c.k} /> {c.name}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-rose-700">
            {ruleText(r)} · 수수료 약 {r.fee}%{changed && <span className="ml-1 text-[11px] font-normal text-stone-400">(고친 값)</span>}
          </div>
          <div className="mt-0.5 text-xs text-stone-500">통장 이름 '{c.bank}'</div>
        </div>
        <button type="button" onClick={onOpen} aria-label="규칙 고치기" className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          {open ? <X size={15} /> : <Pencil size={14} />}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{c.note}</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{c.checked}</p>
      <details className="mt-1 text-xs text-stone-500">
        <summary className="cursor-pointer select-none text-stone-400 hover:text-stone-600">공식 안내 원문</summary>
        <ul className="mt-1 space-y-1">
          {c.official.map((o) => (
            <li key={o.q}>
              "{o.q}"{" "}
              <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-stone-400 hover:text-rose-700">
                출처 <ExternalLink size={10} />
              </a>
            </li>
          ))}
        </ul>
      </details>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select value={basis} onChange={(e) => setBasis(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
              {Object.entries(BASIS).map(([k, b]) => (
                <option key={k} value={k}>
                  {b.label}
                </option>
              ))}
            </select>
            <span>+</span>
            <input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-14 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-right tabular-nums" />
            <span>영업일 · 수수료</span>
            <input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-right tabular-nums" />
            <span>%</span>
          </div>
          {c.alt && (
            <button type="button" onClick={() => put({ basis: c.alt.basis, n: c.alt.n, fee: Number(fee) || c.rule.fee })} className="block text-xs text-stone-500 underline-offset-2 hover:underline">
              {c.alt.label}로 바꾸기
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => put({ basis, n: Number(n) || 0, fee: Number(fee) || 0 })} className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">
              저장
            </button>
            {changed && (
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600">
                <RotateCcw size={13} /> 처음 값({ruleText(c.rule)} · {c.rule.fee}%)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Holidays({ rules, save }) {
  const [add, setAdd] = useState("");
  const today = todayKey();
  const mine = rules.holidays || [];
  const list = [...new Set([...HOLIDAYS, ...mine])].filter((d) => d >= plusDays(today, -30)).sort().slice(0, 14);
  return (
    <div className="mt-2 rounded-lg bg-stone-50 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {list.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs tabular-nums text-stone-600">
            {d.slice(0, 4) !== today.slice(0, 4) ? `${d.slice(0, 4)}년 ` : ""}{mdw(d)}
            {mine.includes(d) && (
              <button type="button" aria-label="빼기" onClick={() => save((cur) => ({ ...cur, holidays: (cur.holidays || []).filter((x) => x !== d) }))} className="text-stone-400 hover:text-rose-700">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="date" value={add} onChange={(e) => setAdd(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm" />
        <button
          type="button"
          disabled={!add}
          onClick={() => {
            save((cur) => ({ ...cur, holidays: [...new Set([...(cur.holidays || []), add])].sort() }));
            setAdd("");
          }}
          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-sm text-stone-700 disabled:opacity-40"
        >
          쉬는 날 더하기
        </button>
        <span className="text-[11px] text-stone-400">임시공휴일이 생기면 더해 주세요</span>
      </div>
    </div>
  );
}

function Compare({ rows, hasBank, onPage }) {
  if (!hasBank || !rows.length)
    return (
      <section className="mb-3 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-4 text-sm text-stone-500">
        <b className="text-stone-700">예상 ↔ 실제 입금 맞춰 보기</b>
        <p className="mt-1">
          재무 비서에 국민은행 거래내역 엑셀을 넣으면, 지난 영업일마다 예상한 정산과 통장에 실제로 들어온 돈을 나란히 보여 줘요.
          {onPage && (
            <button type="button" onClick={() => onPage("financeRules")} className="ml-1 font-medium text-rose-700 underline-offset-2 hover:underline">
              재무 비서 › 규칙·파일로
            </button>
          )}
        </p>
      </section>
    );
  const sumE = rows.reduce((a, r) => a + r.expect, 0);
  const sumA = rows.reduce((a, r) => a + r.actual, 0);
  return (
    <section className="mb-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-stone-900">예상 ↔ 실제 입금</h3>
        <span className="text-xs tabular-nums text-stone-500">
          {rows.length}영업일 · 예상 {won(sumE)} · 실제 {won(sumA)} · 차이 {sumE ? (((sumA - sumE) / sumE) * 100).toFixed(1) : "-"}%
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="py-1.5 text-left font-medium">날짜</th>
              <th className="py-1.5 text-right font-medium">예상</th>
              <th className="py-1.5 text-right font-medium">통장 실제</th>
              <th className="py-1.5 text-right font-medium">차이</th>
              <th className="py-1.5 pl-3 text-left font-medium">채널별 (예상 → 실제)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.actual - r.expect;
              const off = r.expect ? Math.abs(diff) / r.expect : 1;
              return (
                <tr key={r.day} className="border-b border-stone-100 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-stone-700">{mdw(r.day)}</td>
                  <td className="py-1.5 pl-2 text-right text-stone-600">{won(r.expect)}</td>
                  <td className="py-1.5 pl-2 text-right font-medium text-stone-900">{won(r.actual)}</td>
                  <td className={"py-1.5 pl-2 text-right " + (off < 0.05 ? "text-emerald-700" : off < 0.2 ? "text-amber-700" : "text-rose-700")}>
                    {diff > 0 ? "+" : ""}
                    {won(diff)}
                  </td>
                  <td className="py-1.5 pl-3 text-xs text-stone-500">
                    {CHANNELS.filter((c) => r.ch[c.k]).map((c) => (
                      <span key={c.k} className="mr-2 inline-flex items-center gap-1 whitespace-nowrap">
                        <Dot k={c.k} size={6} /> {man(r.ch[c.k].e) || "0"} → {man(r.ch[c.k].a) || "0"}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-stone-400">차이가 크면: 손님이 구매확정을 일찍 누름(카카오) · 반품 공제(네이버 빠른정산) · 하루 몰아서 출금(네이버 충전금) 때문일 때가 많아요.</p>
    </section>
  );
}
