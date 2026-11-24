import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  loadKey,
  changeKey,
  upsert,
  remove,
  onSettingsChange,
  watchKeys,
} from "../lib/shoot";
import { dayKey, dayTitle, shiftDay } from "../lib/journal";
import {
  KEY,
  kindOf,
  colorOf,
  TEMPLATES,
  newTodo,
  isDropDay,
  dropRuleText,
  DROP_LABEL,
  monthWeeks,
  shiftMonth,
  weekday,
  weekBars,
  endOf,
  isOn,
  resultOf,
  periodLabel,
} from "../lib/events";
import { useBarDrag, dropRange, rangeText } from "../lib/barDrag";
import EventSheet, { ResultLine } from "./EventSheet";
import MktNote from "./MktNote";
import { ISSUE_CATS, catOf, issuesOn } from "../lib/mktCalendar";

/**
 * 일 › 마케팅 캘린더 (예전 이름 이벤트 캘린더 — 11/25 합침, lib/events.js · lib/mktCalendar.js 머리말).
 * 위 = 달력(기간 막대 · 신상 업로드 날 '신상 6시' 표시(lib/events DROP_RULES) · 빈 칸 누르면 그날 새 이벤트), 아래 = 상시 진행 / 진행 중 / 다가오는 / 지난 이벤트(그 기간 매출).
 * 10/22 세원: "이벤트 바 옮길 수 있게 해줘." → 막대를 끌어 다른 날에 놓으면 기간 길이 그대로 옮김(마우스 = 끌기, 폰 = 길게 눌러 끌기, lib/barDrag.js).
 *   짧게 누르면 예전처럼 이벤트 창(EventSheet — 홈 캘린더도 같은 창).
 */

const MAX_LANES = 4;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_ISSUES = 3; // 칸 안 이슈 줄 — 넘으면 '+N'

// 11/25 세원 "아이보스 마케팅 캘린더처럼" — 막대를 옅은 바탕 + 왼쪽 진한 줄 + 검은 글씨로(아이보스 띠처럼 읽히게)
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
      style={{
        top: 26 + b.lane * 22,
        left: `calc(${(b.col * 100) / 7}% + 2px)`,
        width: `calc(${(b.span * 100) / 7}% - 4px)`,
        background: c + "24",
        borderLeft: b.cutL ? undefined : `3px solid ${c}`,
      }}
      className={
        "absolute z-[1] flex h-5 cursor-grab items-center gap-1 overflow-hidden px-1.5 text-left text-[12px] font-semibold text-stone-800 select-none [-webkit-touch-callout:none] hover:brightness-95 " +
        (b.cutL ? "rounded-l-none " : "rounded-l-[3px] ") +
        (b.cutR ? "rounded-r-none" : "rounded-r-[3px]") +
        (dim ? " opacity-40" : "")
      }
    >
      {done && (
        <Check
          size={11}
          strokeWidth={3}
          className="shrink-0"
          style={{ color: c }}
        />
      )}
      <span className="truncate">{b.e.title || "이름 없음"}</span>
    </button>
  );
}

/** 칸 안 이슈 한 줄 — 넓은 화면은 아이보스처럼 옅은 띠 + 점 + 이름, 폰은 점만(아래 '이 달 일정'에 글로) */
function IssuePill({ it, onIssue }) {
  const c = catOf(it.c);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(ev) => {
        ev.stopPropagation();
        onIssue(it);
      }}
      onKeyDown={(ev) => {
        if (ev.key !== "Enter") return;
        ev.stopPropagation();
        onIssue(it);
      }}
      title={it.t + (it.tip ? " — " + it.tip : "")}
      className="hidden min-w-0 cursor-pointer items-center gap-1 rounded-[3px] px-1 text-[12px] leading-[18px] text-stone-800 hover:brightness-95 sm:flex"
      style={{ background: c.bg }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: c.dot }}
      />
      <span className="truncate">{it.t}</span>
    </span>
  );
}

function Month({ ym, events, today, onNew, onOpen, onMove, show, onIssue }) {
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const { drag, press, quiet, box, tag } = useBarDrag((item, n) =>
    onMove(item.id, n),
  );
  const hot = dropRange(drag); // 끄는 중이면 놓일 자리 [시작, 끝]
  const evs = show.event ? events : [];
  return (
    <div
      ref={box}
      className={
        "overflow-hidden rounded-2xl border border-stone-200 bg-white" +
        (drag ? " cursor-grabbing select-none" : "")
      }
    >
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-[11px] font-semibold text-stone-500">
        {WEEK.map((w, i) => (
          <div
            key={w}
            className={
              "py-1.5 " +
              (i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : "")
            }
          >
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const { bars, lanes } = weekBars(evs, week);
        const shown = Math.min(lanes, MAX_LANES);
        const hidden = (k) =>
          bars.filter((b) => b.lane >= MAX_LANES && b.s <= k && b.t >= k)
            .length;
        return (
          <div
            key={week[0]}
            className="relative grid grid-cols-7 border-b border-stone-100 last:border-b-0"
            style={{ minHeight: 30 + shown * 22 + 46 }}
          >
            {week.map((k) => {
              const out = k.slice(0, 7) !== ym;
              const wd = weekday(k);
              const more = hidden(k);
              const on = hot && k >= hot[0] && k <= hot[1];
              const its = out ? [] : issuesOn(k).filter((x) => show[x.c]);
              const red = its.some((x) => x.c === "holiday");
              const drop = show.drop && !out && isDropDay(k);
              return (
                <button
                  key={k}
                  type="button"
                  data-day={k}
                  onClick={() => !quiet() && onNew(k)}
                  title={`${dayTitle(k)} — 눌러서 이벤트 넣기`}
                  className={
                    "group relative flex min-w-0 flex-col items-stretch justify-start border-r border-stone-100 p-1 pb-1.5 text-left last:border-r-0 " +
                    (on
                      ? "bg-rose-50 ring-2 ring-rose-300 ring-inset"
                      : (out
                          ? "bg-stone-50/60 "
                          : k === today
                            ? "bg-amber-50/50 "
                            : "") + (drag ? "" : "hover:bg-rose-50/40"))
                  }
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={
                        "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums " +
                        (k === today
                          ? "bg-rose-700 text-white"
                          : out
                            ? "text-stone-300"
                            : wd === 0 || red
                              ? "text-rose-600"
                              : wd === 6
                                ? "text-sky-700"
                                : "text-stone-700")
                      }
                    >
                      {Number(k.slice(8))}
                    </span>
                    {drop && (
                      <span className="hidden rounded bg-teal-50 px-1 text-[9px] font-semibold text-teal-700 sm:inline">
                        {DROP_LABEL}
                      </span>
                    )}
                    {drop && (
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500 sm:hidden" />
                    )}
                    <Plus
                      size={11}
                      className="ml-auto text-stone-300 opacity-0 group-hover:opacity-100"
                    />
                  </span>
                  {/* 막대 자리(막대는 줄 위에 떠 있다)만큼 비우고 그 아래 그날 이슈 */}
                  <span
                    aria-hidden
                    style={{ height: shown * 22 + 2 }}
                    className="shrink-0"
                  />
                  {more > 0 && (
                    <span className="text-[10px] text-stone-400">
                      +{more}개
                    </span>
                  )}
                  {its.length > 0 && (
                    <span className="mt-0.5 flex min-w-0 flex-col gap-0.5">
                      {its.slice(0, MAX_ISSUES).map((it) => (
                        <IssuePill key={it.t} it={it} onIssue={onIssue} />
                      ))}
                      {its.length > MAX_ISSUES && (
                        <span className="hidden text-[10px] text-stone-400 sm:block">
                          +{its.length - MAX_ISSUES}
                        </span>
                      )}
                      <span className="flex gap-0.5 sm:hidden">
                        {its.map((it) => (
                          <span
                            key={it.t}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: catOf(it.c).dot }}
                          />
                        ))}
                      </span>
                    </span>
                  )}
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
                  onPress={(ev) =>
                    press(ev, {
                      id: b.e.id,
                      s: b.e.start,
                      t: endOf(b.e),
                      title: b.e.title || "이름 없음",
                    })
                  }
                />
              ))}
          </div>
        );
      })}
      <div
        ref={tag}
        className={
          "pointer-events-none fixed top-0 left-0 z-[60] max-w-[80vw] truncate rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg " +
          (drag ? "" : "hidden")
        }
      >
        {drag && (
          <>
            {drag.item.title} →{" "}
            <b className="tabular-nums">{rangeText(hot[0], hot[1])}</b>
          </>
        )}
      </div>
    </div>
  );
}

/** 폰 — 칸이 좁아 이름이 안 보이니 달력 아래 날짜별로 글로 (넓은 화면에선 숨김) */
function MonthList({ ym, events, show, onOpen, onIssue }) {
  const days = useMemo(() => {
    const out = [];
    const last = new Date(
      Number(ym.slice(0, 4)),
      Number(ym.slice(5, 7)),
      0,
    ).getDate();
    for (let i = 1; i <= last; i++) {
      const k = `${ym}-${String(i).padStart(2, "0")}`;
      const its = issuesOn(k).filter((x) => show[x.c]);
      const evs = show.event
        ? events.filter((e) => !e.always && e.start === k)
        : [];
      if (its.length || evs.length) out.push({ k, its, evs });
    }
    return out;
  }, [ym, events, show]);
  if (!days.length) return null;
  return (
    <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white lg:hidden">
      <h3 className="px-3 pt-2.5 pb-1.5 text-sm font-bold text-stone-900">
        이 달 일정
      </h3>
      {days.map(({ k, its, evs }) => (
        <div key={k} className="flex gap-3 px-3 py-2">
          <span
            className={
              "w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums " +
              (its.some((x) => x.c === "holiday") || weekday(k) === 0
                ? "text-rose-600"
                : "text-stone-600")
            }
          >
            {Number(k.slice(5, 7))}/{Number(k.slice(8))} ({WEEK[weekday(k)]})
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {evs.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpen(e)}
                className="rounded-[3px] px-1.5 text-[12px] leading-5 font-semibold text-stone-800"
                style={{
                  background: colorOf(e.kind) + "24",
                  borderLeft: `3px solid ${colorOf(e.kind)}`,
                }}
              >
                {e.title || "이름 없음"}
                {endOf(e) !== e.start && (
                  <span className="ml-1 font-normal text-stone-500">
                    ~{Number(endOf(e).slice(5, 7))}/{Number(endOf(e).slice(8))}
                  </span>
                )}
              </button>
            ))}
            {its.map((it) => (
              <button
                key={it.t}
                type="button"
                onClick={() => onIssue(it)}
                className="flex items-center gap-1 rounded-[3px] px-1.5 text-[12px] leading-5 text-stone-800"
                style={{ background: catOf(it.c).bg }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: catOf(it.c).dot }}
                />
                {it.t}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Row({ e, rows, today, onOpen }) {
  const todos = e.todos || [];
  const done = todos.filter((t) => t.done).length;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-stone-50"
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: colorOf(e.kind) }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-semibold text-stone-900">
            {e.title || "이름 없음"}
          </b>
          <span className="text-xs text-stone-500 tabular-nums">
            {kindOf(e.kind)[1]} · {periodLabel(e)}
          </span>
        </span>
        {(e.target || e.benefit) && (
          <span className="block truncate text-xs text-stone-500">
            {[e.target, e.benefit].filter(Boolean).join(" · ")}
          </span>
        )}
        <ResultLine r={resultOf(e, rows, today)} />
      </span>
      {todos.length > 0 && (
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums " +
            (done === todos.length
              ? "bg-emerald-50 text-emerald-700"
              : "bg-stone-100 text-stone-600")
          }
        >
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
        {title}{" "}
        <span className="font-normal text-stone-400">{list.length}</span>
      </h3>
      {list.length ? (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {list.map((e) => (
            <Row key={e.id} e={e} rows={rows} today={today} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-center text-xs text-stone-400">
          {empty}
        </p>
      )}
    </section>
  );
}

// 보기 칸(아이보스 '전체보기 · 이슈&기념일 · 행사 · 공휴일 · 절기' 처럼) — 기기마다 기억
const SHOW_KEY = "poclo_mkt_show";
const SHOW_ALL = Object.fromEntries(ISSUE_CATS.map((c) => [c.k, true]));
const readShow = () => {
  try {
    return {
      ...SHOW_ALL,
      ...JSON.parse(localStorage.getItem(SHOW_KEY) || "{}"),
    };
  } catch {
    return SHOW_ALL;
  }
};

export default function EventsPage({ online, rows }) {
  const today = dayKey();
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(null);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [show, setShowState] = useState(readShow);
  const [picked, setPicked] = useState(null); // 오른쪽 '상세 일정'에 보일 것
  const [showSoon, setShowSoon] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const setShow = (v) => {
    setShowState(v);
    try {
      localStorage.setItem(SHOW_KEY, JSON.stringify(v));
    } catch {
      /* 무시 */
    }
  };

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
    const fn = (v) => ({
      ...v,
      items: (v.items || []).map((x) =>
        x.id === id ? { ...x, start, end } : x,
      ),
    });
    setList((l) => fn({ items: l }).items);
    try {
      setList((await changeKey(KEY, online, fn)).items || []);
    } catch (er) {
      setMsg(er.message || "옮기지 못했어요.");
      load();
    }
  };

  const byStart = (a, b) => (a.start || "").localeCompare(b.start || "");
  const always = list.filter((e) => e.always);
  const now = list.filter((e) => isOn(e, today)).sort(byStart);
  const soon = list.filter((e) => !e.always && e.start > today).sort(byStart);
  const past = list
    .filter((e) => !e.always && e.start && endOf(e) < today)
    .sort((a, b) => endOf(b).localeCompare(endOf(a)));
  const [y, m] = ym.split("-").map(Number);
  const goYm = (v) => {
    setYm(v);
    setPicked(null);
  };
  const allOn = ISSUE_CATS.every((c) => show[c.k]);
  // 폰은 오른쪽 칸이 달력 아래라 — 누르면 '상세 일정'으로 내려가 보여 준다
  const pickIssue = (it) => {
    setPicked(it);
    if (window.innerWidth < 1024)
      setTimeout(
        () =>
          document
            .getElementById("mkt-detail")
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60,
      );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">마케팅 캘린더</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            공휴일·기념일·우리 이벤트를 한 달력에서 보고, 오른쪽에서 이 달 올릴
            것·준비할 것을 챙겨요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEdit({ start: today, end: today })}
          className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> 이벤트 넣기
        </button>
      </div>

      {msg && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-4">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <b className="min-w-[7.5rem] text-xl text-stone-900 tabular-nums">
                {y}년 {m}월
              </b>
              <button
                type="button"
                onClick={() => goYm(shiftMonth(ym, -1))}
                aria-label="이전 달"
                className="rounded-lg border border-stone-200 p-1 text-stone-500 hover:bg-stone-100"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => goYm(shiftMonth(ym, 1))}
                aria-label="다음 달"
                className="rounded-lg border border-stone-200 p-1 text-stone-500 hover:bg-stone-100"
              >
                <ChevronRight size={16} />
              </button>
              {ym !== today.slice(0, 7) && (
                <button
                  type="button"
                  onClick={() => goYm(today.slice(0, 7))}
                  className="ml-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
                >
                  오늘
                </button>
              )}
            </div>
            {/* 보기 칸 */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-stone-600">
              <label className="flex cursor-pointer items-center gap-1 font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() =>
                    setShow(
                      allOn
                        ? Object.fromEntries(
                            ISSUE_CATS.map((c) => [c.k, false]),
                          )
                        : SHOW_ALL,
                    )
                  }
                  className="h-3.5 w-3.5 accent-stone-800"
                />
                전체보기
              </label>
              {ISSUE_CATS.map((c) => (
                <label
                  key={c.k}
                  className="flex cursor-pointer items-center gap-1"
                >
                  <input
                    type="checkbox"
                    checked={!!show[c.k]}
                    onChange={() => setShow({ ...show, [c.k]: !show[c.k] })}
                    className="sr-only"
                  />
                  <span
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border"
                    style={{
                      background: show[c.k] ? c.bg : "#fff",
                      borderColor: show[c.k] ? c.dot : "#d6d3d1",
                    }}
                  >
                    {show[c.k] && (
                      <Check
                        size={10}
                        strokeWidth={3}
                        style={{ color: c.dot }}
                      />
                    )}
                  </span>
                  <span className={show[c.k] ? "" : "text-stone-400"}>
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Month
            ym={ym}
            events={list}
            today={today}
            show={show}
            onNew={(k) => setEdit({ start: k, end: k })}
            onOpen={setEdit}
            onMove={moveEvent}
            onIssue={pickIssue}
          />
          <p className="px-1 text-[11px] text-stone-400">
            <CalendarDays size={11} className="mr-0.5 inline align-[-1px]" /> 빈
            칸을 누르면 그날 이벤트를 넣어요 · 막대를 끌어 다른 날에 놓으면
            날짜가 옮겨져요
            <span className="[@media(pointer:fine)]:hidden">
              (폰은 길게 눌러 끌기)
            </span>{" "}
            · '신상 6시'는 신상 업로드 날({dropRuleText(today)})
          </p>
          <MonthList
            ym={ym}
            events={list}
            show={show}
            onOpen={setEdit}
            onIssue={pickIssue}
          />
        </div>

        <aside className="mt-4 lg:sticky lg:top-4 lg:mt-0">
          <MktNote
            ym={ym}
            rows={rows}
            online={online}
            today={today}
            onPick={goYm}
            picked={picked}
            onUnpick={() => setPicked(null)}
            onOpenEvent={(e) => setEdit(e)}
          />
        </aside>
      </div>

      {loaded && !list.length ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center">
          <p className="text-sm text-stone-500">
            재구매 쿠폰처럼 늘 도는 것은 '상시'로, 기획전·배너·카톡 알림은
            날짜로 넣어 두세요.
          </p>
          <button
            type="button"
            onClick={() =>
              setEdit({
                ...TEMPLATES[0],
                todos: TEMPLATES[0].todos.map(newTodo),
              })
            }
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700"
          >
            <Plus size={14} /> 재구매 쿠폰부터 넣기
          </button>
        </div>
      ) : (
        <>
          <Section
            title="상시 진행"
            list={always}
            rows={rows}
            today={today}
            onOpen={setEdit}
          />
          <Section
            title="진행 중"
            list={now}
            rows={rows}
            today={today}
            onOpen={setEdit}
            empty="오늘 진행 중인 이벤트가 없어요."
          />
          {/* 11/25 가독성 — 다가오는·끝난 이벤트는 접어 둔다(달력에 이미 보이니까) */}
          {[
            ["다가오는 이벤트", soon, showSoon, setShowSoon],
            ["끝난 이벤트", past, showPast, setShowPast],
          ].map(
            ([title, l, open, setOpen]) =>
              l.length > 0 && (
                <div key={title}>
                  <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className="flex items-center gap-1 px-1 text-sm text-stone-500"
                  >
                    <ChevronDown
                      size={14}
                      className={open ? "rotate-180" : ""}
                    />{" "}
                    {title} {l.length}
                  </button>
                  {open && (
                    <div className="mt-1.5">
                      <Section
                        title=""
                        list={l}
                        rows={rows}
                        today={today}
                        onOpen={setEdit}
                      />
                    </div>
                  )}
                </div>
              ),
          )}
        </>
      )}

      {edit && (
        <EventSheet
          key={edit.id || "new" + edit.start}
          seed={edit}
          rows={rows}
          today={today}
          onClose={() => setEdit(null)}
          onSave={(e) => save(upsert(e))}
          onRemove={(id) => save(remove(id))}
        />
      )}
    </div>
  );
}
