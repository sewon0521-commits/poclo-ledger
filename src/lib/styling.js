// 코디 스타일링 (10/25) — components/Styling.jsx 의 상수·요약. 코디에 styling {hair, shoes, bag, acc, memo, refIds}.
// 칩 목록은 settings styling_opts {hair, acc} (세원이 '칩 고치기'로 더하고 뺀다).

export const OPTS_KEY = "styling_opts";
export const DEFAULT_OPTS = {
  hair: ["푼 머리", "반묶음", "포니테일", "낮은 묶음", "똥머리", "집게핀", "웨이브", "스트레이트"],
  acc: ["반지", "목걸이", "귀걸이", "팔찌", "시계", "헤어핀", "벨트", "양말", "스타킹"],
};
export const EMPTY_STYLING = { hair: [], shoes: [], bag: [], acc: [], memo: "", refIds: [] };

/** 스타일링이 한 줄로 — 카드 요약용 ('포니테일 · 로퍼 · 목걸이·반지') */
export function stylingLine(st, items) {
  if (!st) return "";
  const wear = (list) => (list || []).map((s) => (s.itemId ? (items || []).find((x) => x.id === s.itemId)?.name : s.text)).filter(Boolean);
  return [(st.hair || []).join("·"), wear(st.shoes).join("·"), wear(st.bag).join("·"), (st.acc || []).join("·")].filter(Boolean).join(" · ");
}
