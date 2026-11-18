// 매출 쪽 계산. 매입 장부가 '산 돈'을 보듯 여기는 '판 돈'을 본다.
//
// 매출을 두 단계로 나눠 본다. 섞으면 둘 다 못 본다.
//
//   총매출  그날 실제로 팔린 금액. 취소·반품을 아직 안 뺐다.
//           광고가 만들어 낸 매출이므로 **광고비는 여기에 대고 본다.**
//   순매출  거기서 취소·반품을 뺀 것. 실제로 남은 돈이므로 **손익은 여기서 낸다.**
//
// 매출은 **카페24 애널리틱스 › 매출분석**을 그대로 따른다.
//
//   총매출 = 결제합계          (배송비 포함)
//   순매출 = 결제합계 − 환불합계
//
// 주문 API로 매출을 세지 않는다. 네이버페이 주문의 30%가 결제액 0원으로 내려와서
// 매출이 실제보다 낮게 잡히기 때문이다(2026-08 기준 정가 484만원어치). 주문 API는
// **원가·수량·건수·네이버 비중**을 얻는 데만 쓴다 — 이 값들은 결제액과 무관하다.
//
// 기준일이 다르다는 것만 알고 있으면 된다 — 카페24는 **결제완료일**, 주문 API는
// **주문일**. 하루로는 어긋나고 월로는 거의 맞는다.
//
// 원자료 세 가지
//   카페24 애널리틱스 › 매출분석 › 일별 CSV   → 총매출·환불·배송비
//   poclo-cafe24/orders.py 의 orders_일별.csv → 순매출·원가·수량·건수
//   메타 광고 관리자 '일' 단위 CSV            → 광고비

import { hasActual, mixFee, npEstimate, npTotal, NP_ITEMS, NP_RATES, NP_START, VAT } from "./costs";

export const TARGET_AD_RATE = 18; // 목표 광고비율 (%)

// 11/18 부터 손익은 costs.js 의 기준(구독 목록·결제수단 요율·넥스트팩 단가)을 쓴다. 아래는 그 자료가 없을 때만 쓰는 예전 가정값.
export const DEFAULT_COSTS = {
  shipCost: 2300, // 사무실 택배(CJ) 시절 택배비 / 건 (부가세 포함) — 2026-09 까지 청구액이 없는 달에만
  material: 197, // 사무실 포장 부자재 / 개 — 넥스트팩 정산서가 없는 사무실 택배 달에만
  pg: 2.0, // 결제수단 자료가 하나도 없을 때만 (네이버 외)
  naver: 3.74, // 〃 (네이버페이)
  fixed: 1200000, // 구독 목록을 못 읽었을 때만
  samchon: 0, // 달마다 넣는 삼촌비의 기본값
};

// 달마다 손으로 넣는 값. conf.monthly['2026-10'] = { samchon, fixed, shipTotal, np:{ship, material, work, storage, wms, ret, buy, etc} }
//   samchon   그 달 삼촌비 (세원이 달마다 계산해서 넣음)
//   fixed     그 달 고정비를 손으로 덮을 때만 (비우면 구독 목록 합계)
//   shipTotal 사무실 택배(CJ 등) 청구액, np 넥스트팩 정산서 항목 — 모두 부가세 포함. 하나라도 있으면 그 달 물류비는 '정산서'
export const MONTH_FIELDS = [
  ["samchon", "삼촌비", "그 달 삼촌에게 준 돈"],
  ["fixed", "고정비 덮기", "비우면 구독 목록 합계"],
  ["shipTotal", "사무실 택배 청구액", "CJ 등 · 부가세 포함"],
];

// toLocaleString("ko-KR") 은 부를 때마다 숫자 형식기를 새로 만들어서 느리다.
// 표 한 장에 수백 번 불리므로(판매가 계산기 목록) 하나를 만들어 두고 돌려 쓴다.
const NUM = new Intl.NumberFormat("ko-KR");
export const won = (n) => NUM.format(Math.round(n || 0));
export const pct = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "0.0");

// ---------------------------------------------------------------- CSV 읽기

/** 따옴표 안의 쉼표·줄바꿈까지 지키는 최소 CSV 파서. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "," || c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 문자열 어디에 있든 YYYY-MM-DD 를 꺼낸다. '2026-08-01(토)' 같은 것도 통과. */
const dateIn = (v) => (String(v ?? "").match(/\d{4}-\d{2}-\d{2}/) || [])[0] || "";

// ---------------------------------------------------------------- 주문 CSV

const DAILY_COLUMNS = {
  gross: ["총매출"],
  refund: ["취소반품액"],
  net: ["순매출", "상품매출"],
  cogs: ["매출원가"],
  qty: ["판매수량"],
  orders: ["확정주문"],
  shipIncome: ["배송비"],
  naverNet: ["네이버매출"],
};

/**
 * orders_일별.csv → 하루 한 줄.
 * 총매출 칸이 없는 옛 파일이면 순매출 + 취소반품액으로 되살린다.
 */
export function parseDaily(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((c) => c.replace(/^﻿/, "").trim());
  if (!head.some((c) => c === "일자")) return [];

  const at = (names) => {
    for (const n of names) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = Object.fromEntries(
    Object.entries(DAILY_COLUMNS).map(([k, names]) => [k, at(names)]),
  );
  const iDate = head.indexOf("일자");

  const out = [];
  for (const r of rows.slice(1)) {
    const date = dateIn(r[iDate]);
    if (!date) continue;
    const get = (k) => (idx[k] >= 0 ? num(r[idx[k]]) : 0);
    const net = get("net");
    const refund = get("refund");
    out.push({
      date,
      net,
      refund,
      gross: get("gross") || net + refund,
      cogs: get("cogs"),
      qty: get("qty"),
      orders: get("orders"),
      shipIncome: get("shipIncome"),
      naverNet: get("naverNet"),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 카페24 애널리틱스 › 매출분석 › 일별 CSV.
 * 맨 위에 안내문이 여러 줄 붙어 오므로 '일자'로 시작하는 줄을 머리글로 찾는다.
 * 일자는 '2026-08-01(토)' 모양이다.
 */
export function parseCafe(text) {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r[0]?.trim() === "일자");
  if (h < 0) return [];
  const head = rows[h].map((c) => c.trim());
  const iDate = 0;
  const iGross = head.indexOf("결제합계");
  const iRefund = head.indexOf("환불합계");
  const iShip = head.indexOf("배송비");
  if (iGross < 0) return [];

  const out = [];
  for (const r of rows.slice(h + 1)) {
    const date = dateIn(r[iDate]);
    if (!date) continue;
    out.push({
      date,
      cafeGross: num(r[iGross]),
      cafeRefund: iRefund >= 0 ? num(r[iRefund]) : 0,
      cafeShip: iShip >= 0 ? num(r[iShip]) : 0,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- 광고 CSV

/**
 * 메타 광고 CSV → { '2026-08-01': 391800, ... }
 * 광고세트별로 여러 줄이 와도 날짜별로 합친다.
 * `날짜 <탭|쉼표> 금액` 두 칸짜리도 받는다.
 */
export function parseAds(text) {
  const rows = parseCsv(text);
  if (!rows.length) return {};
  const head = rows[0].map((c) => c.trim());
  const iDate = head.findIndex((c) => c === "일" || c === "일자" || c === "날짜");
  const iSpend = head.findIndex((c) => c.includes("지출"));

  const out = {};
  const add = (d, v) => {
    if (d && v) out[d] = (out[d] || 0) + v;
  };

  if (iDate >= 0 && iSpend >= 0) {
    for (const r of rows.slice(1)) add(dateIn(r[iDate]), num(r[iSpend]));
    return out;
  }
  // 헤더가 없으면 각 줄에서 날짜 하나 + 숫자 하나를 찾는다
  for (const r of rows) {
    const d = dateIn(r.join(" "));
    if (!d) continue;
    const money = r.map(num).filter((n) => n > 0);
    add(d, money.length ? Math.max(...money) : 0);
  }
  return out;
}

// ---------------------------------------------------------------- 손익

const daysInMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

const n0 = (v) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : 0);
const has = (v) => v !== "" && v != null && Number.isFinite(Number(v));
/** 한 주문 3장째부터 — 하루 단위로 어림(그날 장수 − 건수 × 2) */
const extraOf = (r) => Math.max(0, (r.qty || 0) - 2 * (r.orders || 0));

/**
 * 하루 물류비 줄 (부가세 포함) — 11/18 넥스트팩 기준. 줄 이름은 costs.js NP_ITEMS + cj(사무실 택배) · officeMat(사무실 부자재).
 *   실제 금액이 있는 달(정산서·청구액): 그 금액을 그 달 건수 비율로 나눈다. 넥스트팩이 없는 달은 사무실 부자재(개당)를 더한다.
 *   2026-09 까지(사무실 택배 시절) 실제가 없으면: 건당 택배비 + 개당 부자재 (예전 가정값)
 *   2026-10 부터 실제가 없으면: 넥스트팩 단가 — 건당·장당은 그날 숫자로, 입고·사입·반품은 건수 비율로, WMS·보관은 날수로
 */
function logisticsOf(row, c, M, ym, dim) {
  const orders = row.orders || 0;
  const qty = row.qty || 0;
  const A = M.agg;
  const share = A?.orders > 0 ? orders / A.orders : 0;
  const L = {};
  if (hasActual(M)) {
    const np = M.np || {};
    if (n0(M.shipTotal)) L.cj = n0(M.shipTotal) * share;
    for (const [k] of NP_ITEMS) if (n0(np[k])) L[k] = n0(np[k]) * share;
    if (!npTotal(np)) L.officeMat = qty * c.material;
    return { L, mode: "actual" };
  }
  if (ym < NP_START) {
    L.cj = orders * c.shipCost;
    L.officeMat = qty * c.material;
    return { L, mode: "office" };
  }
  const R = NP_RATES;
  const E = M.est;
  L.ship = orders * R.ship * VAT;
  L.material = (orders * R.bag + qty * R.poly) * VAT;
  L.work = (orders * R.out + extraOf(row) * R.combine) * VAT + (E ? E.inbound * (R.inbound + R.barcode) * VAT * share : 0);
  L.storage = E ? E.lines.storage / dim : 0;
  L.wms = (R.wms * VAT) / dim;
  if (E) {
    L.ret = E.lines.ret * share;
    L.buy = E.lines.buy * share;
  }
  return { L, mode: "est" };
}

/**
 * 하루치 손익. `costs` 는 DEFAULT_COSTS 모양, `monthly` 는 conf.monthly(+ buildDays 가 실은 그 달 합계), `ctx` 는 costs.makeCtx.
 *
 * 광고 성적(광고비율·ROAS)은 총매출로, 이익은 순매출로 낸다.
 */
export function dayPnl(row, costs, fixed, monthly, ctx) {
  const c = { ...DEFAULT_COSTS, ...costs };
  const ym = row.date.slice(0, 7);
  const M = monthly?.[ym] || {};
  const X = ctx || {};
  const dim = daysInMonth(ym);

  // ── 매출: 카페24 애널리틱스가 기준이다
  const revenue = row.cafeGross || 0; // 총매출 (배송비 포함)
  const refund = row.cafeRefund || 0;
  const net = revenue - refund; // 순매출 — 카페24 화면의 '순매출'과 같은 값
  const shipIncome = row.cafeShip || 0; // 그중 배송비
  const goods = net - shipIncome; // 상품매출 — 원가율은 이것에 댄다

  // 손익을 낼 수 있는 날 = 매출도 알고 원가도 아는 날.
  // 한쪽만 있는 날을 손익에 섞으면 이익이 부풀거나 없는 적자가 생긴다.
  const hasOrders = revenue > 0 && ((row.orders || 0) > 0 || (row.cogs || 0) > 0);
  const cogs = row.cogs || 0;

  // ── 비용
  // 물류비 (택배 + 부자재·작업·보관·WMS·반품·사입) — logisticsOf
  const { L: logi, mode: logiMode } = logisticsOf(row, c, M, ym, dim);
  const shipping = (logi.cj || 0) + (logi.ship || 0); // 택배
  const logistics = Object.values(logi).reduce((a, b) => a + b, 0);
  const material = logistics - shipping; // 부자재·작업·보관 등 택배 아닌 것

  // 결제 수수료 — 그날 결제수단별 결제액 × 요율. 자료가 없는 날은 평균 요율 × 순매출(배송비 포함).
  // 둘 다 없을 때만(이 기기 저장 모드 등) 예전 계산(네이버 비중 × 상품매출).
  const mix = X.mix?.[row.date];
  let fee;
  let feeFrom;
  if (mix) {
    fee = mixFee(mix, X.rates || {}).fee;
    feeFrom = "mix";
  } else if (X.blend != null) {
    fee = (net * X.blend) / 100;
    feeFrom = "blend";
  } else {
    const naverShare = row.net > 0 ? Math.min((row.naverNet || 0) / row.net, 1) : 0;
    fee = goods * ((1 - naverShare) * (c.pg / 100) + naverShare * (c.naver / 100));
    feeFrom = "old";
  }

  const variable = logistics + fee;

  // 달 단위로 내는 돈은 그 달 날수로 쪼개 날마다 얹는다(주문 0건인 날도 — 11/18, 그래야 한 달 합이 그 달 금액이 된다)
  // 고정비 = 그 달 손으로 덮은 값 → 구독·고정 지출 목록의 그 달 합계 → 예전 가정값
  const subsMonth = X.subs ? X.subs(ym).total : null;
  const fixedMonth = has(M.fixed) ? Number(M.fixed) : subsMonth ?? c.fixed;
  const fixedDay = fixedMonth / dim;
  // 삼촌비 = 그 달 금액(세원이 달마다 넣음)을 날수로. 그 달 금액이 없을 때만 예전 날짜별 값
  const samMonth = has(M.samchon) ? Number(M.samchon) : c.samchon;
  const samchonMonthly = samMonth > 0 ? samMonth / dim : 0;
  const samchonDaily = samMonth > 0 ? 0 : (X.samchonDaily?.[row.date] ?? row.samchonCost ?? 0);
  const samchonDay = samchonMonthly + samchonDaily;

  // 광고비 = 장부 값. 장부가 0 인 날만 메타 하루 기록(광고 증액 판단·매일 보고와 같은 규칙)
  const metaAds = !(row.ads > 0) ? n0(X.meta?.[row.date]?.[0]) : 0;
  const ads = row.ads > 0 ? row.ads : metaAds;
  const profit = net - cogs - variable - ads - samchonDay - fixedDay;

  return {
    ...row,
    revenue,
    refund,
    net,
    goods,
    shipIncome,
    hasOrders,
    cogs,
    ads,
    adsMeta: metaAds > 0 ? metaAds : 0,
    fee,
    feeFrom,
    shipping,
    material,
    logistics,
    logi,
    logiMode,
    logiEst: M.est || null,
    variable,
    samchonDay,
    samchonDaily,
    samchonMonthly,
    fixedDay,
    profit,
    adRate: revenue ? (ads / revenue) * 100 : 0, // 총매출 기준 — 광고가 만든 매출
    roas: ads ? revenue / ads : 0,
    cogsRate: goods ? (cogs / goods) * 100 : 0, // 상품매출 기준 (배송비 제외)
    refundRate: revenue ? (refund / revenue) * 100 : 0,
  };
}

const SUM = [
  "revenue",
  "refund",
  "net",
  "goods",
  "shipIncome",
  "cogs",
  "qty",
  "orders",
  "ads",
  "fee",
  "shipping",
  "material",
  "logistics",
  "adsMeta",
  "variable",
  "samchonDay",
  "samchonDaily",
  "samchonMonthly",
  "fixedDay",
  "profit",
];

/** 하루치들을 합쳐 기간 전체 지표를 낸다. */
export function totalPnl(days) {
  const t = Object.fromEntries(SUM.map((k) => [k, 0]));
  t.logi = {};
  t.metaDays = 0;
  for (const d of days) {
    for (const k of SUM) t[k] += d[k] || 0;
    for (const [k, v] of Object.entries(d.logi || {})) t.logi[k] = (t.logi[k] || 0) + v;
    if (d.adsMeta > 0) t.metaDays++;
  }

  t.days = days.length;
  t.orderDays = days.filter((d) => d.hasOrders).length; // 원가까지 아는 날이 며칠인가
  t.adRate = t.revenue ? (t.ads / t.revenue) * 100 : 0;
  t.roas = t.ads ? t.revenue / t.ads : 0;
  t.cogsRate = t.goods ? (t.cogs / t.goods) * 100 : 0;
  t.refundShown = t.refund;
  t.refundRate = t.revenue ? (t.refund / t.revenue) * 100 : 0;
  t.margin = t.net ? (t.profit / t.net) * 100 : 0;

  // 손익분기: 광고비·삼촌비·고정비를 덮으려면 하루 얼마를 팔아야 하나
  const contribution = t.net - t.cogs - t.variable;
  const contribRate = t.net ? contribution / t.net : 0;
  t.contribution = contribution;
  t.contribRate = contribRate * 100;
  t.breakeven =
    contribRate > 0 && t.days
      ? (t.ads + t.samchonDay + t.fixedDay) / t.days / contribRate
      : 0;

  // 목표 광고비율(18%)까지 줄이면 이익이 얼마나 남나
  t.targetAds = (t.revenue * TARGET_AD_RATE) / 100;
  t.targetProfit = t.profit + (t.ads - t.targetAds);
  return t;
}

/**
 * 하루치 목록. 택배비를 달 총액으로 넣은 경우를 위해 그 달 주문 건수를 먼저 세어
 * `monthly`에 실어 준다 — 그래야 날짜별로 건수 비율만큼 나눠 담을 수 있다.
 */
export function buildDays(daily, costs, monthly, ctx) {
  const agg = {};
  for (const d of daily) {
    const ym = d.date.slice(0, 7);
    const a = (agg[ym] ||= { orders: 0, qty: 0, extra: 0, gross: 0, refund: 0 });
    a.orders += d.orders || 0;
    a.qty += d.qty || 0;
    a.extra += extraOf(d);
    a.gross += d.cafeGross || 0;
    a.refund += d.cafeRefund || 0;
  }
  const withCount = {};
  for (const ym of Object.keys(agg)) {
    const M = monthly?.[ym] || {};
    // 넥스트팩 단가로 추정하는 달만 — 그 달 입고·사입(매입 장부)·반품 어림·보관
    const est = !hasActual(M) && ym >= NP_START ? npEstimate(agg[ym], ctx?.np?.[ym], ctx?.stock || 0) : null;
    withCount[ym] = { ...M, monthOrders: agg[ym].orders, agg: agg[ym], est };
  }
  // 손익에 넣는 날 = 원가를 아는 날 + 결제가 한 건도 없던 날(광고비·고정비는 나간다). 원가를 모르는데 매출만 있는 날은 뺀다(이익이 부푼다).
  // 처음 원가를 안 날(2026-08-01) 전은 다 뺀다.
  const out = daily.map((d) => dayPnl(d, costs, null, withCount, ctx));
  const first = out.find((d) => d.hasOrders)?.date;
  for (const d of out) d.inPnl = !!first && d.date >= first && (d.hasOrders || !(d.revenue > 0 || d.refund > 0));
  return out;
}

/** 손익에 넣는 날만 (buildDays 의 inPnl) */
export const pnlDays = (days) => days.filter((d) => d.inPnl);

export const monthsOf = (rows) => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();

/** 주문도 매출도 없는 날의 0원 줄 (10/5 — 광고비만 쓴 날을 매출 장부에 적을 수 있게) */
export const EMPTY_DAY = { cafeGross: 0, cafeRefund: 0, cafeShip: 0, gross: 0, refund: 0, net: 0, cogs: 0, qty: 0, orders: 0, shipIncome: 0, naverNet: 0, ads: 0 };
