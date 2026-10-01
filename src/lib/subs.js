// 구독 · 고정 지출 (2026-10-01)
//
// 세원: "우리가 지금 어떤 사이트를 구독하고 있고 어떤 거에서 금액이 나가고 있고 — 지출 내역을 한 번에 볼 수 있게.
//        노션(쇼필공 OS 구독관리)처럼 해도 되는데 좀 구려 보여서 세련되게. 돈 카테고리에 구독."
// 노션은 월간·연간 카드 두 판이었다. 여기서는 **한 달에 얼마 나가는지**를 맨 위에 두고, **다음 결제일 순서**로 줄을 세운다.
//
// settings 'subscriptions' {items:[{id, name, cycle, price, status, start, card, kind, url, memo, endedOn, createdAt}]}
//   cycle  : "month" | "year"
//   status : "active"(구독 중) | "trial"(무료체험 — start 가 첫 결제일) | "ended"(해지)
//   start  : 결제 시작일(첫 결제일). 다음 결제일은 여기서 주기만큼 넘겨 계산한다(따로 적지 않는다 — 노션처럼 손으로 고칠 일이 없게).

import { dayKey } from "./journal";

export const CYCLES = [
  ["month", "월간"],
  ["year", "연간"],
];
export const STATUSES = [
  ["active", "구독 중"],
  ["trial", "무료체험"],
  ["ended", "해지"],
];
export const KINDS = ["쇼핑몰·운영", "디자인·영상", "AI·업무툴", "광고·마케팅", "고정비", "기타"];
// 처음 넣을 때 바로 고르는 것 — 이름만 채워 준다(금액·날짜는 세원이 적는다)
export const QUICK = [
  ["카페24", "쇼핑몰·운영"],
  ["Claude", "AI·업무툴"],
  ["Adobe", "디자인·영상"],
  ["Canva", "디자인·영상"],
  ["VREW", "디자인·영상"],
  ["Notion", "AI·업무툴"],
  ["그랜터", "쇼핑몰·운영"],
  ["CapCut", "디자인·영상"],
];

const parse = (k) => {
  const [y, m, d] = String(k).split("-").map(Number);
  return { y, m, d };
};
const key = (y, m, d) => {
  // 달 끝을 넘으면 그달 마지막 날로 (1/31 시작 → 2/28)
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

/** 다음 결제일 — 시작일에서 주기만큼 넘겨 오늘 이후 첫 날 (해지면 없음) */
export function nextPay(s, today = dayKey()) {
  if (!s.start || s.status === "ended") return "";
  if (s.start >= today) return s.start;
  const { y, m, d } = parse(s.start);
  const step = s.cycle === "year" ? 12 : 1;
  const t = parse(today);
  let n = Math.max(0, Math.floor(((t.y - y) * 12 + (t.m - m)) / step) * step - step);
  for (let i = 0; i < 40; i++, n += step) {
    const mm = m - 1 + n;
    const k = key(y + Math.floor(mm / 12), (mm % 12) + 1, d);
    if (k >= today) return k;
  }
  return "";
}

/** 오늘부터 며칠 */
export function daysUntil(k, today = dayKey()) {
  if (!k) return null;
  const a = parse(k);
  const b = parse(today);
  return Math.round((new Date(a.y, a.m - 1, a.d) - new Date(b.y, b.m - 1, b.d)) / 86400000);
}

/** 한 달로 치면 얼마 (연간은 12로 나눔) */
export const monthly = (s) => (s.status === "ended" ? 0 : s.cycle === "year" ? (Number(s.price) || 0) / 12 : Number(s.price) || 0);

/** 맨 위 숫자 — 한 달 · 1년 · 앞으로 30일 안에 나갈 돈 */
export function summary(list, today = dayKey()) {
  const live = list.filter((s) => s.status !== "ended");
  const month = live.reduce((a, s) => a + monthly(s), 0);
  const soon = live
    .map((s) => ({ s, at: nextPay(s, today) }))
    .filter((x) => x.at && daysUntil(x.at, today) <= 30);
  return {
    month,
    year: month * 12,
    count: live.length,
    trials: live.filter((s) => s.status === "trial").length,
    soonTotal: soon.reduce((a, x) => a + (Number(x.s.price) || 0), 0),
    soonCount: soon.length,
  };
}

/** 이름으로 정해지는 타일 색 — 로고 대신 (바깥 이미지를 안 불러온다) */
const TILE = ["#9f1239", "#44403c", "#0f766e", "#1d4ed8", "#a16207", "#6d28d9", "#be123c", "#334155"];
export function tileColor(name) {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE[h % TILE.length];
}
