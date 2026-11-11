/**
 * 소재 성적표 (2026-10-19 밤) — 보고 › 소재 성적표.
 * 세원: "매출이 안 나오는 건 에이스 소재를 못 찾아서인 것 같다. 확률을 높이는 게임" →
 * 10/19 분석: 광고 매출의 55%가 상위 5개 소재, 에이스 비율 5월 9% → 9월 1%, 새 소재 수 7월 178개 → 10월 18개.
 * 그래서 이 화면은 ① 주마다 몇 개를 쐈나(슛 수) ② 그중 에이스·후보가 몇 개 나왔나 ③ 지금 켜진 것 중 끌 것·키울 것.
 *
 * 자료: settings meta_ad_stats(사무실 PC ads_live.py 가 1시간마다) {at, fields, rows} — 줄 모양은 fields 순서.
 * 판정 규칙은 여기 한 곳에서만 바꾼다(RULES). 화면이 늘 같은 기준으로 본다.
 */

// ⭐ 11/12 세원 광고 판단 기준(포클로_방향성 창): "보수적으로 2.7 잡아" · "클릭 후 1일로 통일 — 이 광고를 보고 오늘 산 사람이니까" · 옛 기준은 쇼만마 쓰니까 안 씀
//   → **판단에 쓰는 ROAS·구매는 전부 클릭 후 1일**(roas1 · pu1). 결과 ROAS(7일 클릭 + 1일 조회 = roas·pu)는 표에 보여 주기만.
//   테스트 = 소재당 1만 원 · 1만 원 넘게 썼는데 판매 0 → 끔 · 팔림 = 1일 ROAS 2.7↑ + 결과당 비용 1만 원↓.
//   (예전 '3만 원↑인데 ROAS 1.5 아래 끔' · 시험 1.5만 원은 새 기준에 없어서 뺐다)
export const RULES = {
  ace: { spend: 50000, roas: 3 }, // 에이스 = 누적 5만 원 넘게 쓰고 1일 ROAS 3 이상
  hopeful: { spend: 10000, roas: 2.7, cpr: 10000 }, // 팔림 = 1만 원↑ · 1일 ROAS 2.7↑ · 결과당 비용(광고비 ÷ 1일 구매) 1만 원↓
  kill: { spend: 10000 }, // 끌 것 = 켜져 있는데 1만 원 넘게 써도 1일 구매 0
  testMax: 10000, // 1만 원 전은 '시험 중'(테스트 소재당 1만 원)
  weekGoal: 25, // 주 새 소재 목표 — 에이스 비율 4%면 주 1개
  // 11/10 세원 "1군 왕관" (위키 topics/1군-원칙.md) — 링크 CPC = 광고비 ÷ 링크 클릭(lc). 전체 클릭(clk)은 20~30% 많아서 안 쓴다
  gun: { spend: 10000, cpc: 200, cpc2: 300, pu: 1, roas: 2.7 }, // 11/12 1일 ROAS 하한 2.5 → 2.7 (1군·2군·상품 힘 같이)
};

/** 1군 판정 — 광고비 1만↑ 만. 👑 1군 = 링크 CPC 200 미만 + 클릭 후 1일 구매 1건↑ + 1일 ROAS 2.7↑ */
export const GUN = {
  gun1: ["👑 1군", "bg-amber-100 text-amber-900 ring-1 ring-amber-300"],
  gun2: ["🥈 2군", "bg-slate-100 text-slate-800 ring-1 ring-slate-300"],
  comp: ["구도 합격", "bg-violet-100 text-violet-800"],
  power: ["상품 힘", "bg-indigo-50 text-indigo-700"],
};

export function gunOf(o) {
  const G = RULES.gun;
  if (o.spend < G.spend || o.lcpc == null) return "";
  const sold = (o.pu1 || 0) >= G.pu && o.roas1 >= G.roas;
  if (o.lcpc < G.cpc) return sold ? "gun1" : "comp";
  // 11/10 세원 "2군도 만들어 줄 수 있나?" → A안: 링크 CPC 200~300 + 1일 구매 1↑ + 1일 ROAS 2.7↑ (11/12 2.5 → 2.7)
  if (o.lcpc < G.cpc2 && sold) return "gun2";
  return o.roas1 >= G.roas ? "power" : "";
}

export const STATUS = {
  ace: ["에이스", "bg-rose-700 text-white"],
  hopeful: ["팔림", "bg-emerald-600 text-white"], // 11/12 '에이스 후보' → 세원 기준 '팔림'(키 이름은 그대로)
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
    // '(9:16) 261101 - 테디 … - 9:16 영상 - …' 처럼 맨 앞에도 비율이 붙는 이름이 있어서 형식 낱말이 든 칸을 먼저 (11/10)
    o.format = parts.find((p) => /영상|이미지|캐러셀/.test(p)) || parts.find((p) => /\d+:\d+/.test(p)) || "";
    o.kind = /영상/.test(o.format) ? "영상" : /캐러셀/.test(o.format) ? "캐러셀" : /이미지/.test(o.format) ? "이미지" : "";
    o.maker = parts.length >= 4 ? parts[parts.length - 1] : "";
    o.title = parts.length >= 2 ? parts[1] : o.name;
    o.status = statusOf(o);
    o.lcpc = o.lc ? o.spend / o.lc : null; // 링크 CPC (11/10)
    o.roas1 = o.spend ? (o.pv1 || 0) / o.spend : 0; // 클릭 후 1일 ROAS
    o.gun = gunOf(o);
    o.models = String(o.mdl || "").split(",").filter(Boolean); // 상품 폴더 메모 '모델:' (ads_live.py)
    return o;
  });
}

/** 판정 — ROAS·구매는 클릭 후 1일만(11/12). readStats 가 roas1 을 먼저 채운 뒤 부른다 */
export function statusOf(o) {
  const R = RULES;
  const pu1 = o.pu1 || 0;
  const roas1 = o.spend ? (o.pv1 || 0) / o.spend : 0;
  if (o.spend >= R.ace.spend && roas1 >= R.ace.roas) return "ace";
  if (o.spend >= R.hopeful.spend && roas1 >= R.hopeful.roas && pu1 > 0 && o.spend / pu1 <= R.hopeful.cpr) return "hopeful";
  if (!o.active) return "off";
  if (o.spend > R.kill.spend && !pu1) return "kill";
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
  const good = Object.fromEntries(weeks.map((w) => [w, { ace: 0, hopeful: 0, spend: 0, pv: 0 }])); // pv = 결과 매출(보여 주기만)
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
