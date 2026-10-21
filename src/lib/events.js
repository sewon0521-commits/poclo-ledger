// 이벤트 캘린더 (2026-10-17)
//
// 세원: "재구매 쿠폰을 뿌리고, 고객들에게 이벤트나 그런 걸 배너로 알리기도 해야 되는데 이 계획을 짜는 틀을 ERP 에 — 이벤트 캘린더."
// 배경(10/16~17 방향성 대화): 광고비를 매출의 10%로 맞추려면 광고 없이 들어오는 매출(재구매·알림·배너)을 키워야 한다.
//   10월 주문당 광고비 약 1.4만 원 vs 재구매 쿠폰 3천 원 — 한 번 산 손님을 다시 데려오는 게 훨씬 싸다.
//
// settings 'events' {items:[{id, title, kind, start, end, always, target, benefit, couponNo, channels[], banner, todos[{id,text,done}], memo, createdAt}]}
//   start/end : 'YYYY-MM-DD' (하루짜리는 같게). always = 상시(재구매 쿠폰처럼 기간 없이 계속) — 달력 막대 대신 위 '상시 진행'에.
//   결과는 저장하지 않는다 — 매출 장부(sales_daily)에서 그 기간 총매출을 그때그때 센다(resultOf).
//   신상 업로드(주간 운영 루틴)는 저장하지 않고 달력에 '신상' 표시만 — DROP_DAYS 한 곳에서 정한다.

import { dayKey, shiftDay } from "./journal";

export const KEY = "events";

/** 신상 업로드 날 — 10/20 세원: "신상 업로드 월, 화 저녁 6시로 변경" (예전 월·목). 요일 0=일 … 6=토 */
export const DROP_DAYS = [1, 2];
export const DROP_LABEL = "신상 6시";

export const KINDS = [
  ["promo", "기획전", "#be123c"],
  ["coupon", "쿠폰", "#b45309"],
  ["drop", "신상 드랍", "#0f766e"],
  ["banner", "배너", "#6d28d9"],
  ["message", "카톡·문자", "#1d4ed8"],
  ["content", "릴스·콘텐츠", "#a21caf"],
  ["etc", "기타", "#57534e"],
];
export const kindOf = (k) => KINDS.find(([v]) => v === k) || KINDS.at(-1);
export const colorOf = (k) => kindOf(k)[2];

export const TARGETS = ["전체 고객", "신규 가입", "첫 구매", "재구매 (한 번 산 손님)", "카톡 채널 친구"];
export const CHANNELS = ["메인 배너", "팝업", "카톡 채널", "알림톡", "문자", "인스타 스토리", "릴스", "박스 동봉 카드"];

/** 종류를 고르면 미리 깔아 주는 할 일 (비어 있을 때만) */
export const KIND_TODOS = {
  promo: ["기획전 상품 고르기", "할인·쿠폰 만들기", "배너 만들기 (PC·모바일)", "카톡 채널 알림", "쇼만마에 소재 요청"],
  coupon: ["카페24 쿠폰 만들기", "알리는 방법 정하기", "쿠폰 사용 수 확인"],
  drop: ["상품 진열 켜기", "인스타 스토리", "카톡 채널 신상 알림", "메인 배너 바꾸기"],
  banner: ["배너 문구 정하기", "PC·모바일 이미지 만들기", "배너매니저에 올리기", "끝나는 날 내리기"],
  message: ["보낼 문구 쓰기", "보낼 대상 고르기", "보내기"],
  content: ["기획", "촬영", "편집", "올리기"],
  etc: [],
};

/** 처음 넣을 때 바로 고르는 틀 */
export const TEMPLATES = [
  {
    label: "재구매 쿠폰 (상시)",
    title: "재구매 쿠폰",
    kind: "coupon",
    always: true,
    target: "재구매 (한 번 산 손님)",
    benefit: "3,000원 할인 · 3만 원 이상 · 받은 날부터 14일",
    channels: ["박스 동봉 카드", "알림톡"],
    todos: ["카페24 쿠폰 만들기 (배송 완료 후 자동 발급)", "박스 동봉 카드에 쿠폰 안내 넣기 (넥스트팩)", "알림톡·카톡 채널로 알릴지 정하기", "2주 뒤 쿠폰 사용 수 확인"],
  },
  {
    label: "신상 드랍",
    title: "신상 드랍",
    kind: "drop",
    channels: ["인스타 스토리", "카톡 채널", "메인 배너"],
  },
  {
    label: "시즌 기획전",
    title: "기획전",
    kind: "promo",
    target: "전체 고객",
    channels: ["메인 배너", "팝업", "카톡 채널", "인스타 스토리"],
  },
];

export const newTodo = (text) => ({ id: Math.random().toString(36).slice(2, 10), text, done: false });

const ms = (k) => Date.parse(k + "T00:00:00Z");
/** 두 날짜 사이 날수 (b − a) */
export const diffDays = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
export const weekday = (k) => new Date(ms(k)).getUTCDay(); // 0 = 일

/** 달력 — 그달을 덮는 주들 (일요일부터) */
export function monthWeeks(ym) {
  const first = `${ym}-01`;
  let k = shiftDay(first, -weekday(first));
  const weeks = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftDay(k, i)));
    k = shiftDay(k, 7);
  } while (k.slice(0, 7) <= ym && weeks.length < 6);
  return weeks;
}
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const endOf = (e) => e.end || e.start || "";
export const isOn = (e, k) => !e.always && e.start && e.start <= k && endOf(e) >= k;

/** 한 주 안의 막대들 — 겹치면 아래 줄로 (lane) */
export function weekBars(events, week) {
  const ws = week[0];
  const we = week[6];
  const bars = events
    .filter((e) => !e.always && e.start && endOf(e) >= ws && e.start <= we)
    .map((e) => ({ e, s: e.start < ws ? ws : e.start, t: endOf(e) > we ? we : endOf(e), cutL: e.start < ws, cutR: endOf(e) > we }))
    .sort((a, b) => a.s.localeCompare(b.s) || diffDays(b.s, b.t) - diffDays(a.s, a.t));
  const lanes = [];
  for (const b of bars) {
    let i = lanes.findIndex((last) => last < b.s);
    if (i < 0) {
      i = lanes.length;
      lanes.push(b.t);
    } else lanes[i] = b.t;
    b.lane = i;
    b.col = diffDays(ws, b.s);
    b.span = diffDays(b.s, b.t) + 1;
  }
  return { bars, lanes: lanes.length };
}

/** 그 기간 총매출 (매출 장부) + 바로 앞 같은 날수와 비교 — 오늘 것은 아직 다 안 들어와서 어제까지 */
export function resultOf(e, rows, today = dayKey()) {
  if (e.always || !e.start) return null;
  const to = endOf(e) < today ? endOf(e) : shiftDay(today, -1);
  if (to < e.start) return null;
  const n = diffDays(e.start, to) + 1;
  const pFrom = shiftDay(e.start, -n);
  const pTo = shiftDay(e.start, -1);
  let sum = 0;
  let prev = 0;
  let have = 0;
  for (const r of rows || []) {
    const g = r.cafeGross || r.gross || 0;
    if (r.date >= e.start && r.date <= to) {
      sum += g;
      have++;
    } else if (r.date >= pFrom && r.date <= pTo) prev += g;
  }
  if (!have) return null;
  return { days: n, sum, perDay: sum / n, prevPerDay: prev / n, change: prev ? (sum - prev) / prev : null, partial: to < endOf(e) };
}

export const periodLabel = (e) => {
  if (e.always) return "상시";
  if (!e.start) return "날짜 없음";
  const md = (k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
  return endOf(e) === e.start ? md(e.start) : `${md(e.start)} ~ ${md(endOf(e))}`;
};

// ------------------------------------------------------------------ 홈 캘린더 (10/19 밤 → 10/21 내 일정)
// 세원: "캘린더를 우리 하나 만들까? 어떤 날짜에 어떻게 하라고?" → 처음엔 이벤트 캘린더에 얹었다가
//       "이벤트 캘린더는 이벤트 용도로 냅두고, 캘린더는 홈에 대문짝하게 — 뭐할지 한 번에 보이니까" → 홈 맨 위(HomeCalendar).
// 10/21: 반복 할 일(calendar.tasks)은 업무일지 루틴으로 옮기고 캘린더는 내 일정만 — 모양은 lib/calendar.js 머리말.
export const CAL_KEY = "calendar";
export const WHO = ["세원", "지원", "둘 다"];
export const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
