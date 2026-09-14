// 판매가 계산기 — 공급가를 넣으면 판매가마다 한 벌에 얼마 남는지.
//
// 구글 시트 '고정 단가표'를 앱으로 옮긴 것이다. 시트와 다른 점은 **가정값을 손으로 넣지
// 않는다**는 것 — 앱은 실제 숫자를 알고 있으므로 최근 30일(원가까지 아는 날) 실제 평균을 쓴다.
//
//   한 벌 매출   = 판매가 + 한 벌당 실제 배송비 수입
//                  (시트는 상품마다 3,000원을 더했는데, 여러 벌 주문이면 배송비는 한 번만
//                   받으므로 부풀었다. 실제로는 한 벌에 그보다 적게 들어온다.)
//   한 벌 비용   = 공급가 + 부자재 + 한 벌당 실제 택배비
//                + 결제수수료(실제 평균율) + 광고비(목표 18% 또는 실제) + 부가세(간이, 대략)
//   남는 돈      = 한 벌 매출 − 한 벌 비용
//
// 판매가·정상가 규칙은 상품등록(poclo-cafe24/register.py)과 같다.

import { TARGET_AD_RATE } from "./sales";

export const DEFAULT_PRICING = {
  adBasis: "target", // "target" = 목표 18% · "actual" = 최근 30일 실제
  targetMargin: 25, // 이 이익률을 넘는 가장 싼 판매가를 짚어 준다 (%)
  vat: 1.5, // 간이과세 소매업 대략 — 매출의 약 1.5%. 일반과세 전환 후엔 달라진다 (%)
};

/** 기본 판매가 — 공급가 2배 이상, 끝자리 800원 (register.price_of 와 같다) */
export function basePrice(supply) {
  const base = Math.round(supply) * 2;
  return base % 1000 <= 800
    ? Math.floor(base / 1000) * 1000 + 800
    : (Math.floor(base / 1000) + 1) * 1000 + 800;
}

/** 정상가(소비자가) = (판매가 + 3,000) × 1.2 — register.retail_of 와 같다 */
export const retailOf = (price) => Math.round((price + 3000) * 1.2);

/** 판매가 후보 — 기본 판매가 앞뒤로 1,000원 간격, 끝자리 800 */
export function candidates(supply) {
  if (!(supply > 0)) return [];
  const base = basePrice(supply);
  const out = [];
  for (let k = -3; k <= 6; k++) {
    const p = base + k * 1000;
    if (p > supply) out.push(p);
  }
  return out;
}

/**
 * 최근 30일(원가까지 아는 날) 실제 평균 — 한 벌 기준.
 * `days` 는 buildDays/useDays 결과(dayPnl 줄들).
 */
export function actualRates(days, costs) {
  const known = days.filter((d) => d.hasOrders).slice(-30);
  const t = { qty: 0, shipIncome: 0, shipping: 0, fee: 0, goods: 0, ads: 0, revenue: 0 };
  for (const d of known) for (const k of Object.keys(t)) t[k] += d[k] || 0;

  if (!known.length || !t.qty) {
    // 데이터가 없을 때만 — 비용 가정값으로 버틴다
    return {
      days: 0,
      shipIncome: 0,
      shipping: costs.shipCost || 0,
      material: costs.material || 0,
      feeRate: (costs.pg || 0) / 100,
      adRate: TARGET_AD_RATE,
      from: "",
      to: "",
    };
  }
  return {
    days: known.length,
    from: known[0].date,
    to: known.at(-1).date,
    shipIncome: t.shipIncome / t.qty,
    shipping: t.shipping / t.qty,
    material: costs.material || 0,
    feeRate: t.goods ? t.fee / t.goods : (costs.pg || 0) / 100,
    adRate: t.revenue ? (t.ads / t.revenue) * 100 : TARGET_AD_RATE,
  };
}

/** 판매가 하나에 대한 한 벌 손익 */
export function priceResult(supply, price, rates, settings) {
  const s = { ...DEFAULT_PRICING, ...settings };
  const adRate = s.adBasis === "actual" ? rates.adRate : TARGET_AD_RATE;
  const revenue = price + rates.shipIncome;
  const lines = {
    supply,
    material: rates.material,
    shipping: rates.shipping,
    fee: revenue * rates.feeRate,
    ads: (revenue * adRate) / 100,
    vat: (revenue * s.vat) / 100,
  };
  const cost = Object.values(lines).reduce((a, b) => a + b, 0);
  const profit = revenue - cost;
  return {
    price,
    retail: retailOf(price),
    revenue,
    ...lines,
    adRate,
    cost,
    profit,
    margin: revenue ? (profit / revenue) * 100 : 0,
    costRate: price ? (supply / price) * 100 : 0,
    meets: revenue ? (profit / revenue) * 100 >= s.targetMargin : false,
  };
}

/** 이름에서 검색용 열쇠 — 띄어쓰기·대소문자 무시 */
export const searchKey = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
