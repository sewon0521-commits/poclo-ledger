/**
 * 소재 성적표 (2026-10-19 밤) — 보고 › 소재 성적표.
 * 세원: "매출이 안 나오는 건 에이스 소재를 못 찾아서인 것 같다. 확률을 높이는 게임" →
 * 10/19 분석: 광고 매출의 55%가 상위 5개 소재, 에이스 비율 5월 9% → 9월 1%, 새 소재 수 7월 178개 → 10월 18개.
 * 그래서 이 화면은 ① 주마다 몇 개를 쐈나(슛 수) ② 그중 에이스·후보가 몇 개 나왔나 ③ 지금 켜진 것 중 끌 것·키울 것.
 *
 * 자료: settings meta_ad_stats(사무실 PC ads_live.py 가 1시간마다) {at, fields, rows} — 줄 모양은 fields 순서.
 * 판정 규칙은 여기 한 곳에서만 바꾼다(RULES). 화면이 늘 같은 기준으로 본다.
 */

export const RULES = {
  ace: { spend: 50000, roas: 3 }, // 에이스 = 누적 5만 원 넘게 쓰고 ROAS 3 이상
  hopeful: { spend: 10000, roas: 3, pu: 2 }, // 에이스 후보 = 1만 원↑ · ROAS 3↑ · 구매 2건↑ (아직 5만 원 전)
  kill: { spend: 15000, lowSpend: 30000, lowRoas: 1.5 }, // 끌 것 = 켜져 있는데 1.5만 원 써도 구매 0, 또는 3만 원↑인데 ROAS 1.5 아래
  testMax: 15000, // 1.5만 원 전은 '시험 중'
  weekGoal: 25, // 주 새 소재 목표 — 에이스 비율 4%면 주 1개
};

export const STATUS = {
  ace: ["에이스", "bg-rose-700 text-white"],
  hopeful: ["에이스 후보", "bg-emerald-600 text-white"],
  kill: ["끌 것", "bg-amber-400 text-amber-950"],
  test: ["시험 중", "bg-sky-100 text-sky-800"],
  watch: ["지켜보기", "bg-stone-200 text-stone-700"],
  off: ["꺼짐", "bg-stone-100 text-stone-400"],
};

/** 줄 배열 → 소재 객체 + 판정 */
export function readStats(v) {
  const f = v?.fields || [];
  return (v?.rows || []).map((r) => {
    const o = Object.fromEntries(f.map((k, i) => [k, r[i]]));
    o.roas = o.spend ? o.pv / o.spend : 0;
    o.roas7 = o.s7 ? o.pv7 / o.s7 : 0;
    o.ctr = o.imp ? (o.clk / o.imp) * 100 : null;
    o.cpc = o.clk ? o.spend / o.clk : null;
    o.hook = o.v3 && o.imp ? (o.v3 / o.imp) * 100 : null; // 영상 첫 3초 본 비율
    const parts = String(o.name || "").split(" - ").map((s) => s.trim());
    o.format = parts.find((p) => /\d+:\d+|영상|이미지|캐러셀/.test(p)) || "";
    o.kind = /영상/.test(o.format) ? "영상" : /캐러셀/.test(o.format) ? "캐러셀" : /이미지/.test(o.format) ? "이미지" : "";
    o.maker = parts.length >= 4 ? parts[parts.length - 1] : "";
    o.title = parts.length >= 2 ? parts[1] : o.name;
    o.status = statusOf(o);
    return o;
  });
}

export function statusOf(o) {
  const R = RULES;
  if (o.spend >= R.ace.spend && o.roas >= R.ace.roas) return "ace";
  if (o.spend >= R.hopeful.spend && o.roas >= R.hopeful.roas && o.pu >= R.hopeful.pu) return "hopeful";
  if (!o.active) return "off";
  if ((o.spend >= R.kill.spend && !o.pu) || (o.spend >= R.kill.lowSpend && o.roas < R.kill.lowRoas)) return "kill";
  if (o.spend < R.testMax) return "test";
  return "watch";
}

/** 월요일 시작 주 */
export function weekOf(day) {
  const d = new Date(day + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 최근 n주 — 주마다 새 소재 수(meta_ads 전체) · 그중 에이스·후보(성적 있는 것) */
export function weekly(stats, metaAds, n = 12, today = new Date()) {
  const cur = weekOf(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cur + "T00:00:00");
    d.setDate(d.getDate() - 7 * i);
    weeks.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const made = Object.fromEntries(weeks.map((w) => [w, 0]));
  for (const [, created] of metaAds?.items || []) {
    const w = created && weekOf(created);
    if (w in made) made[w] += 1;
  }
  const good = Object.fromEntries(weeks.map((w) => [w, { ace: 0, hopeful: 0, spend: 0, pv: 0 }]));
  for (const o of stats) {
    const w = o.created && weekOf(o.created);
    if (!(w in good)) continue;
    if (o.status === "ace") good[w].ace += 1;
    if (o.status === "hopeful") good[w].hopeful += 1;
    good[w].spend += o.spend;
    good[w].pv += o.pv;
  }
  return weeks.map((w) => ({ week: w, made: made[w], ...good[w] }));
}
