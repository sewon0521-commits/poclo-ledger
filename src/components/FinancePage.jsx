import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, onSettingsChange, watchKeys, FIELD } from "../lib/shoot";
import { queueChange, withPending, saveMark } from "../lib/saveQueue";
import { fileToCsv } from "../lib/tabular";
import { Kpi, Tab } from "./ui";
import { Sheet, SheetHead } from "./ShootBits";
import {
  CATS,
  INDEX_KEY,
  RULES_KEY,
  addRows,
  askEstimate,
  asksOf,
  catType,
  dailyReport,
  groupByMonth,
  makeCtx,
  maskText,
  monthKey,
  monthLabel,
  monthStats,
  parseFinance,
  parseTable,
  patchRows,
  planImport,
  ruleKey,
  shiftDay,
  shiftMonth,
} from "../lib/finance";

/**
 * 돈 › 재무 비서 (lib/finance.js 머리말). 국민은행·국민카드 엑셀을 끌어다 놓으면 규칙으로 나누고, 남은 곳만 버튼을 눌러 Claude 에게 묻는다.
 * 원본 파일은 저장하지 않고 읽은 줄만 달마다 settings 에 쓴다. 계좌·카드번호는 끝 4자리만.
 */

const TAB_KEY = "poclo_finance_tab";
const MONTH_KEY = "poclo_finance_month";
const NO_MONTH = { rows: [] };
const NO_INDEX = { months: [], accounts: {}, imports: [] };
const NO_RULES = { rules: {} };
const PAGE = 60;
// 막대 색 — 수입·지출 두 벌, 색약 검사 통과(dataviz validate_palette). 글자엔 안 쓴다
const IN_COLOR = "#2563eb";
const OUT_COLOR = "#e11d48";

const remember = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const keep = (key, v) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 무시 */
  }
};
const flow = (v) => (v >= 0 ? `+₩${won(v)}` : `-₩${won(-v)}`);
const krw = (v) => (v < 0 ? `-₩${won(-v)}` : `₩${won(v)}`);
const day2 = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${WEEK[new Date(`${d}T00:00:00`).getDay()]})`;
const srcLabel = (r) => `${r.s === "card" ? "카드" : "통장"} ${r.src}`;

function useFinance(online) {
  const [index, setIndex] = useState(NO_INDEX);
  const [rules, setRules] = useState(NO_RULES);
  const [data, setData] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const haveMonths = useRef(new Set());

  const readMonth = useCallback(
    async (m) => {
      const key = monthKey(m);
      const m0 = saveMark(key);
      const v = await loadKey(key, online, NO_MONTH);
      haveMonths.current.add(m);
      if (saveMark(key) === m0) setData((cur) => ({ ...cur, [m]: withPending(key, v).rows || [] }));
    },
    [online],
  );
  const readIndex = useCallback(async () => {
    const m0 = saveMark(INDEX_KEY);
    const v = await loadKey(INDEX_KEY, online, NO_INDEX);
    const next = saveMark(INDEX_KEY) === m0 ? withPending(INDEX_KEY, v) : v;
    setIndex(next);
    return next.months || [];
  }, [online]);
  const readRules = useCallback(async () => {
    const m0 = saveMark(RULES_KEY);
    const v = await loadKey(RULES_KEY, online, NO_RULES);
    if (saveMark(RULES_KEY) === m0) setRules(withPending(RULES_KEY, v));
  }, [online]);

  const load = useCallback(async () => {
    try {
      const [months] = await Promise.all([readIndex(), readRules()]);
      await Promise.all(months.map(readMonth));
    } catch {
      setMsg("재무 내역을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [readIndex, readRules, readMonth]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
  }, [load]);

  // 다른 쪽(지원·다른 기기)이 고치면 그 키만 다시 읽는다
  const watch = useMemo(() => [INDEX_KEY, RULES_KEY, ...(index.months || []).map(monthKey)], [index.months]);
  useEffect(() => {
    if (!online) return;
    const again = async (k) => {
      if (k === INDEX_KEY) {
        const months = await readIndex();
        await Promise.all(months.filter((m) => !haveMonths.current.has(m)).map(readMonth));
      } else if (k === RULES_KEY) readRules();
      else if (String(k).startsWith("finance_")) readMonth(k.replace("finance_", "").replace("_", "-"));
    };
    const off = onSettingsChange(again);
    const stop = watchKeys(watch, again);
    return () => {
      off();
      stop();
    };
  }, [online, watch, readIndex, readRules, readMonth]);

  const changeMonth = useCallback(
    async (m, fn) => {
      const key = monthKey(m);
      setData((cur) => ({ ...cur, [m]: fn({ rows: cur[m] || [] }).rows }));
      try {
        const v = await queueChange(key, online, fn, NO_MONTH);
        setData((cur) => ({ ...cur, [m]: withPending(key, v).rows || [] }));
        return true;
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
        readMonth(m);
        return false;
      }
    },
    [online, readMonth],
  );
  const changeIndex = useCallback(
    async (fn) => {
      setIndex((cur) => fn(cur));
      try {
        setIndex(withPending(INDEX_KEY, await queueChange(INDEX_KEY, online, fn, NO_INDEX)));
        return true;
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
        return false;
      }
    },
    [online],
  );
  const changeRules = useCallback(
    async (fn) => {
      setRules((cur) => fn(cur));
      try {
        setRules(withPending(RULES_KEY, await queueChange(RULES_KEY, online, fn, NO_RULES)));
      } catch (e) {
        setMsg(e.message || "규칙을 저장하지 못했어요.");
      }
    },
    [online],
  );
  return { index, rules, data, loaded, msg, setMsg, changeMonth, changeIndex, changeRules };
}

// ---------------------------------------------------------------- 파일 넣기

function ImportPreview({ preview, onApply, onClose }) {
  const { files, bad, plan } = preview;
  const added = plan.adds.length;
  const filled = plan.report.reduce((a, r) => a + r.filled, 0);
  const dup = plan.report.reduce((a, r) => a + r.dup, 0);
  const none = plan.adds.filter((r) => !r.cat).length;
  return (
    <Sheet wide onClose={onClose}>
      <SheetHead title="넣기 전에 확인" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">새로 {added}건</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600">이미 있음 {dup}건</span>
          {filled > 0 && <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-800">해외 원화 채움 {filled}건</span>}
          {added > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">자동 분류 못 한 {none}건</span>}
        </div>
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 text-sm">
          {plan.report.map((r, i) => (
            <li key={i} className="px-3 py-2.5">
              <div className="flex items-center gap-1.5 font-semibold text-stone-900">
                <FileSpreadsheet size={15} className="shrink-0 text-emerald-600" /> {r.label}
                <span className="font-normal text-stone-500">{r.srcs.join(" · ")}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-stone-400">{files[i].file}</div>
              <div className="mt-1 text-xs text-stone-600 tabular-nums">
                {r.from && `${r.from.replaceAll("-", ".")} ~ ${r.to.replaceAll("-", ".")} · `}
                {r.lines}줄 → 새로 {r.added}
                {r.filled > 0 && ` · 원화 채움 ${r.filled}`} · 이미 있음 {r.dup}
              </div>
            </li>
          ))}
        </ul>
        {bad.map((b, i) => (
          <p key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <b className="font-semibold">{b.file}</b> — {b.why}
          </p>
        ))}
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <p className="mb-2 text-xs text-stone-500">원본 파일은 저장하지 않아요. 읽은 줄만 넣고, 계좌·카드번호는 끝 4자리만 남겨요.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-400">
            취소
          </button>
          <button type="button" disabled={!added && !filled && !plan.patches.size} onClick={onApply} className="flex-[2] rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
            {added || filled ? `넣기 · 새로 ${added}건${filled ? ` + 원화 ${filled}건` : ""}` : "새로 넣을 거래가 없어요"}
          </button>
        </div>
      </footer>
    </Sheet>
  );
}

function EmptyDrop({ busy, drag, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={"flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-14 text-center transition " + (drag ? "border-rose-400 bg-rose-50/60" : "border-stone-300 bg-white hover:border-rose-300")}
    >
      {busy ? <Loader2 size={28} className="animate-spin text-stone-400" /> : <FileSpreadsheet size={30} className="text-emerald-600" />}
      <span className="font-semibold text-stone-900">국민은행 거래내역 · 국민카드 내역 넣기</span>
      <span className="text-sm text-stone-500">끌어다 놓거나 눌러서 고르기 · 여러 파일 한 번에 · .xls · .xlsx · .csv</span>
      <span className="mt-1 max-w-xl text-xs leading-relaxed text-stone-400">
        카드는 승인내역이나 국내매입내역에 해외매입내역까지 넣어 주세요. 메타 광고비 같은 해외 결제는 승인내역에 달러만 있어서 해외매입내역이 있어야 원화로 잡혀요. 이용대금명세서도 읽어요.
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- 거래 분류

function CatSelect({ value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="분류" className={"w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-rose-600 " + (value ? "border-stone-200 bg-white text-stone-800" : "border-amber-300 bg-amber-50 text-amber-800")}>
      <option value="">미분류</option>
      <optgroup label="수입">
        {CATS.filter((c) => c.type === "income").map((c) => (
          <option key={c.k}>{c.k}</option>
        ))}
      </optgroup>
      <optgroup label="지출">
        {CATS.filter((c) => c.type === "expense").map((c) => (
          <option key={c.k}>{c.k}</option>
        ))}
      </optgroup>
      <optgroup label="손익에서 빼기">
        {CATS.filter((c) => c.type === "skip").map((c) => (
          <option key={c.k}>{c.k}</option>
        ))}
      </optgroup>
    </select>
  );
}

const BY_LABEL = { rule: "내 규칙", erp: "거래처", ai: "AI" };

const TxRow = memo(function TxRow({ r, onCat, onOk }) {
  const skip = catType(r.cat) === "skip";
  return (
    <li
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 64px" }}
      className={"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 @3xl:grid-cols-[3.25rem_minmax(0,1fr)_7.5rem_9.5rem_2.5rem] @3xl:py-2 " + (r.ok ? "bg-stone-50/70" : "")}
    >
      <span className="hidden text-xs text-stone-500 tabular-nums @3xl:block">{day2(r.d)}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-stone-900" title={r.name}>
          {r.name}
          {r.cancel && <span className="ml-1 rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500">취소</span>}
        </div>
        <div className="truncate text-xs text-stone-400">
          <span className="@3xl:hidden">{day2(r.d)} · </span>
          {srcLabel(r)}
          {r.sub ? ` · ${r.sub}` : ""}
          {r.usd ? ` · $${r.usd}` : ""}
        </div>
      </div>
      <div className="text-right text-sm tabular-nums @3xl:order-none">
        {r.pend ? (
          <span className="text-xs font-medium text-amber-700">원화 대기</span>
        ) : r.usd && !r.amt ? (
          <span className="text-xs text-stone-400">청구 없음</span>
        ) : (
          <span className={skip ? "text-stone-400" : r.amt > 0 ? "font-semibold text-emerald-700" : "font-semibold text-stone-900"}>{flow(r.amt)}</span>
        )}
      </div>
      <div className="min-w-0">
        <CatSelect value={r.cat} onChange={(cat) => onCat(r, cat)} />
        {(BY_LABEL[r.by] || r.sure === "low") && (
          <div className={"mt-0.5 text-[10px] " + (r.sure === "low" ? "font-medium text-amber-700" : "text-stone-400")}>{r.sure === "low" ? "AI 추정 — 확인해 주세요" : BY_LABEL[r.by]}</div>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!r.cat}
          onClick={() => onOk(r)}
          aria-pressed={!!r.ok}
          aria-label={`${r.name} 확인`}
          title={r.cat ? (r.ok ? "확인 풀기" : "확인") : "분류를 먼저 골라 주세요"}
          className={"flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-40 " + (r.ok ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-300")}
        >
          <Check size={16} strokeWidth={3} />
        </button>
      </div>
    </li>
  );
});

function TxTab({ rows, stats, sources, filter, setFilter, onCat, onOk, onOkAll, onAsk, asking, askInfo }) {
  const [limit, setLimit] = useState(PAGE);
  const { view, src, cat, q } = filter;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "todo" && r.ok) return false;
      if (view === "none" && r.cat) return false;
      if (view === "pend" && !r.pend) return false;
      if (src && `${r.s}|${r.src}` !== src) return false;
      if (cat && r.cat !== cat) return false;
      if (t && !`${r.name} ${r.sub} ${r.cat}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [rows, view, src, cat, q]);
  const canOk = shown.filter((r) => r.cat && !r.ok);
  const views = [
    ["todo", `확인 전 ${stats.todo}`],
    ["all", `전체 ${stats.rows}`],
    ["none", `미분류 ${stats.none.n}`],
    ...(stats.pend.n ? [["pend", `원화 대기 ${stats.pend.n}`]] : []),
  ];
  const set = (patch) => {
    setLimit(PAGE);
    setFilter((f) => ({ ...f, ...patch }));
  };
  return (
    <div className="space-y-2.5">
      {askInfo.count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1 text-stone-700">
            규칙으로 못 나눈 곳이 <b className="tabular-nums">{askInfo.count}곳</b>({stats.none.n}건) 있어요. 직접 고르거나 Claude 에게 물어보세요.
          </span>
          <button type="button" disabled={asking} onClick={onAsk} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:bg-stone-400">
            {asking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {asking ? "묻는 중…" : `Claude 에게 묻기 · 약 ${askInfo.won}원`}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {views.map(([k, label]) => (
          <button key={k} type="button" onClick={() => set({ view: k })} aria-pressed={view === k} className={"rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums " + (view === k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" disabled={!canOk.length} onClick={() => onOkAll(canOk)} className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:border-stone-200 disabled:text-stone-300">
          <Check size={13} /> 보이는 {canOk.length}건 확인
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 @3xl:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <label className="relative col-span-2 block @3xl:col-span-1">
          <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => set({ q: e.target.value })} placeholder="이름·적요·분류 찾기" className={FIELD + " pl-8"} />
        </label>
        <select value={src} onChange={(e) => set({ src: e.target.value })} aria-label="통장·카드 거르기" className={FIELD}>
          <option value="">통장·카드 전부</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={cat} onChange={(e) => set({ cat: e.target.value })} aria-label="분류 거르기" className={FIELD}>
          <option value="">분류 전부</option>
          {CATS.map((c) => (
            <option key={c.k}>{c.k}</option>
          ))}
        </select>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {shown.slice(0, limit).map((r) => (
            <TxRow key={r.id} r={r} onCat={onCat} onOk={onOk} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-stone-200 bg-white py-10 text-center text-sm text-stone-400">{rows.length ? "이 조건에 맞는 거래가 없어요." : "이 달에는 거래가 없어요. 파일을 넣어 주세요."}</p>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-600 hover:border-stone-400">
          더 보기 · {shown.length - limit}건 남음
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 월별 손익

const niceTop = (v) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= v) || 10 * p;
};
const short = (v) => (v >= 1e8 ? `${(v / 1e8).toLocaleString()}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}만` : v.toLocaleString());

function MonthChart({ list, month, onMonth }) {
  const [hover, setHover] = useState("");
  const top = niceTop(Math.max(1, ...list.flatMap((x) => [x.income, x.expense])));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const pct = (v) => (Math.max(0, v) / top) * 100;
  const pick = list.find((x) => x.m === month);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-stone-800">
          월별 손익
          {pick && <span className="ml-2 font-normal text-stone-500 tabular-nums">{Number(pick.m.slice(5))}월 이익 {krw(pick.profit)}</span>}
        </h3>
        <div className="flex gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: IN_COLOR }} /> 수입
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT_COLOR }} /> 지출
          </span>
        </div>
      </div>
      <div className="relative h-52 pl-11">
        {ticks.map((f) => (
          <div key={f} className="absolute right-0 left-11 border-t border-stone-100" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 -left-11 w-9 text-right text-[10px] text-stone-400 tabular-nums">{short(top * f)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-11 flex">
          {list.map((x, i) => {
            const on = x.m === month;
            const edge = i < 2 ? "left-0" : i > list.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <button
                key={x.m}
                type="button"
                onClick={() => onMonth(x.m)}
                onMouseEnter={() => setHover(x.m)}
                onMouseLeave={() => setHover("")}
                onFocus={() => setHover(x.m)}
                onBlur={() => setHover("")}
                aria-pressed={on}
                aria-label={`${monthLabel(x.m)} 수입 ${won(x.income)}원 지출 ${won(x.expense)}원 이익 ${won(x.profit)}원`}
                className={"relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-md transition-colors " + (on ? "bg-stone-100/80" : hover === x.m ? "bg-stone-50" : "")}
              >
                <i data-bar="in" className="block w-[36%] max-w-6 rounded-t-[4px]" style={{ height: `${pct(x.income)}%`, minHeight: x.income > 0 ? 2 : 0, background: IN_COLOR }} />
                <i data-bar="out" className="block w-[36%] max-w-6 rounded-t-[4px]" style={{ height: `${pct(x.expense)}%`, minHeight: x.expense > 0 ? 2 : 0, background: OUT_COLOR }} />
                {hover === x.m && (
                  <span className={"pointer-events-none absolute top-1 z-10 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-left text-[11px] whitespace-nowrap text-stone-600 shadow-sm tabular-nums " + edge}>
                    <b className="block font-semibold text-stone-900">{monthLabel(x.m)}</b>
                    수입 {krw(x.income)}
                    <br />
                    지출 {krw(x.expense)}
                    <br />
                    이익 {krw(x.profit)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex pl-11">
        {list.map((x) => (
          <span key={x.m} className={"min-w-0 flex-1 text-center text-[10px] tabular-nums " + (x.m === month ? "font-semibold text-stone-900" : "text-stone-400")}>
            {Number(x.m.slice(5))}월
          </span>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="py-1.5 text-left font-medium">달</th>
              <th className="py-1.5 text-right font-medium">수입</th>
              <th className="py-1.5 text-right font-medium">지출</th>
              <th className="py-1.5 text-right font-medium">이익</th>
              <th className="py-1.5 text-right font-medium">미분류</th>
            </tr>
          </thead>
          <tbody>
            {[...list].reverse().map((x) => (
              <tr key={x.m} onClick={() => onMonth(x.m)} className={"cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 " + (x.m === month ? "font-semibold" : "")}>
                <td className="py-1.5 text-stone-700">{monthLabel(x.m)}</td>
                <td className="py-1.5 text-right text-stone-900">{krw(x.income)}</td>
                <td className="py-1.5 text-right text-stone-900">{krw(x.expense)}</td>
                <td className={"py-1.5 text-right " + (x.profit < 0 ? "text-rose-700" : "text-stone-900")}>{krw(x.profit)}</td>
                <td className={"py-1.5 text-right " + (x.none.n ? "text-amber-700" : "text-stone-300")}>{x.none.n ? `${x.none.n}건` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CatBars({ title, items, total, color, onCat, note }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((x) => Math.abs(x.v)), 1);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
        {total != null && <span className="text-sm font-bold text-stone-900 tabular-nums">₩{won(total)}</span>}
      </div>
      <ul className="space-y-1">
        {items.map((x) => (
          <li key={x.k}>
            <button type="button" onClick={() => onCat(x.k)} title={`${x.k} 거래 보기`} className="w-full rounded-md px-1 py-1 text-left hover:bg-stone-50">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-stone-700">{x.k}</span>
                <span className="shrink-0 font-semibold text-stone-900 tabular-nums">
                  ₩{won(Math.abs(x.v))}
                  {total > 0 && <span className="ml-1.5 inline-block w-8 text-right text-xs font-normal text-stone-400">{Math.round((x.v / total) * 100)}%</span>}
                </span>
              </span>
              {color && <span className="mt-1 block h-1.5 rounded-full" style={{ width: `${Math.max(1, (Math.abs(x.v) / max) * 100)}%`, background: color }} />}
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-stone-400">{note}</p>}
    </section>
  );
}

function PnlTab({ list, month, stats, onMonth, onCat }) {
  const pick = (type) =>
    Object.entries(stats.byCat)
      .filter(([k, v]) => catType(k) === type && v)
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return (
    <div className="space-y-3">
      {list.length > 0 && <MonthChart list={list} month={month} onMonth={onMonth} />}
      <div className="grid gap-3 @3xl:grid-cols-2">
        <CatBars title={`${Number(month.slice(5))}월 어디에 썼나`} items={pick("expense")} total={stats.expense} color={OUT_COLOR} onCat={onCat} />
        <div className="space-y-3">
          <CatBars title={`${Number(month.slice(5))}월 어디서 들어왔나`} items={pick("income")} total={stats.income} color={IN_COLOR} onCat={onCat} />
          <CatBars title="손익에서 뺀 돈" items={pick("skip")} onCat={onCat} note="카드값은 카드 내역으로 세서 통장 출금은 뺐어요. 대출 원금·내 계좌 이동·대표·개인도 손익에 안 넣어요." />
        </div>
      </div>
      <p className="text-center text-xs text-stone-400">통장·카드로 오간 돈 기준이에요. 카페24 매출 장부의 손익과는 들어온 날·반품 처리가 달라 숫자가 달라요.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 자금일보

function DayList({ title, rows, tone }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <h3 className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800">
        {title}
        <span className="text-xs font-normal text-stone-400">{rows.length}건</span>
      </h3>
      {rows.length ? (
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-10 shrink-0 text-xs text-stone-400 tabular-nums">{r.t.slice(0, 5)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-900">{r.name}</span>
                <span className="block truncate text-xs text-stone-400">
                  {r.s === "card" ? `카드 ${r.src} · ` : ""}
                  {r.cat || "미분류"}
                </span>
              </span>
              <span className={"shrink-0 font-semibold tabular-nums " + tone}>{r.pend ? <span className="text-xs text-amber-700">${r.usd}</span> : `₩${won(Math.abs(r.amt))}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-stone-400">없어요.</p>
      )}
    </section>
  );
}

function DailyTab({ allRows, accounts, day, setDay }) {
  const rep = useMemo(() => dailyReport(allRows, day), [allRows, day]);
  const sum = (k) => rep.accounts.reduce((a, x) => a + (x[k] || 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="전날" className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:border-stone-400">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="날짜" className="w-40 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600" />
        <button type="button" onClick={() => setDay(shiftDay(day, 1))} aria-label="다음 날" className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:border-stone-400">
          <ChevronRight size={16} />
        </button>
        <h3 className="ml-1 text-sm font-semibold text-stone-800">{dayLabel(day)} 자금일보</h3>
      </div>
      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[32rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="px-4 py-2 text-left font-medium">통장</th>
              <th className="px-2 py-2 text-right font-medium">전일 잔액</th>
              <th className="px-2 py-2 text-right font-medium">입금</th>
              <th className="px-2 py-2 text-right font-medium">출금</th>
              <th className="px-4 py-2 text-right font-medium">잔액</th>
            </tr>
          </thead>
          <tbody>
            {rep.accounts.map((a) => (
              <tr key={a.src} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-2.5 text-stone-800">
                  <span className="font-semibold">{a.src}</span> <span className="text-xs text-stone-400">{accounts?.[a.src] || ""}</span>
                </td>
                <td className="px-2 py-2.5 text-right text-stone-600">{a.open == null ? "-" : `₩${won(a.open)}`}</td>
                <td className="px-2 py-2.5 text-right font-medium text-emerald-700">{a.inn ? `₩${won(a.inn)}` : "-"}</td>
                <td className="px-2 py-2.5 text-right font-medium text-stone-900">{a.out ? `₩${won(a.out)}` : "-"}</td>
                <td className="px-4 py-2.5 text-right font-bold text-stone-900">{a.close == null ? "-" : `₩${won(a.close)}`}</td>
              </tr>
            ))}
            {rep.accounts.length > 1 && (
              <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
                <td className="px-4 py-2 text-stone-700">합계</td>
                <td className="px-2 py-2 text-right">₩{won(sum("open"))}</td>
                <td className="px-2 py-2 text-right">₩{won(sum("inn"))}</td>
                <td className="px-2 py-2 text-right">₩{won(sum("out"))}</td>
                <td className="px-4 py-2 text-right">₩{won(sum("close"))}</td>
              </tr>
            )}
            {!rep.accounts.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                  통장 내역을 넣으면 잔액이 나와요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <div className="grid gap-3 @3xl:grid-cols-2">
        <DayList title="입금" rows={rep.inn} tone="text-emerald-700" />
        <DayList title="출금" rows={rep.out} tone="text-stone-900" />
      </div>
      <DayList title={`카드 사용 ₩${won(rep.cardTotal)}${rep.pend ? ` · 원화 대기 ${rep.pend}건 빠짐` : ""}`} rows={rep.cards} tone="text-stone-900" />
      <p className="text-center text-xs text-stone-400">체크카드는 통장 출금에도 같이 보여요. 손익에는 카드 내역으로 한 번만 세요.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 규칙 · 파일

const IMPORT_DAY = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function RulesTab({ rules, index, month, monthRows, onRemoveRule, onClearMonth }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.entries(rules.rules || {})
      .map(([key, r]) => ({ key, ...r }))
      .filter((r) => !t || `${r.name} ${r.cat}`.toLowerCase().includes(t))
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }, [rules, q]);
  return (
    <div className="grid gap-3 @3xl:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-stone-800">분류 규칙 {Object.keys(rules.rules || {}).length}개</h3>
        <p className="mt-0.5 mb-2 text-xs text-stone-400">거래에서 분류를 고치면 여기에 남고, 다음부터 같은 곳은 그 분류로 들어가요.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·분류 찾기" className={FIELD} />
        <ul className="mt-2 max-h-[28rem] divide-y divide-stone-100 overflow-y-auto">
          {list.map((r) => (
            <li key={r.key} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-900">{r.name}</span>
                <span className="block truncate text-xs text-stone-400">
                  {r.key.startsWith("card") ? "카드" : r.key.startsWith("bank|in") ? "통장 입금" : "통장 출금"} · {r.by === "ai" ? `AI${r.why ? ` · ${r.why}` : ""}` : "직접 고침"}
                </span>
              </span>
              <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-700">{r.cat}</span>
              <button type="button" onClick={() => onRemoveRule(r.key)} aria-label={`${r.name} 규칙 지우기`} className="rounded p-1 text-stone-300 hover:text-rose-700">
                <X size={14} />
              </button>
            </li>
          ))}
          {!list.length && <li className="py-6 text-center text-sm text-stone-400">아직 규칙이 없어요.</li>}
        </ul>
      </section>
      <div className="space-y-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">넣은 파일</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-400">원본은 저장하지 않고 넣은 기록만 남아요.</p>
          <ul className="divide-y divide-stone-100">
            {(index.imports || []).slice(0, 30).map((f, i) => (
              <li key={i} className="py-1.5 text-sm">
                <span className="block text-stone-800">
                  {f.label} <span className="text-xs text-stone-400">{(f.srcs || []).join(" · ")}</span>
                </span>
                <span className="block text-xs text-stone-400 tabular-nums">
                  {IMPORT_DAY(f.at)} 넣음 · {f.from} ~ {f.to} · 새로 {f.added}
                  {f.filled ? ` · 원화 채움 ${f.filled}` : ""} · 이미 있음 {f.dup}
                </span>
              </li>
            ))}
            {!(index.imports || []).length && <li className="py-6 text-center text-sm text-stone-400">아직 넣은 파일이 없어요.</li>}
          </ul>
          {index.aiWon > 0 && <p className="mt-2 text-xs text-stone-500 tabular-nums">Claude 분류에 지금까지 약 {won(index.aiWon)}원 썼어요.</p>}
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">{monthLabel(month)} 내역 지우기</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-400">파일을 잘못 넣었을 때만 쓰세요. 고친 규칙은 남아요.</p>
          <button
            type="button"
            disabled={!monthRows.length}
            onClick={() => window.confirm(`${monthLabel(month)} 거래 ${monthRows.length}건을 지울까요? 확인 체크도 같이 지워져요.`) && onClearMonth()}
            className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-40"
          >
            <Trash2 size={13} /> {monthRows.length}건 지우기
          </button>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 화면

const STAMP_NOTE = 8000;

export default function FinancePage({ online, vendors }) {
  const { index, rules, data, loaded, msg, setMsg, changeMonth, changeIndex, changeRules } = useFinance(online);
  const [tab, setTabState] = useState(() => remember(TAB_KEY, "tx"));
  const [picked, setPicked] = useState(() => remember(MONTH_KEY, ""));
  const [filter, setFilter] = useState({ view: "todo", src: "", cat: "", q: "" });
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState(null);
  const [subs, setSubs] = useState([]);
  const [dayPicked, setDayPicked] = useState("");
  const fileRef = useRef(null);

  const setTab = (t) => {
    setTabState(t);
    keep(TAB_KEY, t);
  };
  // 구독 목록은 분류 힌트로만 — 없어도 된다
  useEffect(() => {
    loadKey("subscriptions", online, { items: [] })
      .then((v) => setSubs(v?.items || []))
      .catch(() => {});
  }, [online]);
  useEffect(() => {
    if (!note || note.sticky) return;
    const t = setTimeout(() => setNote(null), STAMP_NOTE);
    return () => clearTimeout(t);
  }, [note]);

  const months = useMemo(() => [...(index.months || [])].sort(), [index.months]);
  const month = picked && months.includes(picked) ? picked : months.at(-1) || "";
  const setMonth = (m) => {
    setPicked(m);
    keep(MONTH_KEY, m);
  };
  const monthRows = useMemo(() => data[month] || [], [data, month]);
  const allRows = useMemo(() => months.flatMap((m) => data[m] || []), [months, data]);
  const stats = useMemo(() => monthStats(monthRows), [monthRows]);
  const chart = useMemo(() => months.slice(-12).map((m) => ({ m, ...monthStats(data[m] || []) })), [months, data]);
  const ctx = useMemo(() => makeCtx({ rules: rules.rules, vendors, subs }), [rules, vendors, subs]);
  const sources = useMemo(() => {
    const m = new Map();
    for (const r of allRows) m.set(`${r.s}|${r.src}`, srcLabel(r));
    return [...m].sort().map(([key, label]) => ({ key, label }));
  }, [allRows]);
  const asks = useMemo(() => asksOf(monthRows), [monthRows]);
  const askInfo = { count: asks.length, won: askEstimate(Math.min(asks.length, 150)) };
  const lastBankDay = useMemo(() => allRows.reduce((a, r) => (r.s === "bank" && r.d > a ? r.d : a), ""), [allRows]);
  const day = dayPicked || lastBankDay || new Date().toISOString().slice(0, 10);

  // 여러 달에 걸친 고침 — 달 키마다 한 번씩
  const patchAll = useCallback(
    (patches, rowsLookup) => {
      const byMonth = {};
      for (const r of rowsLookup) if (patches.has(r.id)) (byMonth[r.d.slice(0, 7)] ||= new Map()).set(r.id, patches.get(r.id));
      return Promise.all(Object.entries(byMonth).map(([m, p]) => changeMonth(m, patchRows(p))));
    },
    [changeMonth],
  );

  // 파일 읽기 — 브라우저 안에서만
  const readFiles = async (list) => {
    const files = [...(list || [])];
    if (!files.length) return;
    setBusy(true);
    setMsg("");
    const good = [];
    const bad = [];
    for (const f of files) {
      const file = maskText(f.name || "파일");
      try {
        const got = parseFinance(parseTable(await fileToCsv(f, { raw: true })));
        if (got.error) bad.push({ file, why: got.error });
        else if (!got.rows.length) bad.push({ file, why: "거래가 한 줄도 없어요. 조회 기간을 확인해 주세요." });
        else good.push({ ...got, file });
      } catch {
        bad.push({ file, why: "파일을 읽지 못했어요. .xls · .xlsx · .csv 파일인지 확인해 주세요." });
      }
    }
    setBusy(false);
    if (!good.length) return setMsg(bad.map((b) => `${b.file} — ${b.why}`).join(" / "));
    setPreview({ files: good, bad, plan: planImport(good, allRows.map((r) => ({ ...r })), ctx) });
  };

  const applyImport = async () => {
    const { plan, files } = preview;
    setPreview(null);
    const at = new Date().toISOString();
    const addBy = groupByMonth(plan.adds);
    const patchBy = {};
    for (const r of allRows) if (plan.patches.has(r.id)) (patchBy[r.d.slice(0, 7)] ||= new Map()).set(r.id, plan.patches.get(r.id));
    const touched = [...new Set([...Object.keys(addBy), ...Object.keys(patchBy)])];
    const accounts = Object.assign({}, ...files.map((f) => f.accounts || {}));
    const log = plan.report.map((r) => ({ at, label: r.label, srcs: r.srcs, from: r.from, to: r.to, added: r.added, filled: r.filled, dup: r.dup }));
    const newest = [...touched].sort().at(-1);
    await changeIndex((v) => ({ ...v, months: [...new Set([...(v.months || []), ...touched])].sort(), accounts: { ...(v.accounts || {}), ...accounts }, imports: [...log, ...(v.imports || [])].slice(0, 60) }));
    const done = await Promise.all(touched.map((m) => changeMonth(m, addRows(addBy[m] || [], patchBy[m]))));
    if (done.every(Boolean)) {
      const filled = plan.report.reduce((a, r) => a + r.filled, 0);
      setNote({ text: `새로 ${plan.adds.length}건 넣었어요${filled ? ` · 해외 ${filled}건 원화 채움` : ""}` });
      if (newest) setMonth(newest);
      setTab("tx");
      setFilter({ view: "todo", src: "", cat: "", q: "" });
    }
  };

  const onOk = useCallback((r) => changeMonth(r.d.slice(0, 7), patchRows(new Map([[r.id, { ok: !r.ok }]]))), [changeMonth]);
  const onOkAll = (rows) => {
    const on = new Map(rows.map((r) => [r.id, { ok: true }]));
    patchAll(on, rows);
    setNote({
      text: `${rows.length}건 확인했어요`,
      undo: () => {
        patchAll(new Map(rows.map((r) => [r.id, { ok: false }])), rows);
        setNote(null);
      },
    });
  };
  // 고치면 다음부터 그 규칙으로 — 같은 곳의 아직 확인 안 한 줄도 같이
  const allRef = useRef(allRows);
  useEffect(() => {
    allRef.current = allRows;
  }, [allRows]);
  const onCat = useCallback(
    (r, cat) => {
      const key = ruleKey(r);
      const others = allRef.current.filter((x) => x.id !== r.id && ruleKey(x) === key && !x.ok && x.by !== "user");
      const patches = new Map([[r.id, cat ? { cat, by: "user", sure: "", ok: true } : { cat: "", by: "", sure: "", ok: false }]]);
      if (cat) for (const x of others) patches.set(x.id, { cat, by: "rule", sure: "" });
      patchAll(patches, [r, ...others]);
      const stamp = new Date().toISOString();
      changeRules((v) => {
        const next = { ...(v.rules || {}) };
        if (cat) next[key] = { cat, by: "user", name: r.name, at: stamp };
        else delete next[key];
        return { ...v, rules: next };
      });
      if (cat) setNote({ text: others.length ? `같은 곳 ${others.length}건도 '${cat}'(으)로 바꿨어요. 다음부터 이 분류로 들어가요.` : `'${cat}'(으)로 기억했어요. 다음부터 이 분류로 들어가요.` });
    },
    [patchAll, changeRules],
  );

  const askClaude = async () => {
    const batch = asks.slice(0, 150);
    if (!batch.length) return;
    setAsking(true);
    setMsg("");
    try {
      const res = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "classify", items: batch.map(({ s, io, name, sub, n, total }) => ({ s, io, name, sub, n, total })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || `Claude 에게 묻지 못했어요 (${res.status})`);
      const stamp = new Date().toISOString();
      const answers = new Map();
      for (const a of j.items || []) if (batch[a.i] && catType(a.cat)) answers.set(batch[a.i].key, a);
      const patches = new Map();
      const hits = [];
      for (const r of allRef.current) {
        const a = !r.cat && answers.get(ruleKey(r));
        if (!a) continue;
        patches.set(r.id, { cat: a.cat, by: "ai", sure: a.sure });
        hits.push(r);
      }
      await patchAll(patches, hits);
      // 확신 낮은 답은 규칙으로 안 남긴다 — 다음에 또 짐작으로 들어가지 않게
      changeRules((v) => {
        const next = { ...(v.rules || {}) };
        for (const [key, a] of answers) {
          if (a.sure === "low" || next[key]?.by === "user") continue;
          const g = batch.find((x) => x.key === key);
          next[key] = { cat: a.cat, by: "ai", why: a.why, name: g?.name || "", at: stamp };
        }
        return { ...v, rules: next };
      });
      const spent = j._cost?.won || 0;
      changeIndex((v) => ({ ...v, aiWon: (v.aiWon || 0) + spent }));
      const low = [...answers.values()].filter((a) => a.sure === "low").length;
      setNote({ text: `${answers.size}곳을 분류했어요 · ${spent}원 들었어요${low ? ` · 짐작 ${low}곳은 'AI 추정'으로 표시` : ""}${asks.length > 150 ? ` · 남은 ${asks.length - 150}곳은 한 번 더 눌러 주세요` : ""}`, sticky: true });
    } catch (e) {
      setMsg(e.message || "Claude 에게 묻지 못했어요.");
    } finally {
      setAsking(false);
    }
  };

  const removeRule = (key) =>
    changeRules((v) => {
      const next = { ...(v.rules || {}) };
      delete next[key];
      return { ...v, rules: next };
    });
  const clearMonth = async () => {
    const m = month;
    await changeMonth(m, (v) => ({ ...v, rows: [] }));
    await changeIndex((v) => ({ ...v, months: (v.months || []).filter((x) => x !== m) }));
    setNote({ text: `${monthLabel(m)} 내역을 지웠어요.` });
  };
  const showCat = (cat) => {
    setFilter({ view: "all", src: "", cat, q: "" });
    setTab("tx");
  };

  const hasData = months.length > 0;
  return (
    <div
      className="@container"
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDrag(false)}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setDrag(false);
        readFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".xls,.xlsx,.csv"
        hidden
        data-testid="finance-file"
        onChange={(e) => {
          readFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-stone-900">재무 비서</h2>
        {hasData && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white">
              <button type="button" disabled={!months.includes(shiftMonth(month, -1))} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="전달" className="p-2 text-stone-500 disabled:text-stone-200">
                <ChevronLeft size={15} />
              </button>
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="달 고르기" className="bg-transparent py-1.5 text-sm font-semibold text-stone-800 outline-none">
                {[...months].reverse().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!months.includes(shiftMonth(month, 1))} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달" className="p-2 text-stone-500 disabled:text-stone-200">
                <ChevronRight size={15} />
              </button>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} 파일 넣기
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="min-w-0 flex-1">{msg}</span>
          <button type="button" onClick={() => setMsg("")} aria-label="닫기" className="shrink-0 text-rose-400">
            <X size={15} />
          </button>
        </div>
      )}
      {note && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="min-w-0 flex-1">{note.text}</span>
          {note.undo && (
            <button type="button" onClick={note.undo} className="shrink-0 font-semibold underline">
              되돌리기
            </button>
          )}
          <button type="button" onClick={() => setNote(null)} aria-label="닫기" className="shrink-0 text-emerald-500">
            <X size={15} />
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="py-16 text-center text-sm text-stone-400">불러오는 중…</p>
      ) : !hasData ? (
        <EmptyDrop busy={busy} drag={drag} onPick={() => fileRef.current?.click()} />
      ) : (
        <>
          {drag && <div className="mb-3 rounded-2xl border-2 border-dashed border-rose-400 bg-rose-50/60 py-6 text-center text-sm font-semibold text-rose-800">여기에 놓으면 읽어요</div>}
          <div className="mb-3 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
            <Kpi label={`${Number(month.slice(5))}월 수입`} value={krw(stats.income)} tone="emerald" />
            <Kpi label={`${Number(month.slice(5))}월 지출`} value={krw(stats.expense)} />
            <Kpi label="이익" value={krw(stats.profit)} tone={stats.profit < 0 ? "rose" : undefined} sub="수입 − 지출" />
            <Kpi label="확인 전" value={`${stats.todo}건`} tone={stats.todo ? "amber" : "emerald"} sub={stats.none.n ? `미분류 ${stats.none.n}건 · 손익에서 빠짐` : "분류 끝"} />
          </div>
          {stats.none.n > 0 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">
              미분류 {stats.none.n}건(출금 ₩{won(stats.none.out)} · 입금 ₩{won(stats.none.inn)})은 아직 손익에 안 들어갔어요.
            </p>
          )}
          {stats.cardOut > 0 && !stats.cardRows && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">이 달 카드 내역이 없어요. 통장에서 카드로 나간 ₩{won(stats.cardOut)}이 지출에 안 잡혔어요. 국민카드 파일을 넣어 주세요.</p>
          )}
          {stats.pend.n > 0 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">
              해외 결제 {stats.pend.n}건(${Math.round(stats.pend.usd * 100) / 100})은 승인내역에 달러만 있어 지출에 안 잡혔어요. 국민카드 해외매입내역을 넣으면 원화로 채워져요.
            </p>
          )}
          <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1">
            <Tab active={tab === "tx"} onClick={() => setTab("tx")}>
              거래 분류
            </Tab>
            <Tab active={tab === "pnl"} onClick={() => setTab("pnl")}>
              월별 손익
            </Tab>
            <Tab active={tab === "daily"} onClick={() => setTab("daily")}>
              자금일보
            </Tab>
            <Tab active={tab === "rules"} onClick={() => setTab("rules")}>
              규칙·파일
            </Tab>
          </div>
          {tab === "pnl" ? (
            <PnlTab list={chart} month={month} stats={stats} onMonth={setMonth} onCat={showCat} />
          ) : tab === "daily" ? (
            <DailyTab allRows={allRows} accounts={index.accounts} day={day} setDay={setDayPicked} />
          ) : tab === "rules" ? (
            <RulesTab rules={rules} index={index} month={month} monthRows={monthRows} onRemoveRule={removeRule} onClearMonth={clearMonth} />
          ) : (
            <TxTab rows={monthRows} stats={stats} sources={sources} filter={filter} setFilter={setFilter} onCat={onCat} onOk={onOk} onOkAll={onOkAll} onAsk={askClaude} asking={asking} askInfo={askInfo} />
          )}
        </>
      )}
      {preview && <ImportPreview preview={preview} onApply={applyImport} onClose={() => setPreview(null)} />}
    </div>
  );
}
