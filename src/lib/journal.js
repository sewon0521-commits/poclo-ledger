// 업무일지 (2026-09-24) — 세원·지원이 각자 하루 한 페이지.
// 세원: "자동으로 채우는 건 아닌 것 같아. 우리 둘이 각자 쓰고, 나중에 되돌아보는 기록·할 일 관리.
//        쇼필공 ERP 랑은 좀 많이 달랐으면. 자유롭게 글쓰는 편이 편해."
// → 보고서(제출·정해진 칸·AI 태그·시간 기록)가 아니라 노트. 쓰는 대로 저장, 할 일만 체크 목록.
//
// 저장: settings 'journal_<사람>' = {
//   days:  { "2026-09-24": { text, at } },           하루 한 페이지 (빈 글이면 지운다)
//   todos: [{ id, text, done, doneOn, createdOn }]    날짜에 묶지 않는다 — 안 끝난 건 오늘 페이지에 계속 보인다(=넘어옴)
// }
// 사람마다 키가 달라 둘이 동시에 써도 서로 덮지 않는다. 쓸 때마다 서버 최신을 읽어 그 부분만 바꿔 쓴다.

import { isRemote, supabase } from "./supabase";

export const PEOPLE = [
  ["sewon", "세원"],
  ["jiwon", "지원"],
];

const EMPTY = { days: {}, todos: [] };
const keyOf = (who) => `journal_${who}`;
const localKey = (who) => `poclo_${keyOf(who)}`;

/** 이 기기의 날짜로 YYYY-MM-DD (toISOString 은 UTC 라 새벽에 하루 밀린다) */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDay(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function dayTitle(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`;
}
export const shortDay = (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;

function readLocal(who) {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(localKey(who)) || "null") };
  } catch {
    return EMPTY;
  }
}
function writeLocal(who, v) {
  try {
    localStorage.setItem(localKey(who), JSON.stringify(v));
  } catch {
    /* 가득 찼거나 막힘 — 서버에는 저장된다 */
  }
}

export async function loadJournal(who, online) {
  if (!(isRemote && online)) return readLocal(who);
  const { data, error } = await supabase.from("settings").select("value").eq("key", keyOf(who)).maybeSingle();
  if (error) throw error;
  const v = { ...EMPTY, ...(data?.value || {}) };
  writeLocal(who, v);
  return v;
}

/** 서버 최신을 읽어 change(v) 로 바꿔 쓴다. 바뀐 값을 돌려준다 */
export async function changeJournal(who, online, change) {
  const base = isRemote && online ? await loadJournal(who, online) : readLocal(who);
  const next = change({ days: { ...base.days }, todos: [...base.todos] });
  writeLocal(who, next);
  if (isRemote && online) {
    const { error } = await supabase.from("settings").upsert({ key: keyOf(who), value: next });
    if (error) throw error;
  }
  return next;
}
