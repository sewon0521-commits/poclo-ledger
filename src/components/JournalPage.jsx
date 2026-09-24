import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  NotebookPen,
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  X,
  Plus,
  Loader2,
  CornerDownRight,
  List,
  Clock,
  Sparkles,
  Pencil,
} from "lucide-react";
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

// ---------------------------------------------------------------- 읽기 좋게 그리기
//
// 9/24 세원: "볼 때 가독성이 좀 떨어진다" → 글을 그대로 뿌리지 않고 가볍게 모양을 낸다.
//   ■ 제목 / # 제목   → 소제목        - · • · * 로 시작  → 점 목록        1. 로 시작 → 번호 목록
//   14:20 으로 시작   → 시각을 흐리게   빈 줄             → 문단 사이
// 쓰는 쪽에서는 이 기호를 단추로 넣는다(아래 Editor).

const HEAD = /^\s*(?:■|#{1,3})\s*(.+)$/;
const BULLET = /^\s*[-•*·]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
const TIME = /^(\d{1,2}:\d{2})\s+(.*)$/;

function Line({ text }) {
  const m = text.match(TIME);
  if (!m) return text;
  return (
    <>
      <span className="mr-1.5 text-[13px] text-stone-400 tabular-nums">{m[1]}</span>
      {m[2]}
    </>
  );
}

function Rendered({ text }) {
  const blocks = [];
  for (const raw of String(text || "").split("\n")) {
    let m;
    if ((m = raw.match(HEAD))) blocks.push({ t: "h", text: m[1] });
    else if ((m = raw.match(BULLET))) {
      const last = blocks[blocks.length - 1];
      if (last?.t === "ul") last.items.push(m[1]);
      else blocks.push({ t: "ul", items: [m[1]] });
    } else if ((m = raw.match(NUMBER))) {
      const last = blocks[blocks.length - 1];
      if (last?.t === "ol") last.items.push([m[1], m[2]]);
      else blocks.push({ t: "ol", items: [[m[1], m[2]]] });
    } else if (!raw.trim()) blocks.push({ t: "gap" });
    else blocks.push({ t: "p", text: raw });
  }
  return (
    <div className="max-w-2xl text-[15px] leading-7 text-stone-800">
      {blocks.map((b, i) =>
        b.t === "h" ? (
          <h4 key={i} className="mt-5 mb-1 flex items-center gap-2 text-sm font-semibold text-rose-800 first:mt-0">
            <span className="h-3.5 w-1 rounded-full bg-rose-300" />
            {b.text}
          </h4>
        ) : b.t === "ul" ? (
          <ul key={i} className="space-y-0.5">
            {b.items.map((x, j) =>
              x.trim() ? (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
                  <span className="min-w-0">
                    <Line text={x} />
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        ) : b.t === "ol" ? (
          <ol key={i} className="space-y-0.5">
            {b.items.map(([n, x], j) => (
              <li key={j} className="flex gap-2">
                <span className="w-5 shrink-0 text-right text-stone-400 tabular-nums">{n}.</span>
                <span className="min-w-0">
                  <Line text={x} />
                </span>
              </li>
            ))}
          </ol>
        ) : b.t === "gap" ? (
          <div key={i} className="h-2.5" />
        ) : (
          <p key={i}>
            <Line text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 쓰기 (쓰는 대로 저장)
//
// 9/24 세원: "아무것도 없이 빈 종이여서 쓸 때 불편" → 칸을 강제하지는 않고(자유 글쓰기는 그대로)
//   - 빈 날엔 '오늘 틀로 시작' 한 번 누르면 소제목 두 개가 깔린다
//   - 위 단추로 소제목(오늘 한 일 · 도매·거래처 · 상품·촬영 · 콘텐츠 · CS·배송 · 메모·생각) · 목록 · 지금 시각을 넣는다
//   - '- ' 로 시작한 줄에서 엔터를 치면 다음 줄도 '- ' (빈 줄에서 한 번 더 엔터면 목록 끝)

const HEADS = ["오늘 한 일", "도매·거래처", "상품·촬영", "콘텐츠", "CS·배송", "메모·생각"];
const STARTER = "■ 오늘 한 일\n- \n\n■ 메모·생각\n- ";

function Editor({ initial, onSave }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const box = useRef(null);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef(null);
  const saveRef = useRef(onSave);
  const caretTo = useRef(null);
  useEffect(() => {
    saveRef.current = onSave;
  });
  // 글을 코드로 바꾸면 커서가 끝으로 튄다 — 그리기 직후(다음 글자 치기 전에) 제자리로
  useLayoutEffect(() => {
    if (caretTo.current == null || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(caretTo.current, caretTo.current);
    caretTo.current = null;
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

  const put = (next, caret) => {
    setText(next);
    latest.current = next;
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
    if (caret != null) caretTo.current = caret;
  };

  /** 커서 자리에 넣기 — block 이면 새 줄에서 시작하고, 앞 글과 한 줄 띄운다 */
  const insert = (str, block) => {
    const el = box.current;
    const s = el ? el.selectionStart : text.length;
    const e = el ? el.selectionEnd : text.length;
    const before = text.slice(0, s);
    let pre = "";
    if (block && before) pre = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const ins = pre + str;
    put(before + ins + text.slice(e), s + ins.length);
  };

  const onChange = (e) => {
    const v = e.target.value;
    const pos = e.target.selectionStart;
    // 목록 줄에서 엔터 → 다음 줄도 목록. 빈 목록 줄에서 엔터 → 목록 끝
    if (v.length === text.length + 1 && v[pos - 1] === "\n") {
      const lineStart = v.lastIndexOf("\n", pos - 2) + 1;
      const prev = v.slice(lineStart, pos - 1);
      const b = prev.match(/^(\s*)([-•*·])\s+(.*)$/);
      const n = prev.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      if (b && !b[3].trim()) return put(v.slice(0, lineStart) + v.slice(pos), lineStart);
      if (n && !n[4].trim()) return put(v.slice(0, lineStart) + v.slice(pos), lineStart);
      const add = b ? `${b[1]}${b[2]} ` : n ? `${n[1]}${Number(n[2]) + 1}${n[3]} ` : "";
      if (add) return put(v.slice(0, pos) + add + v.slice(pos), pos + add.length);
    }
    put(v);
  };

  const now = () => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} `;
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-stone-100 px-4 py-2 [scrollbar-width:none]">
        {HEADS.map((h) => (
          <button
            key={h}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(`■ ${h}\n- `, true)}
            className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
          >
            {h}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("- ", true)}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          <List size={13} /> 목록
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(now(), false)}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          <Clock size={13} /> 지금 시각
        </button>
        <span className="ml-auto shrink-0 pl-2 text-[11px] text-stone-400">
          {state === "saving" ? (
            <Loader2 size={12} className="inline animate-spin" />
          ) : state === "saved" ? (
            "저장됨"
          ) : state === "error" ? (
            <span className="text-rose-600">저장 못 함</span>
          ) : null}
        </span>
      </div>

      <div className="relative">
        <textarea
          ref={box}
          value={text}
          onChange={onChange}
          onBlur={flush}
          placeholder="위 단추로 소제목을 넣거나, 그냥 떠오르는 대로 써요. 쓰는 대로 저장돼요."
          className="block min-h-[22rem] w-full max-w-3xl resize-none bg-transparent px-6 py-5 text-[15px] leading-7 text-stone-800 outline-none [field-sizing:content] placeholder:text-stone-300"
        />
        {!text && (
          <button
            type="button"
            onClick={() => put(STARTER, STARTER.indexOf("- ") + 2)}
            className="absolute top-16 left-6 flex items-center gap-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/60 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50"
          >
            <Sparkles size={14} /> 오늘 틀로 시작 — 오늘 한 일 · 메모·생각
          </button>
        )}
      </div>
    </div>
  );
}

/** 한 페이지 — 오늘 내 일지는 바로 쓰기, 지난 날은 읽기 좋게 보여 주고 '고치기' */
function Page({ initial, editable, isToday, onSave }) {
  const [editing, setEditing] = useState(editable && (isToday || !initial.trim()));
  if (editing) return <Editor initial={initial} onSave={onSave} />;
  return (
    <div className="relative px-6 py-5">
      {initial.trim() ? (
        <Rendered text={initial} />
      ) : (
        <p className="min-h-[10rem] text-sm text-stone-400">이날은 쓴 글이 없어요.</p>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute top-3 right-3 flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
        >
          <Pencil size={12} /> 고치기
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 모아 보기

/** 쓴 날들을 위에서 아래로 이어서 — 하루씩 넘기지 않고 쭉 읽기 */
function Feed({ data, name, onOpen }) {
  const [limit, setLimit] = useState(10);
  const all = useMemo(() => {
    const set = new Set([...Object.keys(data.days), ...data.todos.filter((t) => t.doneOn).map((t) => t.doneOn)]);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data]);
  // 달마다 보기 (9/24 세원: "모아 보기에 월마다 볼 수 있게") — 쓴 날이 있는 달만 단추로, 처음엔 가장 최근 달
  const months = useMemo(() => {
    const m = new Map();
    for (const d of all) m.set(d.slice(0, 7), (m.get(d.slice(0, 7)) || 0) + 1);
    return [...m.entries()];
  }, [all]);
  const [month, setMonth] = useState(() => all[0]?.slice(0, 7) || "all");
  const days = month === "all" ? all : all.filter((d) => d.startsWith(month));
  const label = (k) => {
    const [y, m] = k.split("-").map(Number);
    return y === new Date().getFullYear() ? `${m}월` : `${y}년 ${m}월`;
  };
  const bar = months.length > 0 && (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {[["all", "전체", all.length], ...months.map(([k, c]) => [k, label(k), c])].map(([k, text, c]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            setMonth(k);
            setLimit(10);
          }}
          className={
            "rounded-full border px-3 py-1 text-sm font-medium " +
            (month === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
          }
        >
          {text} <span className={month === k ? "text-rose-200" : "text-stone-400"}>{c}일</span>
        </button>
      ))}
    </div>
  );
  if (!all.length) return <p className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-stone-400">{name}님이 아직 쓴 날이 없어요.</p>;
  return (
    <div className="space-y-3">
      {bar}
      {days.slice(0, limit).map((d) => {
        const done = data.todos.filter((t) => t.doneOn === d);
        return (
          <article key={d} className="rounded-2xl border border-stone-200 bg-white">
            <header className="flex items-center justify-between border-b border-stone-100 px-6 py-2.5">
              <button type="button" onClick={() => onOpen(d)} className="font-semibold text-stone-900 hover:text-rose-700">
                {dayTitle(d)}
              </button>
              {done.length > 0 && <span className="text-xs text-stone-400">할 일 {done.length}개 끝냄</span>}
            </header>
            <div className="px-6 py-4">
              {data.days[d]?.text?.trim() ? <Rendered text={data.days[d].text} /> : <p className="text-sm text-stone-400">글 없음</p>}
              {done.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-stone-100 pt-3">
                  {done.map((t) => (
                    <li key={t.id} className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">
                      <Check size={11} className="text-rose-700" /> {t.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
      {days.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 10)} className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
          더 보기 · {days.length - limit}일 남음
        </button>
      )}
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
  const [view, setView] = useState("day"); // day 하루씩 | feed 모아 보기

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
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="flex shrink-0 gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          {[
            ["day", "하루씩"],
            ["feed", "모아 보기"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setView(k);
                setQ("");
              }}
              className={"rounded-lg px-3 py-1.5 font-medium " + (view === k && !q ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="두 사람 일지에서 찾기"
            className="w-full rounded-lg border border-stone-200 bg-white py-2 pr-2 pl-8 text-sm outline-none focus:border-rose-600"
          />
        </div>
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
            setView("day");
          }}
        />
      ) : view === "feed" ? (
        <Feed
          key={who}
          data={data}
          name={nameOf(who)}
          onOpen={(d) => {
            setDate(d);
            setView("day");
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
                <Page
                  key={`${who}-${date}-${editable}`}
                  initial={data.days[date]?.text || ""}
                  editable={editable}
                  isToday={date === today}
                  onSave={savePage}
                />
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
