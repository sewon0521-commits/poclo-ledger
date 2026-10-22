/**
 * 경쟁몰 이벤트 (2026-10-22) — 보고 › 경쟁몰 이벤트.
 *
 * 세원: "제니어리랑 경쟁사들 이벤트도 계속 모니터링해줘. 누가 언제 뭘하는지 보고 우리도 따라하던 하게."
 *       "얼리윈터 같은건 제니어리는 언제부터 시작했고 언제까지 하는지도 참고해줘바"
 *
 * 사무실 PC poclo-cafe24/mall_events.py 가 매일 아침(아침 보고 마지막) 사입 트래커 몰마다 '이벤트 흔적'을 모아
 *   settings 'mall_events_log'  누적 타임라인 {updated, malls:{host:{name, first, last, err?}}, items:[{id, host, kind, text, link, img, extra,
 *                                first, last, pre?, gone?, back?}]}
 *   settings 'mall_events_<날짜>' 그날 스냅샷(30일) · 'mall_events_days' {items:[날짜…]}
 * 에 둔다. 여기서는 그걸 읽어 진행 중 · 최근 시작/끝 · 타임라인으로 보여 준다(쓰기 없음).
 *   first/last = 처음·마지막으로 본 날. pre = 그 몰을 처음 모은 날 이미 있던 것('10/22 이전부터').
 *   gone = 사라진 걸 알아챈 날(끝난 날 = last). 띠·팝업·배너·태그·상세 그림은 이틀 연속 안 보여야 끝(gone = 처음 안 보인 날).
 *   7일 안에 다시 보이면 같은 이벤트로 이어 붙인다.
 *   extra: 쿠폰 {rate, from, to} · 이벤트 분류 {photo:{lo, hi, min, cnt, n}} (그 분류 상품 사진 올린 날 — 시작 추정) ·
 *          배너·팝업·상세 {up} (그림 주소의 올린 날) · 태그 {n, of} (상품 몇 개에 붙었나)
 */
import { daysBetween } from "./tracker";

export const LOG_KEY = "mall_events_log";
export const DAYS_KEY = "mall_events_days";

/** 종류 — 화면 순서·색. 색은 이벤트 캘린더(lib/events KINDS)와 같은 계열 */
export const KINDS = [
  ["coupon", "쿠폰", "#b45309"],
  ["menu", "이벤트 분류", "#be123c"],
  ["top", "띠 배너", "#6d28d9"],
  ["popup", "팝업", "#a21caf"],
  ["detail", "상세 배너", "#0f766e"],
  ["banner", "메인 배너", "#1d4ed8"],
  ["tag", "상품 태그", "#57534e"],
  ["newcat", "새 분류", "#047857"],
];
export const kindLabel = (k) => (KINDS.find((x) => x[0] === k) || [k, k])[1];
export const kindColor = (k) => (KINDS.find((x) => x[0] === k) || [k, k, "#57534e"])[2];
/** 타임라인에 기본으로 그리는 종류 — 배너·태그는 많고 자주 바뀌어서 켜야 보인다 */
export const TIMELINE_DEFAULT = ["coupon", "menu", "top", "popup", "detail", "newcat"];

/** '2026-10-22' → '10/22' · 달까지만 있으면('2026-10') '10월' */
export const md = (d) => (!d ? "" : d.length <= 7 ? `${Number(d.slice(5, 7))}월` : `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`);
export const mdOrMonth = md;

export const isLive = (it) => !it.gone;

/** 시작 추정 — 쿠폰 기간 시작 · 이벤트 분류 상품 사진(대부분이 몰린 첫 날) · 그림 올린 날. 처음 본 날보다 앞일 때만 */
export function guessStart(it) {
  const ex = it.extra || {};
  const cands = [];
  if (ex.from) cands.push([ex.from, "쿠폰 기간"]);
  if (ex.photo?.lo && ex.photo.lo.length >= 10) cands.push([ex.photo.lo, "상품 사진"]);
  else if (ex.photo?.lo) cands.push([ex.photo.lo + "-01", "상품 사진"]);
  if (ex.up) cands.push([ex.up, "그림 올린 날"]);
  const ok = cands.filter(([d]) => d && d <= it.first).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return ok[0] ? { day: ok[0][0], why: ok[0][1] } : null;
}

/** 며칠째(진행 중) / 며칠 했나(끝남) — 처음 본 날 기준. 그 전부터면 '최소' */
export function spanDays(it, today) {
  const end = it.gone ? it.last : today;
  return Math.max(1, daysBetween(it.first, end) + 1);
}

/** 한 줄 설명 — '10/22 이전부터 · 최소 1일째' · '10/20 시작 · 3일째' · '10/14~10/31 쿠폰 · 9일 남음' · '10/18~10/21 (4일) 끝' */
export function whenText(it, today) {
  if (it.gone) return endedText(it);
  const n = spanDays(it, today);
  const ex = it.extra || {};
  const parts = [it.pre ? `${md(it.first)} 이전부터${n > 1 ? ` · 최소 ${n}일째` : ""}` : `${md(it.first)} 시작 · ${n}일째`];
  if (ex.to) {
    const left = daysBetween(today, ex.to);
    parts.push(left >= 0 ? `${md(ex.to)}까지(${left === 0 ? "오늘 끝" : left + "일 남음"})` : `${md(ex.to)}에 끝날 예정이었음`);
  }
  if (it.missOn) parts.push(`${md(it.missOn)}엔 안 보임 — 하루 더 보고 끝`);
  return parts.join(" · ");
}

/** 끝난 항목 설명(위 함수의 gone 갈래를 읽기 쉽게) */
export function endedText(it) {
  const a = it.pre ? `${md(it.first)} 이전` : md(it.first);
  return `${a}~${md(it.last)} (${Math.max(1, daysBetween(it.first, it.last) + 1)}일${it.pre ? " 이상" : ""}) · ${md(it.gone)}에 사라짐`;
}

/** 덧붙이는 정보 — 쿠폰 할인·기간, 상품 사진 날짜, 태그 개수, 그림 올린 날 */
export function extraText(it) {
  const ex = it.extra || {};
  const out = [];
  if (it.kind === "coupon") {
    if (ex.rate) out.push(ex.rate);
    if (ex.from || ex.to) out.push(`기간 ${md(ex.from) || "?"}~${md(ex.to) || "?"}`);
  }
  if (ex.photo?.cnt) {
    const p = ex.photo;
    out.push(`상품 사진 ${mdOrMonth(p.lo)}~${mdOrMonth(p.hi)}${p.min && p.min !== p.lo ? ` (가장 이른 ${mdOrMonth(p.min)})` : ""} · 상품 ${p.n}개`);
  }
  if (it.kind === "tag" && ex.n) out.push(`상품 ${ex.n}/${ex.of}개`);
  if (ex.up && it.kind !== "coupon") out.push(`그림 ${md(ex.up)} 올림`);
  return out.join(" · ");
}

/** 몰 이름 — 경쟁몰 관리(tracker_malls) 이름 우선 */
export const mallName = (log, conf, host) => conf?.[host]?.name || log?.malls?.[host]?.name || host;

/** 고르기 — 종류·몰·찾기(문구·몰 이름) */
export function pick(items, { kinds, host, q, log, conf }) {
  const qq = String(q || "").trim().toLowerCase().replace(/\s+/g, "");
  return items.filter((it) => {
    if (kinds?.length && !kinds.includes(it.kind)) return false;
    if (host && it.host !== host) return false;
    if (qq) {
      const hay = (String(it.text || "") + mallName(log, conf, it.host) + (it.extra?.rate || "")).toLowerCase().replace(/\s+/g, "");
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
}

/** 최근 N일 안에 새로 시작(이전부터는 빼고) / 끝난 것 — 새것 먼저 */
export function recent(items, today, n = 7) {
  const since = shiftKey(today, -(n - 1));
  const started = items.filter((it) => !it.pre && it.first >= since).sort((a, b) => (a.first < b.first ? 1 : a.first > b.first ? -1 : 0));
  const ended = items.filter((it) => it.gone && it.gone >= since).sort((a, b) => (a.gone < b.gone ? 1 : a.gone > b.gone ? -1 : 0));
  return { started, ended, since };
}

export function shiftKey(key, n) {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ORDER = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
/** 진행 중인 것을 몰별로 — 최근 시작이 있는 몰 먼저, 그다음 이벤트성 항목(쿠폰·분류·띠·팝업)이 많은 몰 */
export function liveByMall(items, today) {
  const by = new Map();
  for (const it of items) {
    if (!isLive(it)) continue;
    if (!by.has(it.host)) by.set(it.host, []);
    by.get(it.host).push(it);
  }
  const since = shiftKey(today, -6);
  const score = (list) => [list.some((x) => !x.pre && x.first >= since) ? 1 : 0, list.filter((x) => ["coupon", "menu", "top", "popup"].includes(x.kind)).length];
  return [...by.entries()]
    .map(([host, list]) => ({ host, list: list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.first < b.first ? 1 : -1)) }))
    .sort((a, b) => {
      const [x1, y1] = score(a.list);
      const [x2, y2] = score(b.list);
      return x2 - x1 || y2 - y1 || a.host.localeCompare(b.host);
    });
}

/**
 * 타임라인 줄 — 몰별로 묶고 줄마다 막대: 본 기간(first~last, 진행 중이면 오늘까지) + 앞쪽 점선(시작 추정·쿠폰 기간 시작)
 * + 뒤쪽 점선(쿠폰 끝나는 날까지 남은 기간). 범위 [from, to] 밖은 잘라서 그린다.
 */
export function timelineRows(items, today, from) {
  const rows = [];
  for (const it of items) {
    const end = it.gone ? it.last : today;
    const g = guessStart(it);
    const ex = it.extra || {};
    const planEnd = !it.gone && ex.to && ex.to > end ? ex.to : "";
    const lo = g && it.pre ? g.day : it.first;
    if ((planEnd || end) < from) continue;
    rows.push({ it, seenFrom: it.first, seenTo: end, guessFrom: it.pre && g ? g.day : "", guessWhy: it.pre && g ? g.why : "", planTo: planEnd, lo });
  }
  return rows;
}

/** 우리 이벤트 캘린더(settings 'events') → 타임라인에 같이 그릴 줄 */
export function ourRows(events, today, from) {
  return (events || [])
    .filter((e) => !e.always && e.start)
    .map((e) => ({ id: "our:" + e.id, title: e.title || "이름 없는 이벤트", kind: e.kind, start: e.start, end: e.end || e.start }))
    .filter((e) => e.end >= from)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((e) => ({ ...e, future: e.start > today }));
}

/** 날짜 → 막대 위치(%) */
export function pos(day, from, to) {
  const total = Math.max(1, daysBetween(from, to) + 1);
  const i = Math.min(Math.max(daysBetween(from, day), 0), total);
  return (i / total) * 100;
}
