import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Check, ChevronDown } from "lucide-react";
import { loadKey, changeKey, upsert, remove, onSettingsChange, watchKeys } from "../lib/shoot";
import { dayKey, dayTitle, shiftDay } from "../lib/journal";
import { KEY, KINDS, kindOf, colorOf, TEMPLATES, newTodo, DROP_DAYS, DROP_LABEL, monthWeeks, shiftMonth, weekday, weekBars, endOf, isOn, resultOf, periodLabel } from "../lib/events";
import { useBarDrag, dropRange, rangeText } from "../lib/barDrag";
import EventSheet, { ResultLine } from "./EventSheet";

/**
 * 일 › 이벤트 캘린더 (lib/events.js 머리말).
 * 위 = 달력(기간 막대 · 월·화 '신상 6시' 표시 · 빈 칸 누르면 그날 새 이벤트), 아래 = 상시 진행 / 진행 중 / 다가오는 / 지난 이벤트(그 기간 매출).
 * 10/22 세원: "이벤트 바 옮길 수 있게 해줘." → 막대를 끌어 다른 날에 놓으면 기간 길이 그대로 옮김(마우스 = 끌기, 폰 = 길게 눌러 끌기, lib/barDrag.js).
 *   짧게 누르면 예전처럼 이벤트 창(EventSheet — 홈 캘린더도 같은 창).
 */

const MAX_LANES = 4;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function Bar({ b, onOpen, onPress, quiet, dim }) {
  const c = colorOf(b.e.kind);
  const done = (b.e.todos || []).length > 0 && b.e.todos.every((t) => t.done);
  return (
    <button
      type="button"
      onPointerDown={onPress}
      onContextMenu={(ev) => ev.preventDefault()}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!quiet()) onOpen(b.e);
      }}
      title={`${b.e.title} · ${periodLabel(b.e)} — 누르면 열기 · 끌어서 날짜 옮기기`}
      style={{ top: 26 + b.lane * 22, left: `calc(${(b.col * 100) / 7}% + 2px)`, width: `calc(${(b.span * 100) / 7}% - 4px)`, background: c }}
      className={
        "absolute z-[1] flex h-5 cursor-grab items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-medium text-white shadow-sm select-none [-webkit-touch-callout:none] hover:brightness-110 " +
        (b.cutL ? "rounded-l-none " : "rounded-l-md ") +
        (b.cutR ? "rounded-r-none" : "rounded-r-md") +
        (dim ? " opacity-40" : "")
      }
    >
      {done && <Check size={11} strokeWidth={3} className="shrink-0" />}
      <span className="truncate">{b.e.title || "이름 없음"}</span>
    </button>
  );
}

function Month({ ym, events, today, onNew, onOpen, onMove }) {
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const { drag, press, quiet, box, tag } = useBarDrag((item, n) => onMove(item.id, n));
  const hot = dropRange(drag); // 끄는 중이면 놓일 자리 [시작, 끝]
  return (
    <div ref={box} className={"overflow-hidden rounded-2xl border border-stone-200 bg-white" + (drag ? " cursor-grabbing select-none" : "")}>
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
              const on = hot && k >= hot[0] && k <= hot[1];
              return (
                <button
                  key={k}
                  type="button"
                  data-day={k}
                  onClick={() => !quiet() && onNew(k)}
                  title={`${dayTitle(k)} — 눌러서 이벤트 넣기`}
                  className={
                    "group relative flex flex-col items-stretch justify-start border-r border-stone-100 p-1 text-left last:border-r-0 " +
                    (on ? "bg-rose-50 ring-2 ring-rose-300 ring-inset" : (out ? "bg-stone-50/60 " : "") + (drag ? "" : "hover:bg-rose-50/40"))
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
                    <Plus size={11} className="ml-auto text-stone-300 opacity-0 group-hover:opacity-100" />
                  </span>
                  {more > 0 && <span className="absolute bottom-0.5 left-1 text-[10px] text-stone-400">+{more}개</span>}
                </button>
              );
            })}
            {bars
              .filter((b) => b.lane < MAX_LANES)
              .map((b) => (
                <Bar
                  key={b.e.id + b.s}
                  b={b}
                  onOpen={onOpen}
                  quiet={quiet}
                  dim={drag?.item.id === b.e.id}
                  onPress={(ev) => press(ev, { id: b.e.id, s: b.e.start, t: endOf(b.e), title: b.e.title || "이름 없음" })}
                />
              ))}
          </div>
        );
      })}
      <div ref={tag} className={"pointer-events-none fixed top-0 left-0 z-[60] max-w-[80vw] truncate rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg " + (drag ? "" : "hidden")}>
        {drag && (
          <>
            {drag.item.title} → <b className="tabular-nums">{rangeText(hot[0], hot[1])}</b>
          </>
        )}
      </div>
    </div>
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
  // 막대 끌어 옮기기 — 화면 먼저 옮기고, 서버는 조건부 쓰기로 그 이벤트의 날짜만 바꾼다(다른 칸·다른 이벤트는 서버 최신 그대로)
  const moveEvent = async (id, n) => {
    const e = list.find((x) => x.id === id);
    if (!e?.start || !n) return;
    const start = shiftDay(e.start, n);
    const end = e.end ? shiftDay(e.end, n) : "";
    const fn = (v) => ({ ...v, items: (v.items || []).map((x) => (x.id === id ? { ...x, start, end } : x)) });
    setList((l) => fn({ items: l }).items);
    try {
      setList((await changeKey(KEY, online, fn)).items || []);
    } catch (er) {
      setMsg(er.message || "옮기지 못했어요.");
      load();
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

      <Month ym={ym} events={shown} today={today} onNew={(k) => setEdit({ start: k, end: k })} onOpen={setEdit} onMove={moveEvent} />
      <p className="-mt-2 px-1 text-[11px] text-stone-400">
        <CalendarDays size={11} className="mr-0.5 inline align-[-1px]" /> 빈 칸을 누르면 그날 이벤트를 넣어요 · 막대를 끌어 다른 날에 놓으면 날짜가 옮겨져요
        <span className="[@media(pointer:fine)]:hidden">(폰은 길게 눌러 끌기)</span> · '신상 6시'는 신상 업로드 날(월·화 저녁 6시)
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

      {edit && <EventSheet key={edit.id || "new" + edit.start} seed={edit} rows={rows} today={today} onClose={() => setEdit(null)} onSave={(e) => save(upsert(e))} onRemove={(id) => save(remove(id))} />}
    </div>
  );
}
