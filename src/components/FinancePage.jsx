import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Coins,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  Percent,
  Printer,
  Receipt,
  Repeat,
  Search,
  Send,
  Shirt,
  Smartphone,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  Upload,
  User,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, onSettingsChange, watchKeys, FIELD } from "../lib/shoot";
import { queueChange, withPending, saveMark } from "../lib/saveQueue";
import { fileToCsv } from "../lib/tabular";
import { buildGroups, stockTotals } from "../lib/stock";
import { daysUntil, monthly, nextPay } from "../lib/subs";
import { Sheet, SheetHead } from "./ShootBits";
import {
  CATS,
  COST_KINDS,
  FEE_NAME,
  INDEX_KEY,
  RULES_KEY,
  addRows,
  askContext,
  askEstimate,
  asksOf,
  balanceSeries,
  catType,
  channelsOf,
  costSplit,
  dailyReport,
  dailyText,
  groupByMonth,
  makeCtx,
  maskText,
  monthKey,
  monthLabel,
  monthStats,
  netWorth,
  parseFinance,
  parseTable,
  patchRows,
  planImport,
  plOf,
  recurringOf,
  ruleKey,
  salesBoard,
  salesByMonth,
  shiftDay,
  shiftMonth,
  suggestsOf,
  tagsOf,
  wordHit,
} from "../lib/finance";

/**
 * 돈 › 재무 비서 (lib/finance.js 머리말). 그랜터(granter.biz)의 화면 구성·흐름을 따르고 색·부품은 ERP 것(11/1 세원).
 * 왼쪽 메뉴: 대시보드 · 거래내역 분류 · 분석 · 매출·정산 · 자금일보 · 규칙·파일. 연결은 엑셀 끌어다 놓기(API 안 씀).
 * 분류는 규칙 먼저, 남은 곳만 버튼으로 Claude → 제안 카드에서 ✓/✕. 원본 파일은 저장하지 않고 번호는 끝 4자리만.
 */

const MONTH_KEY = "poclo_finance_month";
const NO_MONTH = { rows: [] };
const NO_INDEX = { months: [], accounts: {}, imports: [] };
const NO_RULES = { rules: {} };
const PAGE = 60;
// 막대 색 — dataviz validate_palette 통과(이 순서로 네 벌). 글자엔 안 쓴다
const C1 = "#2563eb";
const C2 = "#e11d48";
const C3 = "#0891b2";
const C4 = "#d97706";
const KIND_COLOR = { fixed: C1, var: C2, etc: C3 };
const TITLES = { finance: "대시보드", financeTx: "거래내역 분류", financePnl: "분석", financeSales: "매출·정산", financeDaily: "자금일보", financeRules: "규칙·파일" };

const CAT_ICON = {
  "매출 입금": Wallet,
  "기타 수입": Coins,
  "상품 매입": Shirt,
  광고비: Megaphone,
  "택배·물류": Truck,
  "인건비·외주": Users,
  "구독·프로그램": Repeat,
  "수수료·세무": Receipt,
  "임차·관리비": Building2,
  통신비: Smartphone,
  "소모품·사무": Paperclip,
  "식대·복리후생": Utensils,
  "교통·차량": Car,
  "세금·공과": Landmark,
  "이자·금융비용": Percent,
  "기타 경비": MoreHorizontal,
  "카드 대금": CreditCard,
  "내 계좌 이동": ArrowLeftRight,
  "대출 원금": Banknote,
  "대표·개인": User,
};

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
const day2 = (d) => `${Number(d.slice(5, 7))}.${String(Number(d.slice(8, 10))).padStart(2, "0")}`;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${WEEK[new Date(`${d}T00:00:00`).getDay()]})`;
const srcLabel = (r) => `${r.s === "card" ? "카드" : "통장"} ${r.src}`;
const mon = (m) => `${Number(m.slice(5))}월`;
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
async function saveXlsx(name, rows) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "내역");
  XLSX.writeFile(wb, name);
}

// 메뉴를 옮겨 다닐 때 다시 '불러오는 중'이 안 뜨게 탭에 들고 있는다(읽기는 뒤에서 다시)
const MEM = { index: null, rules: null, data: {}, chat: [] };
let nextFilter = null;

function useFinance(online) {
  const [index, setIndex] = useState(MEM.index || NO_INDEX);
  const [rules, setRules] = useState(MEM.rules || NO_RULES);
  const [data, setData] = useState(MEM.data);
  const [loaded, setLoaded] = useState(!!MEM.index);
  const [msg, setMsg] = useState("");
  const haveMonths = useRef(new Set());
  useEffect(() => {
    MEM.index = index;
    MEM.rules = rules;
    MEM.data = data;
  }, [index, rules, data]);

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

// ---------------------------------------------------------------- 계정과목 · 거래 줄

function CatSelect({ value, onChange }) {
  const Icon = CAT_ICON[value] || CircleHelp;
  return (
    <span className="relative block min-w-0">
      <Icon size={14} className={"pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 " + (value ? "text-stone-500" : "text-amber-700")} />
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label="계정과목" className={"w-full min-w-0 rounded-lg border py-1.5 pr-1 pl-7 text-sm outline-none focus:border-rose-600 " + (value ? "border-stone-200 bg-white text-stone-800" : "border-amber-300 bg-amber-50 text-amber-800")}>
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
    </span>
  );
}

const BY_LABEL = { rule: "내 규칙", erp: "거래처", ai: "AI" };
const GRID = "@3xl:grid-cols-[3.25rem_minmax(0,1fr)_7.5rem_10.5rem_4.75rem]";

const TxRow = memo(function TxRow({ r, onCat, onOk, onOpen }) {
  const skip = catType(r.cat) === "skip";
  return (
    <li style={{ contentVisibility: "auto", containIntrinsicSize: "auto 60px" }} className={"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 @3xl:py-2 " + GRID + " " + (r.ok ? "bg-stone-50/70" : "")}>
      <span className="hidden text-xs text-stone-500 tabular-nums @3xl:block">{day2(r.d)}</span>
      <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium text-stone-900 hover:text-rose-700" title={r.name}>
          {r.name}
          {r.cancel && <span className="ml-1 rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500">취소</span>}
          {r.memo && <span className="ml-1 rounded bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-700">메모</span>}
          {(r.tags || []).map((t) => (
            <span key={t} className="ml-1 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700">
              {t}
            </span>
          ))}
        </span>
        <span className="block truncate text-xs text-stone-400">
          <span className="@3xl:hidden">{day2(r.d)} · </span>
          {srcLabel(r)}
          {r.sub ? ` · ${r.sub}` : ""}
          {r.usd ? ` · $${r.usd}` : ""}
        </span>
      </button>
      <div className="text-right text-sm tabular-nums">
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
        {(BY_LABEL[r.by] || r.sure === "low") && <div className={"mt-0.5 truncate text-[10px] " + (r.sure === "low" ? "font-medium text-amber-700" : "text-stone-400")}>{r.sure === "low" ? "AI 추정 — 확인해 주세요" : BY_LABEL[r.by]}</div>}
      </div>
      <div className="flex justify-end gap-0.5">
        <button type="button" disabled={!r.cat} onClick={() => onOk(r)} aria-pressed={!!r.ok} aria-label={`${r.name} 맞아요`} title={r.cat ? (r.ok ? "확인 풀기" : "맞아요") : "계정과목을 먼저 골라 주세요"} className={"flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-30 " + (r.ok ? "bg-emerald-600 text-white" : "text-stone-400 hover:bg-emerald-50 hover:text-emerald-700")}>
          <ThumbsUp size={15} />
        </button>
        <button type="button" disabled={!r.cat} onClick={() => onCat(r, "")} aria-label={`${r.name} 틀렸어요`} title="틀렸어요 — 미분류로 되돌려요" className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30">
          <ThumbsDown size={15} />
        </button>
      </div>
    </li>
  );
});

function RowHead() {
  return (
    <li className={"hidden items-center gap-x-3 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-500 @3xl:grid " + GRID}>
      <span>날짜</span>
      <span>내역</span>
      <span className="text-right">금액</span>
      <span>계정과목</span>
      <span className="text-right">피드백</span>
    </li>
  );
}

/** 거래 한 건 — 메모(사유)·태그·같은 곳 내역 (그랜터 '사유작성'·'태그') */
function TxDetail({ r, allRows, allTags, onCat, onPatch, onClose }) {
  const key = ruleKey(r);
  const same = useMemo(() => allRows.filter((x) => ruleKey(x) === key).sort((a, b) => `${b.d}${b.t}`.localeCompare(`${a.d}${a.t}`)), [allRows, key]);
  const [memoText, setMemo] = useState(r.memo || "");
  const [tag, setTag] = useState("");
  const addTag = (raw) => {
    const t = String(raw || "").trim().replace(/^#/, "").slice(0, 16);
    if (t && !(r.tags || []).includes(t)) onPatch(r, { tags: [...(r.tags || []), t] });
    setTag("");
  };
  const total = same.reduce((a, x) => a + x.amt, 0);
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="거래 자세히" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="text-center">
          <div className="text-xs text-stone-500 tabular-nums">
            {dayLabel(r.d)} {r.t.slice(0, 5)} · {srcLabel(r)}
          </div>
          <div className="mt-1 font-medium break-words text-stone-800">{r.name}</div>
          <div className="mt-0.5 text-2xl font-bold text-stone-900 tabular-nums">{r.pend ? `$${r.usd}` : flow(r.amt)}</div>
          {r.sub && <div className="mt-0.5 text-xs text-stone-400">{r.sub}</div>}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">계정과목</span>
          <CatSelect value={r.cat} onChange={(cat) => onCat(r, cat)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">메모 · 사유</span>
          <textarea value={memoText} onChange={(e) => setMemo(e.target.value)} onBlur={() => memoText !== (r.memo || "") && onPatch(r, { memo: memoText.trim() })} placeholder="예: 10월 촬영 소품, 세무사님 확인 필요" className={FIELD + " h-16 resize-y"} />
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-stone-500">태그</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(r.tags || []).map((t) => (
              <span key={t} className="flex items-center gap-0.5 rounded-full bg-rose-50 py-0.5 pr-1 pl-2 text-xs font-medium text-rose-800">
                {t}
                <button type="button" onClick={() => onPatch(r, { tags: (r.tags || []).filter((x) => x !== t) })} aria-label={`${t} 빼기`} className="rounded-full p-0.5 hover:bg-rose-100">
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTag(tag);
                }
              }}
              onBlur={() => tag && addTag(tag)}
              placeholder="+ 태그 (예: 촬영)"
              aria-label="태그 더하기"
              className="w-28 rounded-md border border-stone-200 px-2 py-1 text-xs outline-none focus:border-rose-400"
            />
            {allTags
              .filter((t) => !(r.tags || []).includes(t))
              .slice(0, 6)
              .map((t) => (
                <button key={t} type="button" onClick={() => addTag(t)} className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700">
                  + {t}
                </button>
              ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs font-semibold text-stone-500">
            같은 곳 {same.length}건 <span className="font-medium tabular-nums">{flow(total)}</span>
          </div>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {same.slice(0, 8).map((x) => (
              <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="w-10 shrink-0 text-stone-400 tabular-nums">{day2(x.d)}</span>
                <span className="min-w-0 flex-1 truncate text-stone-600">{x.cat || "미분류"}</span>
                <span className="font-medium text-stone-800 tabular-nums">{x.pend ? `$${x.usd}` : flow(x.amt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

/** AI 제안 승인 카드 — 그랜터 '미분류 내역 자동채우기'. 곳마다 한 장, ✓ 승인 / ✕ 빼기 */
function SuggestDeck({ groups, onAccept, onReject, onClose }) {
  const [i, setI] = useState(0);
  const g = groups[i];
  const [cat, setCat] = useState(g?.cat || "");
  const next = () => {
    const n = i + 1;
    if (n >= groups.length) return onClose(true);
    setI(n);
    setCat(groups[n].cat);
  };
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.("select, input, textarea")) return;
      if (e.key === "ArrowRight") document.querySelector("[data-deck-ok]")?.click();
      if (e.key === "ArrowLeft") document.querySelector("[data-deck-no]")?.click();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  if (!g) return null;
  return (
    <Sheet onClose={() => onClose(false)}>
      <div className="flex items-start justify-between border-b border-stone-100 px-4 pt-3 pb-2">
        <div>
          <div className="text-xs text-stone-400 tabular-nums">
            {i + 1}/{groups.length}
          </div>
          <div className="font-semibold text-stone-900">미분류 내역 자동채우기</div>
        </div>
        <button type="button" onClick={() => onClose(false)} aria-label="닫기" className="p-1 text-stone-400 hover:text-stone-700">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div className="text-center">
          <div className="text-xs text-stone-400 tabular-nums">
            {dayLabel(g.d)} · {g.s === "card" ? "카드" : "통장"} {g.src}
          </div>
          <div className="mt-1 text-sm font-medium break-words text-stone-700">{g.name}</div>
          <div className="mt-1 text-2xl font-bold text-stone-900 tabular-nums">{g.rows[0].pend ? `$${g.rows[0].usd}` : `${won(g.total)}원`}</div>
          {g.n > 1 && <div className="mt-0.5 text-xs text-stone-500">같은 곳 {g.n}건을 합친 금액이에요</div>}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">계정과목</div>
          <div className="flex items-center gap-2 rounded-xl bg-stone-100 p-2">
            <span className="flex shrink-0 items-center gap-1 px-1 text-xs text-stone-500">
              <CircleHelp size={14} /> 미분류
            </span>
            <span className="text-stone-400">→</span>
            <span className="min-w-0 flex-1">
              <CatSelect value={cat} onChange={setCat} />
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">판단 근거</div>
          <p className="text-sm leading-relaxed text-stone-700">
            {g.why || "이름만 보고 짐작했어요."}
            {g.sure === "low" && <span className="ml-1 font-medium text-amber-700">확신이 낮아요.</span>}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-deck-no
            onClick={() => {
              onReject(g);
              next();
            }}
            aria-label="빼기"
            title="빼기 — 미분류로 둬요 (←)"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
          >
            <X size={20} strokeWidth={2.6} />
          </button>
          <button
            type="button"
            data-deck-ok
            disabled={!cat}
            onClick={() => {
              onAccept(g, cat);
              next();
            }}
            aria-label="승인"
            title="승인 — 다음부터 이 분류로 (→)"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-stone-300"
          >
            <Check size={20} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 막대

const niceTop = (v) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= v) || 10 * p;
};
const short = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e8 ? `${(a / 1e8).toLocaleString()}억` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString()}만` : a.toLocaleString();
  return v < 0 ? `-${s}` : s;
};

/** 달마다 막대 — series [{k,label,color}]. stacked 면 쌓고, 아니면 나란히(음수 허용). 범례·올리면 풀이·누르면 그 달 */
function MonthBars({ list, series, month, onMonth, stacked, legend = true }) {
  const [hover, setHover] = useState("");
  const vals = stacked ? list.map((x) => series.reduce((a, s) => a + Math.max(0, x[s.k] || 0), 0)) : list.flatMap((x) => series.map((s) => x[s.k] || 0));
  const hi = niceTop(Math.max(1, ...vals));
  const low = Math.min(0, ...vals);
  const lo = low < 0 ? -niceTop(-low) : 0;
  const y = (v) => ((v - lo) / (hi - lo)) * 100;
  const zero = y(0);
  const ticks = lo < 0 ? [hi, hi / 2, 0, lo] : [hi, hi * 0.75, hi * 0.5, hi * 0.25, 0];
  const width = stacked ? 44 : Math.floor(76 / series.length);
  return (
    <div>
      {legend && (
        <div className="mb-2 flex flex-wrap justify-end gap-3 text-xs text-stone-500">
          {series.map((s) => (
            <span key={s.k} className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative h-52 pl-11">
        {ticks.map((f) => (
          <div key={f} className={"absolute right-0 left-11 border-t " + (f === 0 ? "border-stone-300" : "border-stone-100")} style={{ bottom: `${y(f)}%` }}>
            <span className="absolute -top-2 -left-11 w-9 text-right text-[10px] text-stone-400 tabular-nums">{short(f)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-11 flex">
          {list.map((x, i) => {
            const on = x.m === month;
            const edge = i < 2 ? "left-0" : i > list.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            let base = 0;
            return (
              <button
                key={x.m}
                type="button"
                onClick={() => onMonth?.(x.m)}
                onMouseEnter={() => setHover(x.m)}
                onMouseLeave={() => setHover("")}
                onFocus={() => setHover(x.m)}
                onBlur={() => setHover("")}
                aria-pressed={on}
                data-month={x.m}
                aria-label={`${monthLabel(x.m)} ${series.map((s) => `${s.label} ${won(x[s.k] || 0)}원`).join(" ")}`}
                className={"relative flex h-full min-w-0 flex-1 justify-center gap-[2px] rounded-t-md transition-colors " + (on ? "bg-stone-100/80" : hover === x.m ? "bg-stone-50" : "")}
              >
                {stacked ? (
                  <span className="relative h-full" style={{ width: `${width}%`, maxWidth: 24 }}>
                    {series.map((s, si) => {
                      const v = Math.max(0, x[s.k] || 0);
                      const b = y(base);
                      base += v;
                      const h = y(base) - b;
                      if (!v) return null;
                      const top = series.slice(si + 1).every((t) => !(x[t.k] > 0));
                      return <i key={s.k} data-bar={s.k} className={"absolute inset-x-0 block " + (top ? "rounded-t-[4px]" : "")} style={{ bottom: `${b}%`, height: `${h}%`, minHeight: 2, background: s.color, borderTop: top ? 0 : "2px solid #fff" }} />;
                    })}
                  </span>
                ) : (
                  series.map((s) => {
                    const v = x[s.k] || 0;
                    const h = Math.abs(y(v) - zero);
                    return (
                      <span key={s.k} className="relative h-full" style={{ width: `${width}%`, maxWidth: 24 }}>
                        {v !== 0 && <i data-bar={s.k} className={"absolute inset-x-0 block " + (v > 0 ? "rounded-t-[4px]" : "rounded-b-[4px]")} style={{ bottom: `${Math.min(y(v), zero)}%`, height: `${h}%`, minHeight: 2, background: s.color }} />}
                      </span>
                    );
                  })
                )}
                {hover === x.m && (
                  <span className={"pointer-events-none absolute top-1 z-10 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-left text-[11px] whitespace-nowrap text-stone-600 shadow-sm tabular-nums " + edge}>
                    <b className="block font-semibold text-stone-900">{monthLabel(x.m)}</b>
                    {series.map((s) => (
                      <span key={s.k} className="block">
                        {s.label} {krw(x[s.k] || 0)}
                      </span>
                    ))}
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
            {mon(x.m)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Warnings({ stats }) {
  return (
    <>
      {!stats.bankRows && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">이 달 통장 내역이 없어요. 거래처로 보낸 돈·택배비처럼 통장에서 나간 돈이 지출에 안 잡혀서 이익이 실제보다 커요.</p>}
      {stats.none.n > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">
          미분류 {stats.none.n}건(출금 ₩{won(stats.none.out)} · 입금 ₩{won(stats.none.inn)})은 아직 손익에 안 들어갔어요.
        </p>
      )}
      {stats.cardOut > 0 && !stats.cardRows && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">이 달 카드 내역이 없어요. 통장에서 카드로 나간 ₩{won(stats.cardOut)}이 지출에 안 잡혔어요. 국민카드 파일을 넣어 주세요.</p>}
      {stats.pend.n > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 tabular-nums">
          해외 결제 {stats.pend.n}건(${Math.round(stats.pend.usd * 100) / 100})은 승인내역에 달러만 있어 지출에 안 잡혔어요. 국민카드 해외매입내역을 넣으면 원화로 채워져요.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 대시보드

function Card({ title, right, children, className = "" }) {
  return (
    <section className={"rounded-2xl border border-stone-200 bg-white p-4 " + className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-stone-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Line({ color, label, value, sub, tone }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      {color && <i className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm" style={{ background: color }} />}
      <span className="min-w-0 flex-1 truncate text-stone-500">{label}</span>
      {sub && <span className="text-stone-400 tabular-nums">{sub}</span>}
      <span className={"font-semibold tabular-nums " + (tone || "text-stone-800")}>{value}</span>
    </div>
  );
}

function AskBox({ chart, month, monthRows }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState(MEM.chat);
  const send = async (q0) => {
    const q = String(q0 ?? text).trim();
    if (!q || busy) return;
    setBusy(true);
    setMsg("");
    setText("");
    setChat((c) => [...c, { role: "me", text: q }]);
    try {
      const res = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ask", question: q, context: askContext(chart, month, monthRows) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || `답을 못 받았어요 (${res.status})`);
      setChat((c) => {
        const next = [...c, { role: "ai", text: j.text, won: j._cost?.won }];
        MEM.chat = next;
        return next;
      });
    } catch (e) {
      setMsg(e.message || "답을 못 받았어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sticky bottom-3 z-10 rounded-2xl border border-stone-200 bg-white/95 p-2.5 shadow-sm backdrop-blur md:mr-16">
      {chat.length > 0 && (
        <ul className="mb-2 max-h-72 space-y-2 overflow-y-auto px-1">
          {chat.map((c, i) => (
            <li key={i} className={"flex " + (c.role === "me" ? "justify-end" : "justify-start")}>
              <span className={"max-w-[90%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap " + (c.role === "me" ? "rounded-br-md bg-rose-700 text-white" : "rounded-bl-md bg-stone-100 text-stone-800")}>
                {c.text}
                {c.won > 0 && <span className="ml-1.5 text-[10px] text-stone-400">약 {c.won}원</span>}
              </span>
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-1.5 px-1 text-xs text-stone-500">
              <Loader2 size={12} className="animate-spin" /> 숫자 보는 중…
            </li>
          )}
        </ul>
      )}
      {!chat.length && (
        <div className="mb-1.5 hidden flex-wrap gap-1 px-0.5 @3xl:flex">
          {[`${mon(month)}에 왜 이렇게 나갔어?`, "광고비가 매출의 몇 %야?", "줄일 만한 비용이 뭐야?"].map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-800">
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="재무 비서에게 물어보기 — 한 번에 약 20~50원"
          aria-label="재무 비서에게 물어보기"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500"
        />
        <button type="button" disabled={busy || !text.trim()} onClick={() => send()} aria-label="보내기" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-700 text-white disabled:bg-stone-300">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
      {msg && <p className="mt-1 px-1 text-xs text-rose-700">{msg}</p>}
    </section>
  );
}

function HomeView({ F }) {
  const { month, stats, monthRows, allRows, chart, kinds, subs, stock, askInfo, asking, onAsk, suggests, openDeck, onPage, onCat, onOk, openDetail, months } = F;
  const split = useMemo(() => costSplit(stats, kinds), [stats, kinds]);
  const worth = useMemo(() => netWorth(allRows, stock), [allRows, stock]);
  const auto = monthRows.filter((r) => r.cat && ["auto", "erp", "rule", "ai"].includes(r.by)).length;
  const subMonthly = subs.reduce((a, s) => a + monthly(s), 0);
  const nextSubs = useMemo(
    () =>
      subs
        .filter((s) => s.status !== "ended")
        .map((s) => ({ s, day: nextPay(s) }))
        .filter((x) => x.day)
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(0, 3),
    [subs],
  );
  const recent = useMemo(() => monthRows.filter((r) => r.cat && !["카드 대금"].includes(r.cat)).slice(0, 10), [monthRows]);
  const recentSum = recent.reduce((a, r) => a + Math.abs(r.amt), 0);
  const balances = useMemo(() => balanceSeries(allRows, months.slice(-12)).filter((x) => x.total != null).map((x) => ({ m: x.m, total: x.total })), [allRows, months]);
  const recurring = useMemo(() => recurringOf(allRows, subs), [allRows, subs]);
  return (
    <div className="space-y-3">
      <Warnings stats={stats} />
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4">
        <section className="flex flex-col rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
          <h3 className="text-xs font-medium text-rose-900/70">{mon(month)} 자동 분류</h3>
          <div className="mt-1 text-lg font-bold text-stone-900 tabular-nums">{auto}건을 분류했어요</div>
          <div className="mt-0.5 text-xs text-stone-500 tabular-nums">
            확인 전 {stats.todo}건 · 미분류 {stats.none.n}건
          </div>
          <div className="mt-auto pt-2.5">
            {suggests.length > 0 ? (
              <button type="button" onClick={openDeck} className="w-full rounded-lg bg-rose-700 py-2 text-xs font-semibold text-white hover:bg-rose-800">
                제안 {suggests.length}곳 확인하기
              </button>
            ) : askInfo.count > 0 ? (
              <button type="button" disabled={asking} onClick={onAsk} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 py-2 text-xs font-semibold text-white disabled:bg-stone-400">
                {asking ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {asking ? "묻는 중…" : `남은 ${askInfo.count}곳 Claude 에게 · 약 ${askInfo.won}원`}
              </button>
            ) : (
              <button type="button" onClick={() => onPage("financeTx")} className="w-full rounded-lg border border-rose-200 bg-white py-2 text-xs font-semibold text-rose-800">
                거래내역 보기
              </button>
            )}
          </div>
        </section>
        <Card title={`${mon(month)} 이익`} right={<span className={"text-lg font-bold tabular-nums " + (stats.profit < 0 ? "text-rose-700" : "text-stone-900")}>{krw(stats.profit)}</span>}>
          <div className="mt-1.5 space-y-0.5">
            <Line label={stats.sales ? "수입 · 매출 장부 순매출" : "수입 · 통장 입금"} value={krw(stats.income)} tone="text-emerald-700" />
            <Line label={stats.sales?.fee ? "지출 · 결제 수수료 포함" : "지출"} value={krw(stats.expense)} />
          </div>
          <div className="my-2 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-stone-100">
            {COST_KINDS.map(([k]) => split[k] > 0 && <span key={k} style={{ width: `${pct(split[k], stats.expense)}%`, background: KIND_COLOR[k] }} className="h-full" />)}
          </div>
          <div className="space-y-0.5">
            {COST_KINDS.map(([k, label]) => (
              <Line key={k} color={KIND_COLOR[k]} label={label} sub={`${pct(split[k], stats.expense)}%`} value={krw(split[k])} />
            ))}
          </div>
        </Card>
        <Card title="고정 지출" right={<span className="text-lg font-bold text-stone-900 tabular-nums">{krw(Math.round(split.fixed))}</span>}>
          <div className="mt-2 space-y-0.5">
            <Line label="구독 목록 한 달" value={krw(Math.round(subMonthly))} />
            {nextSubs.map(({ s, day }) => (
              <Line key={s.id || s.name} label={s.name} sub={`D-${Math.max(0, daysUntil(day))}`} value={krw(Number(s.price) || 0)} />
            ))}
          </div>
          <button type="button" onClick={() => onPage("subs")} className="mt-1.5 text-[11px] font-medium text-rose-700 hover:underline">
            구독 · 고정 지출 보기
          </button>
        </Card>
        <Card title="순자산" right={<span className="text-lg font-bold text-stone-900 tabular-nums">{worth.hasBank ? krw(worth.net) : "-"}</span>}>
          {worth.hasBank ? (
            <div className="mt-2 space-y-0.5">
              <Line color={C1} label="통장 잔액" value={krw(worth.cash)} />
              <Line color={C3} label="재고 (원가)" value={krw(worth.stock)} />
              <Line color={C2} label="대출 원금" value={krw(worth.loan)} tone={worth.loan ? "text-rose-700" : undefined} />
              <p className="pt-0.5 text-[10px] text-stone-400">카드 미결제 금액은 빠져 있어요.</p>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-stone-500">통장 내역을 넣으면 잔액·재고·대출로 계산해요. 지금 재고 원가 {krw(worth.stock)}.</p>
          )}
        </Card>
      </div>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-baseline justify-between gap-2 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-stone-800">
            자동 분류한 내역 <span className="font-normal text-stone-500 tabular-nums">{recent.length}건 · ₩{won(recentSum)}</span>
          </h3>
          <button type="button" onClick={() => onPage("financeTx")} className="text-xs font-medium text-rose-700 hover:underline">
            전체 보기
          </button>
        </div>
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          <RowHead />
          {recent.map((r) => (
            <TxRow key={r.id} r={r} onCat={onCat} onOk={onOk} onOpen={openDetail} />
          ))}
          {!recent.length && <li className="py-8 text-center text-sm text-stone-400">이 달에 분류된 내역이 없어요.</li>}
        </ul>
      </section>

      <div className="grid gap-3 @3xl:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">월별 손익</h3>
          <MonthBars list={chart} month={month} onMonth={F.setMonth} series={[{ k: "income", label: "수입", color: C1 }, { k: "expense", label: "지출", color: C2 }]} />
        </section>
        {balances.length > 0 ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-stone-800">자산의 변동 · 달 말 통장 잔액</h3>
            <MonthBars list={balances} month={month} onMonth={F.setMonth} legend={false} series={[{ k: "total", label: "통장 잔액", color: C1 }]} />
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
            <h3 className="mb-1 text-sm font-semibold text-stone-800">자산의 변동</h3>
            통장 내역을 넣으면 달 말 잔액이 막대로 나와요.
          </section>
        )}
      </div>

      {recurring.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">구독 목록에 없는 정기 결제</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-500">석 달 넘게 비슷한 금액이 나가는 곳이에요.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            {recurring.map((x) => (
              <li key={x.key} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-stone-800">{x.name}</span>
                <span className="text-xs text-stone-400 tabular-nums">{x.months}개월</span>
                <span className="font-medium text-stone-900 tabular-nums">월 ₩{won(x.avg)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AskBox chart={chart} month={month} monthRows={monthRows} />
    </div>
  );
}

// ---------------------------------------------------------------- 거래내역 분류

function TxView({ F }) {
  const { month, monthRows: rows, stats, sources, filter, setFilter, onCat, onOk, onOkAll, onAsk, asking, askInfo, suggests, openDeck, openDetail } = F;
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
      if (t && !`${r.name} ${r.sub} ${r.cat} ${r.memo || ""} ${(r.tags || []).join(" ")}`.toLowerCase().includes(t)) return false;
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
  const download = () =>
    saveXlsx(`포클로_재무_${month}.xlsx`, [
      ["날짜", "시간", "어디", "내역", "적요·업종", "금액", "계정과목", "확인", "메모", "태그"],
      ...shown.map((r) => [r.d, r.t, srcLabel(r), r.name, r.sub || "", r.pend ? `$${r.usd}` : r.amt, r.cat || "미분류", r.ok ? "O" : "", r.memo || "", (r.tags || []).join(", ")]),
    ]);
  return (
    <div className="space-y-2.5">
      {suggests.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1 text-stone-700">
            Claude 가 <b className="tabular-nums">{suggests.length}곳</b>의 계정과목을 제안했어요. 근거를 보고 승인해 주세요.
          </span>
          <button type="button" onClick={openDeck} className="shrink-0 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-800">
            제안 확인하기
          </button>
        </div>
      )}
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
        <button type="button" disabled={!shown.length} onClick={download} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400 disabled:opacity-40">
          <Download size={13} /> 엑셀
        </button>
        <button type="button" disabled={!canOk.length} onClick={() => onOkAll(canOk)} className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:border-stone-200 disabled:text-stone-300">
          <ThumbsUp size={13} /> 보이는 {canOk.length}건 확인
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 @3xl:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <label className="relative col-span-2 block @3xl:col-span-1">
          <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => set({ q: e.target.value })} placeholder="이름·적요·계정과목·메모·태그 찾기" className={FIELD + " pl-8"} />
        </label>
        <select value={src} onChange={(e) => set({ src: e.target.value })} aria-label="통장·카드 거르기" className={FIELD}>
          <option value="">통장·카드 전부</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={cat} onChange={(e) => set({ cat: e.target.value })} aria-label="계정과목 거르기" className={FIELD}>
          <option value="">계정과목 전부</option>
          {CATS.map((c) => (
            <option key={c.k}>{c.k}</option>
          ))}
        </select>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <RowHead />
          {shown.slice(0, limit).map((r) => (
            <TxRow key={r.id} r={r} onCat={onCat} onOk={onOk} onOpen={openDetail} />
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

// ---------------------------------------------------------------- 분석

function PnlView({ F }) {
  const { month, stats, chart, setMonth, kinds, setKind, showCat, onPage, monthRows, months, data, sales } = F;
  const [mode, setMode] = useState("pl");
  const list = chart.slice(-6);
  const plList = useMemo(() => list.map((x) => ({ m: x.m, ...plOf(x) })), [list]);
  const costList = useMemo(() => list.map((x) => ({ m: x.m, ...costSplit(x, kinds) })), [list, kinds]);
  const pl = plOf(stats);
  const prevM = shiftMonth(month, -1);
  const prev = useMemo(() => (months.includes(prevM) ? monthStats(data[prevM] || [], sales[prevM]) : null), [months, prevM, data, sales]);
  const pp = prev ? plOf(prev) : null;
  const split = costSplit(stats, kinds);
  const tags = tagsOf(monthRows);
  const opexRows = split.rows.filter((r) => r.k !== "상품 매입" && r.k !== "이자·금융비용");
  const line = (label, cur, before, opts = {}) => (
    <tr key={label} className={(opts.total ? "bg-stone-50 font-semibold " : "") + "border-b border-stone-100 last:border-0"}>
      <td className={"py-1.5 pl-3 " + (opts.indent ? "pl-6 text-stone-600" : "text-stone-800")}>
        {opts.onClick ? (
          <button type="button" onClick={opts.onClick} className="text-left hover:text-rose-700">
            {label}
          </button>
        ) : (
          label
        )}
      </td>
      <td className={"py-1.5 text-right tabular-nums " + (cur < 0 ? "text-rose-700" : "text-stone-900")}>{krw(cur)}</td>
      <td className="py-1.5 pr-3 text-right text-stone-400 tabular-nums">{before == null ? "-" : krw(before)}</td>
    </tr>
  );
  return (
    <div className="space-y-3">
      <Warnings stats={stats} />
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-sm">
            {[
              ["pl", "손익"],
              ["cost", "고정비·변동비"],
            ].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={"rounded-md px-3 py-1 font-medium " + (mode === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-stone-500 tabular-nums">
            {mon(month)} 세전이익 {krw(pl.pre)}
          </span>
        </div>
        {mode === "pl" ? (
          <MonthBars list={plList} month={month} onMonth={setMonth} series={[{ k: "sales", label: "매출", color: C1 }, { k: "gross", label: "매출총이익", color: C2 }, { k: "op", label: "영업이익", color: C3 }, { k: "pre", label: "세전이익", color: C4 }]} />
        ) : (
          <MonthBars stacked list={costList} month={month} onMonth={setMonth} series={[{ k: "fixed", label: "고정비", color: KIND_COLOR.fixed }, { k: "var", label: "변동비", color: KIND_COLOR.var }, { k: "etc", label: "기타", color: KIND_COLOR.etc }]} />
        )}
      </section>

      {mode === "pl" ? (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-stone-800">{monthLabel(month)} 손익계산서</h3>
            <button
              type="button"
              onClick={() =>
                saveXlsx(`포클로_손익_${month}.xlsx`, [
                  ["항목", monthLabel(month), prev ? monthLabel(prevM) : ""],
                  ["매출(순매출)", pl.sales, pp?.sales ?? ""],
                  ["상품 매입", pl.buy, pp?.buy ?? ""],
                  ["매출총이익", pl.gross, pp?.gross ?? ""],
                  ...opexRows.map((r) => [r.k, r.v, prev ? (costSplit(prev, kinds).rows.find((x) => x.k === r.k)?.v ?? 0) : ""]),
                  ["영업이익", pl.op, pp?.op ?? ""],
                  ["기타 수입", pl.other, pp?.other ?? ""],
                  ["이자·금융비용", pl.interest, pp?.interest ?? ""],
                  ["세전이익", pl.pre, pp?.pre ?? ""],
                ])
              }
              className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-stone-400"
            >
              <Download size={13} /> 엑셀
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] border-t border-stone-100 text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-500">
                  <th className="py-1.5 pl-3 text-left font-medium">항목</th>
                  <th className="py-1.5 text-right font-medium">{mon(month)}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">지난달</th>
                </tr>
              </thead>
              <tbody>
                {line(stats.sales ? "매출 (매출 장부 순매출)" : "매출 (통장 입금)", pl.sales, pp?.sales, { onClick: stats.sales ? () => onPage("sales") : undefined })}
                {line("상품 매입", pl.buy, pp?.buy, { indent: true, onClick: () => showCat("상품 매입") })}
                {line("매출총이익", pl.gross, pp?.gross, { total: true })}
                {opexRows.map((r) => line(r.k, r.v, prev ? (costSplit(prev, kinds).rows.find((x) => x.k === r.k)?.v ?? 0) : null, { indent: true, onClick: r.k === FEE_NAME ? () => onPage("pnl") : () => showCat(r.k) }))}
                {line("영업이익", pl.op, pp?.op, { total: true })}
                {line("기타 수입", pl.other, pp?.other, { indent: true, onClick: () => showCat("기타 수입") })}
                {line("이자·금융비용", pl.interest, pp?.interest, { indent: true, onClick: () => showCat("이자·금융비용") })}
                {line("세전이익", pl.pre, pp?.pre, { total: true })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">{monthLabel(month)} 비용 구조</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-500">반복되는 비용은 고정비, 때마다 달라지는 비용은 변동비예요. 오른쪽에서 옮길 수 있어요.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            {split.rows.map((r) => (
              <li key={r.k} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => (r.k === FEE_NAME ? onPage("pnl") : showCat(r.k))} className="min-w-0 flex-1 truncate text-left text-stone-800 hover:text-rose-700">
                  {r.k}
                </button>
                <span className="text-xs text-stone-400 tabular-nums">{pct(r.v, stats.expense)}%</span>
                <span className="w-24 text-right font-medium text-stone-900 tabular-nums">{krw(r.v)}</span>
                <select value={r.kind} onChange={(e) => setKind(r.k, e.target.value)} aria-label={`${r.k} 고정·변동`} className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-xs text-stone-700 outline-none focus:border-rose-500">
                  {COST_KINDS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
            {!split.rows.length && <li className="py-6 text-center text-stone-400">이 달 지출이 없어요.</li>}
          </ul>
        </section>
      )}
      {tags.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">{mon(month)} 태그별</h3>
          <ul className="space-y-1 text-sm">
            {tags.map((t) => (
              <li key={t.tag} className="flex items-center gap-2">
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-800">{t.tag}</span>
                <span className="flex-1 text-xs text-stone-400 tabular-nums">{t.n}건</span>
                <span className="font-medium text-stone-900 tabular-nums">{krw(t.v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs leading-relaxed text-stone-400">수입은 매출 장부 순매출, 지출은 통장·카드로 실제 나간 돈이에요. 돈 › 손익은 상품 원가·가정값으로 계산해서 숫자가 달라요.</p>
    </div>
  );
}

// ---------------------------------------------------------------- 매출·정산

function SalesView({ F }) {
  const { month, stats, monthRows, salesRows, tx, onPage } = F;
  const board = useMemo(() => salesBoard(monthRows, salesRows, month), [monthRows, salesRows, month]);
  const channels = useMemo(() => channelsOf(monthRows), [monthRows]);
  const ledger = useMemo(() => {
    const list = (tx || []).filter((t) => String(t.date || "").startsWith(month));
    const total = list.reduce((a, t) => a + (t.supply || 0), 0);
    const inv = list.filter((t) => t.invoice).reduce((a, t) => a + (t.supply || 0), 0);
    return { n: list.length, total, inv };
  }, [tx, month]);
  const s = stats.sales;
  const bankBuy = stats.byCat["상품 매입"] || 0;
  const cell = (label, value, sub) => (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-0.5 text-base font-bold text-stone-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {cell("순매출", s ? krw(s.net) : "-", s ? `총매출 ${krw(s.gross)} · 환불 ${krw(s.refund)}` : "매출 장부 없음")}
        {cell("통장 정산 입금", stats.bankRows ? krw(stats.settled) : "-", stats.bankRows ? (s ? `순매출과 차이 ${krw(s.net - stats.settled)}` : "") : "통장 내역을 넣으면 나와요")}
        {cell("결제 수수료", s ? krw(s.fee) : "-", "매출 장부 계산값")}
        {cell("상품 매입", stats.bankRows ? krw(bankBuy) : "-", ledger.n ? `매입 장부 ${krw(ledger.total)} · 계산서 ${pct(ledger.inv, ledger.total)}%` : "이 달 매입 장부 없음")}
      </div>
      {channels.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">결제 채널별 정산 입금</h3>
          <ul className="space-y-1.5 text-sm">
            {channels.map((c) => (
              <li key={c.name}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-stone-700">{c.name}</span>
                  <span className="font-semibold text-stone-900 tabular-nums">
                    {krw(c.v)} <span className="ml-1 inline-block w-8 text-right text-xs font-normal text-stone-400">{pct(c.v, stats.settled)}%</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full" style={{ width: `${Math.max(1, pct(c.v, channels[0].v))}%`, background: C1 }} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-stone-800">{monthLabel(month)} 날짜별</h3>
          <button type="button" onClick={() => onPage("sales")} className="text-xs font-medium text-rose-700 hover:underline">
            매출 장부 열기
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-t border-stone-100 text-sm tabular-nums">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-500">
                <th className="py-1.5 pl-3 text-left font-medium">날짜</th>
                <th className="py-1.5 text-right font-medium">총매출</th>
                <th className="py-1.5 text-right font-medium">환불</th>
                <th className="py-1.5 text-right font-medium">순매출</th>
                <th className="py-1.5 text-right font-medium">정산 입금</th>
                <th className="py-1.5 pr-3 text-right font-medium">매입</th>
              </tr>
            </thead>
            <tbody>
              {board.map((x) => (
                <tr key={x.d} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pl-3 text-stone-600">{dayLabel(x.d).replace(/^\d+월 /, "")}</td>
                  <td className="py-1.5 text-right text-stone-800">{x.gross ? won(x.gross) : "-"}</td>
                  <td className="py-1.5 text-right text-stone-500">{x.refund ? won(x.refund) : "-"}</td>
                  <td className="py-1.5 text-right font-medium text-stone-900">{x.net ? won(x.net) : "-"}</td>
                  <td className="py-1.5 text-right text-emerald-700">{x.settled ? won(x.settled) : "-"}</td>
                  <td className="py-1.5 pr-3 text-right text-stone-800">{x.buy ? won(x.buy) : "-"}</td>
                </tr>
              ))}
              {!board.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400">
                    이 달 매출·정산 내역이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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

function printDaily(rep, label, accounts) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const row = (r) => `<tr><td>${esc(r.t.slice(0, 5))}</td><td>${esc(r.name)}</td><td>${esc(r.cat || "미분류")}</td><td class="n">${won(Math.abs(r.amt))}</td></tr>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>포클로 자금일보 ${esc(label)}</title><style>body{font:13px/1.5 Pretendard,"Malgun Gothic",sans-serif;margin:24px;color:#1c1917}h1{font-size:18px;margin:0 0 12px}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d6d3d1;padding:4px 8px;text-align:left}th{background:#f5f5f4}.n{text-align:right;font-variant-numeric:tabular-nums}</style>
<h1>포클로 자금일보 · ${esc(label)}</h1>
<table><tr><th>통장</th><th class="n">전일 잔액</th><th class="n">입금</th><th class="n">출금</th><th class="n">잔액</th><th class="n">전일 대비</th></tr>${rep.accounts.map((a) => `<tr><td>${esc(a.src)} ${esc(accounts?.[a.src] || "")}</td><td class="n">${won(a.open)}</td><td class="n">${won(a.inn)}</td><td class="n">${won(a.out)}</td><td class="n">${won(a.close)}</td><td class="n">${won((a.close || 0) - (a.open || 0))}</td></tr>`).join("")}</table>
<h2>입금 ${rep.inn.length}건</h2><table>${rep.inn.map(row).join("")}</table>
<h2>출금 ${rep.out.length}건</h2><table>${rep.out.map(row).join("")}</table>
<h2>카드 사용 ${won(rep.cardTotal)}원</h2><table>${rep.cards.map(row).join("")}</table>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

function DailyView({ F }) {
  const { allRows, index, day, setDay, onNote } = F;
  const accounts = index.accounts;
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
        <h3 className="ml-1 flex-1 text-sm font-semibold text-stone-800">{dayLabel(day)} 자금일보</h3>
        <button type="button" onClick={async () => onNote((await copyText(dailyText(rep, dayLabel(day), accounts))) ? "자금일보를 복사했어요. 카톡에 붙여넣으면 돼요." : "복사가 막혔어요.")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400">
          <Copy size={13} /> 글 복사
        </button>
        <button type="button" onClick={() => printDaily(rep, dayLabel(day), accounts) || onNote("새 창이 막혔어요. 팝업을 허용해 주세요.")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-400">
          <Printer size={13} /> PDF
        </button>
      </div>
      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[38rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="px-4 py-2 text-left font-medium">통장</th>
              <th className="px-2 py-2 text-right font-medium">전일 잔액</th>
              <th className="px-2 py-2 text-right font-medium">입금</th>
              <th className="px-2 py-2 text-right font-medium">출금</th>
              <th className="px-2 py-2 text-right font-medium">잔액</th>
              <th className="px-4 py-2 text-right font-medium">전일 대비</th>
            </tr>
          </thead>
          <tbody>
            {rep.accounts.map((a) => {
              const d = a.close == null || a.open == null ? null : a.close - a.open;
              return (
                <tr key={a.src} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2.5 text-stone-800">
                    <span className="font-semibold">{a.src}</span> <span className="text-xs text-stone-400">{accounts?.[a.src] || ""}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-stone-600">{a.open == null ? "-" : krw(a.open)}</td>
                  <td className="px-2 py-2.5 text-right font-medium text-emerald-700">{a.inn ? krw(a.inn) : "-"}</td>
                  <td className="px-2 py-2.5 text-right font-medium text-stone-900">{a.out ? krw(a.out) : "-"}</td>
                  <td className="px-2 py-2.5 text-right font-bold text-stone-900">{a.close == null ? "-" : krw(a.close)}</td>
                  <td className={"px-4 py-2.5 text-right font-medium " + (d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-stone-400")}>{d == null || d === 0 ? "-" : flow(d)}</td>
                </tr>
              );
            })}
            {rep.accounts.length > 1 && (
              <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
                <td className="px-4 py-2 text-stone-700">합계</td>
                <td className="px-2 py-2 text-right">{krw(sum("open"))}</td>
                <td className="px-2 py-2 text-right">{krw(sum("inn"))}</td>
                <td className="px-2 py-2 text-right">{krw(sum("out"))}</td>
                <td className="px-2 py-2 text-right">{krw(sum("close"))}</td>
                <td className="px-4 py-2 text-right">{flow(sum("close") - sum("open"))}</td>
              </tr>
            )}
            {!rep.accounts.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-400">
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

function RulesView({ F }) {
  const { rules, index, month, monthRows, removeRule, clearMonth, addWord, removeWord } = F;
  const [q, setQ] = useState("");
  const [word, setWord] = useState("");
  const [wordCat, setWordCat] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.entries(rules.rules || {})
      .map(([key, r]) => ({ key, ...r }))
      .filter((r) => !t || `${r.name} ${r.cat}`.toLowerCase().includes(t))
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }, [rules, q]);
  return (
    <div className="grid gap-3 @3xl:grid-cols-2">
      <div className="space-y-3">
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">단어 규칙</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-400">내역에 이 단어가 있으면 이 계정과목으로 들어가요. 확인 안 한 거래에도 바로 적용돼요.</p>
          <div className="flex gap-1.5">
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="단어 (예: 넥스트팩)" aria-label="규칙 단어" className={FIELD + " min-w-0 flex-1"} />
            <span className="w-40 shrink-0">
              <CatSelect value={wordCat} onChange={setWordCat} />
            </span>
            <button
              type="button"
              disabled={!word.trim() || !wordCat}
              onClick={() => {
                addWord(word.trim(), wordCat);
                setWord("");
              }}
              className="shrink-0 rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white disabled:bg-stone-300"
            >
              더하기
            </button>
          </div>
          {(rules.words || []).length > 0 && (
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {rules.words.map((w) => (
                <li key={w.word} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium text-stone-800">‘{w.word}’</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-700">{w.cat}</span>
                  <button type="button" onClick={() => removeWord(w.word)} aria-label={`${w.word} 규칙 지우기`} className="rounded p-1 text-stone-300 hover:text-rose-700">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-800">기억한 분류 {Object.keys(rules.rules || {}).length}곳</h3>
          <p className="mt-0.5 mb-2 text-xs text-stone-400">거래에서 계정과목을 고치면 여기에 남고, 다음부터 같은 곳은 그 분류로 들어가요.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·계정과목 찾기" className={FIELD} />
          <ul className="mt-2 max-h-[24rem] divide-y divide-stone-100 overflow-y-auto">
            {list.map((r) => (
              <li key={r.key} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-stone-900">{r.name}</span>
                  <span className="block truncate text-xs text-stone-400">
                    {r.key.startsWith("card") ? "카드" : r.key.startsWith("bank|in") ? "통장 입금" : "통장 출금"} · {r.by === "ai" ? `AI${r.why ? ` · ${r.why}` : ""}` : "직접 고침"}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-700">{r.cat}</span>
                <button type="button" onClick={() => removeRule(r.key)} aria-label={`${r.name} 규칙 지우기`} className="rounded p-1 text-stone-300 hover:text-rose-700">
                  <X size={14} />
                </button>
              </li>
            ))}
            {!list.length && <li className="py-6 text-center text-sm text-stone-400">아직 없어요.</li>}
          </ul>
        </section>
      </div>
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
            onClick={() => window.confirm(`${monthLabel(month)} 거래 ${monthRows.length}건을 지울까요? 확인 체크도 같이 지워져요.`) && clearMonth()}
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

const NOTE_MS = 8000;

export default function FinancePage({ view = "finance", online, vendors, tx, pricing, salesRows, salesConf, onPage }) {
  const { index, rules, data, loaded, msg, setMsg, changeMonth, changeIndex, changeRules } = useFinance(online);
  const [picked, setPicked] = useState(() => remember(MONTH_KEY, ""));
  const [filter, setFilter] = useState(() => {
    const f = nextFilter || { view: "todo", src: "", cat: "", q: "" };
    nextFilter = null;
    return f;
  });
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState(null);
  const [subs, setSubs] = useState([]);
  const [stock, setStock] = useState(0);
  const [dayPicked, setDayPicked] = useState("");
  const [deck, setDeck] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const fileRef = useRef(null);

  // 구독·재고는 대시보드 칸·분류 힌트로만 — 없어도 된다
  useEffect(() => {
    loadKey("subscriptions", online, { items: [] })
      .then((v) => setSubs(v?.items || []))
      .catch(() => {});
    loadKey("stock", online, {})
      .then((v) => setStock(stockTotals(buildGroups(v, pricing)).money || 0))
      .catch(() => {});
  }, [online, pricing]);
  useEffect(() => {
    if (!note || note.sticky) return;
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [note]);

  const months = useMemo(() => [...(index.months || [])].sort(), [index.months]);
  const month = picked && months.includes(picked) ? picked : months.at(-1) || "";
  const setMonth = useCallback((m) => {
    setPicked(m);
    keep(MONTH_KEY, m);
  }, []);
  const monthRows = useMemo(() => data[month] || [], [data, month]);
  const allRows = useMemo(() => months.flatMap((m) => data[m] || []), [months, data]);
  const sales = useMemo(() => salesByMonth(salesRows, salesConf), [salesRows, salesConf]);
  const stats = useMemo(() => monthStats(monthRows, sales[month]), [monthRows, sales, month]);
  const chart = useMemo(() => months.slice(-12).map((m) => ({ m, ...monthStats(data[m] || [], sales[m]) })), [months, data, sales]);
  const ctx = useMemo(() => makeCtx({ rules: rules.rules, words: rules.words, vendors, subs }), [rules, vendors, subs]);
  const sources = useMemo(() => {
    const m = new Map();
    for (const r of allRows) m.set(`${r.s}|${r.src}`, srcLabel(r));
    return [...m].sort().map(([key, label]) => ({ key, label }));
  }, [allRows]);
  const asks = useMemo(() => asksOf(monthRows), [monthRows]);
  const suggests = useMemo(() => suggestsOf(monthRows), [monthRows]);
  const askInfo = { count: asks.length, won: askEstimate(Math.min(asks.length, 150)) };
  const lastBankDay = useMemo(() => allRows.reduce((a, r) => (r.s === "bank" && r.d > a ? r.d : a), ""), [allRows]);
  const day = dayPicked || lastBankDay || new Date().toISOString().slice(0, 10);
  const allTags = useMemo(() => [...new Set(allRows.flatMap((r) => r.tags || []))], [allRows]);

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
      setFilter({ view: "todo", src: "", cat: "", q: "" });
    }
  };

  const onOk = useCallback((r) => changeMonth(r.d.slice(0, 7), patchRows(new Map([[r.id, { ok: !r.ok }]]))), [changeMonth]);
  const onOkAll = (rows) => {
    patchAll(new Map(rows.map((r) => [r.id, { ok: true }])), rows);
    setNote({
      text: `${rows.length}건 확인했어요`,
      undo: () => {
        patchAll(new Map(rows.map((r) => [r.id, { ok: false }])), rows);
        setNote(null);
      },
    });
  };
  const onPatch = useCallback((r, patch) => changeMonth(r.d.slice(0, 7), patchRows(new Map([[r.id, patch]]))), [changeMonth]);
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

  // Claude 답은 '제안'이다 — 승인 카드에서 ✓ 하면 확정·규칙, ✕ 면 미분류로
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
      const answers = new Map();
      for (const a of j.items || []) if (batch[a.i] && catType(a.cat)) answers.set(batch[a.i].key, a);
      const patches = new Map();
      const hits = [];
      for (const r of allRef.current) {
        const a = !r.cat && answers.get(ruleKey(r));
        if (!a) continue;
        patches.set(r.id, { cat: a.cat, by: "ai", sure: a.sure, why: a.why, ok: false });
        hits.push(r);
      }
      await patchAll(patches, hits);
      const spent = j._cost?.won || 0;
      changeIndex((v) => ({ ...v, aiWon: (v.aiWon || 0) + spent }));
      setNote({ text: `${answers.size}곳을 제안했어요 · ${spent}원 들었어요${asks.length > 150 ? ` · 남은 ${asks.length - 150}곳은 한 번 더 눌러 주세요` : ""}`, sticky: true });
    } catch (e) {
      setMsg(e.message || "Claude 에게 묻지 못했어요.");
    } finally {
      setAsking(false);
    }
  };
  const openDeck = () => setDeck(suggests);
  const acceptSuggest = (g, cat) => {
    const others = allRef.current.filter((x) => ruleKey(x) === g.key && !x.ok);
    patchAll(new Map(others.map((x) => [x.id, { cat, by: "rule", sure: "", why: "", ok: true }])), others);
    const stamp = new Date().toISOString();
    changeRules((v) => ({ ...v, rules: { ...(v.rules || {}), [g.key]: { cat, by: cat === g.cat ? "ai" : "user", why: g.why, name: g.name, at: stamp } } }));
  };
  const rejectSuggest = (g) => {
    const others = allRef.current.filter((x) => ruleKey(x) === g.key && !x.ok && x.by === "ai");
    patchAll(new Map(others.map((x) => [x.id, { cat: "", by: "", sure: "", why: "", ok: false }])), others);
  };

  const removeRule = (key) =>
    changeRules((v) => {
      const next = { ...(v.rules || {}) };
      delete next[key];
      return { ...v, rules: next };
    });
  const addWord = (word, cat) => {
    changeRules((v) => ({ ...v, words: [...(v.words || []).filter((w) => w.word !== word), { word, cat }] }));
    const list = [{ word, cat }];
    const hits = allRef.current.filter((r) => !r.ok && r.by !== "user" && wordHit(r, list));
    if (hits.length) patchAll(new Map(hits.map((r) => [r.id, { cat, by: "rule", sure: "" }])), hits);
    setNote({ text: `‘${word}’ 규칙을 넣었어요${hits.length ? ` · ${hits.length}건에 바로 적용` : ""}` });
  };
  const removeWord = (word) => changeRules((v) => ({ ...v, words: (v.words || []).filter((w) => w.word !== word) }));
  const setKind = (cat, kind) => changeRules((v) => ({ ...v, kinds: { ...(v.kinds || {}), [cat]: kind } }));
  const clearMonth = async () => {
    const m = month;
    await changeMonth(m, (v) => ({ ...v, rows: [] }));
    await changeIndex((v) => ({ ...v, months: (v.months || []).filter((x) => x !== m) }));
    setNote({ text: `${monthLabel(m)} 내역을 지웠어요.` });
  };
  const showCat = (cat) => {
    nextFilter = { view: "all", src: "", cat, q: "" };
    onPage("financeTx");
  };
  const openDetail = useCallback((id) => setDetailId(id), []);
  const detail = detailId ? allRows.find((r) => r.id === detailId) : null;

  const F = {
    month,
    months,
    setMonth,
    monthRows,
    allRows,
    data,
    sales,
    stats,
    chart,
    sources,
    filter,
    setFilter,
    onCat,
    onOk,
    onOkAll,
    onAsk: askClaude,
    asking,
    askInfo,
    suggests,
    openDeck,
    openDetail,
    kinds: rules.kinds,
    setKind,
    showCat,
    onPage,
    subs,
    stock,
    salesRows,
    tx,
    index,
    rules,
    day,
    setDay: setDayPicked,
    onNote: (text) => setNote({ text }),
    removeRule,
    addWord,
    removeWord,
    clearMonth,
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
        <h2 className="text-xl font-bold text-stone-900">{TITLES[view] || "재무 비서"}</h2>
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
          {view === "financeTx" ? <TxView F={F} /> : view === "financePnl" ? <PnlView F={F} /> : view === "financeSales" ? <SalesView F={F} /> : view === "financeDaily" ? <DailyView F={F} /> : view === "financeRules" ? <RulesView F={F} /> : <HomeView F={F} />}
        </>
      )}
      {preview && <ImportPreview preview={preview} onApply={applyImport} onClose={() => setPreview(null)} />}
      {deck && (
        <SuggestDeck
          groups={deck}
          onAccept={acceptSuggest}
          onReject={rejectSuggest}
          onClose={(finished) => {
            setDeck(null);
            if (finished) setNote({ text: "제안을 다 확인했어요." });
          }}
        />
      )}
      {detail && <TxDetail key={detail.id} r={detail} allRows={allRows} allTags={allTags} onCat={onCat} onPatch={onPatch} onClose={() => setDetailId(null)} />}
    </div>
  );
}
