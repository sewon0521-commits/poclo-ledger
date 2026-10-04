import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Undo2,
  ChevronDown,
  ImagePlus,
  X,
} from "lucide-react";
import { putPhoto, photoUrls } from "../lib/shoot";
import { Viewer } from "./ShootBits";
import { clipImages, filesOf } from "../lib/pasteImages";
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
// 그래서 쓰는 칸의 꾸밈은 **글자 폭을 안 바꾸는 것만** 쓴다(굵게 = 외곽선, 형광펜·코드 = 여백 없는 배경).
// 10/3 세원: "볼드·형광펜·밑줄·취소선 전부 오류" — 쓰는 동안 ** == __ ~~ 기호가 흐리게 남고 칠한 자리가 어긋나 보였다.
// → 표시를 **폭이 0인 보이지 않는 글자**(U+2060~2064)로 바꿨다. 칸에서도 화면에서도 기호가 안 보이고 꾸민 모양만 남는다.
// 예전에 ** == __ ~~ 로 적은 글도 그대로 읽고, 쓰는 칸에 열면 새 표시로 바꾼다(toInvisible).
const MK = { b: "\u2061", u: "\u2062", h: "\u2063", s: "\u2064", i: "\u2060" };
const MK_ALL = /[\u2060-\u2064]/g;
const isMk = (c) => c >= "\u2060" && c <= "\u2064";
const STYLE = {
  b: ["font-bold text-stone-900", "text-stone-900 [-webkit-text-stroke:0.6px_currentColor]"],
  u: ["underline decoration-rose-500 decoration-2 underline-offset-[3px]", "underline decoration-rose-500 decoration-2 underline-offset-[3px]"],
  s: ["text-stone-400 line-through decoration-stone-500", "text-stone-400 line-through decoration-stone-500"],
  h: ["rounded-sm bg-yellow-200 px-0.5 text-stone-900", "bg-yellow-200 text-stone-900 [box-decoration-break:clone]"],
  c: ["rounded bg-stone-100 px-1 text-[0.92em] text-rose-700", "bg-stone-100 text-rose-700"],
  i: ["italic", "italic"],
};
// [여는·닫는 표시, 꾸밈, 안쪽 글 정규식]
const PATTERNS = [
  [MK.b, "b"],
  [MK.u, "u"],
  [MK.s, "s"],
  [MK.h, "h"],
  [MK.i, "i"],
  ["**", "b"],
  ["__", "u"],
  ["~~", "s"],
  ["==", "h"],
  ["`", "c", "[^`]+?"],
  ["*", "i", String.raw`[^*\s](?:[^*]*?[^*\s])?`],
];
const escRe = (t) => t.replace(/[*=~_`]/g, "\\$&");
const MARK_SRC = PATTERNS.map(([mk, , inner]) => `${escRe(mk)}(${inner || ".+?"})${escRe(mk)}`).join("|");
const LEGACY = [
  [/\*\*(.+?)\*\*/g, MK.b],
  [/__(.+?)__/g, MK.u],
  [/~~(.+?)~~/g, MK.s],
  [/==(.+?)==/g, MK.h],
];
/** 예전 기호(** __ ~~ ==) → 보이지 않는 표시 */
const toInvisible = (t) => LEGACY.reduce((acc, [re, mk]) => acc.replace(re, `${mk}$1${mk}`), String(t || ""));

/** 꾸민 글 — keep 이면 쓰는 칸 아래에 까는 모양(글자 폭을 안 바꾸는 꾸밈 · 예전 기호는 흐리게) */
function marks(text, keep = false, key = "m") {
  const s = String(text || "");
  const re = new RegExp(MARK_SRC, "g");
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const i = PATTERNS.findIndex((_, k) => m[k + 1] != null);
    const [mk, kind] = PATTERNS[i];
    const [read, edit] = STYLE[kind];
    const inner = kind === "c" ? m[i + 1] : marks(m[i + 1], keep, `${key}-${out.length}`);
    const faint = keep && !isMk(mk) ? <span className="text-stone-300 [-webkit-text-stroke:0]">{mk}</span> : null;
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

// 토글 줄 (10/3 세원: "업무일지 토글 만들기 · /토글") — ▾ 열림 / ▸ 닫힘. 아래로 더 들여 쓴 줄이 그 안에 든다
const TOGGLE = /^( *)([▸▾]) (.*)$/;
// 사진 (10/3) — 한 줄에 [사진:보관 키]
const PHOTO = /^ *\[사진:([^\]\s]+)\]\s*$/;
const HR = /^\s*(-{3,}|—{2,})\s*$/;
/** 토글 ind 안에 드는 줄인가 — 빈 줄이거나 더 들여 쓴 줄 */
const inside = (line, ind) => !line.trim() || line.length - line.trimStart().length > ind;

/**
 * 줄 앞 기호 자리에 그리는 모양 — 글자(투명)는 그대로 두고 그 위에 겹쳐서 폭이 안 바뀌게.
 * data-g/data-ch 로 자리를 재서 그 위에 진짜 단추를 올린다(SpotLayer). bare = 단추가 그리니 비워 둠, dot = 할 일 칸(체크는 왼쪽 칸에)
 */
function Glyph({ ch, i, bare, dot }) {
  const done = ch === "✓" || ch === "☑";
  const inner = bare ? null : dot ? (
    <span className={"h-[5px] w-[5px] rounded-full " + (done ? "bg-stone-300" : "bg-stone-800")} />
  ) : ch === "☐" ? (
      <span className="h-[14px] w-[14px] rounded-[4px] border-[1.5px] border-stone-400 bg-white" />
    ) : ch === "☑" ? (
      <span className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px] bg-rose-700 text-white">
        <Check size={11} strokeWidth={3.5} />
      </span>
    ) : ch === "✓" ? (
      <Check size={14} strokeWidth={3} className="text-rose-600" />
    ) : ch === "▾" ? (
      <ChevronDown size={15} strokeWidth={2.5} className="text-stone-600" />
    ) : (
      <ChevronRight size={15} strokeWidth={2.5} className="text-stone-600" />
    );
  return (
    <span className="relative" data-g={i} data-ch={ch}>
      <span className="text-transparent">{ch}</span>
      <span className="absolute inset-y-0 -left-0.5 -right-0.5 flex items-center justify-center">{inner}</span>
    </span>
  );
}

/** 쓰는 칸 아래 한 줄 (opt: {live, todo}) */
function mirrorLine(ln, i, hidden, opt = {}) {
  if (HEAD.test(ln)) return <span className="text-rose-800 [-webkit-text-stroke:0.5px_currentColor]">{marks(ln, true, `h${i}`)}</span>;
  if (HR.test(ln))
    return (
      <span className="relative inline-block w-full">
        <span className="text-transparent">{ln}</span>
        <span className="absolute inset-x-0 top-1/2 border-t border-stone-300" />
      </span>
    );
  if (PHOTO.test(ln))
    return (
      <span className="relative">
        <span className="text-transparent">{ln}</span>
        <span className="absolute inset-y-[3px] left-0 flex items-center gap-1 rounded-md bg-sky-50 px-1.5 text-[12px] whitespace-nowrap text-sky-800">
          <ImagePlus size={12} /> 사진 · 아래에 보여요
        </span>
      </span>
    );
  const m = ln.match(/^( *)([☐☑✓▸▾]) (.*)$/);
  if (!m) return marks(ln, true, `l${i}`);
  const done = m[2] === "✓" || m[2] === "☑";
  return (
    <>
      {m[1]}
      <Glyph ch={m[2]} i={i} bare={opt.live && m[2] !== "✓"} dot={opt.todo} />{" "}
      <span className={done ? "text-stone-400 line-through decoration-stone-300" : ""}>{marks(m[3], true, `l${i}`)}</span>
      {m[2] === "▸" && hidden > 0 && (
        <span className="inline-block w-0 overflow-visible whitespace-nowrap">
          <span className="ml-2 rounded bg-stone-100 px-1.5 text-[11px] text-stone-500">{hidden}줄 접힘</span>
        </span>
      )}
    </>
  );
}

/**
 * 쓰는 칸 아래에 까는 꾸민 글 — 위 textarea 와 글자 자리가 똑같아야 한다(같은 여백·글꼴·줄 높이·줄바꿈).
 * live = 토글·체크박스는 위에 올린 단추가 그린다 / todo = 할 일 칸(줄마다 시작 자리 표시 → 왼쪽 체크박스)
 */
function Mirror({ text, className, hidden, boxRef, live, todo }) {
  const lines = String(text || "").split("\n");
  return (
    <div ref={boxRef} aria-hidden className={"pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap [overflow-wrap:break-word] " + className}>
      {lines.map((ln, i) => (
        <span key={i}>
          {i > 0 && "\n"}
          {todo && <span data-l={i}>{"\u200b"}</span>}
          {mirrorLine(ln, i, hidden?.[i]?.length || 0, { live, todo })}
        </span>
      ))}
      {"\u200b"}
    </div>
  );
}

/**
 * 기호 자리 재기 (10/3 세원: "토글·오늘 할 일 체크 누르는 곳이 너무 허술해. 노션처럼 올려 두면 음영 지게, 클릭하기 편하게")
 * 예전엔 글 칸에서 커서가 기호 바로 앞·뒤에 떨어졌는지로 판단해서 정확히 눌러야 했고, 줄 맨 앞을 누르면 잘못 켜지기도 했다.
 * 이제 아래 깐 글(Mirror)에서 기호·줄 시작 자리를 재서 그 위에 진짜 단추를 올린다.
 */
function useSpots(root, dep) {
  const [spots, setSpots] = useState([]);
  // 글이 바뀔 때마다 그리기 직전에 (깜빡임 없이)
  useLayoutEffect(() => {
    measureSpots(root.current, setSpots);
  }, [root, dep]);
  // 칸 폭이 바뀌거나 글꼴이 늦게 들어오면 다시
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureSpots(el, setSpots));
    ro.observe(el);
    document.fonts?.ready?.then(() => measureSpots(el, setSpots));
    return () => ro.disconnect();
  }, [root]);
  return spots;
}
function measureSpots(el, set) {
  if (!el) return;
  const out = [];
  for (const n of el.querySelectorAll("[data-g],[data-l]")) {
    const line = n.dataset.l != null;
    out.push({ i: Number(line ? n.dataset.l : n.dataset.g), ch: n.dataset.ch || "", line, x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight });
  }
  set((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
}

/** 체크박스 모양 (단추 안) */
function CheckBox({ done, size = 16 }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={
        "flex shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors " +
        (done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-400 bg-white group-hover/cb:border-stone-600")
      }
    >
      {done && <Check size={size - 5} strokeWidth={3.5} />}
    </span>
  );
}

/** 접힌 토글(▸)의 안쪽 줄을 숨긴 글 — {text, hidden[i]: 숨긴 줄들, map[i]: 원래 줄 번호} */
function foldView(full) {
  const L = String(full || "").split("\n");
  const vis = [];
  const hidden = [];
  const map = [];
  for (let i = 0; i < L.length; i++) {
    vis.push(L[i]);
    map.push(i);
    const m = L[i].match(TOGGLE);
    if (m && m[2] === "▸") {
      const kids = [];
      let j = i + 1;
      while (j < L.length && inside(L[j], m[1].length)) kids.push(L[j++]);
      while (kids.length && !kids[kids.length - 1].trim()) {
        kids.pop();
        j--;
      }
      hidden.push(kids);
      i = j - 1;
    } else hidden.push(null);
  }
  return { text: vis.join("\n"), lines: vis, hidden, map };
}

/** 보이는 글을 고친 뒤 → 숨겨 둔 줄을 같은 토글 아래로 되넣은 전체 글. 같은 제목 먼저, 나머지는 순서대로 */
function unfold(next, view) {
  const blocks = [];
  view.lines.forEach((ln, i) => view.hidden[i]?.length && blocks.push({ head: ln, kids: view.hidden[i], used: false }));
  if (!blocks.length) return next;
  const L = next.split("\n");
  const got = new Array(L.length).fill(null);
  L.forEach((ln, i) => {
    if (!/^ *▸ /.test(ln)) return;
    const b = blocks.find((x) => !x.used && x.head === ln);
    if (b) {
      b.used = true;
      got[i] = b.kids;
    }
  });
  L.forEach((ln, i) => {
    if (!/^ *▸ /.test(ln) || got[i]) return;
    const b = blocks.find((x) => !x.used);
    if (b) {
      b.used = true;
      got[i] = b.kids;
    }
  });
  return L.flatMap((ln, i) => (got[i] ? [ln, ...got[i]] : [ln])).join("\n");
}

// ---------------------------------------------------------------- 사진 (10/3 세원: "업무일지 사진 첨부 가능하게")
const JournalOnline = createContext(false);
const LOCAL_PHOTOS = "poclo_journal_photos";
const PHOTO_URLS = new Map(); // 보관 키 → {url, exp} (서명은 4시간)
function localPhoto(k) {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PHOTOS) || "{}")[k] || null;
  } catch {
    return null;
  }
}
function shrink(file, edge) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("사진을 열지 못했어요."));
    };
    img.src = u;
  });
}
/** 사진 한 장 보관 → 키. 공유 장부면 Storage(reels/shoot/…), 이 기기 저장이면 이 기기에 */
async function addPhoto(file, online) {
  const key = await putPhoto(file, online);
  if (key) return key;
  const data = await shrink(file, 900);
  const k = `local/${newId("p")}`;
  const m = JSON.parse(localStorage.getItem(LOCAL_PHOTOS) || "{}");
  m[k] = data;
  localStorage.setItem(LOCAL_PHOTOS, JSON.stringify(m));
  return k;
}
function usePhotoUrls(keys) {
  const online = useContext(JournalOnline);
  const sig = keys.join("|");
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const ks = sig ? sig.split("|") : [];
      const out = {};
      const need = [];
      for (const k of ks) {
        if (k.startsWith("local/")) out[k] = localPhoto(k);
        else {
          const c = PHOTO_URLS.get(k);
          if (c && c.exp > Date.now()) out[k] = c.url;
          else need.push(k);
        }
      }
      if (need.length) {
        const got = await photoUrls(need, online);
        for (const [k, u] of Object.entries(got)) {
          PHOTO_URLS.set(k, { url: u, exp: Date.now() + 3 * 3600 * 1000 });
          out[k] = u;
        }
      }
      if (alive) setUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [sig, online]);
  return urls;
}
const photoKeys = (text) => String(text || "").split("\n").map((l) => l.match(PHOTO)?.[1]).filter(Boolean);

/** 사진 여러 장 — 누르면 크게, onRemove 가 있으면 × */
function PhotoGrid({ keys, onRemove, small }) {
  const urls = usePhotoUrls(keys);
  const [view, setView] = useState(null);
  if (!keys.length) return null;
  return (
    <>
      <div className={"flex flex-wrap gap-2 " + (small ? "" : "my-1.5")}>
        {keys.map((k, i) => (
          <span key={k + i} className="group relative">
            <button type="button" onClick={() => setView(i)} className={"block overflow-hidden rounded-lg border border-stone-200 bg-stone-100 " + (small ? "h-24 w-20" : "h-44 w-36 sm:h-52 sm:w-40")}>
              {urls[k] ? <img src={urls[k]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-stone-300"><ImagePlus size={16} /></span>}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(k)}
                aria-label="사진 빼기"
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 text-white opacity-80 hover:opacity-100"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {view != null && <Viewer slides={keys.map((k) => ({ url: urls[k] }))} start={view} onClose={() => setView(null)} />}
    </>
  );
}

/** 읽기 모양의 토글 */
function ToggleBlock({ b }) {
  const [open, setOpen] = useState(b.open);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="group/tg -ml-1.5 flex items-start gap-1 text-left">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-stone-500 transition-colors group-hover/tg:bg-stone-200/80 group-hover/tg:text-stone-900">
          <ChevronRight size={17} strokeWidth={2.5} className={"transition-transform duration-150 " + (open ? "rotate-90" : "")} />
        </span>
        <span className="font-medium">
          <Line text={b.text} />
        </span>
      </button>
      {open && (
        <div className="ml-[7px] border-l border-stone-100 pl-4">
          {b.kids.trim() ? <Rendered text={b.kids} /> : <p className="text-sm text-stone-400">비어 있어요</p>}
        </div>
      )}
    </div>
  );
}

/**
 * 고른 글이 없을 때 꾸밀 자리 (10/3 세원: "형광펜 쓰면 ==== 나와" — 빈 자리에 기호만 들어갔다)
 * 커서가 이미 꾸민 조각 안이면 그 조각(→ 풀기), 아니면 그 줄의 글 전체(줄 앞 점·체크·소제목·번호·시각은 빼고). 빈 줄이면 null.
 */
function markRange(text, pos, mark) {
  const { start, line } = lineAt(text, pos);
  const rel = pos - start;
  const esc = mark.replace(/[*=~_`]/g, "\\$&");
  const re = new RegExp(`${esc}(.+?)${esc}`, "g");
  let m;
  while ((m = re.exec(line))) {
    if (rel >= m.index && rel <= m.index + m[0].length) return [start + m.index + mark.length, start + m.index + m[0].length - mark.length];
  }
  const head = line.match(/^(\s*(?:[-•◦*·✓☐☑■]\s+|#{1,3}\s+|\d+[.)]\s+)?(?:\d{1,2}:\d{2}\s+)?)/)[0].length;
  const body = line.slice(head).replace(/\s+$/, "");
  return body ? [start + head, start + head + body.length] : null;
}

/** 고른 글을 기호로 감싸기(이미 감싸여 있으면 풀기). 고른 글이 없으면 커서가 있는 줄(markRange) */
function wrapMark(el, text, put, mark) {
  if (!el) return;
  let s = el.selectionStart;
  let e = el.selectionEnd;
  const caret = s === e ? s : null;
  if (caret != null) {
    const r = markRange(text, caret, mark);
    if (!r) return;
    [s, e] = r;
  }
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
  // 커서만 있었으면 커서는 제자리(글자가 밀린 만큼만)
  const grow = str.length - (b - a);
  const c = caret == null ? null : Math.max(a, Math.min(a + str.length, caret + (caret >= s ? grow / 2 : 0)));
  el.focus();
  el.setSelectionRange(a, b);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, str);
  } catch {
    ok = false;
  }
  if (!ok) return put(text.slice(0, a) + str + text.slice(b), c ?? selB);
  if (c != null) el.setSelectionRange(c, c);
  else el.setSelectionRange(selA, selB);
}

/**
 * 되돌리기 (10/3 세원: "모르고 지울 수도 있으니 Ctrl+Z 로 되살리는 건?")
 * 점 목록·자동 바꾸기처럼 코드로 글을 바꾸면 브라우저의 Ctrl+Z 가 끊겨서 직접 쌓는다.
 * 이어 친 글자·이어 지운 글자는 한 번에, 줄 나누기·들여쓰기·끝냄·여러 글자 지우기는 한 번씩.
 */
function useUndo() {
  const h = useRef({ past: [], future: [], at: 0, kind: "" });
  return useMemo(
    () => ({
      record(prev, caret, next, big) {
        const st = h.current;
        if (prev === next) return;
        const now = Date.now();
        const d = next.length - prev.length;
        let kind = "big";
        if (!big) {
          if (d === 1) kind = "type";
          else if (d === -1) kind = "erase";
          else if (d === 0) {
            // 한글 조합처럼 한 글자만 바뀐 것
            let i = 0;
            while (i < prev.length && prev[i] === next[i]) i++;
            if (prev.slice(i + 1) === next.slice(i + 1)) kind = "type";
          }
        }
        if (kind === "big" || kind !== st.kind || now - st.at > 800 || !st.past.length) {
          st.past.push({ text: prev, caret });
          if (st.past.length > 200) st.past.shift();
        }
        st.kind = kind;
        st.at = now;
        st.future = [];
      },
      step(dir, cur, caret) {
        const st = h.current;
        const from = dir < 0 ? st.past : st.future;
        if (!from.length) return null;
        const snap = from.pop();
        (dir < 0 ? st.future : st.past).push({ text: cur, caret });
        st.kind = "";
        st.at = 0;
        return snap;
      },
    }),
    [],
  );
}

/** Ctrl+Z 되돌리기 · Ctrl+Shift+Z / Ctrl+Y 다시 — 눌렸으면 true */
function undoKeys(e, back) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || (e.code !== "KeyZ" && e.code !== "KeyY")) return false;
  e.preventDefault();
  back(e.code === "KeyZ" && !e.shiftKey ? -1 : 1);
  return true;
}

// 단축키 — 노션과 같게. e.code 로 본다(한글 자판이어도 같은 키)
const MARK_KEYS = { KeyB: MK.b, KeyU: MK.u, KeyI: MK.i, KeyE: "`" };
const MARK_SHIFT_KEYS = { KeyS: MK.s, KeyH: MK.h, KeyX: MK.s };

/** 폰처럼 단축키가 없을 때 누르는 꾸미기 단추 (누르는 동안 글 칸 포커스를 안 뺏는다) */
function MarkBar({ target, text, put, small }) {
  const items = [
    [Bold, MK.b, "굵게 (Ctrl+B)"],
    [Underline, MK.u, "밑줄 (Ctrl+U)"],
    [Highlighter, MK.h, "형광펜 (Ctrl+Shift+H)"],
    [Strikethrough, MK.s, "취소선 (Ctrl+Shift+S)"],
    [Italic, MK.i, "기울임 (Ctrl+I)"],
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
          <Icon size={small ? 13 : 14} className={mk === MK.h ? "text-amber-600" : ""} />
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
  const L = String(text || "").split("\n");
  for (let i = 0; i < L.length; i++) {
    const raw = L[i];
    let m;
    if ((m = raw.match(TOGGLE))) {
      const ind = m[1].length;
      const kids = [];
      let j = i + 1;
      while (j < L.length && inside(L[j], ind)) kids.push(L[j++]);
      while (kids.length && !kids[kids.length - 1].trim()) {
        kids.pop();
        j--;
      }
      const cut = ind + INDENT.length;
      blocks.push({ t: "toggle", open: m[2] === "▾", text: m[3], kids: kids.map((k) => k.slice(Math.min(cut, k.length - k.trimStart().length))).join("\n") });
      i = j - 1;
      continue;
    }
    if ((m = raw.match(PHOTO))) {
      const last = blocks[blocks.length - 1];
      if (last?.t === "photos") last.keys.push(m[1]);
      else blocks.push({ t: "photos", keys: [m[1]] });
      continue;
    }
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
        b.t === "toggle" ? (
          <ToggleBlock key={i} b={b} />
        ) : b.t === "photos" ? (
          <PhotoGrid key={i} keys={b.keys} />
        ) : b.t === "h" ? (
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

function outlineKeys(text, put, opts = {}) {
  // 줄 나누기·들여쓰기·끝냄처럼 구조를 바꾸는 건 되돌리기 한 번씩
  const step = (t, c) => put(t, c, { step: true });
  const onChange = (e) => {
    const v = e.target.value;
    const pos = e.target.selectionStart;
    const typed = v.length === text.length + 1 ? v[pos - 1] : "";
    if (typed === "\n") e.target.dataset.enter = "1"; // 아래 keyup 보강이 두 번 넣지 않게
    // '---' 를 치면 가로줄 + 다음 줄로 (10/3 세원: "—- 세 번 누르면 작대기")
    if (opts.slash && typed === "-" && /^-{3}$/.test(v.slice(v.lastIndexOf("\n", pos - 1) + 1, pos)) && (v[pos] === undefined || v[pos] === "\n"))
      return step(v.slice(0, pos) + "\n" + v.slice(pos), pos + 1);
    if (typed === " ") {
      // '/토글 ' 처럼 명령 이름 + 스페이스
      const { start: ls, line: ll } = lineAt(v, pos);
      const cmd = opts.slash && ll.slice(0, pos - ls).match(/^( *)\/(\S+) $/);
      const hit = cmd && SLASH.find((c) => c.text && (c.name === cmd[2] || c.alias.includes(cmd[2].toLowerCase())));
      if (hit) {
        const ins = (hit.flat ? "" : cmd[1]) + hit.text;
        return step(v.slice(0, ls) + ins + v.slice(pos), ls + ins.length);
      }
      const { start, line } = lineAt(v, pos);
      const m = line.slice(0, pos - start).match(/^( *)[-*] $/);
      if (m) {
        const pre = bulletOf(depthOf(m[1]));
        return step(v.slice(0, start) + pre + v.slice(pos), start + pre.length);
      }
      const box = line.slice(0, pos - start).match(/^( *)(?:[-•◦*·☐☑] )?\[ ?\] $/);
      if (box) {
        const pre = INDENT.repeat(depthOf(box[1])) + "☐ ";
        return step(v.slice(0, start) + pre + v.slice(pos), start + pre.length);
      }
    }
    // -> → 처럼 두 글자 기호를 한 글자로 ('--' 는 줄 맨 앞이면 그대로 — '---' 가로줄을 쓸 수 있게)
    if (typed && pos >= 2) {
      const two = v.slice(pos - 2, pos);
      const hit = AUTO.find(([k]) => k === two);
      const lineHead = v.slice(v.lastIndexOf("\n", pos - 1) + 1, pos);
      if (hit && !(two === "--" && /^\s*-+$/.test(lineHead))) return step(v.slice(0, pos - 2) + hit[1] + v.slice(pos), pos - 1);
    }
    if (typed === "\n") {
      const lineStart = v.lastIndexOf("\n", pos - 2) + 1;
      const prev = v.slice(lineStart, pos - 1);
      const b = prev.match(LINE_ANY);
      const n = prev.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
      if (b && !b[3].trim()) {
        const d = depthOf(b[1]);
        const repl = d > 0 ? (BOX.includes(b[2]) ? INDENT.repeat(d - 1) + "☐ " : bulletOf(d - 1)) : "";
        return step(v.slice(0, lineStart) + repl + v.slice(pos), lineStart + repl.length);
      }
      if (n && !n[4].trim()) return step(v.slice(0, lineStart) + v.slice(pos), lineStart);
      // 토글 줄: 빈 토글이면 표시를 없애고, 열린 토글이면 안쪽(한 칸 더 들여), 닫힌 토글이면 같은 높이
      const tg = prev.match(TOGGLE);
      if (tg && !tg[3].trim()) return step(v.slice(0, lineStart) + tg[1] + v.slice(pos), lineStart + tg[1].length);
      if (tg) {
        const sp = tg[2] === "▾" ? tg[1] + INDENT : tg[1];
        return step(v.slice(0, pos) + sp + v.slice(pos), pos + sp.length);
      }
      // 들여 쓴 그냥 글(토글 안): 같은 만큼 들여서, 빈 줄이면 한 칸 내어
      const pl = !b && !n && prev.match(/^( +)(.*)$/);
      if (pl && !pl[2].trim()) {
        const sp = INDENT.repeat(Math.max(0, depthOf(pl[1]) - 1));
        return step(v.slice(0, lineStart) + sp + v.slice(pos), lineStart + sp.length);
      }
      if (pl) return step(v.slice(0, pos) + pl[1] + v.slice(pos), pos + pl[1].length);
      const add = b ? (BOX.includes(b[2]) ? INDENT.repeat(depthOf(b[1])) + "☐ " : bulletOf(depthOf(b[1]))) : n ? `${n[1]}${Number(n[2]) + 1}${n[3]} ` : "";
      if (add) return step(v.slice(0, pos) + add + v.slice(pos), pos + add.length);
    }
    put(v);
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if (e.key === "Enter") delete el.dataset.enter;
    // 보이지 않는 꾸미기 표시는 한 번에 건너뛴다 (지울 때·화살표)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && el.selectionStart === el.selectionEnd) {
      const p0 = el.selectionStart;
      if (e.key === "Backspace" && isMk(text[p0 - 1] || "")) {
        let j = p0;
        while (j > 0 && isMk(text[j - 1])) j--;
        if (j === 0) return e.preventDefault();
        e.preventDefault();
        let t = text.slice(0, j - 1) + text.slice(j);
        t = t.replace(/([\u2060-\u2064])\1/g, "");
        return put(t, Math.min(j - 1, t.length));
      }
      if (e.key === "Delete" && isMk(text[p0] || "")) {
        let j = p0;
        while (j < text.length && isMk(text[j])) j++;
        if (j >= text.length) return e.preventDefault();
        e.preventDefault();
        const t = (text.slice(0, j) + text.slice(j + 1)).replace(/([\u2060-\u2064])\1/g, "");
        return put(t, p0);
      }
      if (!e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const d = e.key === "ArrowLeft" ? -1 : 1;
        let j = p0 + d;
        while (j > 0 && j < text.length && isMk(text[d < 0 ? j : j - 1])) j += d;
        if (Math.abs(j - p0) > 1) {
          e.preventDefault();
          el.setSelectionRange(j, j);
          return;
        }
      }
    }
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
      step(text.slice(0, start) + b[1] + mark + " " + b[3] + text.slice(end), pos);
    } else if (e.key === "Tab") {
      e.preventDefault(); // 칸 밖으로 나가지 않게
      if (!b) {
        const sp = line.match(/^ */)[0];
        const nd = depthOf(sp) + (e.shiftKey ? -1 : 1);
        if (nd < 0 || nd > 3 || (!line.trim() && !e.shiftKey && !opts.slash)) return;
        const pre = INDENT.repeat(nd);
        return step(text.slice(0, start) + pre + line.slice(sp.length) + text.slice(end), Math.max(start + pre.length, pos + pre.length - sp.length));
      }
      const d = depthOf(b[1]);
      const nd = e.shiftKey ? d - 1 : d + 1;
      if (nd < 0 || nd > 3) return;
      const oldPre = b[1].length + 2;
      const mark = b[2] === "✓" || BOX.includes(b[2]) ? b[2] : glyph(nd);
      const pre = INDENT.repeat(nd) + mark + " ";
      step(text.slice(0, start) + pre + b[3] + text.slice(end), Math.max(start + pre.length, pos + pre.length - oldPre));
    } else if (e.key === "Backspace" && !b && el.selectionEnd === pos && pos > start && pos === start + line.match(/^ */)[0].length) {
      // 들여 쓴 줄 맨 앞에서 지우기 = 한 칸 내어쓰기
      e.preventDefault();
      const nd = depthOf(line.slice(0, pos - start)) - 1;
      const pre = INDENT.repeat(Math.max(0, nd));
      step(text.slice(0, start) + pre + line.trimStart() + text.slice(end), start + pre.length);
    } else if (e.key === "Backspace" && b && el.selectionEnd === pos && pos === start + b[1].length + 2) {
      e.preventDefault();
      const d = depthOf(b[1]);
      const pre = d > 0 ? bulletOf(d - 1) : "";
      step(text.slice(0, start) + pre + b[3] + text.slice(end), start + pre.length);
    }
  };
  // 체크박스·토글 켜고 끄기는 글 위에 올린 단추가 한다(useSpots) — 커서 자리로 판단하면 줄 맨 앞을 눌러도 켜져서 뺐다 (10/3)
  /** 줄 i 의 끝냄 표시 켜고 끄기 (☐↔☑, 점↔✓) */
  const toggleDone = (i, caret) => {
    const L = text.split("\n");
    const b = L[i]?.match(LINE_ANY);
    if (!b) return;
    const mark = b[2] === "☐" ? "☑" : b[2] === "☑" ? "☐" : b[2] === "✓" ? glyph(depthOf(b[1])) : "✓";
    L[i] = b[1] + mark + " " + b[3];
    step(L.join("\n"), caret);
  };
  // 한글 보강 (10/3 세원: "- 스페이스로 나온 점에서 엔터 치면 점 살려서 밑으로") — 한글을 조합하던 중에 엔터를 치면
  // 브라우저가 조합 끝내기와 줄 나누기를 따로 보내서 위 onChange 가 엔터를 못 알아챌 때가 있다. 손을 뗄 때 한 번 더 본다:
  // 방금 만든 빈 줄 바로 위가 글이 든 점·체크 줄이면 그 모양을 이어 준다.
  const onKeyUp = (e) => {
    const el = e.currentTarget;
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (el.dataset.enter) {
      delete el.dataset.enter;
      return;
    }
    const v = el.value;
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd || pos === 0 || v[pos - 1] !== "\n" || (v[pos] && v[pos] !== "\n")) return;
    const prev = v.slice(v.lastIndexOf("\n", pos - 2) + 1, pos - 1);
    const b = prev.match(LINE_ANY);
    if (!b || !b[3].trim() || b[2] === "✓" || b[2] === "☑") return;
    const add = BOX.includes(b[2]) ? INDENT.repeat(depthOf(b[1])) + "☐ " : bulletOf(depthOf(b[1]));
    step(v.slice(0, pos) + add + v.slice(pos), pos + add.length);
  };
  // 복사·잘라내기는 보이지 않는 표시를 빼고 (카톡 등에 붙일 때 깨끗하게)
  const clip = (cut) => (e) => {
    const el = e.currentTarget;
    const a = el.selectionStart;
    const z = el.selectionEnd;
    if (a === z) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", text.slice(a, z).replace(MK_ALL, ""));
    if (cut) step(text.slice(0, a) + text.slice(z), a);
  };
  return { onChange, onKeyDown, onKeyUp, toggleDone, onCopy: clip(false), onCut: clip(true) };
}

// '/' 명령 (10/3 세원: "/토글 누르면 가능하게") — 줄 맨 앞에 / 를 치면 메뉴. 이름 + 스페이스로도 바로 된다
const SLASH = [
  { name: "토글", alias: ["toggle", "접기"], text: "▾ ", hint: "누르면 접고 펴는 줄" },
  { name: "체크박스", alias: ["check", "todo", "할일", "체크"], text: "☐ ", hint: "☐ 할 일" },
  { name: "점 목록", alias: ["bullet", "list", "목록", "점"], text: "• ", hint: "• 목록" },
  { name: "번호 목록", alias: ["number", "번호"], text: "1. ", hint: "1. 2. 3." },
  { name: "소제목", alias: ["head", "제목"], text: "■ ", flat: true, hint: "■ 굵은 제목" },
  { name: "구분선", alias: ["divider", "hr", "선", "가로줄"], text: "---\n", flat: true, hint: "가로줄" },
  { name: "인용", alias: ["quote"], text: "> ", hint: "> 인용" },
  { name: "사진", alias: ["photo", "image", "이미지"], text: null, hint: "사진 붙이기" },
  { name: "지금 시각", alias: ["time", "시간", "시각"], text: null, hint: "14:20" },
];
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const choOf = (t) =>
  [...t]
    .map((c) => {
      const k = c.charCodeAt(0) - 0xac00;
      return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c;
    })
    .join("");
const slashHits = (q) => {
  const lq = q.toLowerCase();
  return SLASH.filter((c) => !q || c.name.includes(q) || choOf(c.name.replace(/\s/g, "")).startsWith(choOf(q)) || c.alias.some((a) => a.startsWith(lq)));
};

// ---------------------------------------------------------------- 쓰기 (쓰는 대로 저장)
//
// 9/24 세원: "아무것도 없이 빈 종이여서 쓸 때 불편" → 칸을 강제하지는 않고(자유 글쓰기는 그대로)
//   - 빈 날엔 '오늘 틀로 시작' 한 번 누르면 소제목 두 개가 깔린다
//   - 위 단추로 소제목(오늘 한 일 · 도매·거래처 · 상품·촬영 · 콘텐츠 · CS·배송 · 메모·생각) · 목록 · 지금 시각을 넣는다
//   - 노션처럼 (9/30): 줄 앞 '- ' → • , 엔터 = 다음 줄도 점, 탭 = 들여쓰기(• → ◦ → •), 시프트+탭·빈 점 줄 엔터·점 바로 뒤 백스페이스 = 내어쓰기(맨 앞이면 점 없앰)

const HEADS = ["오늘 한 일", "도매·거래처", "상품·촬영", "콘텐츠", "CS·배송", "메모·생각"];
const STARTER = "■ 오늘 한 일\n• \n\n■ 메모·생각\n• ";

function Editor({ initial: raw, onSave }) {
  const online = useContext(JournalOnline);
  const [initial] = useState(() => toInvisible(raw));
  // full = 저장하는 전체 글(접힌 토글 안쪽 포함), 칸에는 접힌 줄을 뺀 view.text 가 보인다
  const [full, setFull] = useState(initial);
  const view = useMemo(() => foldView(full), [full]);
  const text = view.text;
  const viewRef = useRef(view);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [menu, setMenu] = useState(null); // '/' 메뉴 {start, q, at}
  const [pick, setPick] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [photoMsg, setPhotoMsg] = useState("");
  const shut = useRef(-1); // Esc 로 닫은 '/' 줄의 시작 자리
  const file = useRef(null);
  const box = useRef(null);
  const latest = useRef(initial);
  const saved = useRef(raw);
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

  const undo = useUndo();
  /** 전체 글 바꾸기 */
  const setAll = (next, caret, opts = {}) => {
    if (opts.history !== false) undo.record(latest.current, box.current?.selectionStart ?? null, next, opts.step);
    setFull(next);
    latest.current = next;
    viewRef.current = foldView(next);
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
    if (caret != null) caretTo.current = caret;
  };
  /** 보이는 글 바꾸기 → 접힌 줄을 되넣어 전체 글로 */
  const put = (next, caret, opts = {}) => setAll(unfold(next, viewRef.current), caret, opts);

  /** 보이는 줄 i 의 토글을 접고 펴기 */
  const flip = (vi) => {
    const fi = viewRef.current.map[vi];
    const L = latest.current.split("\n");
    const m = L[fi]?.match(TOGGLE);
    if (!m) return false;
    L[fi] = m[1] + (m[2] === "▾" ? "▸" : "▾") + " " + m[3];
    setAll(L.join("\n"), box.current?.selectionStart ?? null, { step: true });
    return true;
  };

  // '/' 메뉴 — 커서가 '/글자' 로만 된 줄 끝에 있을 때
  const watch = (el) => {
    if (!el) return;
    const v = el.value;
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd) return setMenu(null);
    const { start, end, line } = lineAt(v, pos);
    const m = pos === end && line.match(/^( *)\/([^\s/]*)$/);
    if (!m || shut.current === start) return setMenu(null);
    const hits = slashHits(m[2]);
    if (!hits.length) return setMenu(null);
    setMenu((old) => {
      if (!old || old.start !== start) setPick(0);
      return { start, q: m[2], sp: m[1], hits };
    });
  };
  const now = () => {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} `;
  };
  /** 메뉴에서 고르기 — '/…' 줄을 그 모양으로. 한글 조합 중 엔터로 줄이 하나 더 생겼으면 그 줄도 거둔다 */
  const run = (cmd, start) => {
    const v = viewRef.current.text;
    const { end, line } = lineAt(v, start);
    const m = line.match(/^( *)\/[^\s/]*$/);
    if (!m) return;
    setMenu(null);
    let tail = v.slice(end);
    if (/^\n[ ]*(?=\n|$)/.test(tail) && box.current?.selectionStart > end) tail = tail.replace(/^\n[ ]*/, "");
    if (cmd.name === "사진") {
      const t = v.slice(0, start) + m[1] + tail;
      put(t, start + m[1].length, { step: true });
      file.current?.click();
      return;
    }
    const ins = cmd.name === "지금 시각" ? m[1] + now() : (cmd.flat ? "" : m[1]) + cmd.text;
    put(v.slice(0, start) + ins + tail, start + ins.length, { step: true });
  };

  /** 사진 붙이기 — 올린 뒤 커서 자리(새 줄)에 [사진:키] 줄로 */
  const attach = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const at = box.current ? box.current.selectionEnd : text.length;
    setUploading(list.length);
    setPhotoMsg("");
    const keys = [];
    try {
      for (const f of list) keys.push(await addPhoto(f, online));
    } catch (e) {
      setPhotoMsg(e.message || "사진을 올리지 못했어요.");
    }
    setUploading(0);
    if (!keys.length) return;
    const v = viewRef.current.text;
    const p = Math.min(at, v.length);
    const before = v.slice(0, p);
    const after = v.slice(p);
    const pre = before && !before.endsWith("\n") ? "\n" : "";
    const ins = pre + keys.map((k) => `[사진:${k}]`).join("\n") + "\n";
    put(before + ins + after.replace(/^\n/, ""), p + ins.length, { step: true });
  };
  const dropPhoto = (k) => setAll(latest.current.split("\n").filter((l) => l.match(PHOTO)?.[1] !== k).join("\n"), null, { step: true });

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
  const keys = outlineKeys(text, put, { slash: true });
  const back = (dir) => {
    const snap = undo.step(dir, latest.current, box.current?.selectionStart ?? 0);
    if (snap) setAll(snap.text, snap.caret ?? snap.text.length, { history: false });
  };
  const onChange = (e) => {
    keys.onChange(e);
    const el = e.target;
    setTimeout(() => watch(el), 0);
  };
  const lineNo = (pos) => text.slice(0, pos).split("\n").length - 1;
  const onKeyDown = (e) => {
    if (menu) {
      const n = menu.hits.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPick((k) => (k + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = menu.hits[Math.min(pick, n - 1)];
        const st = menu.start;
        // 한글 조합 중이면 조합이 끝난 뒤에
        if (e.nativeEvent.isComposing || e.keyCode === 229) setTimeout(() => run(cmd, st), 0);
        else run(cmd, st);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        shut.current = menu.start;
        setMenu(null);
        return;
      }
    }
    if (undoKeys(e, back)) return;
    const el = e.currentTarget;
    // Ctrl+엔터 — 토글 줄이면 접고 펴기
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && TOGGLE.test(lineAt(text, el.selectionStart).line)) {
      e.preventDefault();
      flip(lineNo(el.selectionStart));
      return;
    }
    keys.onKeyDown(e);
  };
  const onMouseUp = (e) => watch(e.currentTarget);
  const photos = photoKeys(full);
  // 토글 화살표·체크박스 자리 → 그 위에 단추
  const mirror = useRef(null);
  const spots = useSpots(mirror, `${text}|${view.hidden.map((h) => h?.length || 0).join(",")}`);

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
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => file.current?.click()}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-stone-500 hover:bg-stone-100"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} {uploading ? `사진 ${uploading}장 올리는 중` : "사진"}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            attach(e.target.files);
            e.target.value = "";
          }}
        />

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

      <div
        className="relative max-w-3xl"
        onDragOver={(e) => [...e.dataTransfer.types].includes("Files") && e.preventDefault()}
        onDrop={(e) => {
          const clip = clipImages(e.dataTransfer);
          if (!clip.files.length && !clip.urls.length) return;
          e.preventDefault();
          filesOf(clip).then(attach);
        }}
      >
        <Mirror text={text} hidden={view.hidden} boxRef={mirror} live className="px-6 py-5 text-[15px] leading-7 text-stone-800" />
        <textarea
          ref={box}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onKeyUp={keys.onKeyUp}
          onMouseUp={onMouseUp}
          onCopy={keys.onCopy}
          onCut={keys.onCut}
          onPaste={(e) => {
            // 사진만 왔을 때 사진으로 (글과 같이 복사한 건 글로 둔다) — 사진 주소로 와도 받아 온다
            const clip = clipImages(e.clipboardData);
            const plain = e.clipboardData.getData("text/plain").trim();
            if (!clip.files.length && !(clip.urls.length && (!plain || clip.urls.includes(plain)))) return;
            e.preventDefault();
            filesOf(clip).then(attach);
          }}
          onBlur={() => {
            setMenu(null);
            flush();
          }}
          spellCheck={false}
          placeholder="위 단추로 소제목을 넣거나, 그냥 떠오르는 대로 써요. '/' 를 치면 토글·체크박스·구분선·사진 메뉴, '- ' 점 목록, '---' 가로줄. 글을 고르고 Ctrl+B 굵게 · Ctrl+U 밑줄 · Ctrl+Shift+H 형광펜. 사진은 붙여넣기·끌어다 놓기도 돼요."
          className="relative block min-h-[22rem] w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-7 whitespace-pre-wrap text-transparent caret-stone-800 outline-none [field-sizing:content] [overflow-wrap:break-word] placeholder:text-stone-300 selection:bg-sky-200/60"
        />
        {/* 토글 화살표·체크박스 단추 — 노션처럼 마우스를 올리면 회색 칸, 넓게 눌린다 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {spots
            .filter((p) => !p.line && p.ch !== "✓")
            .map((p) => {
              const tg = p.ch === "▾" || p.ch === "▸";
              const size = 24;
              // 화살표가 좁아도 단추가 뒤 글자를 덮지 않게 — 오른쪽 끝을 기호 바로 뒤에 맞춘다
              const left = Math.min(p.x + p.w / 2 - size / 2, p.x + p.w + 3 - size);
              return (
                <button
                  key={`${p.i}-${p.ch}`}
                  type="button"
                  tabIndex={-1}
                  title={tg ? (p.ch === "▾" ? "접기 (Ctrl+엔터)" : "펴기 (Ctrl+엔터)") : p.ch === "☐" ? "끝냄 (Ctrl+엔터)" : "안 끝냄"}
                  aria-label={tg ? (p.ch === "▾" ? "접기" : "펴기") : "체크"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (tg ? flip(p.i) : keys.toggleDone(p.i, box.current?.selectionStart ?? null))}
                  className="group/cb pointer-events-auto absolute flex items-center justify-center rounded-[6px] text-stone-500 transition-colors hover:bg-stone-200/80 hover:text-stone-900 active:bg-stone-300/70"
                  style={{ left, top: p.y + p.h / 2 - size / 2, width: size, height: size }}
                >
                  {tg ? (
                    <ChevronRight size={17} strokeWidth={2.5} className={"transition-transform duration-150 " + (p.ch === "▾" ? "rotate-90" : "")} />
                  ) : (
                    <CheckBox done={p.ch === "☑"} size={15} />
                  )}
                </button>
              );
            })}
        </div>
        {menu && (
          // 커서 자리 재기 — 글 칸과 똑같이 깔고, '/' 줄 시작 자리에 메뉴를 붙인다
          <div aria-hidden className="pointer-events-none invisible absolute inset-0 z-20 px-6 py-5 text-[15px] leading-7 whitespace-pre-wrap [overflow-wrap:break-word]">
            {text.slice(0, menu.start)}
            <span className="relative">
              <span className="pointer-events-auto visible absolute top-7 left-0 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-lg">
                {menu.hits.map((c, k) => (
                  <button
                    key={c.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(c, menu.start)}
                    onMouseEnter={() => setPick(k)}
                    className={"flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left " + (k === pick ? "bg-rose-50 text-rose-900" : "text-stone-700")}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[11px] text-stone-400">{c.hint}</span>
                  </button>
                ))}
                <span className="block border-t border-stone-100 px-3 pt-1 text-[10px] text-stone-400">↑↓ 고르기 · 엔터 · Esc 닫기</span>
              </span>
            </span>
          </div>
        )}
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
      {(photos.length > 0 || photoMsg) && (
        <div className="border-t border-dashed border-stone-100 px-6 py-3">
          <div className="mb-1.5 text-xs font-semibold text-stone-500">붙인 사진 {photos.length > 0 && photos.length}</div>
          {photoMsg && <p className="mb-1 text-xs text-rose-700">{photoMsg}</p>}
          <PhotoGrid keys={photos} small onRemove={dropPhoto} />
        </div>
      )}
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

/** 글을 고친 줄인지 — 앞뒤로 이어 쓴 것이거나 글자가 절반 넘게 같으면 같은 할 일(적은 날 이어받기) */
function similar(a, b) {
  const x = String(a).replace(/\s/g, "");
  const y = String(b).replace(/\s/g, "");
  if (!x || !y) return false;
  if (x.startsWith(y) || y.startsWith(x)) return true;
  const m = new Map();
  for (const c of x) m.set(c, (m.get(c) || 0) + 1);
  let same = 0;
  for (const c of y) {
    if (m.get(c)) {
      same++;
      m.set(c, m.get(c) - 1);
    }
  }
  return same / Math.max(x.length, y.length) >= 0.5;
}

/** 끝낸 줄(✓ ☑)을 글에서 뺀다 → [글, 커서] (커서가 뺀 줄에 있었으면 다음 줄 앞으로) */
function dropDone(t, caret) {
  const out = [];
  let pos = 0;
  let len = -1; // out 을 \n 으로 이은 길이
  let c = null;
  for (const ln of t.split("\n")) {
    const end = pos + ln.length;
    const m = ln.match(LINE_ANY);
    const done = m && (m[2] === "✓" || m[2] === "☑") && m[3].trim();
    if (!done) {
      if (caret != null && c == null && caret <= end) c = len + 1 + Math.max(0, caret - pos);
      out.push(ln);
      len += ln.length + 1;
    } else if (caret != null && c == null && caret <= end) c = len + 1;
    pos = end + 1;
  }
  const text = out.join("\n");
  return [text, c == null ? text.length : Math.min(Math.max(0, c), text.length)];
}

/** 할 일 → 글 (끝낸 줄은 ✓) */
const todosToText = (items) =>
  items.map((t) => INDENT.repeat(t.depth || 0) + (t.box ? (t.done ? "☑" : "☐") : t.done ? "✓" : glyph(t.depth || 0)) + " " + toInvisible(t.text)).join("\n");

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
function TodoText({ items, date, today, startOn, editable, placeholder, onCommit, hideDone }) {
  const [text, setText] = useState(() => todosToText(items));
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState(""); // '끝낸 일로 옮겼어요' 같은 잠깐 안내
  const box = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const noteTimer = useRef(null);
  const caretTo = useRef(null);
  // 끝내서 칸에서 뺀 할 일 · 지운 할 일 (id → 할 일) — Ctrl+Z 로 되살리면 같은 할 일(적은 날·'…부터' 그대로)로 돌아오게
  const hidden = useRef(new Map());
  const gone = useRef(new Map());
  const undo = useUndo();
  const latest = useRef({ text, items, onCommit });
  useEffect(() => {
    latest.current = { text: latest.current.text, items, onCommit };
  });

  const sig = todosToText(items);
  useEffect(() => {
    // 서버에 안 끝난 할 일로 있으면(다른 데서 되돌림) 더는 '뺀 것'이 아니다
    for (const x of latest.current.items) {
      hidden.current.delete(x.id);
      gone.current.delete(x.id);
    }
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

  const say = (msg) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 7000);
  };

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const { text: t, items: before, onCommit: commit } = latest.current;
    // 이 칸에 있던 할 일 (방금 끝내서 뺀 건 빼고 — 서버 답이 오기 전 예전 목록일 수 있어서)
    const live = before.filter((x) => !hidden.current.has(x.id));
    const pool = [...new Map([...live, ...hidden.current.values(), ...gone.current.values()].map((x) => [x.id, x])).values()];
    const lines = [];
    for (const raw of t.split("\n")) {
      const m = raw.match(LINE_ANY);
      const body = (m ? m[3] : raw).trim();
      if (!body) continue;
      lines.push({ body, depth: m ? depthOf(m[1]) : 0, done: m?.[2] === "✓" || m?.[2] === "☑", box: BOX.includes(m?.[2]) });
    }
    // 1) 같은 글 2) 글을 고친 줄 — 남은 할 일 중 비슷한 것
    const used = new Set();
    const match = lines.map((ln) => {
      const k = pool.find((x) => !used.has(x.id) && x.text === ln.body);
      if (k) used.add(k.id);
      return k || null;
    });
    lines.forEach((ln, i) => {
      if (match[i]) return;
      const k = pool.find((x) => !used.has(x.id) && similar(x.text, ln.body));
      if (k) {
        match[i] = k;
        used.add(k.id);
      }
    });
    const next = lines.map((ln, i) => {
      const old = match[i];
      if (old) {
        hidden.current.delete(old.id);
        gone.current.delete(old.id);
      }
      return {
        ...(old || { id: newId("t"), createdOn: today, ...(startOn !== today ? { startOn } : {}) }),
        text: ln.body,
        depth: ln.depth,
        done: ln.done,
        box: ln.box,
        doneOn: ln.done ? old?.doneOn || today : null,
      };
    });
    const removed = live.filter((x) => !used.has(x.id));
    for (const x of removed) gone.current.set(x.id, x);
    commit(next, removed.map((x) => x.id));

    // 끝낸 줄은 칸에서 빼서 '끝낸 일'로 (10/3 세원: "다 한 일은 체크하면 사라지고 어디 따로 모아지게")
    const doneNow = hideDone ? next.filter((x) => x.done) : [];
    if (doneNow.length) {
      for (const x of doneNow) hidden.current.set(x.id, x);
      const el = box.current;
      const here = !!el && document.activeElement === el;
      let [nt, caret] = dropDone(t, here ? el.selectionStart : null);
      if (!nt.trim() && here) {
        nt = bulletOf(0);
        caret = nt.length;
      }
      setText(nt);
      latest.current.text = nt;
      if (here) caretTo.current = caret;
      say(`끝낸 일로 옮겼어요${doneNow.length > 1 ? ` (${doneNow.length}개)` : ""}`);
    } else if (removed.length) {
      say(`할 일 ${removed.length}개를 지웠어요`);
    }
  }, [today, startOn, hideDone]);
  useEffect(() => () => flush(), [flush]);

  const put = (next, caret, opts = {}) => {
    if (opts.history !== false) undo.record(latest.current.text, box.current?.selectionStart ?? null, next, opts.step);
    setText(next);
    latest.current.text = next;
    dirty.current = true;
    if (caret != null) caretTo.current = caret;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  // put 은 치는 순간(이벤트)에만 불린다 — 그리는 동안 refs 를 읽지 않는다
  // oxlint-disable-next-line react/refs, react-hooks/refs
  const keys = outlineKeys(text, put);
  const { onChange } = keys;
  // 줄마다 왼쪽 체크박스 (10/3 세원: "오늘 할 일 왼쪽 옆에 체크박스")
  const mirror = useRef(null);
  const spots = useSpots(mirror, text);
  const rows = text.split("\n");
  // 되돌리기 — 끝내서 뺀 줄·지운 줄이 돌아오면 저장할 때 원래 할 일로 다시 이어진다
  const back = (dir) => {
    const snap = undo.step(dir, latest.current.text, box.current?.selectionStart ?? 0);
    if (!snap) return;
    put(snap.text, snap.caret ?? snap.text.length, { history: false });
    setNote("");
  };
  const onKeyDown = (e) => {
    if (!undoKeys(e, back)) keys.onKeyDown(e);
  };

  if (!editable) {
    if (!items.length) return <p className="px-1 text-sm text-stone-400">없어요.</p>;
    return (
      <ul className="space-y-0.5">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-2 py-0.5" style={{ paddingLeft: `${(r.depth || 0) * 22}px` }}>
            <span className="mt-[4px] flex w-4 shrink-0 justify-center">
              <CheckBox done={r.done} size={15} />
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
        <Mirror text={text} boxRef={mirror} todo className="py-0.5 pr-1 pl-8 text-sm leading-7 text-stone-800" />
        <textarea
          ref={box}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onKeyUp={keys.onKeyUp}
          onCopy={keys.onCopy}
          onCut={keys.onCut}
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
          className="relative block min-h-[3rem] w-full resize-none bg-transparent py-0.5 pr-1 pl-8 text-sm leading-7 whitespace-pre-wrap text-transparent caret-stone-800 outline-none [field-sizing:content] [overflow-wrap:break-word] placeholder:text-stone-300 selection:bg-sky-200/60"
        />
        {/* 줄마다 왼쪽 체크박스 — 누르면 끝냄(✓) → 잠깐 뒤 '끝낸 일'로 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {spots
            .filter((p) => p.line)
            .map((p) => {
              const b = rows[p.i]?.match(LINE_ANY);
              if (!b || !b[3].trim()) return null;
              const done = b[2] === "✓" || b[2] === "☑";
              return (
                <button
                  key={p.i}
                  type="button"
                  tabIndex={-1}
                  title={done ? "안 끝냄" : "끝냄 — 잠깐 뒤 '끝낸 일'로 (Ctrl+엔터)"}
                  aria-label={done ? "안 끝냄" : "끝냄"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => keys.toggleDone(p.i, box.current?.selectionStart ?? null)}
                  className="group/cb pointer-events-auto absolute left-0.5 flex h-6 w-6 items-center justify-center rounded-[6px] transition-colors hover:bg-stone-200/80 active:bg-stone-300/70"
                  style={{ top: p.y + p.h / 2 - 12 }}
                >
                  <CheckBox done={done} size={16} />
                </button>
              );
            })}
        </div>
      </div>
      {note && (
        <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-stone-500">
          {note}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => back(-1)}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
          >
            <Undo2 size={11} /> 되돌리기 <span className="font-normal text-stone-400">Ctrl+Z</span>
          </button>
        </p>
      )}
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
function Todos({ todos, date, today, editable, onChange, onShowDone }) {
  const tomorrow = shiftDay(today, 1);
  // 오늘 칸엔 안 끝낸 것만 — 끝내면 빠져서 '오늘 끝낸 일'로 (10/3). 지난 날은 그날 끝낸 것도 같이 보여 준다
  const shown = useMemo(
    () =>
      date === today
        ? todos.filter((t) => !t.done && startOf(t) <= today)
        : todos.filter((t) => t.doneOn === date || (startOf(t) === date && !t.done)),
    [todos, date, today],
  );
  const later = useMemo(() => todos.filter((t) => !t.done && startOf(t) > today), [todos, today]);
  const doneToday = useMemo(() => todos.filter((t) => t.done && t.doneOn === today), [todos, today]);

  // 한 칸에서 고친 줄들을 전체 목록에 되넣는다 — 지운 줄은 빼고, 칸의 줄은 새 순서로 뒤에 붙인다
  const commit = (next, removed = []) =>
    onChange((list) => {
      const ids = new Set([...removed, ...next.map((t) => t.id)]);
      return [...list.filter((t) => !ids.has(t.id)), ...next];
    });
  const undone = (id) => onChange((list) => list.map((t) => (t.id === id ? { ...t, done: false, doneOn: null } : t)));

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
        hideDone={date === today}
        placeholder="적고 엔터 · 탭으로 들여쓰기 · 다 한 일은 왼쪽 네모를 누르거나 Ctrl+엔터 → '끝낸 일'로"
        onCommit={commit}
      />
      {date === today && <DoneToday items={doneToday} editable={editable} onUndo={undone} onAll={onShowDone} />}

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
            hideDone
            placeholder="내일이 되면 '오늘 할 일'로 올라와요"
            onCommit={commit}
          />
        </div>
      )}

      {editable && date !== today && (
        <p className="mt-1 px-1 text-[11px] text-stone-400">새 할 일은 오늘 페이지에서 적어요. 못 한 건 끝낼 때까지 오늘로 넘어와요.</p>
      )}
    </div>
  );
}

/** 끝낸 할 일 한 줄 — 되돌리면 다시 할 일로 */
function DoneRow({ t, editable, onUndo, plain }) {
  const wrote = startOf(t);
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-stone-50">
      <Check size={13} className="mt-[5px] shrink-0 text-rose-700" />
      <span className={"min-w-0 flex-1 text-sm leading-6 " + (plain ? "text-stone-800" : "text-stone-500 line-through decoration-stone-300")}>{marks(t.text)}</span>
      {wrote && wrote !== t.doneOn && <span className="mt-1 shrink-0 text-[11px] text-stone-400">{shortDay(wrote)}부터</span>}
      {editable && (
        <button
          type="button"
          onClick={() => onUndo(t.id)}
          title="안 끝낸 걸로 — 할 일로 돌아가요"
          className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <Undo2 size={11} /> 되돌리기
        </button>
      )}
    </li>
  );
}

/** 오늘 할 일 아래 — 오늘 끝낸 일 (펼쳐 보기) + 끝낸 일 전부 보기 */
function DoneToday({ items, editable, onUndo, onAll }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-dashed border-stone-100 pt-2">
      <div className="flex items-center justify-between gap-2 px-1">
        {items.length > 0 ? (
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
            <Check size={12} className="text-rose-700" /> 오늘 끝낸 일 {items.length}개
            <ChevronDown size={12} className={open ? "rotate-180" : ""} />
          </button>
        ) : (
          <span className="text-xs text-stone-300">오늘 끝낸 일 없음</span>
        )}
        {onAll && (
          <button type="button" onClick={onAll} className="text-[11px] text-stone-400 hover:text-stone-700 hover:underline">
            끝낸 일 전부 보기
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {items.map((t) => (
            <DoneRow key={t.id} t={t} editable={editable} onUndo={onUndo} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 끝낸 일 모아 보기 — 끝낸 날마다 (10/3 세원: "어디 따로 모아진 다음 나중에 볼 수 있게") */
function DoneList({ data, name, editable, onUndo, onOpen }) {
  const [limit, setLimit] = useState(14);
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of data.todos) {
      if (!t.done || !t.doneOn) continue;
      if (!m.has(t.doneOn)) m.set(t.doneOn, []);
      m.get(t.doneOn).push(t);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data.todos]);
  const total = groups.reduce((n, [, xs]) => n + xs.length, 0);
  if (!total)
    return (
      <p className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-stone-400">
        {name}님이 끝낸 할 일이 아직 없어요. 할 일 왼쪽 네모를 누르거나 Ctrl+엔터를 누르면 여기로 모여요.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-stone-500">
        {name}님이 끝낸 일 <b className="font-semibold text-stone-800">{total}개</b> · {groups.length}일
      </p>
      {groups.slice(0, limit).map(([d, xs]) => (
        <article key={d} className="rounded-2xl border border-stone-200 bg-white">
          <header className="flex items-center justify-between border-b border-stone-100 px-5 py-2.5">
            <button type="button" onClick={() => onOpen(d)} className="font-semibold text-stone-900 hover:text-rose-700">
              {dayTitle(d)}
            </button>
            <span className="text-xs text-stone-400">{xs.length}개</span>
          </header>
          <ul className="space-y-0.5 px-4 py-3">
            {xs.map((t) => (
              <DoneRow key={t.id} t={t} editable={editable} onUndo={onUndo} plain />
            ))}
          </ul>
        </article>
      ))}
      {groups.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 14)} className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
          더 보기 · {groups.length - limit}일 남음
        </button>
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
  const [view, setView] = useState("day"); // day 하루씩 | feed 모아 보기 | done 끝낸 일

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

  const setTodos = useCallback((fn) => change((v) => ({ ...v, todos: fn(v.todos) })).catch(() => {}), [change]);

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
    <JournalOnline.Provider value={online}>
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
            ["done", "끝낸 일"],
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
      ) : view === "done" ? (
        <DoneList
          key={who}
          data={data}
          name={nameOf(who)}
          editable={editable}
          onUndo={(id) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: false, doneOn: null } : t)))}
          onOpen={(d) => {
            setDate(d);
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
                <Todos todos={data.todos} date={date} today={today} editable={editable} onChange={setTodos} onShowDone={() => setView("done")} />
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
    </JournalOnline.Provider>
  );
}
