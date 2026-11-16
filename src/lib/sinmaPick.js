// 신마 후보 → 신상 관리 '요청'으로 바로 담기 (11/16 세원(방향성 창): "신마 후보에서 바로바로 촬영 상품 고를 수 있게 만들어줘")
//   예전(11/11)엔 '신상 관리 요청과는 안 섞음 · 고르기·담기는 세원이 신마에서 직접'이었는데 세원이 바꿨다.
// 후보 카드 '촬영 담기' 한 번 → shoot_items 에 요청 단계 상품 하나(서버 최신을 다시 읽고 그 상품 하나만 더함 — d.saveItems = changeKey 조건부 쓰기).
//   같은 상품번호(goodsId)가 이미 있으면 또 안 만든다('담김 · 지금 단계').
//   후보에 있는 값으로 채움: gid→goodsId · url · name(짧게)/fullName · store→vendor(돈 › 거래처와 이름으로 잇기) · loc→place · price · mix→fabric · kind · photo(reels 버킷 sinsang/<gid>.jpg)
//   + sinmaRef {sessionId, title, refId, refNo} (어느 소싱·몇 번 레퍼 사진에서 골랐나) — 그 레퍼 사진의 '이 사진에 쓸 우리 상품'(refLooks)에도 같이 넣는다.
//   신마 화면에만 있는 값(색상·사이즈·거래처 연락처·제품 설명)은 비어 있다 → needsSinma: true ('신마 정보 채우기 필요').
//   신마에서 그 상품을 '포클로에 담기' 하면 빈 칸이 채워지고 표시가 꺼진다(lib/clipSave 의 이미 담긴 상품 갈래).
// 빼기 = 잘못 누른 것 되돌리기 — 신마 후보에서 담았고 아직 요청 단계·요청함/픽업 안 누른 것만 지운다(그 뒤로는 신상 관리에서 단계로).
import { cleanName, vendorName, findVendor, guessKind } from "./sinsang";
import { newId } from "./id";

export const FROM = "신마 후보";
const gidOf = (f) => String(f?.gid ?? "").trim();
const alive = (x) => x.stage !== "trash" && x.stage !== "drop" && !x.refused;

/** 상품번호 → 신상 관리 상품 (살아 있는 것 먼저) */
export function pickedMap(items) {
  const m = new Map();
  for (const x of items || []) {
    const g = String(x.goodsId || "").trim();
    if (!g) continue;
    const had = m.get(g);
    if (!had || (!alive(had) && alive(x))) m.set(g, x);
  }
  return m;
}

/** 후보 옷 종류(바지·스커트·상의·아우터 …) → 신상 관리 종류 */
export function kindOf(f, clothes = []) {
  const k = String(f?.kind || "").trim();
  if (clothes.includes(k)) return k;
  if (/바지|팬츠|스커트|치마|데님|슬랙스|레깅스|숏츠|반바지/.test(k)) return "하의";
  if (/아우터|자켓|재킷|코트|점퍼|패딩|가디건/.test(k)) return "아우터";
  if (/원피스|세트|셋업|점프수트/.test(k)) return "원피스·세트";
  if (/신발|가방|잡화|모자|벨트|머플러|양말|ACC/i.test(k)) return "신발·잡화";
  if (/상의|티|니트|셔츠|블라우스|맨투맨|후드|나시/.test(k)) return "상의";
  return guessKind(f?.name || "");
}

/** 후보 하나 → 신상 관리 요청 상품 */
export function sinmaItem(f, { session, vendors = [], clothes = [] } = {}) {
  const g = gidOf(f);
  const raw = vendorName(f.store || "");
  const v = raw ? findVendor(raw, f.loc || "", vendors) : null;
  return {
    id: newId("i"),
    type: "sample",
    stage: "request",
    name: cleanName(f.name || "") || f.name || g,
    fullName: f.name || "",
    vendor: v?.name || raw,
    vendorId: v?.id || "",
    place: f.loc || "",
    kind: kindOf(f, clothes),
    price: Number(f.price) || "",
    url: f.url || (g ? `https://sinsangmarket.kr/goods/${g}/0` : ""),
    goodsId: g,
    colors: "",
    sizes: "",
    fabric: f.mix || "",
    origin: "",
    photo: f.photo || "",
    photoUrl: "",
    memo: "",
    from: FROM,
    needsSinma: true,
    sinmaRef: { sessionId: session?.id || "", title: session?.title || "", refId: f.refId || "", refNo: f.refNo ?? null },
    createdAt: new Date().toISOString(),
  };
}

/** 서버 최신에 같은 상품번호가 없을 때만 더하는 changeKey 함수 (둘이 같이 눌러도 하나만) */
export const addOnce = (made) => (v) => {
  const items = v.items || [];
  return items.some((x) => String(x.goodsId || "").trim() === made.goodsId) ? v : { ...v, items: [made, ...items] };
};

/** 잘못 누른 것 되돌리기 — 신마 후보에서 담았고 아직 손대지 않은 요청만 */
export const canUndo = (x) => !!x && x.from === FROM && x.stage === "request" && !x.asked && !x.pickup && !x.refused;

/** 신마 정보 채우기 필요 — 표시가 켜져 있고 색상·사이즈가 아직 비었을 때 */
export const needsSinma = (x) => !!x?.needsSinma && (!String(x.colors || "").trim() || !String(x.sizes || "").trim());
