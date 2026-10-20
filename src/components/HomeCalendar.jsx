import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, CalendarDays } from "lucide-react";
import { loadKey, changeKey, FIELD, onSettingsChange, watchKeys } from "../lib/shoot";
import { newId } from "../lib/id";
import { dayKey, dayTitle } from "../lib/journal";
import { CAL_KEY, WHO, WEEK_KO, DEFAULT_TASKS, taskDue, repeatLabel, DROP_DAYS, DROP_LABEL, monthWeeks, shiftMonth, weekday, weekBars, colorOf, endOf } from "../lib/events";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 홈 › 할 일 캘린더 (2026-10-19 밤, 세원: "이벤트 캘린더는 이벤트 용도로 냅두고, 캘린더는 홈에 대문짝하게 — 뭐할지 한 번에 보이니까").
 * settings 'calendar' {tasks:[…], done:{날짜:[할 일 id]}} — 할 일 모양은 lib/events.js '할 일 캘린더'.
 * 달력 = 반복·하루만 할 일 + 이벤트 캘린더의 기간 막대(보기만) + 월·화 저녁 6시 신상. 오른쪽 = 고른 날 할 일(체크·방법).
 */

const WHO_KEY = "poclo_cal_who";
const MAX_LANES = 2;
const MAX_TASKS = 3;

async function loadCal(online) {
  const c = await loadKey(CAL_KEY, online, null);
  if (c?.tasks) return c;
  // 처음 — 이벤트 캘린더에 잠깐 있던 반복 할 일을 옮기거나 기본 4개
  const ev = await loadKey("events", online, { items: [] }).catch(() => ({}));
  const tasks = ev?.tasks?.length ? ev.tasks : DEFAULT_TASKS.map((t) => ({ ...t, id: newId("tk"), from: dayKey() }));
  return changeKey(CAL_KEY, online, (cur) => (cur?.tasks ? cur : { ...(cur || {}), tasks, done: {} }), {});
}

function TaskEditor({ seed, onSave, onRemove, onClose }) {
  const [x, setX] = useState(() => ({ title: "", how: "", who: "세원", time: "", repeat: { type: "weekly", days: [1] }, ...seed }));
  const set = (p) => setX((v) => ({ ...v, ...p }));
  const r = x.repeat || {};
  const setR = (p) => set({ repeat: { ...r, ...p } });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((a) => a !== v) : [...arr, v]);
  const ok = x.title.trim() && (r.type !== "weekly" || (r.days || []).length) && (r.type !== "monthly" || (r.dates || []).length) && (r.type !== "once" || r.date);
  const pill = (on) => "rounded-full border px-3 py-1 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300");
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={seed.id ? "할 일" : "할 일 넣기"} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-stone-500">할 일</span>
          <input autoFocus value={x.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 통장·카드 엑셀 넣기" className={FIELD} />
        </label>
        <div className="space-y-1.5">
          <span className="text-xs text-stone-500">언제</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["once", "하루만"],
              ["daily", "매일"],
              ["weekdays", "평일"],
              ["weekly", "매주"],
              ["monthly", "매월"],
            ].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setR({ type: k, ...(k === "once" && !r.date ? { date: seed.day || dayKey() } : {}) })} className={pill(r.type === k)}>
                {l}
              </button>
            ))}
            <input type="time" value={x.time || ""} onChange={(e) => set({ time: e.target.value })} className="rounded-full border border-stone-200 px-2 py-0.5 text-xs" title="시각 (선택)" />
          </div>
          {r.type === "once" && <input type="date" value={r.date || ""} onChange={(e) => setR({ date: e.target.value })} className="rounded-lg border border-stone-200 px-2 py-1 text-sm" />}
          {r.type === "weekly" && (
            <div className="flex flex-wrap gap-1">
              {WEEK_KO.map((w, i) => (
                <button key={w} type="button" onClick={() => setR({ days: toggle(r.days || [], i) })} className={pill((r.days || []).includes(i))}>
                  {w}
                </button>
              ))}
            </div>
          )}
          {r.type === "monthly" && (
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button key={d} type="button" onClick={() => setR({ dates: toggle(r.dates || [], d) })} className={"rounded-md border py-1 text-xs tabular-nums " + ((r.dates || []).includes(d) ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 text-stone-600")}>
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-stone-500">누가</span>
          <div className="flex gap-1.5">
            {WHO.map((w) => (
              <button key={w} type="button" onClick={() => set({ who: w })} className={pill(x.who === w)}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-stone-500">어떻게 (순서·어디서)</span>
          <textarea value={x.how} onChange={(e) => set({ how: e.target.value })} rows={5} placeholder="예: 국민은행 › 거래내역조회 › 지난 7일 엑셀 → ERP 에 끌어다 놓기" className={FIELD + " leading-relaxed"} />
        </label>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        {seed.id ? (
          <button type="button" onClick={() => confirm("이 할 일을 지울까요?") && onRemove(seed.id)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-rose-700">
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span className="text-xs text-stone-400">{repeatLabel(x)}</span>
        )}
        <button
          type="button"
          disabled={!ok}
          onClick={() => {
            const { day: _day, ...rest } = x;
            onSave({ ...rest, title: x.title.trim(), id: seed.id || newId("tk"), from: seed.from || dayKey() });
          }}
          className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}

const readWho = () => {
  try {
    return localStorage.getItem(WHO_KEY) || "";
  } catch {
    return "";
  }
};

export default function HomeCalendar({ online, onPage }) {
  const today = dayKey();
  const [cal, setCal] = useState(null);
  const [events, setEvents] = useState([]);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [who, setWhoState] = useState(readWho);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState("");
  const setWho = (w) => {
    setWhoState(w);
    try {
      localStorage.setItem(WHO_KEY, w);
    } catch {
      /* 무시 */
    }
  };

  const load = useCallback(async () => {
    try {
      setCal(await loadCal(online));
      setEvents((await loadKey("events", online, { items: [] })).items || []);
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

  const save = async (fn) => {
    try {
      setCal(await changeKey(CAL_KEY, online, fn, {}));
      setEdit(null);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  const tasks = useMemo(() => (cal?.tasks || []).filter((t) => !who || t.who === who || t.who === "둘 다"), [cal, who]);
  const done = cal?.done || {};
  const isDone = (t, k) => (done[k] || []).includes(t.id);
  const toggleDone = (t, k) =>
    save((v) => {
      const d = { ...(v.done || {}) };
      const list = d[k] || [];
      d[k] = list.includes(t.id) ? list.filter((x) => x !== t.id) : [...list, t.id];
      const cut = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      for (const key of Object.keys(d)) if (key < cut || !d[key].length) delete d[key];
      return { ...v, done: d };
    });
  const upsertTask = (t) => save((v) => ({ ...v, tasks: (v.tasks || []).some((x) => x.id === t.id) ? v.tasks.map((x) => (x.id === t.id ? t : x)) : [...(v.tasks || []), t] }));
  const removeTask = (id) => save((v) => ({ ...v, tasks: (v.tasks || []).filter((x) => x.id !== id) }));

  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const dueOn = (k) => tasks.filter((t) => taskDue(t, k)).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const selTasks = dueOn(sel);
  const selEvents = events.filter((e) => !e.always && e.start && e.start <= sel && endOf(e) >= sel);
  const left = selTasks.filter((t) => !isDone(t, sel)).length;
  const [y, m] = ym.split("-").map(Number);

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
          {(ym !== today.slice(0, 7) || sel !== today) && (
            <button type="button" onClick={() => (setYm(today.slice(0, 7)), setSel(today))} className="ml-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50">
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
          <button type="button" onClick={() => setEdit({ day: sel, repeat: { type: "once", date: sel } })} className="flex items-center gap-1 rounded-xl bg-rose-700 px-3 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> 할 일
          </button>
        </div>
      </div>
      {msg && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_22rem]">
        {/* 달력 */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-[11px] font-semibold text-stone-500">
            {WEEK_KO.map((w, i) => (
              <div key={w} className={"py-1.5 " + (i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : "")}>
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week) => {
            const { bars, lanes } = weekBars(events, week);
            const L = Math.min(lanes, MAX_LANES);
            return (
              <div key={week[0]} className="relative grid grid-cols-7 border-b border-stone-100 last:border-b-0">
                {week.map((k) => {
                  const out = k.slice(0, 7) !== ym;
                  const wd = weekday(k);
                  const list = out ? [] : dueOn(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSel(k)}
                      className={
                        "flex min-h-[7.5rem] flex-col items-stretch border-r border-stone-100 p-1 text-left last:border-r-0 sm:min-h-[8.5rem] " +
                        (k === sel ? "bg-rose-50/70 ring-2 ring-rose-300 ring-inset" : out ? "bg-stone-50/60" : "hover:bg-stone-50")
                      }
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
                        {DROP_DAYS.includes(wd) && !out && <span className="rounded bg-teal-50 px-1 text-[9px] font-semibold text-teal-700">{DROP_LABEL}</span>}
                      </span>
                      <span style={{ height: L * 18 }} className="shrink-0" />
                      <span className="mt-0.5 flex flex-col gap-px">
                        {list.slice(0, MAX_TASKS).map((t) => (
                          <span key={t.id} className={"truncate rounded px-1 text-[10px] leading-[16px] " + (isDone(t, k) ? "bg-emerald-50 text-emerald-700 line-through" : "bg-stone-100 text-stone-700")} title={`${t.title} · ${repeatLabel(t)} · ${t.who}`}>
                            {isDone(t, k) ? "✓" : t.repeat?.type === "once" ? "•" : "↻"} {t.title}
                          </span>
                        ))}
                        {list.length > MAX_TASKS && <span className="px-1 text-[10px] text-stone-400">+{list.length - MAX_TASKS}개</span>}
                      </span>
                    </button>
                  );
                })}
                {bars
                  .filter((b) => b.lane < MAX_LANES)
                  .map((b) => (
                    <button
                      key={b.e.id + b.s}
                      type="button"
                      onClick={() => onPage?.("events")}
                      title={`${b.e.title} — 이벤트 캘린더에서 열기`}
                      className={"absolute truncate px-1.5 text-left text-[10px] leading-[16px] font-semibold text-white " + (b.cutL ? "" : "rounded-l ") + (b.cutR ? "" : "rounded-r")}
                      style={{ top: 26 + b.lane * 18, left: `calc(${(b.col / 7) * 100}% + 2px)`, width: `calc(${(b.span / 7) * 100}% - 4px)`, background: colorOf(b.e.kind) }}
                    >
                      {b.e.title}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>

        {/* 고른 날 할 일 */}
        <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-stone-900">{sel === today ? "오늘 할 일" : dayTitle(sel)}</h3>
            <span className="text-xs text-stone-400">{selTasks.length ? `${selTasks.length - left}/${selTasks.length} 끝냄` : ""}</span>
          </div>
          {sel === today && <p className="-mt-1 text-xs text-stone-400">{dayTitle(today)}</p>}
          <ul className="space-y-1.5">
            {selTasks.map((t) => {
              const d = isDone(t, sel);
              return (
                <li key={t.id} className={"rounded-xl border px-3 py-2 " + (d ? "border-emerald-200 bg-emerald-50/50" : "border-stone-200")}>
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => toggleDone(t, sel)} aria-label={d ? "끝냄 풀기" : "끝냄"} className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border " + (d ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white hover:border-rose-400")}>
                      {d && <Check size={13} strokeWidth={3} />}
                    </button>
                    <button type="button" onClick={() => setEdit(t)} className="min-w-0 flex-1 text-left">
                      <span className={"block text-sm font-semibold " + (d ? "text-stone-400 line-through" : "text-stone-900")}>{t.title}</span>
                      <span className="block text-[11px] text-stone-400">
                        {repeatLabel(t)} · {t.who}
                      </span>
                      {t.how && !d && <span className="mt-1 block text-xs leading-relaxed whitespace-pre-line text-stone-600">{t.how}</span>}
                    </button>
                  </div>
                </li>
              );
            })}
            {!selTasks.length && <li className="py-4 text-center text-xs text-stone-400">이날은 할 일이 없어요.</li>}
          </ul>
          {selEvents.length > 0 && (
            <div className="space-y-1 border-t border-stone-100 pt-2">
              <div className="text-[11px] font-semibold text-stone-400">진행 중인 이벤트</div>
              {selEvents.map((e) => (
                <button key={e.id} type="button" onClick={() => onPage?.("events")} className="flex w-full items-center gap-1.5 text-left text-xs text-stone-700 hover:text-rose-700">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(e.kind) }} />
                  {e.title}
                </button>
              ))}
            </div>
          )}
          <p className="flex items-center gap-1 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
            <CalendarDays size={11} /> 날짜를 누르면 그날 할 일 · 할 일을 누르면 고치기 · ↻ 반복 · • 하루만
          </p>
        </div>
      </div>

      {edit && (
        <TaskEditor key={edit.id || "new"} seed={edit} onClose={() => setEdit(null)} onSave={upsertTask} onRemove={removeTask} />
      )}
    </section>
  );
}
