// 소싱 비율 — 촬영 레퍼런스 분류 (2026-10-21)
//
// 세원: "감으로 소싱하다가 매출이 바닥이라 콘텐츠 레퍼런스 40%, 쇼핑몰 레퍼런스 30%, 우리 감으로 한 우리빨 30%로 나눴어.
//        좀 올라오면 바뀔 수 있어 — 우리빨 상품이 에이스가 되면 우리빨 50 · 콘텐츠 25 · 쇼핑몰 25 처럼.
//        촬영 레퍼런스에서 '+ 룩 적기'를 없애고 이 분류를 내가 바꿀 수 있게, 위에 신상 관리 같은 바로 이번 소싱이 몇 %인지."
//
// 분류 목록·목표 % = settings shoot_tags.refCats [{id, name, target}] (모든 소싱 공통 — 목표를 바꾸면 다음 소싱부터 그 기준으로 본다)
// 사진마다 분류 = 회차 refLooks[레퍼런스 id].cat (이 소싱에서만 — 같은 사진도 소싱마다 다르게 둘 수 있다)

export const DEFAULT_CATS = [
  { id: "content", name: "콘텐츠 레퍼런스", target: 40 },
  { id: "shop", name: "쇼핑몰 레퍼런스", target: 30 },
  { id: "ours", name: "우리빨", target: 30 },
];
const COLORS = ["#0369a1", "#b45309", "#be123c", "#15803d", "#6d28d9", "#0f766e", "#57534e"];

/** 쇼핑몰 레퍼런스 분류인가 — 고르면 어느 쇼핑몰인지도 고른다(10/21). 이름을 바꿔도 '쇼핑몰'이 들어 있으면 */
export const isShopCat = (c) => !!c && (c.id === "shop" || (c.name || "").includes("쇼핑몰"));

export const catsOf = (tags) => (tags?.refCats?.length ? tags.refCats : DEFAULT_CATS).map((c, i) => ({ ...c, color: COLORS[i % COLORS.length] }));

/**
 * 이번 소싱 비율 — basis 'photo' = 레퍼런스 사진 장수, 'item' = 사진에 고른 우리 상품 수(같은 상품은 한 번)
 * → {total, rows:[{id,name,color,target,n,pct}], none, tip:{tone,text}}
 */
export function mixOf(refIds, looks, cats, basis = "photo") {
  const ids = refIds || [];
  const known = new Set(cats.map((c) => c.id));
  const catOf = (id) => (known.has(looks?.[id]?.cat) ? looks[id].cat : "");
  const count = (cat) => {
    const of = ids.filter((id) => catOf(id) === cat);
    if (basis === "photo") return of.length;
    return new Set(of.flatMap((id) => looks?.[id]?.itemIds || [])).size;
  };
  const rows = cats.map((c) => ({ ...c, n: count(c.id) }));
  const none = count("");
  const sorted = rows.reduce((s, r) => s + r.n, 0);
  const total = sorted + none;
  for (const r of rows) r.pct = sorted ? Math.round((r.n / sorted) * 100) : 0;
  return { total, sorted, none, rows, tip: tipOf(rows, sorted, basis) };
}

// 받침에 맞는 조사 — '우리빨이 · 우리빨로', '콘텐츠 레퍼런스가 · 콘텐츠 레퍼런스로'
const last = (w) => {
  const c = (w || "").trim().slice(-1).charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? c % 28 : 0; // 0 = 받침 없음, 8 = ㄹ
};
const iga = (w) => w + (last(w) ? "이" : "가");
const ro = (w) => w + (last(w) && last(w) !== 8 ? "으로" : "로");

/** 목표와 가장 많이 어긋난 분류 — 몇 장(개) 더 넣으면 맞는지 */
function tipOf(rows, sorted, basis) {
  const unit = basis === "photo" ? "장" : "개";
  if (sorted < 3) return { tone: "", text: "" };
  const short = rows
    .filter((r) => r.target > 0)
    .map((r) => {
      const t = r.target / 100;
      const need = t >= 1 ? 0 : Math.max(0, Math.ceil((t * sorted - r.n) / (1 - t)));
      return { ...r, gap: r.pct - r.target, need };
    })
    .sort((a, b) => a.gap - b.gap);
  const worst = short[0];
  if (!worst || worst.gap > -10) return { tone: "ok", text: `목표 비율에 가까워요 (모두 ±10%p 안).` };
  return { tone: "warn", text: `${iga(worst.name)} 목표보다 ${-worst.gap}%p 적어요 — ${ro(worst.name)} ${worst.need}${unit} 더 넣으면 목표 ${worst.target}%예요.` };
}
