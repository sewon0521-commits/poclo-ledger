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
 * 레퍼 사진 하나의 후보(finds) → 고른 것(★추천) 중 드랍
 *   lost = 그 옷 종류에서 고른 게 전부 드랍 [{kind, names}] (⚠ 핵심 빠짐)
 *   part = 일부만 [{kind, n, d}] ('고른 것 2개 중 1개 드랍')
 */
export function refDrops(finds, drops) {
  const kinds = new Map();
  for (const f of finds || []) {
    if (!f.pick) continue;
    const k = f.kind || "기타";
    if (!kinds.has(k)) kinds.set(k, []);
    kinds.get(k).push(f);
  }
  const lost = [];
  const part = [];
  for (const [kind, fs] of kinds) {
    const dd = fs.filter((f) => dropOf(drops, f));
    if (!dd.length) continue;
    if (dd.length === fs.length) lost.push({ kind, names: dd.map((f) => f.name || f.gid) });
    else part.push({ kind, n: fs.length, d: dd.length });
  }
  return { lost, part };
}

export const lostText = (lost) => lost.map((l) => `${l.kind}(${l.names.join("·")})`).join(", ");
export const partText = (p) => `${p.kind} 고른 것 ${p.n}개 중 ${p.d}개 드랍`;
