// 보내기 전 글 다듬기 (11/18) — '_' 로 시작해 서버 함수가 되지 않는다.
//
// 11/18 CS 초안이 400 "The request body is not valid JSON: unexpected end of hex escape" 로 안 나왔다(c24-6-245).
// 프롬프트를 만들 때 .slice(0, N) 가 이모지(🤍 · 11/17부터 상품명에 붙은 💗) 한가운데를 자르면 짝 잃은 서로게이트가 남고,
// Anthropic 이 그 JSON 을 거부한다. 예시 답·말투·상품명이 자르는 자리에 걸릴 때마다 아무 문의에서나 날 수 있어서
// 부르기 직전 내용 전체(글 칸마다)에서 짝 잃은 서로게이트를 지운다.

const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** 글 하나 — 짝 잃은 서로게이트만 지운다 */
export const wellFormedText = (s) => (typeof s.toWellFormed === "function" ? (s.isWellFormed() ? s : s.replace(LONE, "")) : s.replace(LONE, ""));

/** 메시지 내용(배열·객체·글) 안의 글을 전부 */
export function wellFormed(v) {
  if (typeof v === "string") return wellFormedText(v);
  if (Array.isArray(v)) return v.map(wellFormed);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = wellFormed(x);
    return out;
  }
  return v;
}
