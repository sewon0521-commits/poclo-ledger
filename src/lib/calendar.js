// 홈 캘린더 — 내 일정 (2026-10-21)
//
// 세원: "캘린더 오른쪽에 있는 오늘 할 일 지우고 업무일지에 오늘 할 일을 채우든 루틴을 채우든 해야 될 듯?
//        그리고 내가 캘린더에 직접 개인적인 일을 쓸 수 있게 — 노션 캘린더나 구글 캘린더처럼."
// → 반복 할 일(예전 calendar.tasks)은 업무일지 루틴(journal_<사람>.routines — 시각·방법 칸)으로 옮겼다. 원래 것은 calendar.movedTasks.
//   홈 캘린더 = 내 일정 + 이벤트 캘린더 기간 막대(10/22 누르면 홈에서 이벤트 창 · 끌어 옮기기) + 신상 6시 표시.
//
// settings 'calendar' { events: [{id, title, start, end, time, endTime, who, color, memo, repeat, createdAt}], movedTasks }
//   start/end : 'YYYY-MM-DD' — 하루짜리는 end 가 비어 있다. time/endTime : 'HH:MM' — time 이 없으면 종일.
//   who       : '세원' | '지원' | '둘 다'.  color 가 비어 있으면 사람 색(whoColor).
//   repeat    : '' | 'weekly' | 'monthly' | 'yearly' — 시작일 기준. 여러 날 일정이면 그 길이 그대로 되풀이.

import { diffDays } from "./events";
import { shiftDay } from "./journal";

export const COLORS = [
  ["#be123c", "로즈"],
  ["#c2410c", "주황"],
  ["#a16207", "겨자"],
  ["#15803d", "초록"],
  ["#0369a1", "하늘"],
  ["#6d28d9", "보라"],
  ["#57534e", "회색"],
];
export const REPEATS = [
  ["", "안 함"],
  ["weekly", "매주"],
  ["monthly", "매월"],
  ["yearly", "매년"],
];
export const whoColor = (who) => (who === "지원" ? "#0369a1" : who === "둘 다" ? "#6d28d9" : "#be123c");
export const colorOfEvent = (e) => e.color || whoColor(e.who);

/** 이 기기에서 업무일지를 쓰는 사람 → 새 일정의 '누가' 기본값 */
export function meWho() {
  try {
    return localStorage.getItem("poclo_journal_me") === "jiwon" ? "지원" : "세원";
  } catch {
    return "세원";
  }
}

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1~12
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** n 달 뒤 같은 날 — 31일이 없는 달은 그달 마지막 날 */
function addMonths(k, n) {
  const [y, m, d] = k.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const Y = t.getUTCFullYear();
  const M = t.getUTCMonth() + 1;
  return ymd(Y, M, Math.min(d, lastDay(Y, M)));
}

export const lengthOf = (e) => Math.max(0, e.end && e.end > e.start ? diffDays(e.start, e.end) : 0);

/** from~to 와 겹치는 그 일정의 자리들 [{e, s, t}] — 반복이면 그 사이에 오는 것 전부 */
export function occurrences(e, from, to) {
  if (!e?.start) return [];
  const len = lengthOf(e);
  const out = [];
  const push = (s) => {
    const t = shiftDay(s, len);
    if (t >= from && s <= to) out.push({ e, s, t });
  };
  if (!e.repeat) push(e.start);
  else if (e.repeat === "weekly") {
    let n = Math.max(0, Math.floor((diffDays(e.start, from) - len) / 7));
    for (let s = shiftDay(e.start, n * 7); s <= to; s = shiftDay(e.start, ++n * 7)) push(s);
  } else {
    const step = e.repeat === "yearly" ? 12 : 1;
    const [ys, ms] = e.start.split("-").map(Number);
    const [yf, mf] = from.split("-").map(Number);
    let n = Math.max(0, Math.floor(((yf - ys) * 12 + (mf - ms)) / step) - 1 - Math.ceil(len / 28));
    for (let s = addMonths(e.start, n * step); s <= to; s = addMonths(e.start, ++n * step)) push(s);
  }
  return out;
}

export const timeLabel = (e) => (e.time ? (e.endTime ? `${e.time}~${e.endTime}` : e.time) : "종일");

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function repeatText(e) {
  if (!e.repeat || !e.start) return "";
  const [y, m, d] = e.start.split("-").map(Number);
  if (e.repeat === "weekly") return `매주 ${WEEK[new Date(y, m - 1, d).getDay()]}요일`;
  if (e.repeat === "monthly") return `매월 ${d}일`;
  return `매년 ${m}월 ${d}일`;
}

/** 'M/D' 또는 'M/D ~ M/D' */
export function periodText(s, t) {
  const md = (k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
  return t && t > s ? `${md(s)} ~ ${md(t)}` : md(s);
}

/** 같은 날 안의 순서 — 종일·여러 날 먼저, 그다음 시각 순 */
export const byTime = (a, b) => (a.e.time || "").localeCompare(b.e.time || "") || a.e.title.localeCompare(b.e.title);
