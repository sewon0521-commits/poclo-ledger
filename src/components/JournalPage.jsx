import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen, ChevronLeft, ChevronRight, Search, Check, X, Plus, Loader2, CornerDownRight } from "lucide-react";
import { PEOPLE, dayKey, shiftDay, dayTitle, shortDay, loadJournal, changeJournal } from "../lib/journal";
import { newId } from "../lib/id";

/**
 * 일 › 업무일지 (2026-09-24). 쇼필공 ERP 업무일지는 '직원이 제출 → 대표가 받아 답하는 보고서'
 * (정해진 네 칸 · AI 태그 · 시간 기록). 세원은 "많이 달랐으면, 자유롭게 글쓰는 편이 편해" →
 * 각자의 노트: 하루 한 페이지 빈 종이 + 할 일 체크. 제출 버튼 없이 쓰는 대로 저장.
 * 못 한 할 일은 날짜에 묶지 않아서 끝낼 때까지 오늘 페이지에 남는다('9/22부터').
 * 되돌아보기는 달력(쓴 날에 점)과 검색.
 */

const ME_KEY = "poclo_journal_me";
const nameOf = (who) => PEOPLE.find(([k]) => k === who)?.[1] || "";

function readMe() {
  try {
    const v = localStorage.getItem(ME_KEY);
    return PEOPLE.some(([k]) => k === v) ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 한 페이지 (쓰는 대로 저장)

function Page({ initial, editable, onSave }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const t = latest.current;
    if (t === saved.current) return;
    setState("saving");
    try {
      await saveRef.current(t);
      saved.current = t;
      setState("saved");
    } catch {
      setState("error");
    }
  }, []);

  // 다른 날로 넘기거나 화면을 떠날 때 치던 글을 마저 저장
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  if (!editable) {
    return initial.trim() ? (
      <p className="min-h-[12rem] px-5 py-4 text-[15px] leading-7 whitespace-pre-wrap text-stone-800">{initial}</p>
    ) : (
      <p className="min-h-[12rem] px-5 py-4 text-sm text-stone-400">이날은 쓴 글이 없어요.</p>
    );
  }

  return (
    <div className="relative">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          latest.current = e.target.value;
          setState("idle");
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={flush}
        placeholder={"오늘 있었던 일, 생각, 메모… 아무렇게나 써요.\n쓰는 대로 저장돼요."}
        className="block min-h-[20rem] w-full resize-none bg-transparent px-5 py-4 text-[15px] leading-7 text-stone-800 outline-none [field-sizing:content] placeholder:text-stone-300"
      />
      <span className="pointer-events-none absolute top-2 right-3 text-[11px] text-stone-400">
        {state === "saving" ? (
          <Loader2 size={12} className="inline animate-spin" />
        ) : state === "saved" ? (
          "저장됨"
        ) : state === "error" ? (
          <span className="text-rose-600">저장 못 함 — 인터넷 확인</span>
        ) : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- 할 일

function Todos({ todos, date, today, editable, onChange }) {
  const [draft, setDraft] = useState("");
  const shown = useMemo(() => {
    const list =
      date === today
        ? todos.filter((t) => !t.done || t.doneOn === today)
        : todos.filter((t) => t.doneOn === date || (t.createdOn === date && !t.done));
    return [...list].sort((a, b) => Number(a.done) - Number(b.done) || a.createdOn.localeCompare(b.createdOn));
  }, [todos, date, today]);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onChange((list) => [...list, { id: newId("t"), text, done: false, doneOn: null, createdOn: today }]);
  };

  return (
    <div className="border-t border-stone-100 px-5 py-4">
      <div className="mb-2 text-xs font-semibold text-stone-500">{date === today ? "할 일" : "이날 할 일"}</div>
      {shown.length === 0 && !editable && <p className="text-sm text-stone-400">없어요.</p>}
      <ul className="space-y-0.5">
        {shown.map((t) => (
          <li key={t.id} className="group flex items-start gap-2.5 rounded-lg px-1 py-1 hover:bg-stone-50">
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                onChange((list) =>
                  list.map((x) => (x.id === t.id ? { ...x, done: !x.done, doneOn: x.done ? null : today } : x)),
                )
              }
              aria-label={t.done ? "안 한 걸로" : "했어요"}
              className={
                "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border " +
                (t.done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white text-transparent hover:border-stone-400")
              }
            >
              <Check size={12} strokeWidth={3} />
            </button>
            <span className={"min-w-0 flex-1 text-sm leading-6 " + (t.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-800")}>
              {t.text}
              {!t.done && t.createdOn < date && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 align-[1px] text-[11px] text-amber-700 no-underline">
                  <CornerDownRight size={10} /> {shortDay(t.createdOn)}부터
                </span>
              )}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => onChange((list) => list.filter((x) => x.id !== t.id))}
                aria-label="할 일 지우기"
                className="mt-0.5 p-0.5 text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 focus-visible:opacity-100"
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && date === today && (
        <div className="mt-1 flex items-center gap-2.5 px-1">
          <Plus size={16} className="shrink-0 text-stone-300" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyUp={(e) => e.key === "Enter" && add()}
            onBlur={add}
            placeholder="할 일 추가 (엔터)"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-300"
          />
        </div>
      )}
      {editable && date !== today && (
        <p className="mt-1 px-1 text-[11px] text-stone-400">새 할 일은 오늘 페이지에서 적어요. 못 한 건 끝낼 때까지 오늘로 넘어와요.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 달력

function Calendar({ data, date, today, onPick }) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const doneOn = useMemo(() => new Set(data.todos.filter((t) => t.doneOn).map((t) => t.doneOn)), [data.todos]);
  const go = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} aria-label="지난달" className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-stone-800">
          {y}년 {m}월
        </span>
        <button type="button" onClick={() => go(1)} aria-label="다음 달" className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-stone-400">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((k, i) =>
          k ? (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              className={
                "relative flex h-9 flex-col items-center justify-center rounded-lg text-sm tabular-nums " +
                (k === date
                  ? "bg-rose-700 font-semibold text-white"
                  : k === today
                    ? "font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                    : k > today
                      ? "text-stone-300 hover:bg-stone-50"
                      : "text-stone-700 hover:bg-stone-100")
              }
            >
              {Number(k.slice(8))}
              <span className="absolute bottom-1 flex gap-0.5">
                {data.days[k]?.text && <span className={"h-1 w-1 rounded-full " + (k === date ? "bg-white" : "bg-rose-500")} />}
                {doneOn.has(k) && <span className={"h-1 w-1 rounded-full " + (k === date ? "bg-rose-200" : "bg-stone-400")} />}
              </span>
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
      <div className="mt-2 flex gap-3 px-1 text-[11px] text-stone-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> 글 쓴 날
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-stone-400" /> 할 일 끝낸 날
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 찾기

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const s = Math.max(0, i - 30);
  return { before: (s > 0 ? "…" : "") + text.slice(s, i).replace(/\n/g, " "), hit: text.slice(i, i + q.length), after: text.slice(i + q.length, i + q.length + 60).replace(/\n/g, " ") };
}

function Results({ all, q, onOpen }) {
  const rows = useMemo(() => {
    const out = [];
    for (const [who] of PEOPLE) {
      const v = all[who];
      if (!v) continue;
      for (const [day, page] of Object.entries(v.days)) {
        const s = snippet(page.text || "", q);
        if (s) out.push({ who, day, s, kind: "글" });
      }
      for (const t of v.todos) {
        const s = snippet(t.text, q);
        if (s) out.push({ who, day: t.doneOn || t.createdOn, s, kind: t.done ? "끝낸 할 일" : "할 일" });
      }
    }
    return out.sort((a, b) => b.day.localeCompare(a.day));
  }, [all, q]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-3 text-sm text-stone-500">
        ‘<b className="font-semibold text-stone-800">{q}</b>’ 나온 곳 {rows.length}개
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-stone-400">두 사람 일지 어디에도 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rows.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => onOpen(r.who, r.day)} className="block w-full px-5 py-3 text-left hover:bg-stone-50">
                <span className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="font-semibold text-stone-800">{dayTitle(r.day)}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5">{nameOf(r.who)}</span>
                  <span className="text-stone-400">{r.kind}</span>
                </span>
                <span className="mt-1 block truncate text-sm text-stone-600">
                  {r.s.before}
                  <mark className="rounded bg-amber-100 px-0.5 text-stone-900">{r.s.hit}</mark>
                  {r.s.after}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 화면

export default function JournalPage({ online }) {
  const [me, setMe] = useState(readMe);
  const [who, setWho] = useState(() => readMe() || "sewon");
  const [all, setAll] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [today, setToday] = useState(dayKey);
  const [date, setDate] = useState(dayKey);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const got = await Promise.all(PEOPLE.map(([k]) => loadJournal(k, online)));
      setAll(Object.fromEntries(PEOPLE.map(([k], i) => [k, got[i]])));
      setMsg("");
    } catch {
      setMsg("일지를 불러오지 못했어요. 인터넷을 확인하고 새로 읽어 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);

  // 처음 열 때, 다시 이 탭을 볼 때 새로 읽는다 (상대가 쓴 것 · 자정 넘김)
  useEffect(() => {
    // 서버에서 받아오는 일이라 여기가 맞다
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setToday(dayKey());
      load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const data = all[who] || { days: {}, todos: [] };
  const editable = !!me && who === me;

  const change = useCallback(
    async (fn) => {
      try {
        const next = await changeJournal(who, online, fn);
        setAll((a) => ({ ...a, [who]: next }));
      } catch (e) {
        setMsg("저장하지 못했어요. 인터넷을 확인해 주세요.");
        throw e;
      }
    },
    [who, online],
  );

  const savePage = useCallback(
    (text) =>
      change((v) => {
        if (text.trim()) v.days[date] = { text, at: new Date().toISOString() };
        else delete v.days[date];
        return v;
      }),
    [change, date],
  );

  const pickMe = (k) => {
    try {
      localStorage.setItem(ME_KEY, k);
    } catch {
      /* 이번 화면만 */
    }
    setMe(k);
    setWho(k);
  };

  const pendingOther = PEOPLE.filter(([k]) => k !== who).map(([k]) => {
    const v = all[k];
    return v ? v.todos.filter((t) => !t.done).length : 0;
  })[0];

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <NotebookPen size={20} /> 업무일지
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">각자 하루 한 페이지. 쓰는 대로 저장되고, 못 한 할 일은 다음 날로 넘어와요.</p>
      </div>

      {!me && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm">
          <span className="font-medium text-rose-900">이 기기에서 쓰는 사람은?</span>
          {PEOPLE.map(([k, n]) => (
            <button key={k} type="button" onClick={() => pickMe(k)} className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white hover:bg-rose-800">
              {n}
            </button>
          ))}
          <span className="text-xs text-rose-800/70">고르면 내 일지는 쓰고, 상대 일지는 읽기만 해요.</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
            {PEOPLE.map(([k, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setWho(k);
                  setQ("");
                }}
                className={"rounded-lg px-4 py-1.5 font-medium " + (who === k && !q ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
              >
                {n}
                {k === me && <span className="ml-1 text-[11px] font-normal text-stone-400">나</span>}
              </button>
            ))}
          </div>
          {me && (
            <button
              type="button"
              onClick={() => window.confirm(`이 기기를 쓰는 사람을 바꿀까요? (지금: ${nameOf(me)})`) && pickMe(me === "sewon" ? "jiwon" : "sewon")}
              className="text-[11px] text-stone-400 hover:text-stone-600 hover:underline"
            >
              이 기기: {nameOf(me)} · 바꾸기
            </button>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="두 사람 일지에서 찾기"
            className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-8 text-sm outline-none focus:border-rose-600"
          />
        </div>
      </div>

      {msg && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      {q.trim() ? (
        <Results
          all={all}
          q={q.trim()}
          onOpen={(k, d) => {
            setWho(k);
            setDate(d);
            setQ("");
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="min-w-0 rounded-2xl border border-stone-200 bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2.5">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setDate(shiftDay(date, -1))} aria-label="전날" className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  <ChevronLeft size={17} />
                </button>
                <span className="min-w-[8.5rem] text-center font-semibold text-stone-900">{dayTitle(date)}</span>
                <button
                  type="button"
                  onClick={() => setDate(shiftDay(date, 1))}
                  disabled={date >= today}
                  aria-label="다음 날"
                  className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <span className="flex items-center gap-2 text-xs">
                {!editable && me && <span className="text-stone-400">{nameOf(who)}님 일지 · 읽기만</span>}
                {date !== today && (
                  <button type="button" onClick={() => setDate(today)} className="rounded-md border border-stone-200 px-2 py-1 font-medium text-stone-600 hover:bg-stone-50">
                    오늘로
                  </button>
                )}
              </span>
            </header>
            {loaded ? (
              <>
                <Page key={`${who}-${date}`} initial={data.days[date]?.text || ""} editable={editable} onSave={savePage} />
                <Todos todos={data.todos} date={date} today={today} editable={editable} onChange={(fn) => change((v) => ({ ...v, todos: fn(v.todos) })).catch(() => {})} />
              </>
            ) : (
              <div className="flex h-60 items-center justify-center text-stone-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <Calendar key={`${who}-${date.slice(0, 7)}`} data={data} date={date} today={today} onPick={setDate} />
            {pendingOther > 0 && (
              <p className="px-1 text-xs text-stone-400">
                {nameOf(PEOPLE.find(([k]) => k !== who)[0])}님 남은 할 일 {pendingOther}개
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
