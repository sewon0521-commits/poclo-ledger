import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  NotebookPen,
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  Loader2,
  CornerDownRight,
  List,
  Clock,
  Sparkles,
  Pencil,
  Bold,
  Underline,
  Highlighter,
  Strikethrough,
  Italic,
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
const BULLET = /^( *)[-•◦*·]\s+(.*)$/;
// 글 칸의 점 목록 (9/30 세원: "작성란도 할 일처럼") — 한 단 = 공백 3칸, 단마다 • ◦ • ◦
const INDENT = "   ";
const glyph = (d) => (d % 2 ? "◦" : "•");
const bulletOf = (d) => INDENT.repeat(d) + glyph(d) + " ";
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
const TIME = /^(\d{1,2}:\d{2})\s+(.*)$/;

// ---------------------------------------------------------------- 글자 꾸미기 (10/2)
//
// 세원: "업무일지에 Ctrl+B 누르면 진하게, Ctrl+U 누르면 밑줄 같이 노션에서 쓸 수 있는 걸. 오늘 할 일에 중요한 게 강조가 안 돼."
// 글은 지금처럼 글자로 저장한다(할 일 줄·점 목록 규칙을 안 깨려고) — 표시만 꾸민다:
//   **굵게**  __밑줄__  *기울임*  ~~취소선~~  ==형광펜==  `코드`
// 쓰는 칸은 글자 칸(textarea) 아래에 같은 글을 꾸며서 깔고(Mirror), 위 글자는 투명하게 — 치는 동안에도 꾸민 모양이 보인다.
// 그래서 쓰는 칸의 꾸밈은 **글자 폭을 안 바꾸는 것만** 쓴다(굵게 = 외곽선, 형광펜·코드 = 여백 없는 배경). 기호는 흐리게 보인다.
const MARKS = [
  ["**", "font-bold text-stone-900", "text-stone-900 [-webkit-text-stroke:0.55px_currentColor]"],
  ["__", "underline decoration-rose-500 decoration-2 underline-offset-[3px]", "underline decoration-rose-500 decoration-2 underline-offset-[3px]"],
  ["~~", "text-stone-400 line-through decoration-stone-400", "text-stone-400 line-through decoration-stone-400"],
  ["==", "rounded-sm bg-yellow-200 px-0.5 text-stone-900", "bg-yellow-200 text-stone-900"],
  ["`", "rounded bg-stone-100 px-1 text-[0.92em] text-rose-700", "bg-stone-100 text-rose-700"],
  ["*", "italic", "italic"],
];
const MARK_SRC = String.raw`\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|==(.+?)==|` + "`([^`]+?)`" + String.raw`|\*([^*\s](?:[^*]*?[^*\s])?)\*`;

/** 꾸민 글 — keep 이면 기호도 흐리게 남긴다(쓰는 칸 아래 깔 때 글자 자리가 똑같아야 해서) */
function marks(text, keep = false, key = "m") {
  const s = String(text || "");
  const re = new RegExp(MARK_SRC, "g");
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const i = [1, 2, 3, 4, 5, 6].find((k) => m[k] != null);
    const [mk, read, edit] = MARKS[i - 1];
    const inner = i === 5 ? m[i] : marks(m[i], keep, `${key}-${out.length}`);
    const faint = keep ? <span className="text-stone-300 [-webkit-text-stroke:0]">{mk}</span> : null;
    out.push(
      <span key={`${key}-${out.length}`}>
        {faint}
        <span className={keep ? edit : read}>{inner}</span>
        {faint}
      </span>,
    );
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** 쓰는 칸 아래에 까는 꾸민 글 — 위 textarea 와 글자 자리가 똑같아야 한다(같은 여백·글꼴·줄 높이·줄바꿈) */
function Mirror({ text, className }) {
  const lines = String(text || "").split("\n");
  return (
    <div aria-hidden className={"pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap [overflow-wrap:break-word] " + className}>
      {lines.map((ln, i) => (
        <span key={i}>
          {i > 0 && "\n"}
          {HEAD.test(ln) ? <span className="text-rose-800 [-webkit-text-stroke:0.5px_currentColor]">{marks(ln, true, `h${i}`)}</span> : /^ *[✓☑] /.test(ln) ? <span className="text-stone-400 line-through decoration-stone-300">{marks(ln, true, `d${i}`)}</span> : marks(ln, true, `l${i}`)}
        </span>
      ))}
      {"\u200b"}
    </div>
  );
}

/** 고른 글을 기호로 감싸기(이미 감싸여 있으면 풀기). 되돌리기(Ctrl+Z)가 되게 브라우저의 글 넣기를 쓴다 */
function wrapMark(el, text, put, mark) {
  if (!el) return;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  const n = mark.length;
  const sel = text.slice(s, e);
  let a = s;
  let b = e;
  let str;
  let selA;
  let selB;
  if (text.slice(s - n, s) === mark && text.slice(e, e + n) === mark) {
    a = s - n;
    b = e + n;
    str = sel;
    selA = s - n;
    selB = e - n;
  } else if (sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
    str = sel.slice(n, sel.length - n);
    selA = s;
    selB = e - 2 * n;
  } else {
    str = mark + sel + mark;
    selA = s + n;
    selB = e + n;
  }
  el.focus();
  el.setSelectionRange(a, b);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, str);
  } catch {
    ok = false;
  }
  if (!ok) return put(text.slice(0, a) + str + text.slice(b), selB);
  el.setSelectionRange(selA, selB);
}

// 단축키 — 노션과 같게. e.code 로 본다(한글 자판이어도 같은 키)
const MARK_KEYS = { KeyB: "**", KeyU: "__", KeyI: "*", KeyE: "`" };
const MARK_SHIFT_KEYS = { KeyS: "~~", KeyH: "==", KeyX: "~~" };

/** 폰처럼 단축키가 없을 때 누르는 꾸미기 단추 (누르는 동안 글 칸 포커스를 안 뺏는다) */
function MarkBar({ target, text, put, small }) {
  const items = [
    [Bold, "**", "굵게 (Ctrl+B)"],
    [Underline, "__", "밑줄 (Ctrl+U)"],
    [Highlighter, "==", "형광펜 (Ctrl+Shift+H)"],
    [Strikethrough, "~~", "취소선 (Ctrl+Shift+S)"],
    [Italic, "*", "기울임 (Ctrl+I)"],
  ];
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {items.map(([Icon, mk, title]) => (
        <button
          key={mk}
          type="button"
          title={title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapMark(target.current, text, put, mk)}
          className={"flex items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900 " + (small ? "h-6 w-6" : "h-7 w-7")}
        >
          <Icon size={small ? 13 : 14} className={mk === "==" ? "text-amber-600" : ""} />
        </button>
      ))}
    </span>
  );
}

function Line({ text }) {
  const m = text.match(TIME);
  if (!m) return marks(text);
  return (
    <>
      <span className="mr-1.5 text-[13px] text-stone-400 tabular-nums">{m[1]}</span>
      {marks(m[2])}
    </>
  );
}

function Rendered({ text }) {
  const blocks = [];
  for (const raw of String(text || "").split("\n")) {
    let m;
    if ((m = raw.match(HEAD))) blocks.push({ t: "h", text: m[1] });
    else if (/^\s*(-{3,}|—{2,})\s*$/.test(raw)) blocks.push({ t: "hr" });
    else if ((m = raw.match(/^\s*>\s?(.*)$/))) blocks.push({ t: "q", text: m[1] });
    else if ((m = raw.match(/^( *)([☐☑✓]) (.*)$/))) {
      const item = { text: m[3], depth: Math.min(3, Math.floor(m[1].length / INDENT.length)), box: m[2] };
      const last = blocks[blocks.length - 1];
      if (last?.t === "ul") last.items.push(item);
      else blocks.push({ t: "ul", items: [item] });
    } else if ((m = raw.match(BULLET))) {
      const item = { text: m[2], depth: Math.min(3, Math.floor(m[1].length / INDENT.length)) };
      const last = blocks[blocks.length - 1];
      if (last?.t === "ul") last.items.push(item);
      else blocks.push({ t: "ul", items: [item] });
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
            {marks(b.text)}
          </h4>
        ) : b.t === "hr" ? (
          <hr key={i} className="my-3 border-stone-200" />
        ) : b.t === "q" ? (
          <blockquote key={i} className="my-1 border-l-[3px] border-stone-300 pl-3 text-stone-600">
            <Line text={b.text} />
          </blockquote>
        ) : b.t === "ul" ? (
          <ul key={i} className="space-y-0.5">
            {b.items.map((x, j) =>
              x.text.trim() ? (
                <li key={j} className="flex gap-2.5" style={{ paddingLeft: `${x.depth * 22}px` }}>
                  <span className={"flex shrink-0 " + (x.box ? "mt-[6px]" : "mt-[10px]")}>
                    {x.box === "✓" ? <Check size={13} className="-mt-0.5 text-stone-400" /> : x.box ? <BoxMark done={x.box === "☑"} /> : <Dot depth={x.depth} />}
                  </span>
                  <span className={"min-w-0 " + (x.box === "☑" || x.box === "✓" ? "text-stone-400 line-through decoration-stone-300" : "")}>
                    <Line text={x.text} />
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

// ---------------------------------------------------------------- 점 목록 치기 (글 칸 · 할 일 칸 같이)
//
// 노션처럼 (9/30 세원): 줄 앞 '- ' → • , 엔터 = 다음 줄도 점, 탭 = 들여쓰기(• → ◦ → •),
// 시프트+탭·빈 점 줄 엔터·점 바로 뒤 백스페이스 = 내어쓰기(맨 앞이면 점 없앰),
// Ctrl(⌘)+엔터 = 그 줄 끝냄 표시(✓) 켜고 끄기.
// put(next, caret) 은 글을 바꾸고 커서를 옮기는 함수.

/** 커서가 있는 줄 {start, end, line} */
function lineAt(v, pos) {
  const start = v.lastIndexOf("\n", pos - 1) + 1;
  const nl = v.indexOf("\n", pos);
  const end = nl < 0 ? v.length : nl;
  return { start, end, line: v.slice(start, end) };
}
const depthOf = (spaces) => Math.min(3, Math.floor(spaces.length / INDENT.length));
const LINE_ANY = /^( *)([-•◦*·✓☐☑]) (.*)$/;
const BOX = ["☐", "☑"]; // 체크박스 줄 (10/2 세원: "[] 스페이스바도 체크표시") — Ctrl+엔터·☐ 누르기로 켜고 끔
// 노션처럼 치는 대로 바꾸기 (10/2 세원: "-> 이것도 화살표로")
const AUTO = [
  ["->", "→"],
  ["<-", "←"],
  ["=>", "⇒"],
  [">=", "≥"],
  ["<=", "≤"],
  ["!=", "≠"],
  ["--", "—"],
];

function outlineKeys(text, put) {
  const onChange = (e) => {
    const v = e.target.value;
    const pos = e.target.selectionStart;
    const typed = v.length === text.length + 1 ? v[pos - 1] : "";
    if (typed === " ") {
      const { start, line } = lineAt(v, pos);
      const m = line.slice(0, pos - start).match(/^( *)[-*] $/);
      if (m) {
        const pre = bulletOf(depthOf(m[1]));
        return put(v.slice(0, start) + pre + v.slice(pos), start + pre.length);
      }
      const box = line.slice(0, pos - start).match(/^( *)(?:[-•◦*·☐☑] )?\[ ?\] $/);
      if (box) {
        const pre = INDENT.repeat(depthOf(box[1])) + "☐ ";
        return put(v.slice(0, start) + pre + v.slice(pos), start + pre.length);
      }
    }
    // -> → 처럼 두 글자 기호를 한 글자로 ('--' 는 줄 맨 앞이면 그대로 — '---' 가로줄을 쓸 수 있게)
    if (typed && pos >= 2) {
      const two = v.slice(pos - 2, pos);
      const hit = AUTO.find(([k]) => k === two);
      const lineHead = v.slice(v.lastIndexOf("\n", pos - 1) + 1, pos);
      if (hit && !(two === "--" && /^\s*--$/.test(lineHead))) return put(v.slice(0, pos - 2) + hit[1] + v.slice(pos), pos - 1);
    }
    if (typed === "\n") {
      const lineStart = v.lastIndexOf("\n", pos - 2) + 1;
      const prev = v.slice(lineStart, pos - 1);
      const b = prev.match(LINE_ANY);
      const n = prev.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      if (b && !b[3].trim()) {
        const d = depthOf(b[1]);
        const repl = d > 0 ? (BOX.includes(b[2]) ? INDENT.repeat(d - 1) + "☐ " : bulletOf(d - 1)) : "";
        return put(v.slice(0, lineStart) + repl + v.slice(pos), lineStart + repl.length);
      }
      if (n && !n[4].trim()) return put(v.slice(0, lineStart) + v.slice(pos), lineStart);
      const add = b ? (BOX.includes(b[2]) ? INDENT.repeat(depthOf(b[1])) + "☐ " : bulletOf(depthOf(b[1]))) : n ? `${n[1]}${Number(n[2]) + 1}${n[3]} ` : "";
      if (add) return put(v.slice(0, pos) + add + v.slice(pos), pos + add.length);
    }
    put(v);
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const mk = e.shiftKey ? MARK_SHIFT_KEYS[e.code] : MARK_KEYS[e.code];
      if (mk) {
        e.preventDefault();
        wrapMark(el, text, put, mk);
        return;
      }
    }
    const pos = el.selectionStart;
    const { start, end, line } = lineAt(text, pos);
    const b = line.match(LINE_ANY);
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!b) return;
      const d = depthOf(b[1]);
      const mark = b[2] === "☐" ? "☑" : b[2] === "☑" ? "☐" : b[2] === "✓" ? glyph(d) : "✓";
      put(text.slice(0, start) + b[1] + mark + " " + b[3] + text.slice(end), pos);
    } else if (e.key === "Tab") {
      e.preventDefault(); // 칸 밖으로 나가지 않게
      if (!b) return;
      const d = depthOf(b[1]);
      const nd = e.shiftKey ? d - 1 : d + 1;
      if (nd < 0 || nd > 3) return;
      const oldPre = b[1].length + 2;
      const mark = b[2] === "✓" || BOX.includes(b[2]) ? b[2] : glyph(nd);
      const pre = INDENT.repeat(nd) + mark + " ";
      put(text.slice(0, start) + pre + b[3] + text.slice(end), Math.max(start + pre.length, pos + pre.length - oldPre));
    } else if (e.key === "Backspace" && b && el.selectionEnd === pos && pos === start + b[1].length + 2) {
      e.preventDefault();
      const d = depthOf(b[1]);
      const pre = d > 0 ? bulletOf(d - 1) : "";
      put(text.slice(0, start) + pre + b[3] + text.slice(end), start + pre.length);
    }
  };
  // 노션처럼 체크박스(☐)를 누르면 켜고 끈다 — 누른 자리가 바로 ☐ 앞이나 뒤일 때만(글을 고치려고 누른 건 안 건드림)
  const onMouseUp = (e) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    const { start, end, line } = lineAt(text, pos);
    const b = line.match(LINE_ANY);
    if (!b || !BOX.includes(b[2])) return;
    const at = start + b[1].length;
    if (pos !== at && pos !== at + 1) return;
    const mark = b[2] === "☐" ? "☑" : "☐";
    put(text.slice(0, start) + b[1] + mark + " " + b[3] + text.slice(end), end);
  };
  return { onChange, onKeyDown, onMouseUp };
}

// ---------------------------------------------------------------- 쓰기 (쓰는 대로 저장)
//
// 9/24 세원: "아무것도 없이 빈 종이여서 쓸 때 불편" → 칸을 강제하지는 않고(자유 글쓰기는 그대로)
//   - 빈 날엔 '오늘 틀로 시작' 한 번 누르면 소제목 두 개가 깔린다
//   - 위 단추로 소제목(오늘 한 일 · 도매·거래처 · 상품·촬영 · 콘텐츠 · CS·배송 · 메모·생각) · 목록 · 지금 시각을 넣는다
//   - 노션처럼 (9/30): 줄 앞 '- ' → • , 엔터 = 다음 줄도 점, 탭 = 들여쓰기(• → ◦ → •), 시프트+탭·빈 점 줄 엔터·점 바로 뒤 백스페이스 = 내어쓰기(맨 앞이면 점 없앰)

const HEADS = ["오늘 한 일", "도매·거래처", "상품·촬영", "콘텐츠", "CS·배송", "메모·생각"];
const STARTER = "■ 오늘 한 일\n• \n\n■ 메모·생각\n• ";

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

  // put 은 치는 순간(이벤트)에만 불린다 — 그리는 동안 refs 를 읽지 않는다
  // oxlint-disable-next-line react/refs, react-hooks/refs
  const { onChange, onKeyDown, onMouseUp } = outlineKeys(text, put);

  const now = () => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} `;
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-stone-100 px-4 py-2 [scrollbar-width:none]">
        {/* 꾸미기 단추를 맨 앞에 — 줄이 넘치면 뒤쪽이 가려져서 (단축키: Ctrl+B · U · I · Shift+H · Shift+S) */}
        {/* oxlint-disable-next-line react/refs, react-hooks/refs */}
        <MarkBar target={box} text={text} put={put} />
        <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />
        {HEADS.map((h) => (
          <button
            key={h}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(`■ ${h}\n• `, true)}
            className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
          >
            {h}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert("• ", true)}
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

      <div className="relative max-w-3xl">
        <Mirror text={text} className="px-6 py-5 text-[15px] leading-7 text-stone-800" />
        <textarea
          ref={box}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onMouseUp={onMouseUp}
          onBlur={flush}
          spellCheck={false}
          placeholder="위 단추로 소제목을 넣거나, 그냥 떠오르는 대로 써요. '- ' 로 점 목록, 탭으로 들여쓰기. 글을 고르고 Ctrl+B 굵게 · Ctrl+U 밑줄 · Ctrl+Shift+H 형광펜. 쓰는 대로 저장돼요."
          className="relative block min-h-[22rem] w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-7 whitespace-pre-wrap text-transparent caret-stone-800 outline-none [field-sizing:content] [overflow-wrap:break-word] placeholder:text-stone-300 selection:bg-sky-200/60"
        />
        {!text && (
          <button
            type="button"
            onClick={() => put(STARTER, STARTER.indexOf("• ") + 2)}
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
                      <Check size={11} className="text-rose-700" /> {marks(t.text)}
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

/** 할 일이 보이기 시작하는 날 — '내일 할 일'로 적은 건 startOn, 아니면 적은 날 */
const startOf = (t) => t.startOn || t.createdOn;

// 들여쓰기 단계마다 점 모양 — 노션처럼 ● → ○ → ● → ○
function Dot({ depth, done }) {
  const hollow = depth % 2 === 1;
  return (
    <span
      className={
        "block h-[7px] w-[7px] rounded-full " +
        (hollow ? "border-[1.5px] " + (done ? "border-stone-300" : "border-stone-700") : done ? "bg-stone-300" : "bg-stone-800")
      }
    />
  );
}

/** 할 일 → 글 (끝낸 줄은 ✓) */
const todosToText = (items) =>
  items.map((t) => INDENT.repeat(t.depth || 0) + (t.box ? (t.done ? "☑" : "☐") : t.done ? "✓" : glyph(t.depth || 0)) + " " + t.text).join("\n");

/** 읽기 모양의 체크박스 */
function BoxMark({ done }) {
  return (
    <span className={"flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border " + (done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-400 bg-white")}>
      {done && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

/**
 * 할 일 한 칸 (9/30 세원: "오늘 할 일 한 번에 드래그될 수 있게, 칸으로 나눠 주지 말고. 체크박스 없어졌으니까").
 * 줄마다 칸이던 걸 글 칸 하나로 — 여러 줄을 끌어서 고르고 지우고 옮길 수 있다. 치는 법은 글 칸과 같다(outlineKeys).
 * 끝낸 일은 줄 앞이 ✓ (Ctrl+엔터로 켜고 끔). 한 줄 = 할 일 하나. 멈추면 0.7초 뒤 저장할 때 글을 할 일 목록으로 되돌린다 —
 * 같은 글인 줄은 원래 할 일(적은 날·'…부터')을 이어받는다.
 */
function TodoText({ items, date, today, startOn, editable, placeholder, onCommit }) {
  const [text, setText] = useState(() => todosToText(items));
  const [focused, setFocused] = useState(false);
  const box = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const caretTo = useRef(null);
  const latest = useRef({ text, items, onCommit });
  useEffect(() => {
    latest.current = { text: latest.current.text, items, onCommit };
  });

  const sig = todosToText(items);
  useEffect(() => {
    // 적는 중이 아니면 서버에서 읽은 대로
    if (dirty.current || document.activeElement === box.current) return;
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setText(sig);
    latest.current.text = sig;
  }, [sig]);

  useLayoutEffect(() => {
    if (caretTo.current == null || !box.current) return;
    box.current.setSelectionRange(caretTo.current, caretTo.current);
    caretTo.current = null;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const { text: t, items: before, onCommit: commit } = latest.current;
    const pool = [...before];
    const next = [];
    for (const raw of t.split("\n")) {
      const m = raw.match(LINE_ANY);
      const body = (m ? m[3] : raw).trim();
      if (!body) continue;
      const depth = m ? depthOf(m[1]) : 0;
      const done = m?.[2] === "✓" || m?.[2] === "☑";
      const box = BOX.includes(m?.[2]);
      const k = pool.findIndex((x) => x.text === body);
      const old = k >= 0 ? pool.splice(k, 1)[0] : null;
      next.push({
        ...(old || { id: newId("t"), createdOn: today, ...(startOn !== today ? { startOn } : {}) }),
        text: body,
        depth,
        done,
        box,
        doneOn: done ? old?.doneOn || today : null,
      });
    }
    commit(next);
  }, [today, startOn]);
  useEffect(() => () => flush(), [flush]);

  const put = (next, caret) => {
    setText(next);
    latest.current.text = next;
    dirty.current = true;
    if (caret != null) caretTo.current = caret;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  // put 은 치는 순간(이벤트)에만 불린다 — 그리는 동안 refs 를 읽지 않는다
  // oxlint-disable-next-line react/refs, react-hooks/refs
  const { onChange, onKeyDown, onMouseUp } = outlineKeys(text, put);

  if (!editable) {
    if (!items.length) return <p className="px-1 text-sm text-stone-400">없어요.</p>;
    return (
      <ul className="space-y-0.5">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-2 py-0.5" style={{ paddingLeft: `${(r.depth || 0) * 22}px` }}>
            <span className={"flex w-4 shrink-0 justify-center " + (r.box ? "mt-[5px]" : "mt-[9px]")}>
              {r.box ? <BoxMark done={r.done} /> : r.done ? <Check size={12} className="-mt-0.5 text-stone-400" /> : <Dot depth={r.depth || 0} />}
            </span>
            <span className={"min-w-0 flex-1 text-sm leading-6 " + (r.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-800")}>{marks(r.text)}</span>
            {!r.done && startOf(r) < date && (
              <span className="mt-1 flex shrink-0 items-center gap-0.5 text-[11px] text-amber-700">
                <CornerDownRight size={10} /> {shortDay(startOf(r))}부터
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const carried = items.filter((r) => !r.done && startOf(r) < date);
  return (
    <div className="group/todo relative">
      {/* 꾸미기 단추 — 글 칸을 쓰는 동안만(폰에서 Ctrl 이 없으니) */}
      <span className={"absolute -top-7 right-0 z-10 rounded-lg border border-stone-200 bg-white px-0.5 shadow-sm " + (focused ? "" : "hidden")}>
        {/* oxlint-disable-next-line react/refs, react-hooks/refs */}
        <MarkBar target={box} text={text} put={put} small />
      </span>
      <div className="relative">
        <Mirror text={text} className="px-1 py-0.5 text-sm leading-7 text-stone-800" />
        <textarea
          ref={box}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onMouseUp={onMouseUp}
          spellCheck={false}
          onFocus={() => {
            setFocused(true);
            if (!text) put(bulletOf(0), 2);
          }}
          onBlur={() => {
            setFocused(false);
            if (text.trim() === "•") {
              setText("");
              latest.current.text = "";
            }
            flush();
          }}
          placeholder={placeholder}
          className="relative block min-h-[3rem] w-full resize-none bg-transparent px-1 py-0.5 text-sm leading-7 whitespace-pre-wrap text-transparent caret-stone-800 outline-none [field-sizing:content] [overflow-wrap:break-word] placeholder:text-stone-300 selection:bg-sky-200/60"
        />
      </div>
      {carried.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-amber-700">
          <CornerDownRight size={10} /> 넘어온 일:{" "}
          {carried.map((r, i) => (
            <span key={r.id}>
              {i > 0 && " · "}
              {marks(r.text)} ({shortDay(startOf(r))}부터)
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * 할 일. 날짜에 묶지 않아서 안 끝난 건 끝낼 때까지 오늘 페이지에 계속 보인다('9/22부터').
 * '내일 할 일' 칸: startOn = 내일 → 오늘은 아래 칸에만, 내일이 되면 '오늘 할 일'로 올라온다.
 * 순서·들여쓰기(depth)는 목록 순서 그대로 저장한다.
 */
function Todos({ todos, date, today, editable, onChange }) {
  const tomorrow = shiftDay(today, 1);
  const shown = useMemo(
    () =>
      date === today
        ? todos.filter((t) => (!t.done && startOf(t) <= today) || t.doneOn === today)
        : todos.filter((t) => t.doneOn === date || (startOf(t) === date && !t.done)),
    [todos, date, today],
  );
  const later = useMemo(() => todos.filter((t) => !t.done && startOf(t) > today), [todos, today]);

  // 한 칸에서 고친 줄들을 전체 목록에 되넣는다 — 그 칸에 있던 줄은 빼고 새 순서로 붙인다
  const commit = (before) => (next) =>
    onChange((list) => {
      const ids = new Set([...before.map((t) => t.id), ...next.map((t) => t.id)]);
      return [...list.filter((t) => !ids.has(t.id)), ...next];
    });

  return (
    <div className="border-t border-stone-100 px-5 py-4">
      <div className="mb-1.5 text-xs font-semibold text-stone-500">{date === today ? "오늘 할 일" : "이날 할 일"}</div>
      <TodoText
        key={`d${date}`}
        items={shown}
        date={date}
        today={today}
        startOn={today}
        editable={editable && date === today}
        placeholder="적고 엔터 · 탭으로 들여쓰기 · 끝낸 줄은 Ctrl+엔터(✓)"
        onCommit={commit(shown)}
      />

      {date === today && (editable || later.length > 0) && (
        <div className="mt-4 border-t border-dashed border-stone-100 pt-3">
          <div className="mb-1.5 text-xs font-semibold text-stone-500">내일 할 일</div>
          <TodoText
            key={`t${date}`}
            items={later}
            date={date}
            today={today}
            startOn={tomorrow}
            editable={editable}
            placeholder="내일이 되면 '오늘 할 일'로 올라와요"
            onCommit={commit(later)}
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
