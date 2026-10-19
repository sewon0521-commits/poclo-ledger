/**
 * 매일 보고 — 기간 바꿔 보기 (2026-10-19 저녁, 세원: "하루, 7일, 한 달, 3개월, 6개월 버튼 + 날짜 직접 지정").
 * 아침 보고(report_<날짜>)는 '최근 7일'로 만들어 두고, 다른 기간은 화면에서 하루 단위 기록을 더해 센다:
 *   매출 장부 rows(sales_daily)              — 총매출·환불·주문·광고비
 *   settings meta_daily      {days:{날짜:[광고비, 노출, 클릭, 구매, 구매액, 1일 구매, 1일 구매액]}}
 *   settings meta_prod_daily {days:{날짜:{상품코드:[광고비, 구매, 1일 구매, 구매액, 1일 구매액, 클릭]}}}
 *   settings meta_ads        {at, items:[[상품코드, 만든 날, 켜짐 1/0]]}
 *   settings prod_daily      {days:{주문일:{상품번호:장수}}, info:{상품번호:{name, code, image, price}}}
 * (만드는 곳: poclo-cafe24/daily_report.py · product_stats.py)
 */

export const SPANS = [
  { id: "1", label: "하루", n: 1 },
  { id: "7", label: "7일", n: 7 },
  { id: "30", label: "한 달", n: 30 },
  { id: "90", label: "3개월", n: 90 },
  { id: "180", label: "6개월", n: 180 },
  { id: "custom", label: "직접 지정" },
];

export function addDays(day, n) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const countDays = (s, e) => Math.round((new Date(e + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000) + 1;
const eachDay = (s, e) => {
  const out = [];
  for (let d = s; d <= e; d = addDays(d, 1)) out.push(d);
  return out;
};

/** 고른 기간 + 바로 앞 같은 길이 */
export function rangeOf(spanId, end, custom) {
  if (spanId === "custom" && custom?.start && custom?.end) {
    const [s, e] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start];
    const n = countDays(s, e);
    return { start: s, end: e, n, prevStart: addDays(s, -n), prevEnd: addDays(s, -1) };
  }
  const n = SPANS.find((x) => x.id === spanId)?.n || 7;
  const s = addDays(end, -(n - 1));
  return { start: s, end, n, prevStart: addDays(s, -n), prevEnd: addDays(s, -1) };
}

export const fmtDay = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
export function rangeLabel(r) {
  return r.n === 1 ? fmtDay(r.end) : `${fmtDay(r.start)}~${fmtDay(r.end)}`;
}
export function vsLabel(r, spanId) {
  if (spanId === "1") return "vs 전날";
  if (spanId === "30") return "vs 그 전 한 달";
  if (spanId === "90") return "vs 그 전 3개월";
  if (spanId === "180") return "vs 그 전 6개월";
  return `vs 앞 ${r.n}일`;
}

/** 보고의 week 와 같은 모양으로 센다 — KpiGrid 를 그대로 쓴다 */
export function spanStats(rows, metaDays, s, e) {
  const byDay = new Map((rows || []).map((r) => [r.date, r]));
  // 매출 장부는 2026-02-21부터, 주문 수는 8월부터만 있다 — CPA·객단가는 주문 수가 있는 날만으로 센다
  const firstRow = (rows || []).reduce((m, r) => (r.cafeGross && (!m || r.date < m) ? r.date : m), "");
  const firstOrd = (rows || []).reduce((m, r) => (r.orders && (!m || r.date < m) ? r.date : m), "");
  const t = { revenue: 0, refund: 0, orders: 0, ads: 0, adsFromMeta: 0, revOrd: 0, adsOrd: 0, firstOrd, noData: !firstRow || s < firstRow, ordPartial: !!firstOrd && s < firstOrd, metaSpend: 0, impressions: 0, clicks: 0, metaPurchases: 0, metaValue: 0, metaPurchases1d: 0, metaValue1d: 0, days: countDays(s, e) };
  for (const d of eachDay(s, e)) {
    const r = byDay.get(d);
    const m = metaDays?.[d];
    if (r) {
      t.revenue += r.cafeGross || 0;
      t.refund += r.cafeRefund || 0;
      t.orders += r.orders || 0;
    }
    // 광고비 = 매출 장부 값, 장부가 비어 있는 날은 메타 값(8월 전·9/24 같은 날 장부에 광고비가 안 적혀 있다)
    const ad = r?.ads || m?.[0] || 0;
    if (!r?.ads && m?.[0]) t.adsFromMeta += 1;
    t.ads += ad;
    if (firstOrd && d >= firstOrd) {
      t.revOrd += r?.cafeGross || 0;
      t.adsOrd += ad;
    }
    if (m) {
      t.metaSpend += m[0] || 0;
      t.impressions += m[1] || 0;
      t.clicks += m[2] || 0;
      t.metaPurchases += m[3] || 0;
      t.metaValue += m[4] || 0;
      t.metaPurchases1d += m[5] || 0;
      t.metaValue1d += m[6] || 0;
    }
  }
  t.adRate = t.revenue ? Math.round((t.ads / t.revenue) * 1000) / 10 : null;
  t.metaPurchases = Math.round(t.metaPurchases);
  t.metaPurchases1d = Math.round(t.metaPurchases1d);
  return t;
}

/** '[1+1] 소슬 딥브이 니트티 (6color)' → '소슬' — daily_report.code_of_name 과 같은 규칙 */
export const codeOfName = (name) => (String(name || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim().split(/\s+/)[0] || "");

/**
 * 상품별 광고 기여 — 기간 안 판매 장수(상품코드로 묶음) + 광고(광고 이름의 상품) + 광고 개수(전체 · 지금 켜짐 · 이 기간에 만든 것)
 * 줄 = {code, name, image, url, q, spend, value, pu, pu1, adsTotal, adsActive, adsMade, kind, top}
 */
export function productRows({ prod, metaProd, metaAds, s, e }) {
  const n = countDays(s, e);
  const info = prod?.info || {};
  const rows = new Map();
  const row = (code) => {
    if (!rows.has(code)) rows.set(code, { code, name: "", image: "", q: 0, best: -1, spend: 0, value: 0, pu: 0, pu1: 0, adsTotal: 0, adsActive: 0, adsMade: 0 });
    return rows.get(code);
  };
  const perNo = new Map();
  for (const d of eachDay(s, e)) for (const [no, q] of Object.entries(prod?.days?.[d] || {})) perNo.set(no, (perNo.get(no) || 0) + q);
  for (const [no, q] of perNo) {
    const p = info[no] || {};
    const code = p.code || codeOfName(p.name) || `#${no}`;
    const r = row(code);
    r.q += q;
    if (q > r.best) Object.assign(r, { best: q, name: p.name || code, image: p.image || "", no });
  }
  for (const d of eachDay(s, e))
    for (const [code, v] of Object.entries(metaProd?.days?.[d] || {})) {
      const r = row(code);
      r.spend += v[0] || 0;
      r.pu += v[1] || 0;
      r.pu1 += v[2] || 0;
      r.value += v[3] || 0;
    }
  for (const [code, made, on] of metaAds?.items || []) {
    if (!rows.has(code)) continue;
    const r = rows.get(code);
    r.adsTotal += 1;
    r.adsActive += on ? 1 : 0;
    if (made >= s && made <= e) r.adsMade += 1;
  }
  const want = Math.max(2, Math.round((3 * n) / 7)); // 7일에 3장 꼴 이상 팔리는데 광고가 없으면 '광고 추천'
  const list = [...rows.values()].map((r) => ({
    ...r,
    name: r.name || r.code,
    pu: Math.round(r.pu),
    pu1: Math.round(r.pu1),
    spend: Math.round(r.spend),
    value: Math.round(r.value),
    kind: r.spend ? (r.pu ? "광고 구매" : "광고 비효율") : r.q >= want ? "광고 추천" : "",
  }));
  const top = new Set([...list].sort((a, b) => b.q - a.q).filter((r) => r.q > 0).slice(0, 5).map((r) => r.code));
  return list.map((r) => ({ ...r, top: top.has(r.code) })).sort((a, b) => b.q - a.q || b.spend - a.spend);
}

/** 기간 안 광고 개수 — 전체(만든 것 전부) · 지금 켜진 것 · 이 기간에 만든 것 */
export function adCountsIn(metaAds, s, e) {
  const items = metaAds?.items || [];
  return { total: items.length, active: items.filter((x) => x[2]).length, made: items.filter((x) => x[1] >= s && x[1] <= e).length, at: metaAds?.at, list: metaAds?.active || [] };
}

/** 기간 막대 — 31일까지 하루씩, 넘으면 주마다 */
export function trendOf(rows, s, e) {
  const byDay = new Map((rows || []).map((r) => [r.date, r]));
  const days = eachDay(s, e).map((d) => ({ date: d, revenue: byDay.get(d)?.cafeGross || 0, ads: byDay.get(d)?.ads || 0 }));
  if (days.length <= 31) return days;
  const out = [];
  for (let i = 0; i < days.length; i += 7) {
    const w = days.slice(i, i + 7);
    out.push({ date: w[0].date, end: w[w.length - 1].date, revenue: w.reduce((a, x) => a + x.revenue, 0), ads: w.reduce((a, x) => a + x.ads, 0) });
  }
  return out;
}
