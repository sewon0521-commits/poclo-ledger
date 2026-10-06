// 직접 잰 실측 (10/6 세원: "샘플을 거래처에 다시 보낼 때 포장하면서 사이즈를 재거든? 원래 종이에 적었는데 그럴 필요가 없을 것 같아.
// 종류별로 칸을 만들어 휴대폰으로 치기 쉽게, PC에서는 복사 붙여넣기하면 바로 다 잡히게 — 상품등록할 때 편하게").
//
// 상품에 measure = {cat, sizes:["FREE"], v:{FREE:{어깨:"44", …}}, on}
// 복사 글은 상품등록 메모(poclo-cafe24 정보.txt)와 같은 모양 — memo.py 가 그대로 읽는다:
//   사이즈: FREE          사이즈: S / M / L
//   어깨 44               허리 33/35/37
// 항목은 세원이 정한 그대로(상의·하의는 상품등록 메모 항목과 같다).

export const MEASURE_CATS = [
  { k: "top", label: "상의", hint: "반팔·긴팔·아우터·셔츠·티셔츠", parts: ["어깨", "가슴", "소매", "암홀", "밑단", "총장"] },
  { k: "bottom", label: "하의", hint: "반바지·바지", parts: ["허리", "엉덩이", "허벅지", "밑위", "밑단", "총장"] },
  { k: "sleeveless", label: "나시", hint: "나시·민소매·슬리브리스", parts: ["어깨", "가슴", "암홀", "밑단", "총장"] },
  { k: "skirt", label: "치마", hint: "치마·스커트", parts: ["허리", "엉덩이", "밑단", "총장"] },
];
export const catOf = (k) => MEASURE_CATS.find((c) => c.k === k) || MEASURE_CATS[0];

/** 상품 이름·종류로 어느 표인지 짐작 (틀리면 칩으로 바꾼다) */
export function guessMeasureCat(x) {
  const t = `${x?.name || ""} ${x?.fullName || ""}`.toLowerCase();
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

/** 몇 칸 채웠나 */
export function filled(m) {
  if (!m) return { n: 0, of: 0 };
  const parts = catOf(m.cat).parts;
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  let n = 0;
  for (const s of sizes) for (const p of parts) if (String(m.v?.[s]?.[p] ?? "").trim()) n++;
  return { n, of: parts.length * sizes.length };
}

/** 복사 글 — 상품등록 메모(정보.txt) 모양. 사이즈마다 값이 다 있는 줄만(빈 칸이 있는 줄은 빼고 missing 으로 알려 준다) */
export function measureText(m) {
  if (!m) return { text: "", missing: [] };
  const parts = catOf(m.cat).parts;
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  const lines = [`사이즈: ${sizes.join(" / ")}`];
  const missing = [];
  for (const p of parts) {
    const vals = sizes.map((s) => String(m.v?.[s]?.[p] ?? "").trim());
    if (vals.every((v) => !v)) continue;
    if (vals.some((v) => !v)) {
      missing.push(p);
      continue;
    }
    lines.push(`${p} ${vals.join("/")}`);
  }
  return { text: lines.length > 1 ? lines.join("\n") : "", missing };
}

// 붙여넣은 글 읽기 — 다른 이름으로 적힌 부위도 받는다(가슴단면·가슴품 → 가슴, 힙 → 엉덩이, 소매기장·팔길이 → 소매 …)
const SYN = [
  ["어깨", "어깨\\s*너비|어깨"],
  ["가슴", "가슴\\s*단면|가슴\\s*품|가슴|(?<![가-힣])품(?![가-힣])"],
  ["소매", "소매\\s*(?:기장|길이)|팔\\s*(?:기장|길이)|소매(?!\\s*통)"],
  ["암홀", "암홀"],
  ["허리", "허리\\s*단면|허리"],
  ["엉덩이", "엉덩이|힙"],
  ["허벅지", "허벅지\\s*단면|허벅지"],
  ["밑위", "밑\\s*위"],
  ["밑단", "밑\\s*단\\s*단면|밑\\s*단"],
  ["총장", "총\\s*기?장|(?<![가-힣])기장"],
];
const NUM = "\\d+(?:\\.\\d+)?";
const SIZE_HEAD = /^\s*(FREE|F|XS|S|M|L|XL|XXL|2XL|\d{2,3})\b\s*[:(]?/i;

/**
 * 붙여넣은 글 → {sizes?:[…], v:{size:{part:val}}} (못 읽으면 null)
 *   '어깨 44 / 가슴 52 / 총장 60'  ·  '허리 33/35/37' (사이즈 순서대로)  ·  'S (허리: 35cm / 힙: 46cm)' 줄마다 사이즈
 *   부위 이름 없이 숫자만(엑셀 한 줄 '44 52 60 22 50 65')이면 표 순서대로
 */
export function parseMeasure(text, m) {
  const parts = catOf(m.cat).parts;
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
    for (const [part, syn] of SYN) {
      if (!parts.includes(part)) continue;
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
