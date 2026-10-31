// 직접 잰 실측 (10/6 세원: "샘플을 거래처에 다시 보낼 때 포장하면서 사이즈를 재거든? 원래 종이에 적었는데 그럴 필요가 없을 것 같아.
// 종류별로 칸을 만들어 휴대폰으로 치기 쉽게, PC에서는 복사 붙여넣기하면 바로 다 잡히게 — 상품등록할 때 편하게").
//
// 상품에 measure = {cat, sizes:["FREE"], v:{FREE:{어깨:"44", …}}, on}
// 복사 글은 상품등록 메모(poclo-cafe24 정보.txt)와 같은 모양 — memo.py 가 그대로 읽는다:
//   사이즈: FREE          사이즈: S / M / L
//   어깨 44               허리 33/35/37
// 항목은 세원이 정한 그대로(상의·하의는 상품등록 메모 항목과 같다).

export const MEASURE_CATS = [
  { k: "top", label: "상의", hint: "반팔·긴팔·아우터·셔츠·티셔츠", parts: ["어깨", "가슴", "팔길이", "암홀", "밑단", "총장"] },
  { k: "bottom", label: "하의", hint: "반바지·바지", parts: ["허리", "엉덩이", "허벅지", "밑위", "밑단", "총장"] },
  { k: "sleeveless", label: "나시", hint: "나시·민소매·슬리브리스", parts: ["어깨", "가슴", "암홀", "밑단", "총장"] },
  { k: "skirt", label: "치마", hint: "치마·스커트", parts: ["허리", "엉덩이", "밑단", "총장"] },
  // 칸은 옷마다 따로 — partsOf 가 SET_PIECES 로 만든다 (아래 '세트')
  { k: "set", label: "세트", hint: "상의+하의처럼 옷마다 따로 재요", parts: [] },
  // 10/12 세원: "실측에 기타도 — 지금 스카프 진행하게. 신발도 등록할 때 필요할 것 같아"
  // 둘 다 잴 곳이 상품마다 달라서 칸을 고칠 수 있다(measure.partsBy[cat]). 이름에 숫자는 못 쓴다(상품등록 메모가 숫자부터 값으로 읽음)
  { k: "shoes", label: "신발", hint: "구두·로퍼·운동화·부츠·샌들", parts: ["굽높이", "앞굽"], more: ["발목 높이", "발목 둘레", "통 둘레", "총 높이"], custom: true, same: true },
  { k: "etc", label: "기타", hint: "스카프·가방·모자·벨트 등 — 잴 곳을 정해요", parts: ["가로", "세로"], more: ["폭", "길이", "둘레", "끈 길이", "깊이", "챙"], custom: true },
];
// 10/12 세원: "실측에서 소매 → 팔길이로" — 예전에 '소매'로 저장된 값은 읽을 때 '팔길이'로 옮긴다(고쳐 저장하면 새 이름으로 남음)
export function fixMeasure(m) {
  if (!m?.v || !Object.values(m.v).some((pv) => pv && "소매" in pv)) return m;
  const v = {};
  for (const [s, pv] of Object.entries(m.v)) {
    const { 소매: old, ...rest } = pv || {};
    v[s] = old != null && !String(rest.팔길이 ?? "").trim() ? { ...rest, 팔길이: old } : rest;
  }
  return { ...m, v };
}
export const catOf = (k) => MEASURE_CATS.find((c) => c.k === k) || MEASURE_CATS[0];

// 세트 (11/1 세원: "상하의 세트 상품은 실측 넣을 때 하의도 같이 넣어야 하는데") — 옷마다 표를 따로.
// measure = {cat:"set", pieces:["상의","하의"], sizes, v:{FREE:{"상의 어깨":"44", "하의 허리":"30"}}}
// 칸 이름이 '옷 이름 + 잴 곳' 이라 상의·하의 밑단·총장이 안 겹친다. poclo-cafe24 erp_sync.py SET_PIECE_CAT 과 같게
export const SET_PIECES = [
  { name: "상의", cat: "top" },
  { name: "나시", cat: "sleeveless" },
  { name: "가디건", cat: "top" },
  { name: "자켓", cat: "top" },
  { name: "하의", cat: "bottom" },
  { name: "치마", cat: "skirt" },
];
export const piecesOf = (m) => (m?.pieces?.length ? m.pieces : ["상의", "하의"]);
const pieceCat = (name) => catOf(SET_PIECES.find((p) => p.name === name)?.cat);
/** 옷 하나의 칸 이름들 — '상의 어깨' … */
export const pieceParts = (name) => pieceCat(name).parts.map((p) => `${name} ${p}`);
/** 한 표로 재던 상품을 세트로 — 적어 둔 값은 옷별 칸으로 옮겨 적는다(원래 값도 남겨서 다른 표로 되돌려도 안 날아간다) */
export function toSet(m) {
  const pieces = piecesOf(m);
  const v = {};
  for (const [s, pv] of Object.entries(m.v || {})) {
    v[s] = { ...pv };
    for (const [p, val] of Object.entries(pv || {})) {
      const has = (n) => pieceCat(n).parts.includes(p);
      const to = pieces.find((n) => has(n) && pieceCat(n).k === m.cat) || pieces.find(has);
      if (to && String(val ?? "").trim() && !v[s][`${to} ${p}`]) v[s][`${to} ${p}`] = val;
    }
  }
  return { ...m, cat: "set", pieces, v };
}
/** 옷 바꾸기(하의 → 치마) — 같은 옷을 고쳐 부르는 거라 겹치는 잴 곳의 값은 그대로, 없어지는 칸만 뺀다 */
export function renamePiece(m, i, name) {
  const pieces = piecesOf(m);
  const old = `${pieces[i]} `;
  const keep = pieceCat(name).parts;
  const v = {};
  for (const [s, pv] of Object.entries(m.v || {})) {
    v[s] = {};
    for (const [p, val] of Object.entries(pv || {})) {
      if (!p.startsWith(old)) v[s][p] = val;
      else if (keep.includes(p.slice(old.length))) v[s][`${name} ${p.slice(old.length)}`] = val;
    }
  }
  return { ...m, pieces: pieces.map((n, j) => (j === i ? name : n)), v };
}

/** 이 실측표의 잴 곳 — 신발·기타는 고친 것(partsBy), 세트는 옷마다 */
export const partsOf = (m) => {
  if (m?.cat === "set") return piecesOf(m).flatMap(pieceParts);
  const c = catOf(m?.cat);
  const own = c.custom ? m?.partsBy?.[c.k] : null;
  return own?.length ? own : c.parts;
};
/** 모든 사이즈 같은 값(신발 굽높이처럼) — 한 줄만 재고, 복사는 '굽높이 5' 하나로 */
export const isSame = (m) => (m?.same ?? catOf(m?.cat).same) === true;
/** 잴 곳 이름 다듬기 — 숫자·기호 빼고(상품등록 메모가 숫자부터 값으로 읽어서) */
export const partName = (s) =>
  String(s || "")
    .replace(/[\d.:：/~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);

const SHOES = /신발|슈즈|구두|로퍼|부츠(?!컷)|부티|워커|스니커|운동화|샌들|슬리퍼|쪼리|뮬|메리제인|블로퍼|슬링백|펌프스|플랫슈|힐$/;
const ETC = /스카프|머플러|목도리|(?<![가-힣])숄(?!더)|가방|크로스백|숄더백|토트백|에코백|파우치|모자|비니|버킷햇|볼캡|양말|장갑|키링|목걸이|귀걸이|팔찌/;
// 벨트 세트는 옷이 하나라 뺀다. 신마 긴 이름(fullName)은 '세트가능'·'허리끈 세트' 같은 말이 많아서 짧은 이름만 본다
const SET_NAME = /(?<!벨트\s?)(세트(?!가능)|set\b)|셋업|투피스/i;

/** 상품 이름·종류로 어느 표인지 짐작 (틀리면 칩으로 바꾼다) */
export function guessMeasureCat(x) {
  const t = `${x?.name || ""} ${x?.fullName || ""}`.toLowerCase();
  // 옷 종류가 정해진 상품은 이름에 '벨트'·'부츠컷' 이 들어 있어도 옷으로 본다
  if (x?.kind === "신발·잡화") return SHOES.test(t) ? "shoes" : "etc";
  if (!x?.kind && SHOES.test(t)) return "shoes";
  if (!x?.kind && ETC.test(t)) return "etc";
  if (SET_NAME.test(x?.name || "")) return "set";
  if (/나시|민소매|슬리브리스|sleeveless|캐미|뷔스티에/.test(t)) return "sleeveless";
  if (/치마바지|스커트팬츠|큐롯/.test(t)) return "bottom";
  if (/치마|스커트|skirt|sk\b|sk$/.test(t)) return "skirt";
  if (x?.kind === "하의" || /팬츠|바지|슬랙스|데님|청바지|쇼츠|반바지|레깅스|조거|pt\b|pt$/.test(t)) return "bottom";
  return "top";
}

/** 'S, M, L' · 'Free' · 'M-L, L-2XL' → ['S','M','L'] · ['FREE'] */
export function sizeNames(sizes) {
  const list = String(sizes || "")
    .split(/[,/·]|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^(free|프리|f)$/i.test(s) ? "FREE" : s));
  return list.length ? [...new Set(list)] : ["FREE"];
}

export function blankMeasure(x) {
  return { cat: guessMeasureCat(x), sizes: sizeNames(x?.sizes), v: {} };
}

/** 몇 칸 채웠나 (모든 사이즈 같은 값이면 한 줄만 센다) */
export function filled(m) {
  if (!m) return { n: 0, of: 0 };
  m = fixMeasure(m);
  const parts = partsOf(m);
  const all = m.sizes?.length ? m.sizes : ["FREE"];
  const sizes = isSame(m) ? all.slice(0, 1) : all;
  let n = 0;
  for (const s of sizes) for (const p of parts) if (String(m.v?.[s]?.[p] ?? "").trim()) n++;
  return { n, of: parts.length * sizes.length };
}

/**
 * 복사 글 — 상품등록 메모(정보.txt) 모양. 사이즈마다 값이 다 있는 줄만(빈 칸이 있는 줄은 빼고 missing 으로 알려 준다)
 * 모든 사이즈 같은 값이면 값 하나('굽높이 5') — memo.py 가 값이 하나면 모든 사이즈에 넣는다
 * 세트: 사이즈 하나면 memo.py 옷별 표 모양('어깨 상의-53'), 여럿이면 '상의 어깨 44/45/46' — 옷별 표는 사이즈 옵션을 안 걸어서
 */
export function measureText(m) {
  if (!m) return { text: "", missing: [] };
  m = fixMeasure(m);
  const parts = partsOf(m);
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  const same = isSame(m);
  const setOne = m.cat === "set" && sizes.length === 1;
  const lines = [`사이즈: ${sizes.join(" / ")}`];
  const missing = [];
  for (const p of parts) {
    const vals = (same ? sizes.slice(0, 1) : sizes).map((s) => String(m.v?.[s]?.[p] ?? "").trim());
    if (vals.every((v) => !v)) continue;
    if (vals.some((v) => !v)) {
      missing.push(p);
      continue;
    }
    lines.push(setOne ? `${p.split(" ").slice(1).join(" ")} ${p.split(" ")[0]}-${vals[0]}` : `${p} ${vals.join("/")}`);
  }
  return { text: lines.length > 1 ? lines.join("\n") : "", missing };
}

/** 모든 사이즈 같은 값이면 첫 사이즈 값을 나머지 사이즈에도 (상품등록 쪽이 사이즈마다 읽어서) */
export function spreadSame(m) {
  if (!isSame(m)) return m;
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  const first = { ...(m.v?.[sizes[0]] || {}) };
  return { ...m, v: Object.fromEntries(sizes.map((s) => [s, { ...first }])) };
}

// 붙여넣은 글 읽기 — 다른 이름으로 적힌 부위도 받는다(가슴단면·가슴품 → 가슴, 힙 → 엉덩이, 소매기장·소매 → 팔길이 …)
const SYN = [
  ["어깨", "어깨\\s*너비|어깨"],
  ["가슴", "가슴\\s*단면|가슴\\s*품|가슴|(?<![가-힣])품(?![가-힣])"],
  ["팔길이", "팔\\s*(?:기장|길이)|소매\\s*(?:기장|길이)|소매(?!\\s*통)"],
  ["암홀", "암홀"],
  ["허리", "허리\\s*단면|허리"],
  ["엉덩이", "엉덩이|힙"],
  ["허벅지", "허벅지\\s*단면|허벅지"],
  ["밑위", "밑\\s*위"],
  ["밑단", "밑\\s*단\\s*단면|밑\\s*단"],
  ["총장", "총\\s*기?장|(?<![가-힣])기장"],
  ["굽높이", "굽\\s*높이|(?<![가-힣])굽(?![가-힣])"],
  ["앞굽", "앞\\s*굽"],
];
const SYN_OF = Object.fromEntries(SYN);
// 표에 없는 잴 곳(신발·기타에서 직접 정한 것)은 그 이름 그대로(띄어쓰기는 있어도 없어도).
// 앞에 다른 말이 붙은 것('끈 길이'의 '길이')은 다른 칸이라 안 잡는다
const synOf = (p) => SYN_OF[p] || "(?<![가-힣]\\s?)" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
const NUM = "\\d+(?:\\.\\d+)?";
const SIZE_HEAD = /^\s*(FREE|F|XS|S|M|L|XL|XXL|2XL|\d{2,3})\b\s*[:(]?/i;

/**
 * 붙여넣은 글 → {sizes?:[…], v:{size:{part:val}}} (못 읽으면 null)
 *   '어깨 44 / 가슴 52 / 총장 60'  ·  '허리 33/35/37' (사이즈 순서대로)  ·  'S (허리: 35cm / 힙: 46cm)' 줄마다 사이즈
 *   부위 이름 없이 숫자만(엑셀 한 줄 '44 52 60 22 50 65')이면 표 순서대로
 */
export function parseMeasure(text, m) {
  const parts = partsOf(m);
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const v = {};
  const put = (s, p, val) => {
    v[s] = { ...(v[s] || {}), [p]: val };
  };
  let named = false;
  const lineSizes = [];
  for (const line of lines) {
    const head = line.match(SIZE_HEAD);
    const own = head && !/^\d/.test(head[1]) ? head[1].toUpperCase().replace(/^F$/, "FREE") : head && /\(/.test(line) ? head[1] : null;
    if (own) lineSizes.push(own);
    for (const part of parts) {
      const syn = synOf(part);
      const re = new RegExp(`(?:${syn})(?:\\s*\\([^)]*\\))?\\s*[:：=/-]?\\s*((?:${NUM})(?:\\s*(?:cm)?\\s*[/,]\\s*${NUM})*)`, "i");
      const mm = line.match(re);
      if (!mm) continue;
      named = true;
      const vals = mm[1].split(/\s*(?:cm)?\s*[/,]\s*/).map((x) => x.replace(/cm/i, "").trim()).filter(Boolean);
      if (own) put(own, part, vals[0]);
      else if (vals.length > 1) vals.forEach((val, i) => sizes[i] && put(sizes[i], part, val));
      else sizes.forEach((s) => put(s, part, vals[0]));
    }
  }
  if (named) return { sizes: lineSizes.length > 1 ? lineSizes : null, v };
  // 숫자만 — 표 순서대로 (첫 사이즈)
  const nums = String(text || "").match(new RegExp(NUM, "g")) || [];
  if (nums.length >= 2) {
    parts.forEach((p, i) => nums[i] && put(sizes[0], p, nums[i]));
    return { sizes: null, v };
  }
  return null;
}

const UPPER_WORD = "상의|탑|자켓|재킷|가디건|나시|민소매";
const LOWER_WORD = "하의|바지|팬츠|치마|스커트";
/**
 * 세트에 붙여넣은 글 — '상의 어깨 44 가슴 52 / 하의 허리 30 총장 38' 처럼 옷 이름이 있으면 옷별로,
 * 없으면 붙여넣은 칸의 옷(into)으로 읽는다. 돌려주는 모양은 parseMeasure 와 같다(칸 이름만 '상의 어깨')
 */
export function parseSet(text, m, into) {
  const pieces = piecesOf(m);
  const pick = (w) =>
    pieces.find((n) => n === w) ||
    pieces.find((n) => (new RegExp(LOWER_WORD).test(w) ? ["bottom", "skirt"] : ["top", "sleeveless"]).includes(pieceCat(n).k));
  const chunks = {};
  let cur = into || pieces[0];
  const head = new RegExp(`^\\s*(${UPPER_WORD}|${LOWER_WORD})`);
  for (const line of String(text || "")
    .replace(new RegExp(`${UPPER_WORD}|${LOWER_WORD}`, "g"), "\n$&")
    .split("\n")) {
    const w = line.match(head)?.[1];
    if (w) cur = pick(w) || cur;
    chunks[cur] = `${chunks[cur] || ""}${w ? line.replace(head, "") : line}\n`;
  }
  const v = {};
  let sizes = null;
  let found = false;
  for (const [name, t] of Object.entries(chunks)) {
    const got = parseMeasure(t, { cat: pieceCat(name).k, sizes: m.sizes });
    if (!got) continue;
    found = true;
    sizes = got.sizes || sizes;
    for (const [s, pv] of Object.entries(got.v)) for (const [p, val] of Object.entries(pv)) v[s] = { ...(v[s] || {}), [`${name} ${p}`]: val };
  }
  return found ? { sizes, v } : null;
}

// 착용정보 (10/8 세원: "계절감·신축성·두께감·촉감 적을 칸 — 앞으로 상품등록할 때 여기 있는 상품 정보를 가져가게")
// 선택지는 상품등록(poclo-cafe24 detail_page.py WEAR, 에디봇과 같음) 그대로. 계절감만 여러 개.
// 상품에 wear = {계절감:["봄/가을","겨울"], 신축성:"좋음", 두께감:"적당함", 촉감:"부드러움"}
export const WEAR = [
  ["계절감", ["봄/가을", "여름", "겨울"]],
  ["신축성", ["없음", "적당함", "좋음"]],
  ["두께감", ["얇음", "적당함", "두꺼움"]],
  ["촉감", ["부드러움", "적당함", "까슬함"]],
];
// 네 칸 모두 여러 개 고를 수 있다 — 상품등록(memo.py)이 '얇음~적당함'·'적당함, 두꺼움' 을 칸 여러 개로 받아서
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const wearVal = (w, k) => asList(w?.[k]).join(", ");
/** 상품등록 메모(정보.txt) 줄 — '계절감: 봄/가을, 겨울' (memo.py 가 읽는 모양) */
export const wearLines = (w) =>
  WEAR.map(([k]) => (wearVal(w, k) ? `${k}: ${wearVal(w, k)}` : ""))
    .filter(Boolean)
    .join("\n");
export const wearSummary = (w) =>
  WEAR.map(([k]) => wearVal(w, k))
    .filter(Boolean)
    .join(" · ");
export const hasWear = (w) => WEAR.some(([k]) => asList(w?.[k]).length);

// 다른 말 → 우리 선택지 (memo.py WEAR_ALIAS 와 같게 + 신마 옷감정보 말)
const ALIAS = {
  계절감: { 봄: "봄/가을", 가을: "봄/가을", 봄가을: "봄/가을", 간절기: "봄/가을", 여름: "여름", 겨울: "겨울" },
  신축성: { 없음: "없음", 약간: "적당함", 조금: "적당함", 보통: "적당함", 중간: "적당함", 적당함: "적당함", 있음: "좋음", 많음: "좋음", 좋음: "좋음", 우수: "좋음" },
  두께감: { 얇음: "얇음", 얇은: "얇음", 보통: "적당함", 중간: "적당함", 적당함: "적당함", 도톰: "두꺼움", 도톰함: "두꺼움", 두툼함: "두꺼움", 두꺼움: "두꺼움", 두꺼운: "두꺼움" },
  촉감: { 부드러움: "부드러움", 부드러운: "부드러움", 보통: "적당함", 적당함: "적당함", 까슬함: "까슬함", 까슬: "까슬함", 거침: "까슬함", 거칠음: "까슬함" },
};
/** '봄/가을, 겨울' · '없음~적당함' · ['봄','가을'] → 우리 선택지 목록 (모르는 말은 뺀다) */
export function normWear(key, v) {
  const opts = (WEAR.find(([k]) => k === key) || [])[1] || [];
  const words = asList(v)
    .flatMap((x) => String(x).split(/[,·~]|\s{2,}/))
    .map((x) => x.replace(/\s*\(.*?\)\s*/g, "").trim())
    .filter(Boolean);
  const out = [];
  for (const w of words) {
    if (/^(사계절|4계절|전계절)$/.test(w) && key === "계절감") out.push(...opts);
    else out.push(opts.includes(w) ? w : ALIAS[key]?.[w] || ALIAS[key]?.[w.replace(/\s/g, "")]);
  }
  return [...new Set(out.filter((x) => opts.includes(x)))];
}
