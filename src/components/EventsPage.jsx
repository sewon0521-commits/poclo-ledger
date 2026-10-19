import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X, CalendarDays, Check, ChevronDown } from "lucide-react";
import { loadKey, changeKey, upsert, remove, FIELD, onSettingsChange, watchKeys } from "../lib/shoot";
import { won } from "../lib/sales";
import { newId } from "../lib/id";
import { dayKey, dayTitle } from "../lib/journal";
import { KEY, KINDS, kindOf, colorOf, TARGETS, CHANNELS, KIND_TODOS, TEMPLATES, newTodo, monthWeeks, shiftMonth, weekday, weekBars, endOf, isOn, resultOf, periodLabel } from "../lib/events";
import { Sheet, SheetHead, Chips } from "./ShootBits";

/**
 * 일 › 이벤트 캘린더 (lib/events.js 머리말).
 * 위 = 달력(기간 막대 · 월·목 '신상' 표시 · 빈 칸 누르면 그날 새 이벤트), 아래 = 상시 진행 / 진행 중 / 다가오는 / 지난 이벤트(그 기간 매출).
 */

const MAX_LANES = 4;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function Bar({ b, onOpen }) {
  const c = colorOf(b.e.kind);
  const done = (b.e.todos || []).length > 0 && b.e.todos.every((t) => t.done);
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(b.e);
      }}
      title={`${b.e.title} · ${periodLabel(b.e)}`}
      style={{ top: 26 + b.lane * 22, left: `calc(${(b.col * 100) / 7}% + 2px)`, width: `calc(${(b.span * 100) / 7}% - 4px)`, background: c }}
      className={
        "absolute z-[1] flex h-5 items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-medium text-white shadow-sm hover:brightness-110 " +
        (b.cutL ? "rounded-l-none " : "rounded-l-md ") +
        (b.cutR ? "rounded-r-none" : "rounded-r-md")
      }
    >
      {done && <Check size={11} strokeWidth={3} className="shrink-0" />}
      <span className="truncate">{b.e.title || "이름 없음"}</span>
    </button>
  );
}

function Month({ ym, events, today, onNew, onOpen }) {
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-[11px] font-semibold text-stone-500">
        {WEEK.map((w, i) => (
          <div key={w} className={"py-1.5 " + (i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : "")}>
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const { bars, lanes } = weekBars(events, week);
        const hidden = (k) => bars.filter((b) => b.lane >= MAX_LANES && b.s <= k && b.t >= k).length;
        return (
          <div key={week[0]} className="relative grid grid-cols-7 border-b border-stone-100 last:border-b-0" style={{ minHeight: 30 + Math.min(lanes, MAX_LANES) * 22 + 18 }}>
            {week.map((k) => {
              const out = k.slice(0, 7) !== ym;
              const wd = weekday(k);
              const more = hidden(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNew(k)}
                  title={`${dayTitle(k)} — 눌러서 이벤트 넣기`}
                  className={"group relative flex flex-col items-stretch justify-start border-r border-stone-100 p-1 text-left last:border-r-0 hover:bg-rose-50/40 " + (out ? "bg-stone-50/60" : "")}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={
                        "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums " +
                        (k === today ? "bg-rose-700 text-white" : out ? "text-stone-300" : wd === 0 ? "text-rose-600" : wd === 6 ? "text-sky-700" : "text-stone-700")
                      }
                    >
                      {Number(k.slice(8))}
                    </span>
                    {(wd === 1 || wd === 4) && !out && <span className="rounded bg-teal-50 px-1 text-[9px] font-semibold text-teal-700">신상</span>}
                    <Plus size={11} className="ml-auto text-stone-300 opacity-0 group-hover:opacity-100" />
                  </span>
                  {more > 0 && <span className="absolute bottom-0.5 left-1 text-[10px] text-stone-400">+{more}개</span>}
                </button>
              );
            })}
            {bars
              .filter((b) => b.lane < MAX_LANES)
              .map((b) => (
                <Bar key={b.e.id + b.s} b={b} onOpen={onOpen} />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function ResultLine({ r }) {
  if (!r) return null;
  const up = r.change != null && r.change >= 0;
  return (
    <span className="text-[11px] text-stone-500 tabular-nums">
      {r.partial ? "지금까지" : "기간"} 매출 <b className="text-stone-800">{won(r.sum)}원</b> · 하루 {won(r.perDay)}원
      {r.change != null && (
        <b className={up ? "text-emerald-700" : "text-rose-700"}>
          {" "}
          ({up ? "+" : ""}
          {Math.round(r.change * 100)}% 직전 {r.days}일보다)
        </b>
      )}
    </span>
  );
}

function Row({ e, rows, today, onOpen }) {
  const todos = e.todos || [];
  const done = todos.filter((t) => t.done).length;
  return (
    <button type="button" onClick={() => onOpen(e)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-stone-50">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(e.kind) }} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-semibold text-stone-900">{e.title || "이름 없음"}</b>
          <span className="text-xs text-stone-500 tabular-nums">
            {kindOf(e.kind)[1]} · {periodLabel(e)}
          </span>
        </span>
        {(e.target || e.benefit) && <span className="block truncate text-xs text-stone-500">{[e.target, e.benefit].filter(Boolean).join(" · ")}</span>}
        <ResultLine r={resultOf(e, rows, today)} />
      </span>
      {todos.length > 0 && (
        <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums " + (done === todos.length ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600")}>
          할 일 {done}/{todos.length}
        </span>
      )}
    </button>
  );
}

function Section({ title, list, rows, today, onOpen, empty }) {
  if (!list.length && !empty) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="px-1 text-sm font-semibold text-stone-700">
        {title} <span className="font-normal text-stone-400">{list.length}</span>
      </h3>
      {list.length ? (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {list.map((e) => (
            <Row key={e.id} e={e} rows={rows} today={today} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-center text-xs text-stone-400">{empty}</p>
      )}
    </section>
  );
}

const EMPTY = { title: "", kind: "promo", start: "", end: "", always: false, target: "", benefit: "", couponNo: "", channels: [], banner: "", todos: [], memo: "" };

function Editor({ seed, rows, today, onSave, onRemove, onClose }) {
  const [x, setX] = useState(() => {
    const v = { ...EMPTY, ...seed };
    return v.todos.length || seed.id ? v : { ...v, todos: (KIND_TODOS[v.kind] || []).map(newTodo) };
  });
  const [todo, setTodo] = useState("");
  const set = (p) => setX((v) => ({ ...v, ...p }));
  const pickKind = (k) => {
    // 할 일을 아직 안 건드렸으면 그 종류의 할 일로 바꿔 깐다
    const untouched = x.todos.every((t) => !t.done) && x.todos.map((t) => t.text).join("|") === (KIND_TODOS[x.kind] || []).join("|");
    set({ kind: k, ...(untouched ? { todos: (KIND_TODOS[k] || []).map(newTodo) } : {}) });
  };
  const applyTemplate = (t) =>
    setX((v) => ({
      ...v,
      title: t.title,
      kind: t.kind,
      always: !!t.always,
      target: t.target || v.target,
      benefit: t.benefit || v.benefit,
      channels: t.channels || v.channels,
      todos: (t.todos || KIND_TODOS[t.kind] || []).map(newTodo),
    }));
  const addTodo = () => {
    const t = todo.trim();
    if (!t) return;
    set({ todos: [...x.todos, newTodo(t)] });
    setTodo("");
  };
  const ok = x.title.trim() && (x.always || x.start);
  const r = resultOf(x, rows, today);
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={seed.id ? x.title || "이벤트" : "이벤트 넣기"} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {!seed.id && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400">틀로 시작</span>
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => applyTemplate(t)} className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-800">
                {t.label}
              </button>
            ))}
          </div>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">이름</span>
          <input value={x.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 겨울 아우터 얼리버드" className={FIELD + " text-base font-semibold"} />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map(([k, label, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={"flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium " + (x.kind === k ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                style={x.kind === k ? { background: c } : undefined}
              >
                {x.kind !== k && <span className="h-2 w-2 rounded-full" style={{ background: c }} />}
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">기간</span>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input type="checkbox" checked={x.always} onChange={(e) => set({ always: e.target.checked })} className="accent-rose-700" />
              상시 (기간 없이 계속)
            </label>
          </span>
          {!x.always && (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={x.start} onChange={(e) => set({ start: e.target.value, end: !x.end || x.end < e.target.value ? e.target.value : x.end })} className={FIELD} />
              <input type="date" value={x.end} min={x.start || undefined} onChange={(e) => set({ end: e.target.value })} className={FIELD} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">누구에게</span>
          <Chips list={TARGETS} value={x.target} onChange={(v) => set({ target: v })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-stone-500">혜택</span>
            <input value={x.benefit} onChange={(e) => set({ benefit: e.target.value })} placeholder="예: 3,000원 할인 · 3만 원 이상 · 14일" className={FIELD} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-stone-500">카페24 쿠폰 번호</span>
            <input value={x.couponNo} onChange={(e) => set({ couponNo: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="만든 뒤 적기" className={FIELD + " tabular-nums"} />
          </label>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">어디에 알리나</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => {
              const on = x.channels.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ channels: on ? x.channels.filter((y) => y !== c) : [...x.channels, c] })}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">배너·알림 문구</span>
          <textarea value={x.banner} onChange={(e) => set({ banner: e.target.value })} placeholder={"예: 가을 아우터 얼리버드 10%\n3만 원 이상 · 10/20 ~ 10/26"} className={FIELD + " min-h-[3.5rem] [field-sizing:content]"} />
        </label>
        <div className="space-y-1.5 rounded-xl border border-stone-200 p-3">
          <span className="text-xs font-semibold text-stone-500">
            할 일 <span className="font-normal text-stone-400">{x.todos.filter((t) => t.done).length}/{x.todos.length}</span>
          </span>
          {x.todos.map((t) => (
            <div key={t.id} className="group flex items-center gap-2">
              <input type="checkbox" checked={t.done} onChange={() => set({ todos: x.todos.map((y) => (y.id === t.id ? { ...y, done: !y.done } : y)) })} className="h-4 w-4 shrink-0 accent-rose-700" />
              <input
                value={t.text}
                onChange={(e) => set({ todos: x.todos.map((y) => (y.id === t.id ? { ...y, text: e.target.value } : y)) })}
                className={"min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm outline-none hover:border-stone-200 focus:border-rose-400 " + (t.done ? "text-stone-400 line-through" : "text-stone-800")}
              />
              <button type="button" onClick={() => set({ todos: x.todos.filter((y) => y.id !== t.id) })} aria-label="할 일 빼기" className="p-1 text-stone-300 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <input
              value={todo}
              onChange={(e) => setTodo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTodo();
                }
              }}
              placeholder="할 일 더하기 (엔터)"
              className={FIELD + " py-1.5"}
            />
            <button type="button" onClick={addTodo} aria-label="할 일 더하기" className="rounded-lg border border-stone-200 px-2.5 text-stone-500 hover:border-rose-300 hover:text-rose-700">
              <Plus size={15} />
            </button>
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">메모 · 결과 기록</span>
          <textarea value={x.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 쿠폰 발급 42 · 사용 9 — 다음엔 2만 원 이상으로" className={FIELD + " min-h-[3rem] [field-sizing:content]"} />
        </label>
        {r && (
          <p className="rounded-lg bg-stone-50 px-3 py-2">
            <ResultLine r={r} />
          </p>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {seed.id ? (
          <button type="button" onClick={() => window.confirm(`'${x.title}' 이벤트를 지울까요?`) && onRemove(seed.id)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600">
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span className="text-xs text-stone-400">{!ok ? "이름과 날짜(또는 상시)를 넣으면 저장돼요" : ""}</span>
        )}
        <button
          type="button"
          disabled={!ok}
          onClick={() =>
            onSave({
              ...x,
              title: x.title.trim(),
              end: x.always ? "" : x.end || x.start,
              start: x.always ? "" : x.start,
              todos: x.todos.filter((t) => t.text.trim()),
              id: seed.id || newId("ev"),
              createdAt: seed.createdAt || new Date().toISOString(),
            })
          }
          className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}

export default function EventsPage({ online, rows }) {
  const today = dayKey();
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(null);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [kind, setKind] = useState("");
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await loadKey(KEY, online)).items || []);
    } catch {
      setMsg("이벤트를 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    // 둘이 같이 쓴다 — 상대가 고치면 바로 다시 읽기
    const off = onSettingsChange((k) => k === KEY && load());
    const stop = watchKeys([KEY], (k) => k === KEY && load());
    return () => {
      off();
      stop();
    };
  }, [load]);

  const save = async (fn) => {
    try {
      setList((await changeKey(KEY, online, fn)).items || []);
      setEdit(null);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };

  const shown = useMemo(() => (kind ? list.filter((e) => e.kind === kind) : list), [list, kind]);
  const byStart = (a, b) => (a.start || "").localeCompare(b.start || "");
  const always = shown.filter((e) => e.always);
  const now = shown.filter((e) => isOn(e, today)).sort(byStart);
  const soon = shown.filter((e) => !e.always && e.start > today).sort(byStart);
  const past = shown
    .filter((e) => !e.always && e.start && endOf(e) < today)
    .sort((a, b) => endOf(b).localeCompare(endOf(a)));
  const [y, m] = ym.split("-").map(Number);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">이벤트 캘린더</h2>
          <p className="mt-0.5 text-sm text-stone-500">기획전·쿠폰·배너·알림을 날짜에 올려 두고 할 일을 챙겨요. 끝나면 그 기간 매출이 저절로 붙어요.</p>
        </div>
        <button type="button" onClick={() => setEdit({ start: today, end: today })} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 이벤트 넣기
        </button>
      </div>

      {msg && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="이전 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <ChevronLeft size={18} />
          </button>
          <b className="min-w-[7.5rem] text-center text-base text-stone-900 tabular-nums">
            {y}년 {m}월
          </b>
          <button type="button" onClick={() => setYm(shiftMonth(ym, 1))} aria-label="다음 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <ChevronRight size={18} />
          </button>
          {ym !== today.slice(0, 7) && (
            <button type="button" onClick={() => setYm(today.slice(0, 7))} className="ml-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50">
              오늘
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setKind("")} className={"rounded-full border px-2.5 py-1 text-[11px] font-medium " + (!kind ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}>
            전체
          </button>
          {KINDS.map(([k, label, c]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(kind === k ? "" : k)}
              className={"flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium " + (kind === k ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-600")}
              style={kind === k ? { background: c } : undefined}
            >
              {kind !== k && <span className="h-2 w-2 rounded-full" style={{ background: c }} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <Month ym={ym} events={shown} today={today} onNew={(k) => setEdit({ start: k, end: k })} onOpen={setEdit} />
      <p className="-mt-2 px-1 text-[11px] text-stone-400">
        <CalendarDays size={11} className="mr-0.5 inline align-[-1px]" /> 빈 칸을 누르면 그날 이벤트를 넣어요 · 월·목 '신상'은 신상 드랍 날(주간 루틴)
      </p>

      {loaded && !list.length ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center">
          <p className="text-sm text-stone-500">재구매 쿠폰처럼 늘 도는 것은 '상시'로, 기획전·배너·카톡 알림은 날짜로 넣어 두세요.</p>
          <button type="button" onClick={() => setEdit({ ...TEMPLATES[0], todos: TEMPLATES[0].todos.map(newTodo) })} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700">
            <Plus size={14} /> 재구매 쿠폰부터 넣기
          </button>
        </div>
      ) : (
        <>
          <Section title="상시 진행" list={always} rows={rows} today={today} onOpen={setEdit} />
          <Section title="진행 중" list={now} rows={rows} today={today} onOpen={setEdit} empty="오늘 진행 중인 이벤트가 없어요." />
          <Section title="다가오는" list={soon} rows={rows} today={today} onOpen={setEdit} />
          {past.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowPast(!showPast)} className="flex items-center gap-1 px-1 text-sm text-stone-500">
                <ChevronDown size={14} className={showPast ? "rotate-180" : ""} /> 끝난 이벤트 {past.length}
              </button>
              {showPast && (
                <div className="mt-1.5">
                  <Section title="" list={past} rows={rows} today={today} onOpen={setEdit} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {edit && <Editor key={edit.id || "new" + edit.start} seed={edit} rows={rows} today={today} onClose={() => setEdit(null)} onSave={(e) => save(upsert(e))} onRemove={(id) => save(remove(id))} />}
    </div>
  );
}
