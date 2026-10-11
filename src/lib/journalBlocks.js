// 업무일지 글 ↔ 노션식 블록 (10/11 세원: "우리 업무일지 노션 완전 손민수 할 수 있나? 너무 불편하게 많아.")
//
// 쓰는 칸은 노션 같은 블록 편집기(BlockNote)지만 **저장은 예전 글 모양 그대로** 한다 —
// 모아 보기·찾기·읽기 모양(Rendered)·지난 글이 하나도 안 바뀌고, 저장 크기도 그대로다. 열 때 글 → 블록, 저장할 때 블록 → 글.
//
//   한 단 들여쓰기 = 공백 3칸 (안쪽 블록)        • / ◦ 글  → 점 목록          1. 글 → 번호 목록
//   ☐ / ☑ 글 → 체크박스 (✓ 도 끝낸 체크)         ▾ / ▸ 글 → 토글              > 글 → 인용
//   ■ 글 → 소제목(제목 3) · # 제목 1 · ## 제목 2   --- → 구분선                  [사진:키] → 사진
//   글자 꾸미기는 폭 0 표시 글자(U+2060~2064) — 굵게·밑줄·형광펜·취소선·기울임, `코드`
//
// 할 일은 한 줄 = 할 일 하나(todos 목록)라서 따로: 블록 id = 할 일 id, 블록 종류 = kind(bullet·number·heading·text).
// 10/11 저녁 세원: "작대기나 버그가 너무 많아서 오늘 할 일·내일 할 일에 체크박스 없애고 점으로 통일하자" — 체크박스(check)·토글은 점으로 읽는다.

const MK = { b: "⁡", u: "⁢", h: "⁣", s: "⁤", i: "⁠" };
const MK_ALL = /[⁠-⁤]/g;
const INDENT = "   ";
const glyph = (d) => (d % 2 ? "◦" : "•");

// JournalPage 의 PATTERNS 와 같다 (예전 ** __ ~~ == 기호도 읽는다)
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
const KIND_STYLE = {
  b: { bold: true },
  u: { underline: true },
  s: { strike: true },
  h: { backgroundColor: "yellow" },
  i: { italic: true },
  c: { code: true },
};

const sameStyles = (a, b) => {
  const ka = Object.keys(a).filter((k) => a[k] && a[k] !== "default");
  const kb = Object.keys(b).filter((k) => b[k] && b[k] !== "default");
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

/** 꾸민 글 → 블록 글자 조각 [{type:"text", text, styles}] */
export function inlineFromText(s, styles = {}) {
  const out = [];
  const push = (text, st) => {
    const t = String(text || "").replace(MK_ALL, "");
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && sameStyles(prev.styles, st)) prev.text += t;
    else out.push({ type: "text", text: t, styles: { ...st } });
  };
  const src = String(s || "");
  const re = new RegExp(MARK_SRC, "g");
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) push(src.slice(last, m.index), styles);
    const i = PATTERNS.findIndex((_, k) => m[k + 1] != null);
    const kind = PATTERNS[i][1];
    const st = { ...styles, ...KIND_STYLE[kind] };
    if (kind === "c") push(m[i + 1], st);
    else for (const r of inlineFromText(m[i + 1], st)) push(r.text, r.styles);
    last = re.lastIndex;
  }
  if (last < src.length) push(src.slice(last), styles);
  return out;
}

/** 블록 글자 조각 → 꾸민 글 (색 같은 건 못 담아서 뺀다) */
export function inlineToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  // 같은 꾸밈끼리 붙인다
  const runs = [];
  const add = (text, styles) => {
    const prev = runs[runs.length - 1];
    if (prev && sameStyles(prev.styles, styles)) prev.text += text;
    else runs.push({ text, styles });
  };
  for (const c of content) {
    if (c?.type === "link") {
      for (const x of c.content || []) if (x?.type === "text") add(x.text, x.styles || {});
    } else if (c?.type === "text") add(c.text, c.styles || {});
  }
  let out = "";
  for (const r of runs) {
    let t = String(r.text || "").replace(MK_ALL, "").replace(/\n/g, " ");
    if (!t) continue;
    const s = r.styles || {};
    if (s.code) t = "`" + t.replace(/`/g, "'") + "`";
    const hl = s.backgroundColor && s.backgroundColor !== "default";
    for (const [k, on] of [
      ["i", s.italic],
      ["h", hl],
      ["s", s.strike],
      ["u", s.underline],
      ["b", s.bold],
    ])
      if (on) t = MK[k] + t + MK[k];
    out += t;
  }
  return out;
}

const plainOf = (content) => inlineToText(content).replace(MK_ALL, "");

/** 한 줄 → {depth, block} 또는 {blank} */
function parseLine(raw) {
  if (!raw.trim()) return { blank: true };
  const sp = raw.length - raw.trimStart().length;
  const depth = Math.min(6, Math.floor(sp / INDENT.length));
  const s = raw.trimStart();
  const ic = (t) => inlineFromText(t);
  let m;
  if ((m = s.match(/^\[사진:([^\]\s]+)\]\s*$/))) return { depth, block: { type: "image", props: { url: /^https?:/.test(m[1]) ? m[1] : `photo:${m[1]}` } } };
  if (/^(-{3,}|—{2,})$/.test(s.trim())) return { depth, block: { type: "divider" } };
  if ((m = s.match(/^([▸▾]) ?(.*)$/))) return { depth, block: { type: "toggleListItem", content: ic(m[2]) } };
  if ((m = s.match(/^([☐☑✓]) ?(.*)$/))) return { depth, block: { type: "checkListItem", props: { checked: m[1] !== "☐" }, content: ic(m[2]) } };
  if ((m = s.match(/^(#{1,3})\s+(.+)$/))) return { depth, block: { type: "heading", props: { level: m[1].length }, content: ic(m[2]) } };
  if ((m = s.match(/^■\s*(.+)$/))) return { depth, block: { type: "heading", props: { level: 3 }, content: ic(m[1]) } };
  if ((m = s.match(/^>\s?(.*)$/))) return { depth, block: { type: "quote", content: ic(m[1]) } };
  if ((m = s.match(/^[-•◦*·]\s+(.*)$/))) return { depth, block: { type: "bulletListItem", content: ic(m[1]) } };
  if ((m = s.match(/^(\d+)[.)]\s+(.*)$/))) return { depth, block: { type: "numberedListItem", props: { start: Number(m[1]) }, content: ic(m[2]) } };
  return { depth, block: { type: "paragraph", content: ic(s) } };
}

/** [{depth, block}] → 블록 나무 (한 단씩만 안으로 — 건너뛴 단은 바로 위로 붙인다) */
function nest(rows) {
  const root = [];
  const stack = [];
  for (const r of rows) {
    const d = Math.min(r.depth, stack.length);
    const b = { ...r.block, children: [] };
    if (d === 0) root.push(b);
    else stack[d - 1].children.push(b);
    stack.length = d;
    stack.push(b);
  }
  return root;
}

/** 저장된 글 → 블록 (빈 글이면 빈 배열) */
export function textToBlocks(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const parsed = lines.map(parseLine);
  // 빈 줄은 앞뒤 줄 중 얕은 쪽 깊이에 빈 문단으로 (토글 안쪽 빈 줄이 토글을 끊지 않게)
  const depthAt = (i, dir) => {
    for (let j = i + dir; j >= 0 && j < parsed.length; j += dir) if (!parsed[j].blank) return parsed[j].depth;
    return 0;
  };
  const rows = parsed.map((p, i) => (p.blank ? { depth: Math.min(depthAt(i, -1), depthAt(i, 1)), block: { type: "paragraph" } } : p));
  const tree = nest(rows);
  // 번호 목록: 이어지는 줄은 번호를 세게 두고, 첫 줄만 시작 번호(1이 아니면)
  const fix = (list) => {
    list.forEach((b, i) => {
      if (b.type === "numberedListItem") {
        const cont = list[i - 1]?.type === "numberedListItem";
        if (cont || b.props.start === 1) delete b.props.start;
      }
      fix(b.children);
    });
  };
  fix(tree);
  return tree;
}

/** 블록 → 저장할 글 */
export function blocksToText(blocks) {
  const out = [];
  const walk = (list, d) => {
    let n = 0;
    for (const b of list || []) {
      n = b.type !== "numberedListItem" ? 0 : n ? n + 1 : Number(b.props?.start) || 1;
      const pre = INDENT.repeat(d);
      const t = inlineToText(b.content);
      switch (b.type) {
        case "heading":
          out.push(pre + (b.props?.level === 1 ? "# " : b.props?.level === 2 ? "## " : "■ ") + t);
          break;
        case "bulletListItem":
          out.push(pre + glyph(d) + " " + t);
          break;
        case "numberedListItem":
          out.push(pre + n + ". " + t);
          break;
        case "checkListItem":
          out.push(pre + (b.props?.checked ? "☑" : "☐") + " " + t);
          break;
        case "toggleListItem":
          out.push(pre + "▾ " + t);
          break;
        case "quote":
          out.push(pre + "> " + t);
          break;
        case "divider":
          out.push(pre + "---");
          break;
        case "image": {
          const u = String(b.props?.url || "");
          if (u) out.push(pre + "[사진:" + (u.startsWith("photo:") ? u.slice(6) : u) + "]");
          break;
        }
        default:
          out.push(t ? pre + t : "");
      }
      if (b.children?.length) walk(b.children, d + 1);
    }
  };
  walk(blocks, 0);
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

// ---------------------------------------------------------------- 할 일

const TYPE_OF = { bullet: "bulletListItem", number: "numberedListItem", heading: "heading", text: "paragraph" };
const KIND_OF = { ...Object.fromEntries(Object.entries(TYPE_OF).map(([k, v]) => [v, k])), checkListItem: "bullet", toggleListItem: "bullet" };
/** 예전 할 일(kind 없음 · check · toggle)은 점 */
export const kindOf = (t) => (TYPE_OF[t?.kind] ? t.kind : "bullet");
/** 끝낼 수 있는 할 일인가 (글 줄·제목은 메모라서 안 셈) */
export const isTask = (t) => ["bullet", "number"].includes(kindOf(t));

/** 할 일 목록(순서·depth) → 블록 나무. 비면 빈 점 하나 */
export function todosToBlocks(items) {
  const rows = (items || []).map((t) => {
    const type = TYPE_OF[kindOf(t)];
    const props = type === "heading" ? { level: 3 } : {};
    return { depth: t.depth || 0, block: { id: t.id, type, props, content: inlineFromText(t.text) } };
  });
  const tree = nest(rows);
  return tree.length ? tree : [{ type: "bulletListItem" }];
}

/** 블록 나무 → 줄마다 {id, kind, text, depth, done, kids} (글이 빈 줄도 포함 — 저장할 때 거른다) */
export function blocksToRows(blocks) {
  const out = [];
  const walk = (list, d) => {
    for (const b of list || []) {
      const kind = KIND_OF[b.type];
      if (kind) out.push({ id: b.id, kind, text: inlineToText(b.content).trim(), plain: plainOf(b.content).trim(), depth: d });
      if (b.children?.length) walk(b.children, d + 1);
    }
  };
  walk(blocks, 0);
  return out;
}

/** 블록 나무에서 id 로 찾기 + 위치(앞·뒤·부모) */
export function findBlock(blocks, id, parent = null) {
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i];
    if (b.id === id) return { block: b, prev: blocks[i - 1] || null, next: blocks[i + 1] || null, parent };
    const got = findBlock(b.children, id, b);
    if (got) return got;
  }
  return null;
}

/** 블록 나무 펼치기 */
export function flatBlocks(blocks, out = []) {
  for (const b of blocks || []) {
    out.push(b);
    flatBlocks(b.children, out);
  }
  return out;
}
