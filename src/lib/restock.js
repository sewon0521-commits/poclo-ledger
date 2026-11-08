// 오늘출발 여유분 (11/8 세원: "하루 평균치 판매량을 보고 당일배송 할 수 있는 수량을 계산해주는 자동으로.
// SO+ 발주변환, 재고에서 발주를 계산식을 통해서 진행할 수 있게 보여주는거지")
//
// 이지어드민 발주 파일 = 밀린 주문(재고로 못 채운 것)뿐이라, 그대로 사면 들어오는 족족 주문에 묶여 오늘출발 재고가 안 남는다.
// 그래서 잘 팔리는 옵션은 며칠 치를 더 사 둔다:
//
//   목표 재고 = 하루 평균 판매 × (입고까지 날 + 여유 날)   — 소수점 버림, 최소 1장
//   더 살 것  = 목표 재고 − 지금 재고(넥스트팩 가용 + 사무실 렉)   — 0 아래면 0
//   하루 평균 = 최근 N일(기본 7) 판매 ÷ 그 기간 날수(등록한 지 N일이 안 됐으면 등록한 날부터, 오늘은 지난 시간만큼만)
//   기간 동안 M장(기본 3) 안 팔린 옵션은 0 — 느린 건 주문 들어올 때만 산다
//
// 밀린 주문 수량은 건드리지 않고 '여유분'만 줄에 더한다(row.extra). 가용 재고는 이미 주문에 묶인 걸 뺀 수라 겹치지 않는다.
// 11/3 테디: 여유 3장을 더 샀는데 거래처 미송으로 3일 걸리는 사이 주문이 8장 더 들어와 다 묶였다 → 입고까지 날을 늘리면 된다.
//
// 자료: settings `opt_sales` (사무실 PC poclo-cafe24/product_stats.py — 새벽마다 30일, 바로 올리려면 `python product_stats.py --opt`)
//   {updated, to, days, byDay:{날짜:{상품번호:{옵션:장수}}}, info:{상품번호:{name, created, selling}}}
//   옵션 글자는 이지어드민 옵션 모양 — '아이보리' · '블랙-M' · '중청-기본-M' (1+1 두 번째 장도 한 장으로 셈)
// settings `stock` (일 › 재고 — nextpack.rows {name, option, avail, maker, supplyName, code, cost} · rack [{name, option, qty}])

import { shopKey, splitName } from "./soOrder";
import { groupKey, cleanOption } from "./stock";

export const RESTOCK_CONF = "poclo_restock_conf";
export const DEFAULT_RESTOCK = { days: 7, lead: 1, safety: 1, min: 3 };

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
/** 옵션 비교 — '[블랙-L]' · '블랙 - L' → '블랙-l' */
export const normOpt = (s) => squash(cleanOption(s));
const dayNum = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** 이 상품 이름이 opt_sales 의 어느 상품번호인가 — 우리 상품명(꼬리표·(Ncolor) 뗀 것)이 같으면, 아니면 첫 낱말(고유네임) */
export function productOf(sales, name) {
  const info = sales?.info || {};
  const s = shopKey(name);
  const g = squash(groupKey(name));
  if (!s && !g) return null;
  const ids = Object.keys(info);
  const exact = ids.filter((no) => shopKey(info[no].name) === s);
  if (exact.length) return exact.sort((a, b) => b - a)[0];
  const same = ids.filter((no) => g && squash(groupKey(info[no].name)) === g);
  if (same.length === 1) return same[0];
  // 고유네임이 겹치면 판매 중인 것 → 최근 등록
  return same.sort((a, b) => (info[b].selling ? 1 : 0) - (info[a].selling ? 1 : 0) || b - a)[0] || null;
}

/** 판매 기간 — 마지막 날(to)까지 N일. 오늘은 올린 시각까지만 센다(새벽 1시에 올렸으면 거의 0일) */
function windowOf(sales, days) {
  const to = sales?.to || new Date().toISOString().slice(0, 10);
  const up = sales?.updated ? new Date(sales.updated) : null;
  const frac = up && up.toISOString().slice(0, 10) <= to ? Math.min(1, Math.max(0.05, (up.getHours() * 60 + up.getMinutes()) / 1440)) : 1;
  const end = dayNum(to);
  return { from: isoOf(end - days + 1), to, frac, end };
}

/** 한 옵션의 최근 판매 → {sold, span, avg} */
export function salesOf(sales, no, option, days) {
  if (!no || !sales?.byDay) return { sold: 0, span: days, avg: 0 };
  const w = windowOf(sales, days);
  const want = normOpt(option);
  let sold = 0;
  for (const [d, byNo] of Object.entries(sales.byDay)) {
    if (d < w.from || d > w.to) continue;
    for (const [opt, q] of Object.entries(byNo[no] || {})) if (normOpt(opt) === want) sold += q;
  }
  let span = days - 1 + w.frac;
  const created = sales.info?.[no]?.created;
  if (created && created > w.from) span = Math.max(1, w.end - dayNum(created) + w.frac);
  return { sold, span, avg: span > 0 ? sold / span : 0 };
}

/** 지금 재고 — 넥스트팩 가용 + 사무실 렉 (이름은 우리 상품명 또는 고유네임, 옵션 같은 것) */
export function stockOf(stock, name, option) {
  const s = shopKey(name);
  const g = squash(groupKey(name));
  const o = normOpt(option);
  const same = (n) => (s && shopKey(n) === s) || (g && squash(groupKey(n)) === g);
  let np = 0;
  let rack = 0;
  let row = null;
  for (const r of stock?.nextpack?.rows || []) {
    if (!same(r.name) || normOpt(r.option) !== o) continue;
    np += Math.max(0, Number(r.avail) || 0);
    row = row || r;
  }
  for (const r of Array.isArray(stock?.rack) ? stock.rack : []) if (same(r.name) && normOpt(r.option) === o) rack += Math.max(0, Number(r.qty) || 0);
  return { np, rack, total: np + rack, row };
}

/** 계산 한 줄 → {no, sold, span, avg, target, have, add, slow} */
export function restockFor({ sales, stock, conf }, name, option) {
  const c = { ...DEFAULT_RESTOCK, ...conf };
  const no = productOf(sales, name);
  const s = salesOf(sales, no, option, c.days);
  const st = stockOf(stock, name, option);
  const slow = s.sold < c.min;
  const target = slow ? 0 : Math.max(1, Math.floor(s.avg * (c.lead + c.safety)));
  return { no, ...s, target, have: st.total, np: st.np, rack: st.rack, add: Math.max(0, target - st.total), slow, stockRow: st.row };
}

/**
 * 발주 파일에 없는데 여유분이 모자란 옵션 — 재고가 다 나가서 밀린 주문도 없는 잘 팔리는 옵션 같은 것.
 * 줄 정보(매장·도매 상품명·단가)는 넥스트팩 재고 줄(제조사·공급처상품명·원가) → 판매가 목록(productNo 로 이은 줄: 거래처·메모 이름·공급가) 순으로.
 * → [{key, no, name, option, ...restockFor, row(발주 줄 모양) | null}]
 */
export function missingRestock({ sales, stock, pricing, conf }, inFile) {
  const c = { ...DEFAULT_RESTOCK, ...conf };
  if (!sales?.byDay) return [];
  const w = windowOf(sales, c.days);
  const opts = new Map(); // `${no}|${opt}` → opt 글자
  for (const [d, byNo] of Object.entries(sales.byDay)) {
    if (d < w.from || d > w.to) continue;
    for (const [no, byOpt] of Object.entries(byNo)) for (const opt of Object.keys(byOpt)) opts.set(`${no}|${normOpt(opt)}`, { no, opt });
  }
  const out = [];
  for (const [key, { no, opt }] of opts) {
    if (inFile.has(key)) continue;
    const info = sales.info?.[no];
    if (!info || info.selling === false) continue;
    const r = restockFor({ sales, stock, conf: c }, info.name, opt);
    if (r.no !== no || r.add <= 0) continue;
    const np = r.stockRow;
    const pr = !np && (pricing || []).filter((p) => String(p.productNo || "") === String(no) && p.supply > 0 && !/1\s*\+\s*1/.test(p.memoName || ""))[0];
    let row = null;
    const option = opt ? `[${opt}]` : "";
    if (np?.maker && np?.supplyName) {
      const sp = splitName(np.supplyName);
      row = { vendor: np.maker, rawName: np.supplyName, name: sp.name, place: sp.place, parsedStore: sp.store, shopName: np.name, option, code: np.code || "", priceHint: Number(np.cost) || 0 };
    } else if (pr && (pr.memoName || pr.name) && pr.vendor) {
      const raw = String(pr.memoName || pr.name).replace(/\s*\(1\s*\+\s*1\)\s*$/, "");
      const sp = splitName(raw);
      row = { vendor: pr.vendor, rawName: raw, name: sp.name, place: sp.place, parsedStore: sp.store, shopName: info.name, option, code: "", priceHint: Math.round(pr.supply) };
    }
    out.push({ key, no, name: info.name, option: opt, ...r, row });
  }
  return out.sort((a, b) => b.avg - a.avg);
}

/** 발주 줄 열쇠 → opt_sales 열쇠 (파일에 이미 있는 옵션 거르기) */
export const saleKey = (sales, row) => {
  const no = productOf(sales, row.shopName || row.name);
  return no ? `${no}|${normOpt(row.optionFile || row.option)}` : "";
};

/** '19장 ÷ 6.9일 = 하루 2.8장 × (입고 1 + 여유 1)일 = 5장 − 재고 0 = +5' */
export function formulaText(r, conf) {
  const c = { ...DEFAULT_RESTOCK, ...conf };
  if (r.slow) return `최근 ${c.days}일 ${r.sold}장 — ${c.min}장 미만이라 여유분 없음(주문 들어올 때만)`;
  const avg = Math.round(r.avg * 10) / 10;
  return `${r.sold}장 ÷ ${Math.round(r.span * 10) / 10}일 = 하루 ${avg}장 × (입고 ${c.lead} + 여유 ${c.safety})일 = ${r.target}장 − 재고 ${r.have} = +${r.add}`;
}
