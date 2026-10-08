import { createContext } from "react";
import { won } from "./sales";
import { basePrice, searchKey } from "./pricing";

/**
 * 신상 관리 상품 창 안의 판매가 (10/8 세원: "상품등록할 때 신상 관리에서 상품 내용을 보면서 하는데, 단가를 맞추려고
 * 돈 › 판매가 계산기에 갔다 오는 게 동선상 비효율적. 여기서 판매가를 만들 수 있게, 1+1 도 같이.")
 *
 * 계산은 판매가 계산기와 똑같다(lib/pricing — 최근 30일 실제 평균 · 목표 이익률 · 광고비 기준은 계산기 설정 그대로).
 * 정한 값은 상품에 sellPrice · pair · price1p1 로 두고, 상품을 저장하면 돈 › 판매가 목록에도 담긴다(pricingId 로 이어짐 —
 * 등록 뒤 새벽 잇기(pricing_link.py)가 우리 상품명으로 바꿔도 같은 줄을 고친다). 판매가를 비워 두면 목록에 안 담는다.
 * App 이 PricingCtx 로 {rows, conf, items, save} 를 내려 준다. 화면은 components/PriceBox.jsx.
 */
export const PricingCtx = createContext(null);

export const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");
export const toNum = (s) => Number(digits(s) || 0);
const firstWord = (s) => searchKey(String(s || "").trim().split(/\s+/)[0]);

/** 판매가 목록에서 이 상품 줄 — 이어진 줄(pricingId) → 같은 이름(거래처 상품명·신마 상품명) + 같은 거래처 */
export function pricingRowOf(x, items) {
  if (!items?.length) return null;
  if (x.pricingId) {
    const r = items.find((i) => i.id === x.pricingId);
    if (r) return r;
  }
  const keys = [x.name, x.fullName].map(searchKey).filter(Boolean);
  if (!keys.length) return null;
  return (
    items.find(
      (i) =>
        (keys.includes(searchKey(i.memoName)) || keys.includes(searchKey(i.name))) &&
        ((x.vendorId && i.vendorId === x.vendorId) || (firstWord(i.vendor) && firstWord(i.vendor) === firstWord(x.vendor))),
    ) || null
  );
}

/** 1+1 판매가 — 비우면 공급가 2장 기준 기본 판매가 */
export const pairPriceOf = (x) => (x.pair ? toNum(x.price1p1) || (toNum(x.price) ? basePrice(toNum(x.price) * 2) : 0) : 0);

/** 접힌 '가격' 칸 제목 옆 한 줄 */
export function priceSummary(x) {
  const parts = [];
  if (toNum(x.price)) parts.push(`도매 ${won(toNum(x.price))}`);
  if (toNum(x.sellPrice)) parts.push(`판매 ${won(toNum(x.sellPrice))}`);
  if (toNum(x.sellPrice) && x.pair) parts.push(`1+1 ${won(pairPriceOf(x))}`);
  if (toNum(x.price) && !toNum(x.sellPrice)) parts.push("판매가 아직");
  return parts.join(" · ");
}

/**
 * 상품을 저장할 때 판매가 목록에 담을 것 — 판매가를 정했을 때만. {id, patch} (id "" = 새 줄, patch null = 목록 값과 같아서 안 씀) 또는 null.
 * 이미 있는 줄은 숫자만 고친다 — 이름은 새벽 잇기가 우리 상품명으로 바꿔 둔 것일 수 있어서 안 건드린다.
 */
export function pricingChange(x, items) {
  const supply = toNum(x.price);
  const price = toNum(x.sellPrice);
  if (!supply || !price) return null;
  const price1p1 = pairPriceOf(x);
  const row = pricingRowOf(x, items);
  if (row) {
    if (row.supply === supply && row.price === price && (row.price1p1 || 0) === price1p1) return { id: row.id, patch: null };
    return { id: row.id, patch: { supply, price, price1p1 } };
  }
  return { id: "", patch: { name: String(x.name || x.fullName || "").trim(), vendor: x.vendor || "", vendorId: x.vendorId || "", supply, price, price1p1, from: "신상 관리" } };
}

