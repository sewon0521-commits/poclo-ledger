// 레퍼 사진 → 코디 바로 만들기 (11/16 세원(방향성 창): "고른 우리 상품에서 상품 각각 버튼을 만들어 주고 버튼 누르면 코디에서 코디 바로 만들어지게")
// 소싱 회차 창의 레퍼 사진 하나 = 코디 하나. 고른 우리 상품 카드 '코디 +' →
//   처음 = settings shoot_codis 에 새 코디 {name '261116_이주현 2번'(회차 제목 + 레퍼 번호), refIds [그 레퍼], itemIds [그 상품], fromRef {sessionId, refId}}
//   그 뒤 = 같은 코디(fromRef 가 같은 것)에 더하기, 다시 누르면 빼기. 다 빼면(촬영 끝 안 한 코디) 코디도 지운다 — 버튼으로 만든 것을 되돌리는 것.
//   촬영일 = 그 회차 모델(회차 제목의 이름 — '261116_이주현')의 다가오는 촬영(settings shoot_days)이 있으면 그날 · shootId, 없으면 비움('촬영일 미정').
// 저장은 d.saveCodis(fn) — 서버 최신을 다시 읽고 그 코디만 바꾼다(changeKey 조건부 쓰기, fn 은 여러 번 불릴 수 있어 순수하게).
import { dayKey } from "./journal";

const same = (c, sessionId, refId) => c?.fromRef?.sessionId === sessionId && c?.fromRef?.refId === refId;

/** 이 레퍼로 만든 코디 */
export const refCodiOf = (codis, sessionId, refId) => (codis || []).find((c) => same(c, sessionId, refId)) || null;

/** 회차 제목에 이름이 든 모델의 다가오는 촬영 하나 (이주현 · 주현 둘 다 맞춤) */
export function codiDayFor(days, title, today = dayKey()) {
  const t = String(title || "");
  const hit = (m) => {
    const n = String(m || "").trim();
    return !!n && (t.includes(n) || (n.length >= 3 && t.includes(n.slice(1))));
  };
  return (
    (days || [])
      .filter((r) => r.on && r.on >= today && (r.models || []).some(hit))
      .sort((a, b) => a.on.localeCompare(b.on) || (a.createdAt || "").localeCompare(b.createdAt || ""))[0] || null
  );
}

/**
 * 상품 하나 넣고 빼기 → changeKey 함수. made = 코디가 없을 때 만들 모양 {id, name, shootDate, shootId}
 */
export const toggleRefCodi = ({ sessionId, refId, itemId, made }) => (v) => {
  const items = v.items || [];
  const c = items.find((x) => same(x, sessionId, refId));
  if (!c)
    return {
      ...v,
      items: [
        {
          name: "",
          shootDate: "",
          uploadOn: "",
          memo: "",
          ...made,
          itemIds: [itemId],
          refIds: [refId],
          fromRef: { sessionId, refId },
          codiOn: made.codiOn || dayKey(),
          createdAt: made.createdAt || new Date().toISOString(),
        },
        ...items,
      ],
    };
  const ids = c.itemIds || [];
  const itemIds = ids.includes(itemId) ? ids.filter((x) => x !== itemId) : [...ids, itemId];
  if (!itemIds.length && !c.done) return { ...v, items: items.filter((x) => x.id !== c.id) };
  return { ...v, items: items.map((x) => (x.id === c.id ? { ...x, itemIds } : x)) };
};
