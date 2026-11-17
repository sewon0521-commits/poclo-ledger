// 발주 계산기 (11/17 밤) — 세원: "팔리는 거 보고 다시 잡으면 되지. 이거 계산기 만들어 줄 수 있나? 미송 + 리드타임 계산기
//   예전에 할레 진행하면서 만들었었는데 까먹었네" (예전 계산기는 PC·원드라이브에 없음 → 새로).
// 예: 테디 — 넥스트팩 재고 0 · 밀린 주문 아이보리 5 · 남은 미송 아이보리 10(11/13) · 하루 판매 광고 켠 주 4장 / 끈 날 1장
//   → 광고 켜면 다음 주 얼마나? 방향성 추천 25장, 세원 "보수적으로 15장, 팔리는 거 보고 다시 잡자".
//
//   넣을 수량 = 밀린 주문 + 하루 판매 × (리드타임 + 버틸 날) − 재고 − 남은 미송   (0 아래면 0, 올림)
//   바닥나는 날 = 오늘 + (재고 + 남은 미송 + 넣을 수량 − 밀린 주문) ÷ 하루 판매
//   다시 잡을 날 = 바닥나는 날 − 리드타임 (하루 판매가 기준(기본 3장)을 넘는 옵션만 알림 줄)
//   금액 = 공급가 × 넣을 수량.  발주는 세원이 직접 — 계산기는 숫자만(재발주 단추 없음).
//
// 자료(전부 읽기만):
//   settings opt_sales   — 옵션별 하루 판매(사무실 PC product_stats.py, 새벽마다 30일) {to, updated, byDay:{날짜:{상품번호:{옵션:장수}}}, info:{상품번호:{name, created, selling}}}
//   settings stock       — 일 › 재고(넥스트팩 rows {name, option, qty(실재고), avail(가용), maker(거래처), supplyName(도매 상품명), cost} + 사무실 rack)
//                          재고 = 실재고 + 렉 — 가용(avail)은 이지어드민이 이미 주문에 묶은 걸 뺀 수라, 밀린 주문을 따로 빼는 이 식에선 실재고를 쓴다
//   settings order_backlog — 카페24 밀린 주문(입금전·상품준비중·배송준비중·배송대기·배송보류) {at, byNo:{상품번호:{옵션:장수}}} — 사무실 PC backlog.py(30분마다 오늘출발 작업 끝에)
//   settings product_stats.all — 판매 중 상품 이름(찾기용) · 판매가 목록(pricing) — 공급가·도매 상품명·거래처 · 매입 장부 — 남은 미송(pending.flowBoard)
// 설정: settings order_calc {fast(바로 나오면 리드타임, 기본 1), misong(미송이면 3), cover(버틸 날 7), alert(다시 잡을 기준 하루 3장), lead:{거래처 열쇠:{fast, misong}}}
import { shopKey, splitName, sameVendor, misongFor, nameHit, wholesaleKey } from "./soOrder";
import { normOpt } from "./restock";
import { groupKey } from "./stock";

export const CALC_KEY = "order_calc";
export const DEFAULT_CALC = { fast: 1, misong: 3, cover: 7, alert: 3, lead: {} };

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const dayNum = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const vendorKey = (v) => squash(String(v || "").split(/[\s(/]/)[0]);

/** 고를 수 있는 상품 — 최근 30일 팔린 것(판매 많은 순) + 판매 중 전부(찾기용) */
export function productList({ sales, stats, backlog }) {
  const out = new Map();
  const info = sales?.info || {};
  const sold = {};
  const recent = {};
  const to = sales?.to ? dayNum(sales.to) : 0;
  for (const [d, byNo] of Object.entries(sales?.byDay || {}))
    for (const [no, byOpt] of Object.entries(byNo)) {
      const n = Object.values(byOpt).reduce((a, b) => a + b, 0);
      sold[no] = (sold[no] || 0) + n;
      if (to - dayNum(d) < 7) recent[no] = (recent[no] || 0) + n;
    }
  for (const [no, x] of Object.entries(info)) out.set(String(no), { no: String(no), name: x.name, selling: x.selling !== false, sold30: sold[no] || 0, sold7: recent[no] || 0 });
  for (const x of stats?.all || []) if (!out.has(String(x.no))) out.set(String(x.no), { no: String(x.no), name: x.name, selling: true, sold30: 0, sold7: 0, image: x.image });
  for (const x of stats?.all || []) if (out.has(String(x.no)) && x.image) out.get(String(x.no)).image = x.image;
  for (const no of Object.keys(backlog?.byNo || {})) if (out.has(no)) out.get(no).backlog = Object.values(backlog.byNo[no]).reduce((a, b) => a + b, 0);
  return [...out.values()].sort((a, b) => b.sold7 - a.sold7 || b.sold30 - a.sold30 || Number(b.no) - Number(a.no));
}

/** 옵션 하루 판매 — 날마다 [장수…](등록 전 날은 빼고) → 최근 3·7·14일 평균 · 30일 중 가장 잘 팔린 7일(광고 켠 주에 가까움) */
export function dailyOf(sales, no, option) {
  const want = normOpt(option);
  const to = sales?.to;
  if (!to || !no) return { d3: 0, d7: 0, d14: 0, best7: 0, sold30: 0, days: 0, series: [] };
  const end = dayNum(to);
  const created = sales.info?.[no]?.created;
  const start = Math.max(end - 29, created ? dayNum(created) : end - 29);
  // 오늘은 올린 시각까지만(새벽 1시에 올렸으면 거의 0일)
  const up = sales.updated ? new Date(sales.updated) : null;
  const frac = up && up.toISOString().slice(0, 10) <= to ? Math.min(1, Math.max(0.05, (up.getHours() * 60 + up.getMinutes()) / 1440)) : 1;
  const series = [];
  for (let n = start; n <= end; n++) {
    const byOpt = sales.byDay?.[isoOf(n)]?.[no] || {};
    let q = 0;
    for (const [o, v] of Object.entries(byOpt)) if (normOpt(o) === want) q += v;
    series.push({ day: isoOf(n), q });
  }
  const avg = (k) => {
    const take = series.slice(-k);
    if (!take.length) return 0;
    const span = take.length - 1 + frac;
    return take.reduce((a, b) => a + b.q, 0) / Math.max(span, 0.5);
  };
  let best7 = 0;
  for (let i = 0; i + 7 <= series.length - 1; i++) best7 = Math.max(best7, series.slice(i, i + 7).reduce((a, b) => a + b.q, 0) / 7);
  if (series.length <= 8) best7 = Math.max(best7, avg(7));
  return { d3: avg(3), d7: avg(7), d14: avg(14), best7, sold30: series.reduce((a, b) => a + b.q, 0), days: series.length, series };
}

/** 이 상품의 옵션들 — 팔린 옵션 + 재고 줄 + 밀린 주문 (팔린 많은 순) */
export function optionsOf({ sales, stock, backlog }, no, name) {
  const seen = new Map();
  const add = (o, n = 0) => {
    const k = normOpt(o);
    if (!k && k !== "") return;
    const x = seen.get(k) || { option: String(o || "").replace(/^\[|\]$/g, ""), sold: 0 };
    x.sold += n;
    seen.set(k, x);
  };
  for (const byNo of Object.values(sales?.byDay || {})) for (const [o, v] of Object.entries(byNo[no] || {})) add(o, v);
  for (const r of stockRows(stock, name)) add(r.option);
  for (const o of Object.keys(backlog?.byNo?.[no] || {})) add(o);
  return [...seen.values()].sort((a, b) => b.sold - a.sold);
}

const sameShop = (name) => {
  const s = shopKey(name);
  const g = squash(groupKey(name));
  return (n) => (s && shopKey(n) === s) || (g && squash(groupKey(n)) === g);
};
/** 이 상품의 재고 줄(넥스트팩) */
const stockRows = (stock, name) => (stock?.nextpack?.rows || []).filter((r) => sameShop(name)(r.name));

/** 지금 재고 — 넥스트팩 실재고 + 사무실 렉 (가용 아님 — 위 머리말) */
export function stockFor(stock, name, option) {
  const same = sameShop(name);
  const o = normOpt(option);
  let np = 0;
  let rack = 0;
  let hold = 0;
  for (const r of stock?.nextpack?.rows || []) {
    if (!same(r.name) || normOpt(r.option) !== o) continue;
    np += Math.max(0, Number(r.qty ?? r.avail) || 0);
    hold += Math.max(0, Number(r.hold) || 0);
  }
  for (const r of Array.isArray(stock?.rack) ? stock.rack : []) if (same(r.name) && normOpt(r.option) === o) rack += Math.max(0, Number(r.qty) || 0);
  return { np, rack, total: np + rack, hold };
}

/** 도매 쪽 — 거래처·도매 상품명·공급가 (넥스트팩 줄 → 판매가 목록) */
export function wholesaleOf({ stock, pricing }, no, name) {
  const r = stockRows(stock, name).find((x) => x.maker || x.supplyName);
  const pr = (pricing || []).filter((p) => String(p.productNo || "") === String(no) && p.supply > 0);
  const one = pr.find((p) => !/1\s*\+\s*1/.test(`${p.memoName || ""} ${p.name || ""}`)) || pr[0];
  const sp = r?.supplyName ? splitName(r.supplyName) : one?.memoName ? splitName(String(one.memoName).replace(/\s*\(1\s*\+\s*1\)\s*$/, "")) : null;
  return {
    vendor: r?.maker || one?.vendor || sp?.store || "",
    wholesale: sp?.name || "",
    supply: Math.round(one?.supply || Number(r?.cost) || 0),
    from: one?.supply ? "판매가 목록" : r?.cost ? "넥스트팩 원가" : "",
  };
}

/** 남은 미송 — 같은 거래처·같은 도매 상품·같은 옵션 줄. 거래처를 모르면 도매 상품명이 같은 줄의 거래처로 */
export function misongOf(lines, w, option) {
  if (!w.wholesale) return { left: 0, lines: [] };
  let vendor = w.vendor;
  if (!vendor) {
    const key = wholesaleKey(w.wholesale);
    const hit = (lines || []).find((l) => nameHit(squash(String(l.name || "").split("/")[0]), key) === 2);
    vendor = hit?.vendor || "";
  }
  if (!vendor) return { left: 0, lines: [] };
  const m = misongFor({ name: w.wholesale, vendor, option: `[${option}]` }, lines);
  const got = m.exact;
  return {
    left: got.reduce((a, l) => a + Math.max(0, l.left), 0),
    lines: got.map((l) => ({ ...l, since: firstOpen(l) })),
    loose: m.loose.filter((l) => l.left > 0),
    vendor,
  };
}
/** 아직 안 받은 미송을 잡은 날 — 잡은 순서대로 쌓아 나간 수(out)를 넘는 첫 날 */
function firstOpen(l) {
  let cum = 0;
  for (const t of [...(l.takenDates || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    cum += t.qty;
    if (cum > l.out) return t.date;
  }
  return l.takenDates?.at(-1)?.date || "";
}

/** 계산 한 줄 */
export function calcRow({ daily, stock, backlog, misong, lead, cover, qty }) {
  const need = backlog + daily * (lead + cover) - stock - misong;
  const auto = Math.max(0, Math.ceil(need - 1e-9));
  const q = qty == null ? auto : Math.max(0, qty);
  const have = stock + misong + q - backlog;
  const runDays = daily > 0 ? have / daily : Infinity;
  return { auto, qty: q, need, have, runDays, short: have < 0 };
}
export const addDays = (today, n) => {
  if (!Number.isFinite(n)) return "";
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + Math.floor(n));
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const daysSince = (today, day) => (day ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000) : null);
export { sameVendor };
