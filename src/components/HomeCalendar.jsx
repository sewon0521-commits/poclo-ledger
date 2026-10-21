import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays, Repeat, ListChecks, X } from "lucide-react";
import { loadKey, changeKey, FIELD, onSettingsChange, watchKeys } from "../lib/shoot";
import { newId } from "../lib/id";
import { dayKey, dayTitle, shiftDay } from "../lib/journal";
import { CAL_KEY, WHO, WEEK_KO, DROP_DAYS, DROP_LABEL, monthWeeks, shiftMonth, weekday, weekBars, colorOf, diffDays, periodLabel } from "../lib/events";
import { COLORS, REPEATS, occurrences, colorOfEvent, whoColor, meWho, timeLabel, repeatText, periodText, byTime } from "../lib/calendar";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 홈 › 캘린더 (2026-10-19 밤 → 10/21 내 일정).
 * 10/21 세원: "캘린더 오른쪽 오늘 할 일 지우고 업무일지에 할 일·루틴으로 — 그리고 캘린더에 직접 개인적인 일을 쓸 수 있게, 노션·구글 캘린더처럼."
 * → 오른쪽 '오늘 할 일' 칸을 없애고 달력을 꽉 차게. 반복 할 일은 업무일지 루틴으로 옮겼다(lib/calendar.js 머리말).
 *   달력 = 내 일정(settings calendar.events) + 이벤트 캘린더 기간 막대(보기만, 누르면 이벤트 캘린더) + 월·화 신상 6시.
 *   마우스: 날짜 칸 누르기 = 그날 일정 넣기 · 여러 칸 끌기 = 여러 날 일정 · 일정 끌기 = 옮기기 · 일정 누르기 = 고치기 · 날짜 숫자 = 그날 전부.
 *   손가락: 날짜 칸 누르기 = 그날 일정 목록(+ 넣기) · 일정 누르기 = 고치기.
 */

const WHO_KEY = "poclo_cal_who";
const MOVED_SEEN = "poclo_cal_moved_seen";
const MAX_LANES = 3;
const LANE = 18;
const TOP = 26;

const readLS = (k) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 무시 */
  }
};

const pill = (on) => "rounded-full border px-3 py-1 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300");

/** 일정 넣기·고치기 */
function EventEditor({ seed, onSave, onRemove, onClose }) {
  const [x, setX] = useState(() => ({ title: "", start: dayKey(), end: "", time: "", endTime: "", who: meWho(), color: "", memo: "", repeat: "", ...seed }));
  const set = (p) => setX((v) => ({ ...v, ...p }));
  const color = x.color || whoColor(x.who);
  const ok = x.title.trim() && x.start;
  const save = () => {
    if (!ok) return;
    const end = x.end && x.end > x.start ? x.end : "";
    onSave({ ...x, title: x.title.trim(), memo: x.memo.trim(), end, endTime: x.time ? x.endTime : "", id: x.id || newId("ce"), createdAt: x.createdAt || new Date().toISOString() });
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={x.id ? "일정 고치기" : "일정 넣기"} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <input
            autoFocus
            value={x.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
            placeholder="일정 — 예: 병원, 동대문 미팅, 엄마 생신"
            className="min-w-0 flex-1 border-b border-stone-200 py-1.5 text-lg font-semibold text-stone-900 outline-none placeholder:font-normal placeholder:text-stone-300 focus:border-rose-400"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-stone-500">날짜</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={x.start} onChange={(e) => set({ start: e.target.value, ...(x.end && x.end < e.target.value ? { end: "" } : {}) })} className="rounded-lg border border-stone-200 px-2 py-1.5" />
            <span className="text-stone-400">~</span>
            <input type="date" value={x.end} min={x.start} onChange={(e) => set({ end: e.target.value })} className="rounded-lg border border-stone-200 px-2 py-1.5" title="여러 날이면 끝나는 날" />
            {x.end && x.end > x.start ? (
              <button type="button" onClick={() => set({ end: "" })} className="text-xs text-stone-400 hover:text-stone-700">
                하루로
              </button>
            ) : (
              <span className="text-xs text-stone-400">여러 날이면 끝나는 날</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-stone-500">시각</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => set({ time: "", endTime: "" })} className={pill(!x.time)}>
              종일
            </button>
            <button type="button" onClick={() => !x.time && set({ time: "10:00" })} className={pill(!!x.time)}>
              시각 정하기
            </button>
            {x.time && (
              <>
                <input type="time" value={x.time} onChange={(e) => set({ time: e.target.value || "" })} className="rounded-lg border border-stone-200 px-2 py-1" />
                <span className="text-stone-400">~</span>
                <input type="time" value={x.endTime} onChange={(e) => set({ endTime: e.target.value })} className="rounded-lg border border-stone-200 px-2 py-1" title="끝나는 시각 (선택)" />
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-stone-500">반복</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {REPEATS.map(([k, l]) => (
              <button key={k || "none"} type="button" onClick={() => set({ repeat: k })} className={pill((x.repeat || "") === k)}>
                {l}
              </button>
            ))}
            {x.repeat && <span className="text-xs text-stone-500">{repeatText(x)}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <span className="text-xs text-stone-500">누구 일정</span>
            <div className="flex gap-1.5">
              {WHO.map((w) => (
                <button key={w} type="button" onClick={() => set({ who: w })} className={pill(x.who === w)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-stone-500">색</span>
            <div className="flex items-center gap-1.5">
              {COLORS.map(([c, n]) => (
                <button
                  key={c}
                  type="button"
                  title={n}
                  aria-label={n}
                  aria-pressed={color === c}
                  onClick={() => set({ color: c === whoColor(x.who) ? "" : c })}
                  className={"h-6 w-6 rounded-full ring-offset-2 " + (color === c ? "ring-2 ring-stone-400" : "")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-stone-500">메모</span>
          <textarea value={x.memo} onChange={(e) => set({ memo: e.target.value })} rows={3} placeholder="장소, 준비물, 연락처…" className={FIELD + " leading-relaxed"} />
        </label>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        {x.id ? (
          <button type="button" onClick={() => confirm(x.repeat ? "반복 일정을 통째로 지울까요?" : "이 일정을 지울까요?") && onRemove(x.id)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-rose-700">
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span className="text-xs text-stone-400">엔터로 저장</span>
        )}
        <button type="button" disabled={!ok} onClick={save} className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
          저장
        </button>
      </footer>
    </Sheet>
  );
}

/** 그날 전부 — 손가락 화면에서 칸을 눌렀을 때, 또는 '+N개'·날짜 숫자 */
function DaySheet({ day, mine, biz, onAdd, onOpen, onBiz, onClose }) {
  const drop = DROP_DAYS.includes(weekday(day));
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={dayTitle(day)} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-sm">
        {drop && <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">{DROP_LABEL} — 신상 업로드 날</p>}
        {biz.map((e) => (
          <button key={e.id} type="button" onClick={() => onBiz(e)} className="flex w-full items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-left hover:bg-stone-50">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(e.kind) }} />
            <span className="min-w-0 flex-1 truncate font-medium text-stone-800">{e.title}</span>
            <span className="shrink-0 text-[11px] text-stone-400">이벤트 · {periodLabel(e)}</span>
          </button>
        ))}
        {mine.map((o) => (
          <button key={o.e.id + o.s} type="button" onClick={() => onOpen(o.e)} className="flex w-full items-start gap-2 rounded-xl border border-stone-200 px-3 py-2 text-left hover:bg-stone-50">
            <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full" style={{ background: colorOfEvent(o.e) }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-stone-900">{o.e.title}</span>
              <span className="block text-[11px] text-stone-500">
                {timeLabel(o.e)}
                {o.t > o.s && ` · ${periodText(o.s, o.t)}`}
                {o.e.repeat && ` · ${repeatText(o.e)}`} · {o.e.who}
              </span>
              {o.e.memo && <span className="mt-0.5 block text-xs whitespace-pre-line text-stone-600">{o.e.memo}</span>}
            </span>
          </button>
        ))}
        {!biz.length && !mine.length && <p className="py-6 text-center text-xs text-stone-400">이날은 일정이 없어요.</p>}
      </div>
      <footer className="shrink-0 border-t border-stone-200 px-4 py-3">
        <button type="button" onClick={onAdd} className="flex w-full items-center justify-center gap-1 rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white">
          <Plus size={15} /> 이날 일정 넣기
        </button>
      </footer>
    </Sheet>
  );
}

export default function HomeCalendar({ online, onPage }) {
  const today = dayKey();
  const [cal, setCal] = useState(null);
  const [biz, setBiz] = useState([]);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [who, setWhoState] = useState(() => readLS(WHO_KEY));
  const [edit, setEdit] = useState(null);
  const [daySheet, setDaySheet] = useState("");
  const [msg, setMsg] = useState("");
  const [movedSeen, setMovedSeen] = useState(() => readLS(MOVED_SEEN));
  const [drag, setDrag] = useState(null); // {mode:'select', from, to} | {mode:'move', id, grab, target, x, y, moved}
  const dragRef = useRef(null);
  const ptype = useRef("mouse");
  const setWho = (w) => {
    setWhoState(w);
    writeLS(WHO_KEY, w);
  };

  const load = useCallback(async () => {
    try {
      setCal((await loadKey(CAL_KEY, online, {})) || {});
      setBiz((await loadKey("events", online, { items: [] })).items || []);
    } catch {
      setMsg("캘린더를 불러오지 못했어요.");
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const off = onSettingsChange((k) => (k === CAL_KEY || k === "events") && load());
    const stop = watchKeys([CAL_KEY], load);
    return () => {
      off();
      stop();
    };
  }, [load]);

  // 누르면 화면 먼저 바꾸고 저장은 뒤에서 — fn 은 여러 번 불릴 수 있어서 순수하게
  const save = async (fn) => {
    setCal((c) => fn(c || {}));
    setEdit(null);
    try {
      setCal(await changeKey(CAL_KEY, online, fn, {}));
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
      load();
    }
  };
  const upsert = (ev) => save((v) => ({ ...v, events: (v.events || []).some((x) => x.id === ev.id) ? v.events.map((x) => (x.id === ev.id ? ev : x)) : [...(v.events || []), ev] }));
  const remove = (id) => save((v) => ({ ...v, events: (v.events || []).filter((x) => x.id !== id) }));
  const moveBy = (id, n) => save((v) => ({ ...v, events: (v.events || []).map((x) => (x.id === id ? { ...x, start: shiftDay(x.start, n), end: x.end ? shiftDay(x.end, n) : "" } : x)) }));

  const all = cal?.events;
  const mine = useMemo(() => (all || []).filter((e) => !who || e.who === who || e.who === "둘 다"), [all, who]);
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const from = weeks[0][0];
  const to = weeks.at(-1)[6];
  const occ = useMemo(() => mine.flatMap((e) => occurrences(e, from, to)), [mine, from, to]);
  // 막대 = 이벤트 캘린더 + 내 일정 중 종일·여러 날 / 칸 안 한 줄 = 내 일정 중 하루짜리 시각 있는 것
  const barItems = useMemo(
    () => [
      ...biz.filter((e) => !e.always && e.start).map((e) => ({ ...e, _biz: true })),
      ...occ.filter((o) => !o.e.time || o.t > o.s).map((o) => ({ ...o.e, id: o.e.id, start: o.s, end: o.t, _mine: o.e })),
    ],
    [biz, occ],
  );
  const chipsOn = (k) => occ.filter((o) => o.e.time && o.s === o.t && o.s === k).sort(byTime);
  const dayMine = (k) => occ.filter((o) => o.s <= k && o.t >= k).sort(byTime);
  const dayBiz = (k) => biz.filter((e) => !e.always && e.start && e.start <= k && (e.end || e.start) >= k);
  const [y, m] = ym.split("-").map(Number);

  // ---- 마우스 끌기 (손가락은 onClick 으로)
  const dayAt = (x, yy) => {
    for (const el of document.elementsFromPoint(x, yy)) if (el.dataset?.day) return el.dataset.day;
    return "";
  };
  const put = (d) => {
    dragRef.current = d;
    setDrag(d);
  };
  const onDown = (e) => {
    ptype.current = e.pointerType;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest("[data-biz],[data-more],[data-daynum]")) return;
    const day = dayAt(e.clientX, e.clientY);
    if (!day) return;
    e.preventDefault();
    const ev = e.target.closest("[data-ev]");
    put(ev ? { mode: "move", id: ev.dataset.ev, grab: day, target: day, x: e.clientX, y: e.clientY, moved: false } : { mode: "select", from: day, to: day });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const day = dayAt(e.clientX, e.clientY) || (d.mode === "select" ? d.to : d.target);
    if (d.mode === "select") {
      if (day !== d.to) put({ ...d, to: day });
    } else {
      const moved = d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5;
      if (moved !== d.moved || day !== d.target) put({ ...d, moved, target: day });
    }
  };
  const onUp = () => {
    const d = dragRef.current;
    put(null);
    if (!d) return;
    if (d.mode === "select") {
      const [a, b] = [d.from, d.to].sort();
      setEdit({ start: a, end: b > a ? b : "" });
    } else if (!d.moved) {
      const ev = (all || []).find((x) => x.id === d.id);
      if (ev) setEdit(ev);
    } else if (d.target !== d.grab) moveBy(d.id, diffDays(d.grab, d.target));
  };
  const touch = () => ptype.current !== "mouse";
  const selLo = drag?.mode === "select" ? [drag.from, drag.to].sort()[0] : "";
  const selHi = drag?.mode === "select" ? [drag.from, drag.to].sort()[1] : "";

  const moved = cal?.movedTasks;
  const showMoved = moved?.tasks?.length && movedSeen !== moved.on;

  return (
    <section className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setYm(shiftMonth(ym, -1))} aria-label="이전 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
            <ChevronLeft size={18} />
          </button>
          <b className="min-w-[7.5rem] text-center text-lg text-stone-900 tabular-nums">
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
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-full bg-stone-100 p-0.5">
            {["", "세원", "지원"].map((w) => (
              <button key={w || "all"} type="button" onClick={() => setWho(w)} className={"rounded-full px-3 py-1 text-xs font-semibold " + (who === w ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                {w || "둘 다"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setEdit({ start: ym === today.slice(0, 7) ? today : `${ym}-01` })} className="flex items-center gap-1 rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> 일정
          </button>
        </div>
      </div>
      {msg && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}
      {showMoved && (
        <p className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <ListChecks size={14} className="mt-px shrink-0 text-stone-400" />
          <span className="min-w-0 flex-1">
            예전 캘린더의 반복 할 일 {moved.tasks.length}개({moved.tasks.map((t) => t.title).join(" · ")})는 <b>업무일지 › 루틴</b>으로 옮겼어요 — 시각·방법도 같이. 캘린더에는 이제 일정만 적어요.
            <button type="button" onClick={() => onPage?.("journal")} className="ml-1 font-semibold text-rose-700 hover:underline">
              업무일지 열기
            </button>
          </span>
          <button type="button" onClick={() => (setMovedSeen(moved.on), writeLS(MOVED_SEEN, moved.on))} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-[11px] font-semibold text-stone-500">
          {WEEK_KO.map((w, i) => (
            <div key={w} className={"py-1.5 " + (i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : "")}>
              {w}
            </div>
          ))}
        </div>
        <div className="select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => put(null)}>
          {weeks.map((week) => {
            const { bars, lanes } = weekBars(barItems, week);
            const L = Math.min(lanes, MAX_LANES);
            return (
              <div key={week[0]} className="relative grid grid-cols-7 border-b border-stone-100 last:border-b-0">
                {week.map((k) => {
                  const out = k.slice(0, 7) !== ym;
                  const wd = weekday(k);
                  const chips = chipsOn(k);
                  const room = Math.max(1, 4 - L);
                  const hidden = bars.filter((b) => b.lane >= MAX_LANES && b.s <= k && b.t >= k).length + Math.max(0, chips.length - room);
                  const inSel = selLo && k >= selLo && k <= selHi;
                  const isTarget = drag?.mode === "move" && drag.moved && drag.target === k;
                  return (
                    <div
                      key={k}
                      data-day={k}
                      role="button"
                      tabIndex={0}
                      aria-label={`${dayTitle(k)} — 일정 넣기`}
                      onClick={() => touch() && setDaySheet(k)}
                      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setEdit({ start: k })}
                      className={
                        "flex min-h-[7rem] cursor-pointer flex-col items-stretch border-r border-stone-100 p-1 text-left outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-inset sm:min-h-[8.5rem] " +
                        (inSel || isTarget ? "bg-rose-50 ring-2 ring-rose-300 ring-inset" : out ? "bg-stone-50/60" : "hover:bg-stone-50/70")
                      }
                    >
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          data-daynum
                          onClick={(e) => (e.stopPropagation(), setDaySheet(k))}
                          title="그날 전부 보기"
                          className={
                            "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums hover:ring-2 hover:ring-stone-200 " +
                            (k === today ? "bg-rose-700 text-white" : out ? "text-stone-300" : wd === 0 ? "text-rose-600" : wd === 6 ? "text-sky-700" : "text-stone-700")
                          }
                        >
                          {Number(k.slice(8))}
                        </button>
                        {DROP_DAYS.includes(wd) && !out && (
                          <>
                            <span className="hidden truncate rounded bg-teal-50 px-1 text-[9px] font-semibold text-teal-700 sm:inline">{DROP_LABEL}</span>
                            <span title={DROP_LABEL} className="h-1.5 w-1.5 rounded-full bg-teal-500 sm:hidden" />
                          </>
                        )}
                      </span>
                      <span style={{ height: L * LANE }} className="shrink-0" />
                      <span className="mt-0.5 flex min-w-0 flex-col gap-px">
                        {chips.slice(0, room).map((o) => (
                          <span
                            key={o.e.id}
                            data-ev={o.e.id}
                            onClick={(ev) => touch() && (ev.stopPropagation(), setEdit(o.e))}
                            title={`${o.e.title} · ${timeLabel(o.e)}${o.e.repeat ? " · " + repeatText(o.e) : ""} · ${o.e.who}${o.e.memo ? "\n" + o.e.memo : ""}`}
                            className={"flex min-w-0 cursor-grab items-center gap-1 rounded px-1 text-[10px] leading-[16px] text-stone-700 hover:bg-stone-100 active:cursor-grabbing " + (drag?.mode === "move" && drag.moved && drag.id === o.e.id ? "opacity-40" : "")}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOfEvent(o.e) }} />
                            <span className="shrink-0 text-stone-400 tabular-nums">{o.e.time}</span>
                            <span className="truncate font-medium">{o.e.title}</span>
                            {o.e.repeat && <Repeat size={9} className="hidden shrink-0 text-stone-400 sm:block" />}
                          </span>
                        ))}
                        {hidden > 0 && (
                          <button type="button" data-more onClick={(e) => (e.stopPropagation(), setDaySheet(k))} className="rounded px-1 text-left text-[10px] font-semibold text-stone-500 hover:bg-stone-100">
                            +{hidden}개
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {bars
                  .filter((b) => b.lane < MAX_LANES)
                  .map((b) => {
                    const pos = { top: TOP + b.lane * LANE, left: `calc(${(b.col / 7) * 100}% + 2px)`, width: `calc(${(b.span / 7) * 100}% - 4px)` };
                    const round = (b.cutL ? "" : "rounded-l ") + (b.cutR ? "" : "rounded-r");
                    if (b.e._biz)
                      return (
                        <button
                          key={"b" + b.e.id + b.s}
                          type="button"
                          data-biz
                          onClick={() => onPage?.("events")}
                          title={`${b.e.title} — 이벤트 캘린더에서 열기`}
                          className={"absolute truncate px-1.5 text-left text-[10px] leading-[16px] font-semibold text-white " + round}
                          style={{ ...pos, background: colorOf(b.e.kind) }}
                        >
                          {b.e.title}
                        </button>
                      );
                    const e = b.e._mine;
                    const c = colorOfEvent(e);
                    return (
                      <span
                        key={"m" + e.id + b.s}
                        data-ev={e.id}
                        onClick={(ev) => touch() && (ev.stopPropagation(), setEdit(e))}
                        title={`${e.title} · ${timeLabel(e)}${e.repeat ? " · " + repeatText(e) : ""} · ${e.who}${e.memo ? "\n" + e.memo : ""}`}
                        className={"absolute flex cursor-grab items-center gap-1 truncate px-1.5 text-[10px] leading-[16px] font-semibold active:cursor-grabbing " + round + (drag?.mode === "move" && drag.moved && drag.id === e.id ? " opacity-40" : "")}
                        style={{ ...pos, background: c + "26", color: c, boxShadow: b.cutL ? "none" : `inset 3px 0 0 ${c}` }}
                      >
                        {e.time && <span className="font-normal tabular-nums opacity-75">{e.time}</span>}
                        <span className="truncate">{e.title}</span>
                        {e.repeat && <Repeat size={9} className="hidden shrink-0 opacity-70 sm:block" />}
                      </span>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-400">
        <span className="flex items-center gap-1">
          <CalendarDays size={11} />
          <span className="[@media(pointer:fine)]:hidden">날짜를 누르면 그날 일정 · 넣기 · 일정을 누르면 고치기 · 초록 점 = {DROP_LABEL}</span>
          <span className="hidden [@media(pointer:fine)]:inline">날짜 칸을 누르면 일정 넣기 · 여러 칸을 끌면 여러 날 · 일정을 끌어 옮기기 · 날짜 숫자를 누르면 그날 전부</span>
        </span>
        <span>진한 색 막대 = 이벤트 캘린더(누르면 이동)</span>
      </p>

      {edit && <EventEditor key={edit.id || `${edit.start}-${edit.end || ""}`} seed={edit} onClose={() => setEdit(null)} onSave={upsert} onRemove={remove} />}
      {daySheet && (
        <DaySheet
          day={daySheet}
          mine={dayMine(daySheet)}
          biz={dayBiz(daySheet)}
          onClose={() => setDaySheet("")}
          onAdd={() => (setDaySheet(""), setEdit({ start: daySheet }))}
          onOpen={(e) => (setDaySheet(""), setEdit(e))}
          onBiz={() => (setDaySheet(""), onPage?.("events"))}
        />
      )}
    </section>
  );
}
