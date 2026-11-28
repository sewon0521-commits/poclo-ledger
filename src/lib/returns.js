/**
 * CS 관리 › 반품·교환 (2026-11-24, 포클로_방향성 창 전달 — 세원 "반품, 교환 자동화는 좋다잉 진행해줘", 1단계)
 *
 * 자료
 *  - settings returns_live  {at, rows}  사무실 PC poclo-cafe24/returns_track.py 가 10분마다 — 최근 60일 주문의 반품(R)·교환(E)·취소(C) 줄(클레임 코드끼리 묶음)
 *  - settings returns_stats {at, since, months, products, reasons}  같은 파일이 하루 한 번(06시 뒤) — 8/1부터 월별·상품별·사유
 *  - settings returns_marks {marks: {[줄 id]: {np:{on}, arrived:{on}, memo, cls}}}  ERP 에서 누른 것(넥스트팩 회수 접수·입고 확인·메모·사유 고침) — PC 가 안 덮는다
 *  - settings stock  넥스트팩 현재고(교환 재고 보기)
 *
 *  - settings np_returns  {at, rows}  사무실 PC poclo-cafe24/np_returns.py 가 30분마다 — 넥스트팩 '반품 교환 신청' 최근 신청(31일): 이름·반품/교환 수거·상품·옵션·상태(방문 예정·수거 완료·다시 신청 필요)
 *  - settings np_pickup   {mode, items}  ERP '넥스트팩 수거 접수' 버튼 → 사무실 PC 가 넥스트팩에 접수(mode live 일 때만 신청 단추, 아니면 미리보기) — 11/24 세원 "버튼만 누르면 넥스트팩 접수"
 *  - settings orders_track  결제수단(카페24 60일 주문 — returns_live 에 pm 이 없던 때 대신)
 * 단계: 요청(넥스트팩 회수 접수 전) → [세원이 넥스트팩에 회수 접수] → 회수 중 → 입고·검수 → 환불·교환 완료.
 *   넥스트팩 최근 신청과 이름·상품으로 맞춰 단계를 저절로 옮긴다(방문 예정 = 회수 중 · 수거 완료 = 입고·검수 · 다시 신청 필요 = 빨강).
 * 11/24 세원: 배송비 기준 7만 원 하나 · 반품 주소 남양주 · 카드 등은 환불금에서 배송비 차감 · 계좌이체(무통장) 손님만 문자 · 네이버페이는 네이버에서 차감.
 *   단계마다 머문 평일이 STALE 을 넘으면 빨강(오래 멈춤).
 * 판단 초안: 사유(변심·불량·오배송, PC 가 카페24 사유 코드+글로 나눔 — ERP 에서 고칠 수 있음) · 배송비(쇼핑몰 공지 규칙) · 받은 지 7일 안 · 교환 재고 · 손님 안내 글(틀, AI 안 씀).
 * ⛔ 자동으로 안 하는 것: 환불 · 손님에게 보내기 · 넥스트팩 입력 · 카페24·네이버 반품 승인(2~4단계, 세원 확인 뒤).
 */
import { codeOf } from "./cs";

const NL = String.fromCharCode(10);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** ISO → 이 기기 날짜 'YYYY-MM-DD' */
export const dayOf = (iso) => {
  const s = String(iso || "");
  if (!s) return "";
  if (s.length === 10) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : ymd(d);
};
export const md = (iso) => {
  const s = dayOf(iso);
  return s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "";
};
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
/** a 다음 날부터 b 까지 평일 수 */
export function weekdaysBetween(a, b) {
  if (!a || !b || b <= a) return 0;
  const d = new Date(`${a}T00:00:00`);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    d.setDate(d.getDate() + 1);
    if (ymd(d) > b) break;
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
}
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;

export const KIND = { R: "반품", E: "교환", C: "취소" };
export const KIND_TONE = { R: "bg-rose-50 text-rose-800 ring-rose-200", E: "bg-violet-50 text-violet-800 ring-violet-200", C: "bg-stone-100 text-stone-700 ring-stone-200" };
export const CLS = { change: "변심", defect: "불량", wrong: "오배송" };
export const placeOf = (place) => (/네이버\s*페이/.test(place || "") ? "네이버페이" : /톡\s*체크아웃/.test(place || "") ? "톡체크아웃" : "카페24");

/** 단계 — 순서가 화면 순서 */
export const STAGES = [
  ["req", "요청 · 회수 접수 필요"],
  ["pickup", "회수 중"],
  ["check", "입고·검수"],
  ["done", "환불·교환 완료"],
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
/** 이만큼 평일이 지나면 '오래 멈춤'(빨강) — 방향성 계획(11/24): 요청 1일 · 회수 중 5일 · 입고·검수 2일(환불은 3영업일 안 — 쇼핑몰 규정) */
export const STALE = { req: 1, pickup: 5, check: 2 };
/** 완료는 이만큼 지난 것까지만 목록에 */
export const DONE_KEEP = 30;

const NAVER_LABEL = {
  RETURN_REQUEST: "네이버 반품 요청",
  EXCHANGE_REQUEST: "네이버 교환 요청",
  COLLECTING: "네이버 수거 중",
  COLLECT_DONE: "네이버 수거 완료",
  RETURN_DONE: "네이버 반품 완료",
  EXCHANGE_DONE: "네이버 교환 완료",
  RETURN_REJECT: "네이버 반품 거부",
  EXCHANGE_REJECT: "네이버 교환 거부",
};
export const naverLabel = (s) => NAVER_LABEL[s] || s || "";

/** 줄 하나의 지금 단계와 그 단계 시작 날 — np = 넥스트팩 최근 신청에서 맞춘 줄, job = ERP 버튼으로 맡긴 접수 */
export function stageOf(r, mark = {}, np = null, job = null) {
  const s = r.s || "";
  if (r.kind === "C") {
    if (/^C4/.test(s) || r.done) return { stage: "done", since: dayOf(r.done || r.req), how: r.st || "취소 완료" };
    return { stage: "req", since: dayOf(r.req || r.at), how: r.st || "취소 요청" };
  }
  const refunded = r.kind === "R" && (s === "R40" || !!r.ref);
  const exchanged = r.kind === "E" && (/^E4/.test(s) || s === "E50");
  if (refunded || exchanged) return { stage: "done", since: dayOf(r.ref || r.exd || r.col), how: s === "E50" ? "교환 철회" : r.st };
  const collected = !!r.col || !!mark.arrived || /^(R13|R20|R31|R34|R36|R41|R42|R43|E13|E31|E32|E33|E34|E35|E36)$/.test(s) || r.nps === "COLLECT_DONE" || np?.state === "done";
  if (collected)
    return {
      stage: "check",
      since: dayOf(r.col || mark.arrived?.on || (np?.state === "done" ? np.since : "") || r.acc || r.req),
      how: /^R4[123]$/.test(s) ? `${r.st} — 환불 남음` : np?.state === "done" && !r.col ? "넥스트팩 수거 완료(반품지 도착) · 검수·환불 기다림" : "회수됨 · 검수·환불 기다림",
    };
  if (np && np.state !== "redo" && np.state !== "cancel")
    return { stage: "pickup", since: dayOf(np.since || job?.doneAt || r.req), how: np.visit ? `넥스트팩 ${md(np.visit)} 방문 예정` : `넥스트팩 접수됨 · ${np.note || "진행 중"}` };
  if (job?.status === "done") return { stage: "pickup", since: dayOf(job.doneAt || job.at), how: "넥스트팩 수거 접수함(ERP 버튼)" };
  if (mark.np || r.nps === "COLLECTING") return { stage: "pickup", since: dayOf(mark.np?.on || r.acc || r.req), how: mark.np ? "넥스트팩 회수 접수함" : "네이버 수거 중" };
  // 11/28 세원 "네이버페이는 자동 수거야" — 네이버페이 주문(주문 경로 '네이버 페이')은 넥스트팩 수거 접수를 안 한다(선불금은 토스·카카오도 섞여 있어 경로로 판단)
  if (placeOf(r.place) === "네이버페이" && (r.kind === "R" || r.kind === "E"))
    return { stage: "pickup", since: dayOf(r.req || r.acc || r.at), how: "네이버페이 자동 수거 — 넥스트팩 접수 안 함" };
  if (np?.state === "redo") return { stage: "req", since: dayOf(r.req || r.acc || r.at), how: `넥스트팩 다시 신청 필요 — ${np.note || ""}` };
  return { stage: "req", since: dayOf(r.req || r.acc || r.at), how: /^(R00|E00)$/.test(s) ? "카페24·네이버 접수 전" : r.st || "" };
}

/** 받은 지 7일 안에 신청했나 — 배송완료일이 없으면 출고 다음다음 날로 셈 */
export function within7(r) {
  const req = dayOf(r.req);
  let dl = dayOf(r.dl);
  let guess = false;
  // 네이버페이 주문은 카페24 배송완료일이 수거 날로 덮일 때가 있다 — 요청보다 늦으면 믿지 않는다
  if (dl && req && dl > req) dl = "";
  if (!dl && r.sh) {
    dl = addDays(dayOf(r.sh), 2);
    guess = true;
  }
  if (!dl || !req) return { ok: null, days: null, text: "수령일 모름 — 확인 필요" };
  const days = Math.max(0, daysBetween(dl, req));
  return { ok: days <= 7, days, guess, text: `${guess ? "받은 날 모름(출고 이틀 뒤로 셈) · " : `${md(dl)} 받음 · `}${md(req)} 신청 = ${days}일째${days <= 7 ? " · 7일 안" : " · 7일 지남"}` };
}

const claimAmount = (r) => (r.items || []).reduce((s, it) => s + (Number(it.p) || 0) * (Number(it.q) || 1), 0);

/**
 * 배송비 누가·얼마 — 쇼핑몰 공지 '교환 및 반품 안내사항'. 11/24 세원 "6만원 없애고 7만원만" (공지 NOTICE 11·12·13 도 7만으로 고침 — 방향성 창)
 *  변심 전체 반품: 7만↑ 왕복 7,000 · 7만↓ 반품 4,000 / 변심 부분 반품: 7,000 / 변심 교환: 왕복 7,000 / 불량·오배송: 포클로 부담 / 도서·산간 +5,000(편도)
 */
export const FREE_SHIP = 70000;
export const RETURN_ADDR = "경기도 남양주시 진건읍 배양리 513-1, 2층";
export function feeOf(r, cls) {
  const c = cls || r.cls || "change";
  const notes = [];
  if (r.retFee > 0) notes.push(`카페24에 적힌 반품 배송비 ${won(r.retFee)}`);
  if (r.kind === "C") return { who: "없음", amount: 0, why: r.sh ? "출고 뒤 취소 — 배송비 확인" : "출고 전 취소 — 배송비 없음", notes };
  if (c === "defect" || c === "wrong") return { who: "포클로", amount: 0, why: `${CLS[c]} — 포클로가 왕복 부담${r.kind === "E" ? "(같은 상품·같은 사이즈로 교환할 때)" : ""}`, notes };
  let amount;
  let why;
  if (r.kind === "E") {
    amount = 7000;
    why = "변심 교환 — 왕복 7,000원";
  } else {
    const claim = claimAmount(r);
    const keep = Number(r.keep) || 0;
    const total = Number(r.total) || claim + keep;
    if (keep <= 0) {
      if (total >= FREE_SHIP) {
        amount = 7000;
        why = `7만 원 이상(${won(total)}) 산 뒤 전체 반품 — 왕복 7,000원`;
      } else {
        amount = 4000;
        why = `7만 원 미만(${won(total)}) 전체 반품 — 반품 배송비 4,000원`;
      }
    } else {
      amount = 7000;
      why = `부분 반품(${won(claim)}) · 남은 금액 ${won(keep)} — 7,000원`;
    }
  }
  if (r.remote) {
    amount += 5000;
    why += " + 도서·산간 5,000원";
  }
  return { who: "손님", amount, why, notes };
}

const SIZE_RE = /\b(XS|S|M|L|XL|2XL|3XL|FREE|프리|2[2-5]\d)\b/gi;
/** 교환 재고 — 같은 상품(이름 첫 낱말)의 넥스트팩·렉 재고를 옵션마다. 손님 글에 사이즈·색이 있으면 그 옵션을 짚는다 */
export function exchStock(r, stock) {
  const rows = stock?.nextpack?.rows || [];
  const rack = Array.isArray(stock?.rack) ? stock.rack : [];
  const text = String(r.reason || "");
  return (r.items || []).map((it) => {
    const code = codeOf(it.n);
    const hit = (n) => code.length >= 2 && String(n || "").includes(code);
    const map = new Map();
    // avail = 현재고 − 밀린 주문(hold). 음수면 재고보다 기다리는 주문이 많은 것
    for (const x of rows.filter((x) => hit(x.name))) map.set(x.option || "", { option: x.option || "", avail: Number(x.avail ?? x.qty ?? 0), qty: Number(x.qty) || 0, hold: Number(x.hold) || 0, rack: 0 });
    for (const x of rack.filter((x) => hit(x.name))) {
      const k = x.option || "";
      const cur = map.get(k) || { option: k, avail: 0, qty: 0, hold: 0, rack: 0 };
      cur.rack += Number(x.qty) || 0;
      map.set(k, cur);
    }
    const list = [...map.values()].sort((a, b) => a.option.localeCompare(b.option, "ko"));
    const sizes = [...new Set((text.match(SIZE_RE) || []).map((s) => s.toUpperCase()))];
    const want = list.filter((x) => {
      const o = x.option.toUpperCase();
      return (sizes.length && sizes.some((s) => o.split(/[\s,/-]+/).includes(s))) || (x.option && text.includes(x.option.replace(/[\s,/-]+$/, "")));
    });
    return { code, name: it.n, option: it.o, list, want: want.map((x) => x.option), sizes, at: stock?.nextpack?.at || "" };
  });
}

// ------------------------------------------------------------------ 넥스트팩 · 결제수단 (11/24)
const squash = (n) =>
  String(n || "")
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
    .replace(/\s*\((\d+|one)\s*colou?r\)\s*$/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
/** 넥스트팩 최근 신청 줄 중 이 반품과 같은 것(받는 사람 이름 + 상품 이름) — 여러 개면 끝나지 않은 것 먼저 */
export function npMatch(r, npRows = []) {
  if (r.kind === "C") return null;
  const names = new Set((r.items || []).map((it) => squash(it.n)));
  const hits = npRows.filter((x) => x && x.name && x.name === r.name && names.has(squash(x.product)) && x.kind === (r.kind === "E" ? "exchange" : "return"));
  if (!hits.length) return null;
  const order = { visit: 0, other: 1, redo: 2, done: 3, cancel: 4 };
  return [...hits].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9))[0];
}

/** 넥스트팩 반품 사유 라디오(11/24 화면) ← ERP 사유 */
export const NP_REASONS = ["변심·상품불만족", "사이즈·색상", "불량·오염·냄새", "오배송·출고문제", "기타"];
export const npReasonOf = (x) => (x.cls === "defect" ? "불량·오염·냄새" : x.cls === "wrong" ? "오배송·출고문제" : x.grp === "사이즈·핏" ? "사이즈·색상" : "변심·상품불만족");

const BANK = /cash|tcash|icash/; // 무통장입금 · 계좌이체 · 가상계좌
/**
 * 배송비를 어떻게 받나 — 11/24 세원 "카페24 같은 경우에는 우리가 환불할 때 70000원 이상이었으면 7000원 걍 환불금에서 빼고 보내거든? 문자를 보내는 경우에는 계좌이체 한 사람들인 경우야."
 *  카드 등 → 환불금에서 차감(문자 없음) · 계좌이체·무통장·가상계좌 → 문자 · 네이버페이 → 네이버가 차감 · 교환 → 빼 줄 환불금이 없어 따로 받기
 */
export function payWay(x, method = "") {
  if (!x.fee || x.fee.who !== "손님") return null;
  const pm = (x.pm || []).join(",");
  const name = x.pmName || method || "";
  const refund = (x.items || []).reduce((s, it) => s + (Number(it.pay) || 0), 0);
  const after = refund > 0 ? refund - x.fee.amount : 0;
  if (x.kind === "E") return { mode: "exch", label: "교환 배송비 따로 받기", text: `교환은 빼 줄 환불금이 없어요 — 왕복 ${won(x.fee.amount)} 받는 방법은 세원이 정해요${name ? ` (결제: ${name})` : ""}` };
  if (x.channel === "네이버페이") return { mode: "naver", label: "네이버페이에서 차감", text: `반품 배송비 ${won(x.fee.amount)}은 네이버페이가 환불금에서 빼요 — 문자 필요 없음` };
  if (BANK.test(pm) || /무통장|계좌|가상계좌/.test(name))
    return {
      mode: "sms",
      label: "계좌 결제 — 문자 안내",
      text: `${name || "계좌이체"} 결제라 문자로 안내해요${x.refundAcct ? " · 손님이 환불 계좌를 적어 뒀어요" : ""}`,
      after,
    };
  if (!pm && !name) return { mode: "unknown", label: "결제수단 확인", text: "결제수단을 못 찾았어요 — 카페24 주문에서 확인" };
  return { mode: "deduct", label: `환불금에서 ${won(x.fee.amount)} 차감`, text: `${name} 결제 — 환불할 때 배송비를 빼고 환불해요(문자 필요 없음)${after > 0 ? ` · 환불 약 ${won(after)}` : ""}`, after };
}

/** 줄 + 표시 → 화면용. ctx = {npRows, jobs:{[rid]: 마지막 접수}, methods:{[주문번호]: 결제수단 글}} */
export function decorate(r, mark = {}, today, ctx = {}) {
  const np = npMatch(r, ctx.npRows || []);
  const job = (ctx.jobs || {})[r.id] || null;
  const st = stageOf(r, mark, np, job);
  const cls = mark.cls || r.cls || "change";
  const waited = st.stage === "done" ? 0 : weekdaysBetween(st.since, today);
  const limit = STALE[st.stage];
  const base = {
    ...r,
    mark,
    np,
    job,
    cls,
    autoCls: r.cls || "change",
    clsFixed: !!mark.cls,
    stage: st.stage,
    since: st.since,
    how: st.how,
    waited,
    stale: (limit != null && waited > limit) || np?.state === "redo" || job?.status === "error",
    channel: placeOf(r.place),
    fee: feeOf(r, cls),
    w7: r.kind === "C" ? null : within7(r),
    needNp: (r.kind === "R" || r.kind === "E") && st.stage === "req",
  };
  base.pay = payWay(base, (ctx.methods || {})[r.order] || "");
  return base;
}

/** 목록 — 진행 중 + 끝난 지 DONE_KEEP 일 안. 취소는 끝나지 않은 것만(끝난 취소는 카페24가 알아서 끝낸 것이라 통계에만) */
export function returnRows(live, marks = {}, today, ctx = {}) {
  return (live?.rows || [])
    .map((r) => decorate(r, marks[r.id] || {}, today, ctx))
    .filter((x) => (x.stage === "done" ? x.kind !== "C" && x.since && daysBetween(x.since, today) <= DONE_KEEP : true))
    .sort((a, b) => {
      const o = { req: 0, pickup: 1, check: 2, done: 3 };
      return o[a.stage] - o[b.stage] || Number(b.stale) - Number(a.stale) || String(a.since).localeCompare(String(b.since));
    });
}
/** 반품 줄마다 마지막 넥스트팩 접수(np_pickup) */
export function jobsByReturn(v) {
  const out = {};
  for (const j of v?.items || []) if (j.rid && (!out[j.rid] || String(j.at) > String(out[j.rid].at))) out[j.rid] = j;
  return out;
}

export function returnSummary(list) {
  const open = list.filter((x) => x.stage !== "done");
  const by = (k) => list.filter((x) => x.stage === k).length;
  return { open: open.length, needNp: open.filter((x) => x.needNp).length, stale: open.filter((x) => x.stale).length, req: by("req"), pickup: by("pickup"), check: by("check"), done: by("done") };
}

/** 이번 달 반품률(통계 자료) — 반품 수량 ÷ 판매 수량(취소 뺀 것) */
export const rateOf = (m) => (m?.sold ? (m.ret / m.sold) * 100 : null);
export const pct = (v, d = 1) => (v == null ? "—" : `${v.toFixed(d)}%`);

const shortName = (n) =>
  String(n || "")
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
    .replace(/\s*\((\d+|one)\s*colou?r\)\s*$/i, "")
    .trim();
export { shortName };

/**
 * 손님 안내 글 초안 — 틀(AI 안 씀, 0원). 인사·맺음은 CS 답변 틀(cs_templates)의 것. 금액은 위 배송비 계산 그대로.
 * ⛔ 보내기 없음 — 세원이 보고 고쳐서 복사(손님에게 보이는 글은 세원 OK 뒤, 메모리 poclo-customer-text-confirm).
 * 모르는 것은 [대괄호] 빈칸으로 남긴다(회수 날짜·교환 배송비 받는 방법 등).
 */
export function draftOf(x, tpl = {}) {
  const hi = tpl.greeting || "안녕하세요 고객님 :) 포클로입니다 🤍";
  const bye = tpl.closing || "더 궁금하신 점 있으시면 편하게 말씀 주세요. 감사합니다 🤍";
  const names = [...new Set((x.items || []).map((it) => shortName(it.n)))].join(", ");
  const lines = [hi];
  const late = x.w7 && x.w7.ok === false;
  if (x.cls === "defect") {
    lines.push(`${names} 상품에 불편을 드려 정말 죄송해요. 보내 주신 내용 확인했어요.`);
    lines.push("");
    lines.push("불량 상품은 왕복 배송비를 모두 저희가 부담해요.");
    lines.push("번거로우시겠지만 불량 부분 사진을 한 장 보내 주시면 더 빠르게 확인해 드릴게요.");
    if (x.kind === "E") lines.push("확인되는 대로 같은 상품·같은 사이즈로 새 상품을 보내 드릴게요.");
    else lines.push("상품이 저희에게 도착해 확인되면 3영업일 안에 환불해 드릴게요.");
  } else if (x.cls === "wrong") {
    lines.push("주문하신 상품과 다른 상품을 보내 드려 정말 죄송해요.");
    lines.push("");
    lines.push("왕복 배송비는 모두 저희가 부담하고, 주문하신 상품으로 다시 보내 드릴게요.");
    lines.push("받으신 상품은 택배 기사님이 방문하시면 그대로 포장해서 전달해 주세요.");
  } else if (x.kind === "E") {
    lines.push(`${names} 교환 신청 확인했어요 :)`);
    lines.push("");
    lines.push(`단순 변심(사이즈·색상) 교환은 왕복 배송비 ${won(x.fee.amount)}이 고객님 부담이에요.`);
    lines.push("교환 배송비는 [교환 배송비 받는 방법]으로 부탁드려요.");
    lines.push("받으신 상품은 택(라벨)과 구성품 그대로 포장해서 택배 기사님께 전달해 주세요.");
    lines.push("상품이 도착해 확인되면 바꾸실 상품으로 바로 보내 드릴게요.");
  } else if (x.kind === "R") {
    lines.push(`${names} 반품 신청 확인했어요. 마음에 꼭 들지 못해 아쉬우셨을 것 같아요.`);
    lines.push("");
    lines.push(`단순 변심 반품은 반품 배송비 ${won(x.fee.amount)}이 고객님 부담이에요. 환불 금액에서 빼고 돌려드릴게요.`);
    lines.push("받으신 상품은 택(라벨)과 구성품 그대로 포장해서 택배 기사님께 전달해 주세요.");
    lines.push("상품이 저희에게 도착해 확인되면 3영업일 안에 환불해 드릴게요.");
  } else {
    lines.push("주문 취소 요청 확인했어요.");
    lines.push("[취소 처리 안내]");
  }
  if (late) {
    lines.push("");
    lines.push("[⚠ 받으신 지 7일이 지났어요 — 받아 줄지 세원이 정하고 이 줄을 고치기]");
  }
  if (x.remote && x.cls === "change") lines.push("(도서·산간 지역이라 편도 5,000원이 더해졌어요.)");
  lines.push("");
  lines.push(bye);
  return lines.join(NL);
}
/** 손님 사유 글 보기 — 네이버 끝의 '(구매자 주문취소 : 구매 의사 취소)'는 따로 떼어 '고른 사유'로 */
export function reasonParts(text) {
  let t = String(text || "").trim();
  let pick = "";
  const m = t.match(/\((?:구매자|판매자)\s*주문취소\s*:\s*([^)]*)\)\s*$/);
  if (m) {
    pick = m[1].trim();
    t = t.slice(0, m.index).trim();
  }
  return { body: t, pick };
}
/**
 * 계좌이체·무통장 손님 문자 초안(11/24 세원 — 이 손님들만 문자). 두 가지 중 세원이 고름:
 *  deposit = 반품 배송비를 [입금 계좌]로 입금 부탁(방향성 창이 읽은 뜻) · account = 배송비를 뺀 금액을 환불, 환불 계좌 받기
 * ⭐ 11/25 세원: "계좌이체로 결제한 사람들은 그 사람들의 계좌번호를 받아야 하는 거 아냐? 2번이 나을 것 같고,
 *    '단순 변심 반품이라 반품 배송비 7,000원을 뺀 …원을 환불해 드릴게요' 줄은 빼도 될 것 같아" → account 가 기본·맨 앞, 그 줄 뺌.
 * ⛔ 보내기 없음 — 복사만(손님에게 가는 글은 세원 OK 뒤).
 */
export const SMS_KINDS = [
  ["account", "환불 계좌 받기"],
  ["deposit", "배송비 입금 안내"],
];
export function smsDraft(x, kind = "account") {
  const names = [...new Set((x.items || []).map((it) => shortName(it.n)))].join(", ");
  const fee = won(x.fee?.amount || 0);
  const L = ["[포클로] 안녕하세요 고객님 :) 포클로입니다 🤍", `${names} 반품 신청 확인했어요.`];
  if (kind === "account") {
    L.push(x.refundAcct ? "적어 주신 환불 계좌로 상품 확인 후 3영업일 안에 보내 드릴게요." : "환불 받으실 계좌(은행 · 계좌번호 · 예금주)를 알려 주시면 상품 확인 후 3영업일 안에 보내 드릴게요.");
  } else {
    L.push(`단순 변심 반품이라 반품 배송비 ${fee}이 고객님 부담이에요.`);
    L.push(`번거로우시겠지만 [입금 계좌]로 ${fee} 입금 부탁드려요.`);
    L.push("상품이 저희에게 도착해 확인되면 3영업일 안에 환불해 드릴게요.");
  }
  if (x.w7 && x.w7.ok === false) L.push("[⚠ 받으신 지 7일이 지났어요 — 받아 줄지 세원이 정하고 이 줄을 고치기]");
  L.push("감사합니다 🤍");
  return L.join(NL);
}
export const draftBlank = (t) => /\[[^\]]+\]/.test(String(t || ""));
