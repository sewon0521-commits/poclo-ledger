// 광고 증액 판단 (2026-11-09 세원: 쇼필공 강의 "터질 때 광고비를 많이 써야 한다 — ROAS 효율은 떨어지지만 남는 '순수익'은 높아진다")
//
// 핵심 한 줄:
//   남는 돈 = 총매출 × 공헌이익률 − 광고비
//   → 늘린 광고비에서 나온 매출(한계 ROAS = 늘어난 매출 ÷ 늘린 광고비)이 손익분기 ROAS(= 1 ÷ 공헌이익률)를 넘으면
//     평균 ROAS 가 떨어져도 남는 돈은 커진다. 넘지 못하면 그때부터는 늘릴수록 줄어든다('무조건'은 아니다).
//
// 공헌이익률 = (순매출 − 매출원가 − 택배·부자재·수수료) ÷ 총매출 — 광고비·삼촌비·고정비 빼기 전.
//   총매출로 나누는 이유: ROAS 도 총매출(카페24 결제합계)로 재서 같은 바닥에 대야 1 ÷ 공헌이익률이 손익분기 ROAS 가 된다.
// 광고비 = 매출 장부 값, 장부가 빈 날은 메타 하루 기록(settings meta_daily, poclo-cafe24/daily_report.py) — 매일 보고와 같은 규칙(lib/reportPeriod).
// ROAS 는 메타 광고 관리자 숫자가 아니라 **카페24 총매출 ÷ 광고비**(광고 없이 들어온 매출 포함). 증액 판단은 쇼핑몰 전체로 남는 돈을 봐야 해서.
import { buildDays, DEFAULT_COSTS } from "./sales";
import { fillGaps } from "./view";
import { addDays } from "./reportPeriod";

const todayKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/** 하루치 손익 — 광고비가 빈 날은 메타 값으로 채운다. 원가를 아는 날(hasOrders)만, 오늘은 뺀다(아직 안 끝남). */
export function adDays(rows, conf, metaDays) {
  const costs = { ...DEFAULT_COSTS, ...(conf?.costs || {}) };
  const sam = conf?.samchonDaily || {};
  const meta = metaDays || {};
  const today = todayKey();
  const filled = fillGaps(rows || []).map((r) => {
    let x = sam[r.date] ? { ...r, samchonCost: sam[r.date] } : r;
    const m = meta[r.date];
    if (!(x.ads > 0) && m && m[0] > 0) x = { ...x, ads: m[0], adsFromMeta: true };
    return x;
  });
  const all = buildDays(filled, costs, conf?.monthly);
  // 원가를 아는 날 + 주문 0건인데 광고비만 쓴 날(그날은 남는 돈 = −광고비). 원가를 모르는 매출 날은 뺀다(이익이 부풀어서).
  const first = all.find((d) => d.hasOrders)?.date;
  if (!first) return [];
  return all
    .filter((d) => d.date >= first && d.date < today && (d.hasOrders || (!(d.revenue > 0) && d.ads > 0)))
    .map((d) => ({ ...d, contrib: d.hasOrders ? d.net - d.cogs - d.variable : 0 }));
}

const sumOf = (list) => {
  const t = { n: list.length, ads: 0, rev: 0, contrib: 0, meta: 0 };
  for (const d of list) {
    t.ads += d.ads || 0;
    t.rev += d.revenue || 0;
    t.contrib += d.contrib || 0;
    if (d.adsFromMeta) t.meta++;
  }
  t.roas = t.ads > 0 ? t.rev / t.ads : 0;
  t.rate = t.rev > 0 ? t.contrib / t.rev : 0; // 공헌이익률(총매출 대비)
  t.dayAds = t.n ? t.ads / t.n : 0;
  t.dayRev = t.n ? t.rev / t.n : 0;
  t.dayKeep = t.n ? (t.contrib - t.ads) / t.n : 0; // 광고비까지 뺀 하루 남는 돈(삼촌비·고정비 전)
  return t;
};

/** 마지막 n일(데이터 있는 날 기준) */
export function lastDays(days, n) {
  if (!days.length) return sumOf([]);
  const end = days[days.length - 1].date;
  const start = addDays(end, -(n - 1));
  const t = sumOf(days.filter((d) => d.date >= start));
  return { ...t, start, end };
}

/** 월요일에 시작하는 주마다. 앞 주와 비교한 한계 ROAS 도 같이. */
export function weeksOf(days) {
  const map = new Map();
  for (const d of days) {
    const dt = new Date(d.date + "T00:00:00");
    const mon = addDays(d.date, -((dt.getDay() + 6) % 7));
    if (!map.has(mon)) map.set(mon, []);
    map.get(mon).push(d);
  }
  const out = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, list]) => ({ start, end: addDays(start, 6), ...sumOf(list) }));
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    const b = out[i];
    const dAds = b.dayAds - a.dayAds;
    const dRev = b.dayRev - a.dayRev;
    b.dAds = dAds;
    b.dRev = dRev;
    b.dKeep = b.dayKeep - a.dayKeep;
    // 광고비가 거의 그대로(15% 안쪽·하루 1만 원 안쪽)면 한계 ROAS 는 숫자가 튀어서 안 잰다
    b.mRoas = Math.abs(dAds) >= Math.max(10000, a.dayAds * 0.15) ? dRev / dAds : null;
  }
  return out;
}

/** 손익분기 ROAS — 이 아래로 벌면 쓴 광고비보다 남는 돈이 적다 */
export const breakEven = (rate) => (rate > 0 ? 1 / rate : 0);

/** 하루 광고비 s, ROAS r 일 때 하루 남는 돈 */
export const keepOf = (s, r, rate) => s * r * rate - s;

/**
 * 광고비를 s0 → s1 로 바꿀 때 지금만큼은 남기려면 ROAS 가 몇 이상이어야 하나.
 *   s1 × R × m − s1 ≥ s0 × r0 × m − s0  →  R ≥ (지금 남는 돈 + s1) ÷ (s1 × m)
 */
export function needRoas(s0, r0, s1, rate) {
  if (!(s1 > 0 && rate > 0)) return 0;
  return (keepOf(s0, r0, rate) + s1) / (s1 * rate);
}

/** 늘린 뒤 ROAS 가 이렇게 나오면 — 지금 ROAS 부터 0.5 씩 내려가며, 지금만큼 남는 선은 꼭 넣는다 */
export function scenarios(s0, r0, s1, rate) {
  const keep0 = keepOf(s0, r0, rate);
  const need = needRoas(s0, r0, s1, rate);
  const be = breakEven(rate);
  const floor = Math.max(1, Math.min(be, need) - 0.5);
  const top = Math.max(r0, need + 0.5);
  const set = new Set();
  for (let r = Math.floor(top * 2) / 2; r >= floor - 1e-9; r -= 0.5) set.add(Math.round(r * 100) / 100);
  set.add(Math.round(r0 * 100) / 100);
  if (need > 0) set.add(Math.round(need * 100) / 100);
  return [...set]
    .sort((a, b) => b - a)
    .map((r) => {
      const rev = s1 * r;
      const keep = keepOf(s1, r, rate);
      return {
        roas: r,
        rev,
        keep,
        diff: keep - keep0,
        mRoas: s1 !== s0 ? (rev - s0 * r0) / (s1 - s0) : null, // 늘린 돈에서 나온 ROAS
        isNow: Math.abs(r - r0) < 0.005,
        isNeed: Math.abs(r - need) < 0.005,
      };
    });
}
