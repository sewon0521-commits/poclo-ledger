// 신마 후보 ↔ 신상 관리 드랍 (11/16 세원(방향성 창): "코디를 짜고 샘플 요청을 했는데 안 내려준다고 해서 내가 드랍을 한 제품들이
//   만약 요번 코디의 핵심이면 소싱관리 내에서 표시" · "신마 후보에 만약 드랍이 됐으면 뜨게")
// 새로 저장하는 것 없음 — 읽어서 잇기만:
//   후보 sinma_finds_<회차>.items[].gid  ↔  신상 관리 shoot_items[].goodsId (문자열로)  →  stage drop · trash · refused
//   거절 기록 sample_refusals (itemIds 에 그 상품) — 거래처 · 날짜 · 이유
// '핵심' = 레퍼 사진 하나에서 ★추천(pick)한 후보 중 같은 옷 종류(kind)가 전부 드랍이면 — 세원이 따로 ⭐ 안 눌러도 되게.
import { md } from "./shoot";

const gone = (x) => x.stage === "drop" || x.stage === "trash" || !!x.refused;

/** 드랍된 신마 상품번호 → {label, line} (이어진 신상 관리 상품이 하나라도 살아 있으면 드랍 아님) */
export function sinmaDrops(items, refusals) {
  const by = new Map();
  for (const x of items || []) {
    const g = String(x.goodsId || "").trim();
    if (!g) continue;
    if (!by.has(g)) by.set(g, []);
    by.get(g).push(x);
  }
  const out = new Map();
  for (const [g, xs] of by) {
    if (!xs.every(gone)) continue;
    const x = xs.find((y) => y.refused) || xs[0];
    const rec = (refusals || []).find((r) => (r.itemIds || []).includes(x.id));
    const vendor = (rec?.vendor || x.vendor || "").trim();
    if (x.refused) {
      const why = [...(rec?.reasons || []), rec?.note].filter(Boolean).join(", ") || x.refusedWhy || "";
      const head = rec?.scope === "vendor" || (rec && !rec.scope) ? "샘플 거절(거래처 전체)" : "샘플 거절";
      out.set(g, { label: "샘플 거절", line: [head, vendor, md(rec?.on || x.refusedOn || ""), why].filter(Boolean).join(" · ") });
    } else if (x.stage === "trash") out.set(g, { label: "휴지통", line: ["휴지통", vendor, md(x.trashedOn || "")].filter(Boolean).join(" · ") });
    else out.set(g, { label: "보류·드랍", line: ["보류·드랍", vendor].filter(Boolean).join(" · ") });
  }
  return out;
}

export const dropOf = (drops, f) => (drops && f?.gid != null ? drops.get(String(f.gid)) : undefined) || null;

/**
 * 레퍼 사진 하나의 후보(finds) → 자리마다 드랍
 *   자리 = 후보의 slot(레퍼 안 옷 자리 — '반팔 니트'·'이너'·'아우터'·'신발', 소싱 창이 넣음) · 없으면 옷 종류(kind)
 *   (11/16 방향성: kind 로만 보면 놓친다 — 1번 사진 차콜 반팔 니트 후보 둘이 다 거절인데 같은 '상의'인 스트라이프 이너가 살아 있어서 경고가 안 떴다)
 *   보는 후보 = 그 자리에서 ★추천한 것. slot 자리는 ★추천이 하나도 없으면 그 자리 후보 전부(자리가 통째로 비었는지).
 *   lost = 보는 후보가 전부 드랍 [{kind(자리 이름), names}] (⚠ 핵심 빠짐) · part = 일부만 [{kind, n, d}] ('고른 것 2개 중 1개 드랍')
 */
export function refDrops(finds, drops) {
  const slots = new Map();
  for (const f of finds || []) {
    const slot = String(f.slot || "").trim();
    const k = slot ? `s:${slot}` : `k:${f.kind || "기타"}`;
    if (!slots.has(k)) slots.set(k, { name: slot || f.kind || "기타", bySlot: !!slot, all: [] });
    slots.get(k).all.push(f);
  }
  const lost = [];
  const part = [];
  for (const { name, bySlot, all } of slots.values()) {
    const picks = all.filter((f) => f.pick);
    const fs = picks.length ? picks : bySlot ? all : [];
    if (!fs.length) continue;
    const dd = fs.filter((f) => dropOf(drops, f));
    if (!dd.length) continue;
    if (dd.length === fs.length) lost.push({ kind: name, names: dd.map((f) => f.name || f.gid) });
    else part.push({ kind: name, n: fs.length, d: dd.length, all: !picks.length });
  }
  return { lost, part };
}

export const lostText = (lost) => lost.map((l) => `${l.kind}(${l.names.join("·")})`).join(", ");
export const partText = (p) => `${p.kind} ${p.all ? "후보" : "고른 것"} ${p.n}개 중 ${p.d}개 드랍`;
