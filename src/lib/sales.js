// 매출 쪽 계산. 매입 장부가 '산 돈'을 보듯 여기는 '판 돈'을 본다.
//
// 매출을 두 단계로 나눠 본다. 섞으면 둘 다 못 본다.
//
//   총매출  그날 실제로 팔린 금액. 취소·반품을 아직 안 뺐다.
//           광고가 만들어 낸 매출이므로 **광고비는 여기에 대고 본다.**
//   순매출  거기서 취소·반품을 뺀 것. 실제로 남은 돈이므로 **손익은 여기서 낸다.**
//
// 총매출은 카페24 애널리틱스 › 매출분석의 '결제합계'를 그대로 쓴다. 사장님이 매일
// 보는 화면의 숫자와 앱의 숫자가 다르면 앱을 못 믿게 되기 때문이다. 그 값이 없는
// 날만 주문 API에서 계산한 값으로 메운다.
//
// 두 숫자는 기준일이 다르다는 것만 알고 있으면 된다 — 카페24는 **결제완료일**,
// 주문 API는 **주문일**. 그래서 하루 단위로는 어긋날 수 있고 월 단위로는 거의 맞는다.
//
// 원자료 세 가지
//   카페24 애널리틱스 › 매출분석 › 일별 CSV   → 총매출·환불
//   poclo-cafe24/orders.py 의 orders_일별.csv → 순매출·원가·수량·건수
//   메타 광고 관리자 '일' 단위 CSV            → 광고비

export const TARGET_AD_RATE = 18; // 목표 광고비율 (%)

export const DEFAULT_COSTS = {
  shipCost: 2300, // 우리가 내는 택배비 / 건
  material: 197, // 부자재 / 개
  pg: 2.0, // 일반 결제 수수료 (%)
  naver: 3.74, // 네이버페이 수수료 (%, 부가세 포함)
  fixed: 1700000, // 월 고정비
};

export const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");
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
  if (iGross < 0) return [];

  const out = [];
  for (const r of rows.slice(h + 1)) {
    const date = dateIn(r[iDate]);
    if (!date) continue;
    out.push({
      date,
      cafeGross: num(r[iGross]),
      cafeRefund: iRefund >= 0 ? num(r[iRefund]) : 0,
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

/**
 * 하루치 손익. `costs` 는 DEFAULT_COSTS 모양, `fixed` 는 { '2026-08': 1700000 }.
 *
 * 광고 성적(광고비율·ROAS)은 총매출로, 이익은 순매출로 낸다.
 */
export function dayPnl(row, costs, fixed) {
  const c = { ...DEFAULT_COSTS, ...costs };
  const ym = row.date.slice(0, 7);
  const fixedDay = row.net ? (fixed?.[ym] ?? c.fixed) / daysInMonth(ym) : 0;

  // 화면에 쓰는 총매출. 카페24 애널리틱스 값이 있으면 그것이 기준이다.
  const revenue = row.cafeGross || row.gross || 0;
  const fromCafe = row.cafeGross > 0;
  const hasOrders = (row.net || 0) > 0 || (row.orders || 0) > 0;

  const naverNet = Math.min(row.naverNet || 0, row.net);
  const fee = (row.net - naverNet) * (c.pg / 100) + naverNet * (c.naver / 100);
  const shipping = (row.orders || 0) * c.shipCost;
  const material = (row.qty || 0) * c.material;
  const variable = shipping + material + fee;

  const ads = row.ads || 0;
  const profit = row.net + (row.shipIncome || 0) - row.cogs - variable - ads - fixedDay;

  return {
    ...row,
    revenue,
    fromCafe,
    hasOrders,
    ads,
    fee,
    shipping,
    material,
    variable,
    fixedDay,
    profit,
    adRate: revenue ? (ads / revenue) * 100 : 0, // 총매출 기준 — 광고가 만든 매출
    roas: ads ? revenue / ads : 0,
    cogsRate: row.net ? (row.cogs / row.net) * 100 : 0,
    refundRate: revenue ? ((row.cafeRefund || row.refund) / revenue) * 100 : 0,
  };
}

const SUM = [
  "revenue",
  "cafeGross",
  "cafeRefund",
  "gross",
  "refund",
  "net",
  "cogs",
  "qty",
  "orders",
  "shipIncome",
  "naverNet",
  "ads",
  "fee",
  "shipping",
  "material",
  "variable",
  "fixedDay",
  "profit",
];

/** 하루치들을 합쳐 기간 전체 지표를 낸다. */
export function totalPnl(days) {
  const t = Object.fromEntries(SUM.map((k) => [k, 0]));
  for (const d of days) for (const k of SUM) t[k] += d[k] || 0;

  t.days = days.length;
  t.orderDays = days.filter((d) => d.hasOrders).length; // 원가까지 아는 날이 며칠인가
  t.adRate = t.revenue ? (t.ads / t.revenue) * 100 : 0;
  t.roas = t.ads ? t.revenue / t.ads : 0;
  t.cogsRate = t.net ? (t.cogs / t.net) * 100 : 0;
  t.refundShown = t.cafeRefund || t.refund;
  t.refundRate = t.revenue ? (t.refundShown / t.revenue) * 100 : 0;
  t.margin = t.net ? (t.profit / t.net) * 100 : 0;

  // 손익분기: 광고비와 고정비를 덮으려면 하루 얼마를 팔아야 하나
  const contribution = t.net + t.shipIncome - t.cogs - t.variable;
  const contribRate = t.net ? contribution / t.net : 0;
  t.contribution = contribution;
  t.contribRate = contribRate * 100;
  t.breakeven = contribRate > 0 ? (t.ads + t.fixedDay) / t.days / contribRate : 0;

  // 목표 광고비율(18%)까지 줄이면 이익이 얼마나 남나
  t.targetAds = (t.revenue * TARGET_AD_RATE) / 100;
  t.targetProfit = t.profit + (t.ads - t.targetAds);
  return t;
}

/** 주문 데이터 + 광고비를 날짜로 맞물린 하루치 목록. */
export function buildDays(daily, ads, costs, fixed) {
  return daily.map((d) => dayPnl({ ...d, ads: ads?.[d.date] || 0 }, costs, fixed));
}

export const monthsOf = (rows) => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
