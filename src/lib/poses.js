// 포즈 판 (11/16) — 세원(방향성 창): "촬영 중요한데 포즈 레퍼런스 어디서 확인하는지 알려주고 이것도 굉장히 중요해. → 각 코디마다 포즈를 정해야 하니까."
//   + "코디를 짜서 촬영 관리에 넣으면 너가 넣어 준다는 거지?" → 세원은 코디만 넣고, 포즈는 옷 종류로 먼저 골라 둔다(추천). 세원은 보고 바꾸기만.
//
// 포즈 카드 = 모델 레퍼런스(settings model_refs) 모음의 칸 하나. 칸에 pose {code, fits, why, src, ok} 가 붙은 칸만 포즈 카드다.
//   fits = 이 포즈가 맞는 옷 자리 ["전신" | "아우터" | "상의" | "하의"] — 추천에 쓴다.
//   why · src = 고른 이유 · 원본(쇼핑몰·상품·주소) — 우리만 본다. 모델 시트엔 title · text · photos 만 간다(lib/shootSheet sectionsData 가 고른 칸만 담음).
//   ok = 세원 확인: true = OK(모델 시트에 감) · false = 뺌(판에서 숨김, 데이터는 남김) · 없음 = 확인 전(판엔 보이고 시트엔 안 감).
//   모음의 poseOn = 이 포즈를 쓸 촬영일 — 촬영 창 포즈 판이 처음에 이 날짜 모음을 칸으로 깐다(촬영 줄 poseSetIds 로 바꿀 수 있음).
//
// 고른 것은 촬영 줄(settings shoot_days)에 — posePicks {코디 id: [칸 id]} · poseDone {코디 id: [칸 id]}(촬영 날 찍은 것).
//   posePicks 에 그 코디가 없으면 = 아직 안 건드림 → 추천을 보여 주고(저장은 안 함), 세원이 한 칸이라도 누르면 그때부터 그 코디는 고른 그대로.
import { wearPart } from "./shoot";

export const FITS = ["전신", "아우터", "상의", "하의"];

/** 포즈 카드가 든 모음인지 */
export const isPoseSet = (x) => (x?.sections || []).some((s) => s.pose);

/** 이 촬영의 포즈 모음 — 고른 게 있으면 그것, 없으면 촬영일과 poseOn 이 같은 모음 */
export function poseSetsFor(day, sets) {
  const all = (sets || []).filter(isPoseSet);
  if (Array.isArray(day?.poseSetIds)) return day.poseSetIds.map((id) => all.find((x) => x.id === id)).filter(Boolean);
  return all.filter((x) => day?.on && x.poseOn === day.on);
}

/** 포즈 카드 목록 — 뺀 것(ok === false)은 hidden 으로 따로 */
export function poseCards(sets) {
  const cards = (sets || []).flatMap((x) =>
    (x.sections || [])
      .filter((s) => s.pose)
      .map((s) => ({ id: s.id, setId: x.id, code: s.pose.code || "", title: (s.title || "").trim(), fits: s.pose.fits || [], ok: s.pose.ok, sec: s })),
  );
  return { cards: cards.filter((c) => c.ok !== false), hidden: cards.filter((c) => c.ok === false) };
}

/** 코디가 무엇을 입는지 → 추천에 쓰는 자리. 원피스·세트는 위·아래 둘 다 */
export function codiFits(c, items) {
  const out = new Set();
  for (const id of c?.itemIds || []) {
    const x = (items || []).find((y) => y.id === id);
    if (!x) continue;
    const p = wearPart(x);
    if (p === "아우터") out.add("아우터");
    else if (p === "상의" || p === "이너") out.add("상의");
    else if (p === "하의") out.add("하의");
    else if (p === "원피스·세트") {
      out.add("상의");
      out.add("하의");
    }
  }
  return out;
}

/**
 * 추천 — 세원(방향성 창) 예: "아우터는 전신·걷기, 하의 포인트는 하반신·앉은 컷"
 *   전신 포즈는 늘 · 아우터가 있으면 아우터 포즈 · 하의가 있으면 하반신·앉은 포즈 · 아우터 없이 상의만 있으면 상반신 포즈
 */
export const RECO_RULE = "전신은 늘 · 아우터 있으면 아우터 컷 · 하의 있으면 하반신·앉은 컷 · 아우터 없이 상의면 상반신 컷";
export function recommend(cards, c, items) {
  const f = codiFits(c, items);
  const want = new Set(["전신"]);
  if (f.has("아우터")) want.add("아우터");
  if (f.has("하의")) want.add("하의");
  if (f.has("상의") && !f.has("아우터")) want.add("상의");
  return cards.filter((k) => k.fits.some((t) => want.has(t))).map((k) => k.id);
}

/** 이 코디에서 고른 포즈 — {ids, auto}. auto = 아직 세원이 안 건드려서 추천을 보여 주는 중 */
export function picksOf(day, c, cards, items) {
  const have = new Set(cards.map((k) => k.id));
  const mine = day?.posePicks?.[c.id];
  if (Array.isArray(mine)) return { ids: mine.filter((id) => have.has(id)), auto: false };
  return { ids: recommend(cards, c, items), auto: true };
}
export const doneOf = (day, c) => day?.poseDone?.[c.id] || [];

/** 모델 레퍼런스 한 칸의 pose.ok 를 바꾸는 changeKey 함수 */
export const setPoseOk = (secId, ok) => (v) => ({
  ...v,
  items: (v.items || []).map((x) =>
    (x.sections || []).some((s) => s.id === secId)
      ? {
          ...x,
          sections: x.sections.map((s) => {
            if (s.id !== secId) return s;
            const { ok: _was, ...rest } = s.pose || {};
            return { ...s, pose: ok === undefined ? rest : { ...rest, ok } };
          }),
        }
      : x,
  ),
});
