/**
 * 소싱 관리 레퍼런스 룩의 옷 종류 칸 · 칸마다 '제일 잘 맞음' (10/20) — 소싱 관리(ShootPlan)와 신상 관리(ShootItems)가 같이 쓴다.
 *
 * 회차(settings shoot_sessions)의 refLooks[레퍼런스 id] = {text, memo, itemIds, groups: {상품 id: 칸}, best: {칸: [상품 id…]}}.
 * 11/16 세원: "상의에서 두 개를 레이어드해서 입어야 되는데 하나밖에 제일 잘 맞음이 안 돼" → 칸마다 여러 개(배열). 예전 값(상품 id 하나, 문자열)도 읽는다.
 * 칸 = 신상 관리 옷 종류(촬영 레퍼런스 꼬리표 clothes) + 기타. 옮긴 칸(groups)이 먼저, 없으면 상품 종류.
 *
 * 10/21 세원: "제일 잘 맞음 해 둔 거 신상 관리에서도 보이게 — 썸네일 오른쪽 위에 별표, 거슬리지 않게. 마우스 올리면 소싱일 딱 뜨게,
 * 별표 친 걸 한 번에 볼 수 있게. 나중에 샘플 내려올 때 별표만 보고 따로 비닐 빼 놔서 중요 행거에 걸어 둘 수 있게" → starsOf.
 */
export const GROUP_ETC = "기타";
const DEFAULT_KINDS = ["상의", "하의", "원피스·세트", "아우터", "신발·잡화"];
export const lookKinds = (tags) => [...(tags?.clothes?.length ? tags.clothes : DEFAULT_KINDS), GROUP_ETC];
export const lookGroupOf = (kinds, groups = {}) => (x) => (kinds.includes(groups[x.id]) ? groups[x.id] : kinds.includes(x.kind) ? x.kind : GROUP_ETC);

/** 칸 하나의 제일 잘 맞음 → 상품 id 목록 (예전 문자열 하나도) */
export const bestIds = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
/** 칸마다 제일 잘 맞는 상품들 {칸: [id…]} — 그 상품이 다른 칸으로 옮겨졌거나 빠졌으면 없는 것으로 */
export const lookBest = (look, items, groupOf) => {
  const out = {};
  for (const [g, v] of Object.entries(look.best || {})) {
    const ids = bestIds(v).filter((id) => items.some((x) => x.id === id && groupOf(x) === g));
    if (ids.length) out[g] = ids;
  }
  return out;
};
export const isBest = (best, g, id) => (best?.[g] || []).includes(id);
/** ☆ 누르기 — 그 칸에 더하거나 빼기 (여러 개 가능) */
export const bestPatch = (look, g, id) => {
  const next = { ...(look.best || {}) };
  const ids = bestIds(next[g]);
  const n = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  if (n.length) next[g] = n;
  else delete next[g];
  return { best: next };
};

/**
 * 상품 id → [{sessionId, on, title, group}] — 어느 소싱의 어느 칸에서 '제일 잘 맞음'으로 골랐나. 최근 소싱 먼저.
 * sessions = shoot_sessions items, items = 신상 관리 상품, tags = shoot_tags
 */
export function starsOf(sessions, items, tags) {
  const kinds = lookKinds(tags);
  const byId = new Map((items || []).map((x) => [x.id, x]));
  const out = new Map();
  for (const s of sessions || []) {
    for (const look of Object.values(s.refLooks || {})) {
      if (!look?.best) continue;
      const its = (look.itemIds || []).map((id) => byId.get(id)).filter(Boolean);
      const best = lookBest(look, its, lookGroupOf(kinds, look.groups));
      for (const [group, ids] of Object.entries(best))
        for (const id of ids) {
          const list = out.get(id) || [];
          if (!list.some((r) => r.sessionId === s.id && r.group === group)) list.push({ sessionId: s.id, on: s.on || "", title: s.title || "", group });
          out.set(id, list);
        }
    }
  }
  for (const list of out.values()) list.sort((a, b) => (b.on || "").localeCompare(a.on || ""));
  return out;
}

/** '10/21 소싱 · 하의' 꼴 (소싱일이 없으면 회차 이름) */
export const starLabel = (r) => [r.on ? `${+r.on.slice(5, 7)}/${+r.on.slice(8, 10)} 소싱` : r.title || "소싱", r.group].filter(Boolean).join(" · ");
