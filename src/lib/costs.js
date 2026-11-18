// 손익 비용 기준 (2026-11-18) — 세원: "매출장부~손익까지 최신 업데이트 된걸로 변경해야될 것 같아. 삼촌비 넣기는 내가 달마다 계산해서 넣을꺼고,
//   월 고정비는 직접 구독, 고정 지출 여기서 가져오게 해주고, 결제 수수료도 너가 다시 한번 정리해줘. 택배비는 넥스트팩에서 주는걸로 맞춰야될 것 같고, 부자재도 마찬가지야."
//
// 여기서 만드는 ctx 하나를 buildDays(sales.js) 가 받아 하루 손익에 쓴다. 손익·홈·판매가 계산기·광고 증액 판단·재무 비서가 다 같은 ctx 를 본다.
//
// ① 삼촌비   달마다 세원이 넣는다(conf.monthly[ym].samchon). 그 달에 월 금액이 있으면 그 달 날짜별 값(예전 samchonDaily)은 안 더한다.
// ② 고정비   돈 › 구독 · 고정 지출 목록(settings subscriptions)의 그 달 합계. 연간 ÷ 12, 시작한 달부터, 해지는 해지한 날의 전 달까지.
//            conf.monthly[ym].fixed 를 넣으면 그 달만 덮는다.
// ③ 수수료   결제수단 5개 실제 요율(settle.js CHANNELS, 정산 달력에서 고친 값이 먼저) × 그날 결제수단별 결제액(− 그 결제의 환불).
//            결제수단별 금액은 settings pay_mix {days:{날짜:{ch:금액}}} — 사무실 PC settle_feed.py 가 새벽마다 쌓는다(settle_orders 는 60일만 남아서).
//            자료가 없는 날(9/20 전)은 그동안 쌓인 결제수단 비중으로 낸 평균 요율 × 순매출.
// ④ 물류비   넥스트팩 계약 단가(부가세 별도 → × 1.1). 정산서·청구서가 오면 그 달은 실제 금액으로 덮는다(conf.monthly[ym].np · shipTotal).
//            2026-09 까지는 사무실 택배(CJ) — 청구액(shipTotal) 이 있으면 그것 + 부자재 개당, 없으면 예전 건당 가정값.

import { withKinds, kindOf } from "./subs";
import { CHANNELS } from "./settle";

export const VAT = 1.1;

// 넥스트팩 물류위탁계약서 별첨1 (부가세 별도). 11/17 바탕화면 물류위탁계약서_포클로.pdf
export const NP_RATES = {
  ship: 2400, // 택배 극소 (아우터 소 3,050 · 중 3,600 — 상자 크기는 몰라서 극소로 추정)
  out: 100, // 출고 / 건
  bag: 105, // 택배봉투 / 건
  poly: 65, // 포장폴리 / 나간 장
  inbound: 800, // 입고·검수·폴리백 / 들어온 장
  barcode: 100, // 바코드 / 들어온 장
  combine: 100, // 합포 — 한 주문 3장째부터 장당
  wms: 50000, // WMS / 월
  storage: 150, // 보관 / 장 (월말 재고, 행거는 300)
  buy: 400, // 사입 대행 / 곳
  ret: 3200, // 반품 / 건 (회수 택배 포함)
};
export const NP_START = "2026-10"; // 넥스트팩 입고가 시작된 달 — 이 달부터 정산서가 없으면 넥스트팩 단가로 추정

// 정산서 항목 (conf.monthly[ym].np) — 모두 부가세 포함 금액
export const NP_ITEMS = [
  ["ship", "택배비", ""],
  ["material", "부자재", "택배봉투·폴리"],
  ["work", "작업비", "입고·바코드·출고·합포"],
  ["storage", "보관료", ""],
  ["wms", "WMS", ""],
  ["ret", "반품", ""],
  ["buy", "사입", "곳당 400원"],
  ["etc", "기타", ""],
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const npTotal = (np) => NP_ITEMS.reduce((a, [k]) => a + num(np?.[k]), 0);
/** 그 달에 실제 금액(넥스트팩 정산서 또는 사무실 택배 청구액)이 들어와 있나 */
export const hasActual = (M) => npTotal(M?.np) > 0 || num(M?.shipTotal) > 0;

// ---------------------------------------------------------------- ② 고정비

/** 구독 하나가 그 달에 얼마 나가나 — 시작한 달부터, 해지는 해지한 날의 전 달까지. 해지했는데 날짜가 없으면 0 */
export function subMonthAmount(s, ym) {
  if (!s?.start || ym < s.start.slice(0, 7)) return 0;
  if (s.status === "ended") {
    if (!s.endedOn || ym >= s.endedOn.slice(0, 7)) return 0;
  }
  const p = num(s.price);
  return s.cycle === "year" ? p / 12 : p;
}

/** 구독 목록 → (달) => {total, kinds:[{k, v, items:[{name, v}]}], noEnd:[해지했는데 날짜 빈 이름]} */
export function subsMonthly(value) {
  const v = withKinds(value || {});
  const items = v.items || [];
  const kinds = v.kinds || [];
  const memo = {};
  return (ym) => {
    if (memo[ym]) return memo[ym];
    const by = new Map();
    let total = 0;
    for (const s of items) {
      const a = subMonthAmount(s, ym);
      if (!a) continue;
      const k = kindOf(s, kinds);
      if (!by.has(k)) by.set(k, { k, v: 0, items: [] });
      const g = by.get(k);
      g.v += a;
      g.items.push({ name: s.name, v: a, cycle: s.cycle });
      total += a;
    }
    const order = (k) => {
      const i = kinds.indexOf(k);
      return i < 0 ? 99 : i;
    };
    const out = {
      total,
      kinds: [...by.values()].sort((a, b) => order(a.k) - order(b.k)),
      noEnd: items.filter((s) => s.status === "ended" && !s.endedOn && num(s.price) > 0).map((s) => s.name),
    };
    memo[ym] = out;
    return out;
  };
}

// ---------------------------------------------------------------- ③ 수수료

export const FEE_CHANNELS = CHANNELS.map((c) => ({ k: c.k, name: c.name, color: c.color }));
export const CH_NAME = { ...Object.fromEntries(CHANNELS.map((c) => [c.k, c.name])), cash: "무통장입금", etc: "그 밖" };

/** 결제수단별 요율(%) — 정산 달력에서 고친 값(settle_rules)이 먼저. 무통장 0, 그 밖은 카페24 페이먼츠와 같게 */
export function feeRates(saved) {
  const out = {};
  for (const c of CHANNELS) out[c.k] = num(saved?.[c.k]?.fee ?? c.rule.fee);
  out.cash = 0;
  out.etc = out.c24;
  return out;
}

/** settle_orders 줄 → {날짜: {ch: 결제액 − 그 결제의 환불}} (결제일 기준) — settle_feed.py pay_mix 와 같은 계산 */
export function mixFromOrders(feed) {
  const out = {};
  for (const r of feed?.rows || []) {
    const [ch, pay, , , , amt, refund] = r;
    if (!pay) continue;
    const d = (out[pay] ||= {});
    d[ch] = (d[ch] || 0) + num(amt) - num(refund);
  }
  return out;
}

/** 하루 수수료 — 결제수단별 금액 × 요율 */
export function mixFee(mix, rates) {
  let fee = 0;
  let base = 0;
  for (const [ch, a] of Object.entries(mix || {})) {
    const v = Math.max(0, num(a));
    base += v;
    fee += (v * num(rates[ch] ?? rates.etc)) / 100;
  }
  return { fee, base };
}

/** 쌓인 결제수단 비중으로 낸 평균 요율(%) — 결제수단 자료가 없는 날에 쓴다. 자료가 아예 없으면 null */
export function blendRate(days, rates) {
  let fee = 0;
  let base = 0;
  for (const mix of Object.values(days || {})) {
    const r = mixFee(mix, rates);
    fee += r.fee;
    base += r.base;
  }
  return base > 0 ? (fee / base) * 100 : null;
}

// ---------------------------------------------------------------- ④ 물류비

const ARRIVED = new Set(["buy", "defect", "pendingOut", "defectOut"]); // 실제로 들어온 물건 (미송 'pending' 은 아직 안 옴)
export const isNextpackTx = (t) => /넥스트팩|3pl/i.test(String(t?.memo || ""));

/** 매입 장부 넥스트팩 줄 → 달마다 {inbound: 들어온 장수, buy: 사입한 곳(거래처 × 날짜) 수} */
export function nextpackIn(tx) {
  const out = {};
  const places = {};
  for (const t of tx || []) {
    if (!t?.date || !isNextpackTx(t)) continue;
    const ym = t.date.slice(0, 7);
    const m = (out[ym] ||= { inbound: 0, buy: 0 });
    for (const it of t.items || []) {
      const k = it.kind || (it.pending ? "pending" : "buy");
      if (ARRIVED.has(k)) m.inbound += Math.max(0, num(it.qty));
    }
    const key = `${t.vendorId || t.vendor || ""}|${t.date}`;
    (places[ym] ||= new Set()).add(key);
  }
  for (const [ym, s] of Object.entries(places)) out[ym].buy = s.size;
  return out;
}

/** 넥스트팩 보관 재고(장) — settings stock.nextpack 의 지금 재고 */
export const stockQty = (stock) => (stock?.nextpack?.rows || []).reduce((a, r) => a + Math.max(0, num(r.qty)), 0);

/**
 * 넥스트팩 단가로 그 달 물류비 추정 (부가세 포함). agg = 그 달 {orders, qty, extra(3장째부터 장수), gross, refund}
 * 나뉘는 방법: 건당·장당은 그날 건수·장수로, 입고·사입·반품은 건수 비율로, WMS·보관은 날수로(dayParts 가 한다).
 */
export function npEstimate(agg, inn, stock) {
  const R = NP_RATES;
  const inbound = inn?.inbound > 0 ? inn.inbound : agg.qty; // 매입 장부 넥스트팩 줄이 없으면 판매 장수
  const avgOrder = agg.orders > 0 ? agg.gross / agg.orders : 0;
  const returns = avgOrder > 0 ? Math.round(agg.refund / avgOrder) : 0; // 환불액 ÷ 평균 주문 — 반품 건수 어림
  const L = {
    ship: agg.orders * R.ship,
    material: agg.orders * R.bag + agg.qty * R.poly,
    work: agg.orders * R.out + agg.extra * R.combine + inbound * (R.inbound + R.barcode),
    storage: stock * R.storage,
    wms: R.wms,
    ret: returns * R.ret,
    buy: (inn?.buy || 0) * R.buy,
  };
  for (const k of Object.keys(L)) L[k] *= VAT;
  return { lines: L, total: Object.values(L).reduce((a, b) => a + b, 0), inbound, inboundFrom: inn?.inbound > 0 ? "매입 장부" : "판매 장수", returns, stock, buyPlaces: inn?.buy || 0 };
}

// ---------------------------------------------------------------- ctx

/**
 * 손익 계산 재료 한 묶음. buildDays(daily, costs, monthly, ctx) 의 ctx.
 *   subs        settings subscriptions 값        stock   settings stock
 *   payMix      settings pay_mix 값({days})      feed    settings settle_orders (pay_mix 가 아직 없는 최근 날을 채운다)
 *   rules       settings settle_rules            meta    settings meta_daily (장부 광고비가 0 인 날 메타 하루 기록으로)
 *   tx          매입 장부(넥스트팩 입고·사입)    samchonDaily  예전 날짜별 삼촌비
 */
export function makeCtx({ subs, payMix, feed, rules, stock, meta, tx, samchonDaily } = {}) {
  const rates = feeRates(rules);
  // 쌓아 둔 것 위에 최근 60일 원자료를 얹는다(같은 계산 — 원자료가 더 새것)
  const mixDays = { ...(payMix?.days || {}), ...mixFromOrders(feed) };
  return {
    subs: subs ? subsMonthly(subs) : null,
    rates,
    mix: mixDays,
    blend: blendRate(mixDays, rates),
    np: nextpackIn(tx),
    stock: stockQty(stock),
    meta: meta?.days || {},
    samchonDaily: samchonDaily || {},
  };
}
