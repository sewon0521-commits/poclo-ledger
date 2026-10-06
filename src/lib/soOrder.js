// SO+ 발주 변환 (10/6 세원: "넥스트팩 발주 변환기를 우리 ERP 에 넣고, 상품을 보고 단가 칸에 단가를 넣어 줬으면.
// 수량은 SO+ 가 알아서 곱하니까 수량 옆에 한 장 단가만")
//
// 흐름: 이지어드민 발주(request_stock_*.xls/csv) → 줄마다 단가 찾기 → SO+ › 엑셀 사입 관리 › 엑셀 붙여넣기 칸 모양(탭)으로 복사.
// SO+ 열: A 매장명 · B 타입 · C 제품명(도매) · D 색상 · E 사이즈 · F 수량 · G 개당단가 · H 메모 · I 사진링크 · J 코드 · K 샵 제품명
// 넥스트팩 변환기와 같게 — 색상 칸에 옵션 그대로([베이지-M]), 사이즈·사진·코드·샵 제품명은 비움,
// 메모 맨 앞에 '미송가능' / '미송X', 매장·도매 상품명·색상·사이즈가 같은 줄은 수량을 합친다.
//
// 단가 찾는 순서 (한 장 값):
//   ① 매입 장부 — 같은 거래처 장끼에서 같은 도매 상품명의 가장 최근 단가 (실제로 낸 값)
//   ② 판매가 목록 — 우리 상품명(이지어드민 '상품명' = 카페24 상품명) 또는 메모 이름(도매 상품명)의 공급가.
//      1+1 상품은 목록에 한 장·두 장 줄이 같이 있어서 한 장 줄을 고른다.
//   ③ 지난번 이 화면에서 직접 적은 값 (settings so_prices)
// ①과 ②가 다르면 화면에 같이 보여 준다(판매가 목록 공급가가 낡았을 수 있다).

import { parseCsv } from "./sales";

export const SO_TYPES = ["주문", "확인", "환불", "교환미송", "샘플픽업", "샘플결제", "선교요청", "자료픽업", "자료대납", "미송수거", "미송잡기", "장끼픽업", "선차감", "차감", "반송", "교환", "반품", "샘플반납", "선교반납", "자료전달", "매입"];

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const head = (cells, names) => cells.findIndex((c) => names.includes(squash(c)));

/** 도매 상품명에서 뒤에 붙은 '(디오트 1층 c26 / 오드)' 위치를 뗀 이름 — 비교용 */
export const wholesaleKey = (s) => squash(String(s || "").replace(/\s*\([^)]*\)\s*$/, ""));
/** 우리 상품명 비교용 — 앞 [주문폭주] 꼬리표, (3color) 떼기 */
export const shopKey = (s) =>
  squash(
    String(s || "")
      .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
      .replace(/\((\d+\s*colou?rs?|one\s*colou?r|\d+\s*컬러|원컬러)\)/gi, ""),
  );
/** 거래처 이름 조각 — '럽모어 LUVMORE' · '마인디(mineD)' → [럽모어, luvmore] */
const vendorParts = (s) =>
  String(s || "")
    .split(/[\s()/·,]+/)
    .map(squash)
    .filter(Boolean);
export const sameVendor = (a, b) => {
  const pa = vendorParts(a);
  const pb = vendorParts(b);
  return pa.some((x) => pb.includes(x)) || (squash(a) && squash(a) === squash(b));
};

/** 이지어드민 발주 파일 글 → {title, on, rows:[{id, vendor, name, shopName, option, qty, code, memo}]} */
export function parseOrder(text) {
  const all = parseCsv(text || "");
  const at = all.findIndex((r) => head(r, ["공급처상품명", "도매처상품명", "도매상품명"]) >= 0 && head(r, ["제조사", "공급처", "매장명", "거래처"]) >= 0);
  if (at < 0) return null;
  const h = all[at];
  const col = {
    vendor: head(h, ["제조사", "공급처", "매장명", "거래처"]),
    name: head(h, ["공급처상품명", "도매처상품명", "도매상품명"]),
    shopName: head(h, ["상품명", "샵상품명"]),
    option: head(h, ["옵션", "색상"]),
    qty: head(h, ["요청수량", "수량"]),
    code: head(h, ["상품코드"]),
    memo: head(h, ["요청메모", "메모"]),
  };
  const meta = (label) => {
    const line = all.slice(0, at).find((r) => squash(r[0]).startsWith(squash(label)));
    return line ? String(line[0]).split(":").slice(1).join(":").trim() : "";
  };
  const cell = (r, k) => (col[k] >= 0 ? String(r[col[k]] || "").trim() : "");
  const rows = [];
  for (const r of all.slice(at + 1)) {
    const vendor = cell(r, "vendor");
    const name = cell(r, "name");
    if (!vendor || vendor === "합계" || !name) continue;
    rows.push({
      id: `${rows.length}-${cell(r, "code") || name}`,
      vendor,
      name,
      shopName: cell(r, "shopName"),
      option: cell(r, "option"),
      qty: Math.max(0, parseInt(cell(r, "qty").replace(/[^\d-]/g, ""), 10) || 0),
      code: cell(r, "code"),
      memo: cell(r, "memo"),
    });
  }
  return { title: meta("전표명"), on: meta("요청일"), rows };
}

const mmdd = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");

/**
 * 한 줄의 단가 찾기 → {price, from, note, alt}
 *   from: "ledger" | "pricing" | "memory" | ""   note: 화면에 보일 출처   alt: 다른 출처 값이 다르면 그 설명
 */
export function findPrice(row, { tx, vendors, pricing, memory }) {
  const vname = Object.fromEntries((vendors || []).map((v) => [v.id, v.name]));
  const w = wholesaleKey(row.name);

  // ① 매입 장부 — 같은 거래처, 같은 도매 상품명(장끼 품목은 '이름/ 색상' 꼴이라 / 앞만)
  let led = null;
  if (w) {
    for (const t of tx || []) {
      if (!sameVendor(vname[t.vendorId] || "", row.vendor)) continue;
      for (const it of t.items || []) {
        const base = squash(String(it.name || "").split("/")[0]);
        const price = Math.round(Number(it.unitPrice) || 0);
        if (!base || price <= 0) continue;
        const hit = base === w || (w.length >= 3 && base.startsWith(w)) || (base.length >= 3 && w.startsWith(base));
        if (hit && (!led || t.date > led.date)) led = { price, date: t.date, item: it.name };
      }
    }
  }

  // ② 판매가 목록 — 우리 상품명 → 없으면 메모 이름(도매 상품명)
  const s = shopKey(row.shopName);
  let cands = s ? (pricing || []).filter((p) => p.supply > 0 && shopKey(p.name) === s) : [];
  if (!cands.length && w) cands = (pricing || []).filter((p) => p.supply > 0 && p.memoName && wholesaleKey(p.memoName) === w);
  if (cands.length > 1) {
    const sameV = cands.filter((p) => !p.vendor || sameVendor(p.vendor, row.vendor));
    if (sameV.length) cands = sameV;
  }
  let pri = null;
  if (cands.length) {
    // 1+1 상품: 한 장 줄(메모에 1+1 이 없는 줄)을 고른다. 두 장 줄만 있으면 반으로.
    const single = cands.filter((p) => !/1\s*\+\s*1/.test(p.memoName || ""));
    if (single.length) {
      const p = single.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0];
      pri = { price: Math.round(p.supply), name: p.name };
    } else {
      const p = cands[0];
      pri = { price: Math.round(p.supply / 2), name: p.name, half: true };
    }
  }

  const mem = memory?.[memoryKey(row)];
  if (led) {
    return {
      price: led.price,
      from: "ledger",
      note: `장끼 ${mmdd(led.date)}`,
      alt: pri && pri.price !== led.price ? `판매가 목록 공급가는 ${pri.price.toLocaleString("ko-KR")}원` : "",
    };
  }
  if (pri) return { price: pri.price, from: "pricing", note: pri.half ? "판매가 목록 1+1 ÷ 2" : "판매가 목록", alt: "" };
  if (mem?.price > 0) return { price: mem.price, from: "memory", note: `지난번 적은 값 ${mmdd(mem.on)}`, alt: "" };
  return { price: null, from: "", note: "", alt: "" };
}

/** 직접 적은 단가 기억 키 — 거래처 + 도매 상품명 */
export const memoryKey = (row) => `${vendorParts(row.vendor)[0] || squash(row.vendor)}|${wholesaleKey(row.name)}`;

/** SO+ 에 붙일 줄 — 같은 매장·도매 상품명·색상(옵션)·타입은 수량을 합친다 */
export function soLines(rows, type) {
  const out = [];
  const byKey = new Map();
  for (const r of rows) {
    const k = [r.vendor, r.name, r.option].map(squash).join("|");
    const had = byKey.get(k);
    if (had) {
      had.qty += r.qty;
      continue;
    }
    const line = { ...r, qty: r.qty };
    byKey.set(k, line);
    out.push(line);
  }
  return out.map((r) => {
    const memo = [r.miss === "no" ? "미송X" : r.miss === "yes" ? "미송가능" : "", r.memo].filter(Boolean).join(" ");
    const cells = [r.vendor, type || "주문", r.name, r.option, "", String(r.qty), r.price > 0 ? String(Math.round(r.price)) : "", memo, "", "", ""];
    return cells.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t");
  });
}
