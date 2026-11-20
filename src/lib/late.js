// CS 관리 › 늦는 주문 (2026-11-20 세원 "CS를 조금 더 고도화 — 늦는 주문이 흩어져 있음", 포클로_방향성 창 전달)
// "우리 배송지연했나?"에 답하려고 카페24 출고 전 주문 · 네이버페이센터 · 지연 문자 · N페이 발송지연 · CS 답 · 입고 예정을 따로 뒤졌다
// (11/10 볼륨 주문 20261110-0000055 는 평일 8일째인데 손님 안내 기록이 어디에도 없었다) → 주문 하나에 한 줄로 모아 본다.
// 자료(전부 settings — 사무실 PC 가 씀, 이 화면은 읽기 + 세원이 누른 것만 씀):
//   orders_track_live {rows, sent}  카페24 출고 전 주문(네이버페이 주문형·톡체크아웃 포함), 10분마다 — orders_track.py
//   npay_delay {items}              네이버페이센터 배송준비 목록 · 발송기한 · 발송지연 처리 — npay_delay.py
//   delay_sms {items}               카페24 지연 문자 대상 · 보냄 — delay_sms.py
//   delay_sent_manual {items}       ERP 밖에서 보낸 안내({order, on, via, note}) — 이 화면 '보냈어요'도 여기에
//   cs_inbox · cs_done_YYYYMM       문의에 답한 기록(주문번호로 잇는다). cs_answers 는 주문번호가 없어 잇는 데 안 씀
//   inbound_eta · stock             옵션별 거래처 입고 예정 · 넥스트팩 재고
import { weekdaysAfter, cleanName } from "./orderTrack";
import { etaFor, scheduleText, codeOf, channelOf, DELAY_TEMPLATE, fillDelay } from "./cs";

export const UNSHIP = ["N10", "N20", "N21", "N22"];
export const LIST_DAYS = 2; // 결제 다음 날부터 평일 2일↑ = 목록에 (방향성 11/20 — 안내 기준보다 하루 먼저 보이게)
export const NOTICE_DAYS = 3; // 평일 3일↑ = 안내할 때 (CS 지침서 · 배송지연 안내와 같은 기준)
export const BOARD_DAYS = 7; // 리오더 안내(상품명 '순차 출고' 꼬리표)를 보고 산 주문은 결제 후 7일 넘을 때만 안내 (세원 11/11)
export const NPAY_SOON = 3; // 네이버 발송기한 3일 안 = 빨강
export const OLD_NOTICE = 7; // 안내한 지 7일 넘었는데 아직 안 나감 = '다시 안내?' 작은 표시
export const FIRST_LINE = "지금 고객님께서 주문해주신 상품이 현재 주문 폭주로 물량이 딸리고 있어요ㅠㅠㅠ";
// 11/17 세원이 고쳐 준 리오더 표기 상품판 둘째 줄(볼륨 조거 그레이 1건에 씀) — 나머지 문장은 틀 그대로
export const REORDER_LINE = "지금 고객님께서 주문해주신 상품이 현재 리오더로 다음주 중 출고될 것 같아요..ㅠㅠㅠㅠ";
// 11/10 부분 배송 규칙(CS 지침서 ⭐) — 섞인 주문(바로 나가는 옵션 + 늦는 옵션)에만. 두 번째 택배비는 지금은 우리가 내지만(세원 11/11) 글에는 안 씀
export const PARTIAL_LINE = "가능한 것부터 먼저 보내 드릴까요?";
const NL = String.fromCharCode(10);
const DELAYISH = ["배송", "재입고·입고", "주문 변경", "주문 취소"];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (iso) => String(iso || "").slice(0, 10);
/** '2026-11-23' / ISO → '11/23' */
export const md = (iso) => {
  const s = String(iso || "");
  if (!s) return "";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};
/** a → b 사이 달력 날수 (b − a) */
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
/** day 다음 날부터 평일 n 개를 센 날 — 결제 3평일째 날 */
export function addWeekdays(day, n) {
  const d = new Date(`${day}T00:00:00`);
  let k = 0;
  while (k < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) k++;
  }
  return ymd(d);
}

/** 주문 경로 → 채널 이름 */
export const placeOf = (place) => (/네이버\s*페이/.test(place || "") ? "네이버페이" : /톡\s*체크아웃/.test(place || "") ? "톡체크아웃" : "카페24");

/** scheduleText('11/23~27' · '11/20' · '11/19 입고 뒤 바로' · '다음 주 주중') → 마지막 날 'YYYY-MM-DD' (날짜가 없으면 '') */
export function lastDayOf(text, today) {
  const m = String(text || "").match(/(\d{1,2})\/(\d{1,2})(?:\s*~\s*(?:(\d{1,2})\/)?(\d{1,2}))?/);
  if (!m) return "";
  const mon = Number(m[4] ? m[3] || m[1] : m[1]);
  const day = Number(m[4] || m[2]);
  let y = Number(String(today).slice(0, 4));
  const cand = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (daysBetween(today, cand) < -180) y += 1; // 12월에 본 '1/5'
  return `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 상품 한 줄의 출고 전망 — tone: ok(지금 출고 가능) · due(입고 예정 날이 오늘이거나 지남 — 나갔는지 확인) · wait(입고 기다림) · none(모름) */
export function itemEta(inbound, stock, it, today) {
  const code = codeOf(it.n);
  const opt = String(it.o || "").replace(/,\s*1\+1 할인!=선택안함/, "");
  const e = etaFor(inbound, stock, code, opt);
  const sched = e.tone === "ok" ? "" : scheduleText(inbound, code, opt);
  const by = e.tone === "ok" ? "" : lastDayOf(sched, today);
  const tone = e.tone === "wait" && by && by <= today ? "due" : e.tone;
  const label = tone === "due" ? (by === today ? `오늘 출고 예정 (${e.label})` : `${md(by)} 출고 예정이었음 — 나갔는지 확인`) : e.label;
  // 입고 예정 줄을 마지막으로 고친 시각 — 안내한 뒤에 바뀌었으면 '다시 안내?'
  const rows = (inbound?.items || []).filter((x) => x.code && x.code === code);
  const row = rows.find((x) => x.option && opt.includes(x.option)) || rows.find((x) => !x.option);
  return { code, opt, tone, label, sched, by, memo: e.memo || "", at: tone === "ok" ? "" : row?.at || "" };
}

const keysOf = (r) => new Set([r.id, r.mno, ...(r.items || []).map((i) => i.np)].filter(Boolean).map(String));
const csOrders = (x) => [x?.orderNo, ...((x?.order?.orders || []).map((o) => o.id))].filter(Boolean).map(String);
const DELAY_RE = /출고|입고|배송|지연|리오더|보내\s*드릴|발송/;
const isDelayish = (x) => DELAYISH.includes(x?.type) || DELAY_RE.test(String(x?.final || ""));
const normTxt = (t) => String(t || "").replace(/\s+/g, "");
/** 대화 말풍선 시각 '11/18 13:51' · '16:55'(그날) → ISO 비슷한 'YYYY-MM-DDTHH:MM' (모르면 fallback) */
function threadIso(at, fallback, today) {
  const s = String(at || "");
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const day = lastDayOf(`${m[1]}/${m[2]}`, today);
    return `${day}T${m[3].padStart(2, "0")}:${m[4]}`;
  }
  const t = s.match(/^(\d{1,2}):(\d{2})$/);
  if (t && fallback && !Number.isNaN(new Date(fallback).getTime())) return `${ymd(new Date(fallback))}T${t[1].padStart(2, "0")}:${t[2]}`;
  return fallback || "";
}
/** 연락 갈래 — 같은 날 같은 갈래는 한 번만(사무실 PC 기록과 겹침 없애기) */
const groupOf = (via) => (/문자/.test(via) ? "sms" : /발송지연/.test(via) ? "npay" : /카톡/.test(via) ? "kakao" : /톡톡/.test(via) ? "talk" : /게시판|Q&A|1:1|리뷰/.test(via) ? "board" : via);

/**
 * 이 주문에 손님에게 나간(나갈) 연락 — [{on, via, note, kind: notice|planned|other|open, csId, url}] 최근 것 먼저.
 * notice = 늦어짐을 알린 것(지연 문자 · 네이버 발송지연 처리 · 배송·입고·변경·취소 답 · ERP 밖에서 보낸 것) · planned = 보낼 목록 · other = 다른 얘기 답 · open = 답할 문의
 */
export function contactsOf(r, { sms, npay, manual, cs = [], sent, today = "" } = {}) {
  const keys = keysOf(r);
  const out = [];
  for (const s of sms?.items || []) if (s.status === "sent" && keys.has(String(s.orderNo))) out.push({ on: s.sentAt || "", via: "문자", note: "지연 문자", kind: "notice" });
  for (const n of npay?.items || []) {
    if (!(keys.has(String(n.id)) || (r.mno && String(n.orderNo) === String(r.mno)))) continue;
    if (n.status === "done") out.push({ on: n.doneAt || "", via: "네이버 발송지연", note: n.deadline ? `기한 ${md(n.deadline)}` : "", kind: "notice" });
    else if (n.status === "queued") out.push({ on: n.askedAt || "", via: "네이버 발송지연", note: "처리 맡김", kind: "planned" });
  }
  for (const m of manual?.items || []) if (keys.has(String(m.order))) out.push({ on: m.on || "", via: m.via || "문자", note: m.note || "", kind: "notice", mid: m.id || "", by: m.by || "" });
  const seenCs = new Set();
  for (const x of cs) {
    if (!x?.id || seenCs.has(x.id) || !csOrders(x).some((k) => keys.has(k))) continue;
    seenCs.add(x.id);
    const ch = channelOf(x.channel).short;
    const st = x.status || "new";
    const url = x.ext?.url || "";
    if (["sent", "done"].includes(st) && (x.final || x.sentAt)) out.push({ on: x.sentAt || x.doneAt || "", via: `${ch} 답`, note: x.type || "", kind: isDelayish(x) ? "notice" : "other", csId: x.id, url, ch: x.channel });
    else if (["approved", "sending"].includes(st)) out.push({ on: x.approvedAt || x.sendAskedAt || "", via: `${ch} 답`, note: "보낼 목록", kind: "planned", csId: x.id, url, ch: x.channel });
    else if (["new", "drafting", "ready", "error"].includes(st)) out.push({ on: x.at || x.createdAt || "", via: `${ch} 문의`, note: "답할 문의", kind: "open", csId: x.id, url, ch: x.channel });
    // 11/20 세원·지원이 카톡·톡톡 방에서 직접 쓴 답(초안을 거치지 않은 말) — 대화 안에만 남는다(13일 테디 주문: 지원 11/18 '금요일 출고 예정' 안내)
    const mine = (Array.isArray(x.thread) ? x.thread : []).filter((m) => m?.from === "us" && m.who && !["자동", "알림톡"].includes(m.who) && !m.menu && String(m.text || "").trim());
    const last = mine.filter((m) => /출고|발송/.test(m.text)).slice(-1)[0] || mine.filter((m) => DELAY_RE.test(m.text)).slice(-1)[0] || mine.slice(-1)[0];
    if (last && !normTxt(x.final).includes(normTxt(last.text)))
      out.push({ on: threadIso(last.at, x.doneAt || x.at, today), via: `${ch} 답(직접)`, note: String(last.text).replace(/\s+/g, " ").slice(0, 40), kind: DELAY_RE.test(last.text) ? "notice" : "other", csId: x.id, url, ch: x.channel, who: last.who });
    // 방 주소만 남은 카드(마무리 인사로 넘긴 것 등) — 표시는 안 하고 '방 열기'에만 쓴다
    if (url && !out.some((e) => e.csId === x.id)) out.push({ on: "", via: `${ch} 방`, note: "", kind: "room", csId: x.id, url, ch: x.channel });
  }
  // 사무실 PC 가 모아 둔 것(orders_track_live.sent) 중 위에 없는 것 — 같은 날·같은 갈래면 한 번만
  const have = new Set(out.filter((e) => e.on).map((e) => `${dayOf(e.on)}|${groupOf(e.via)}`));
  for (const k of keys)
    for (const e of sent?.[k] || []) {
      const id = `${dayOf(e.on)}|${groupOf(String(e.via || ""))}`;
      if (have.has(id)) continue;
      have.add(id);
      out.push({ on: e.on || "", via: e.via || "", note: e.note || "", kind: /문자|발송지연/.test(e.via || "") || DELAYISH.includes(e.note) ? "notice" : "other" });
    }
  return out.sort((a, b) => String(b.on).localeCompare(String(a.on)));
}

/** 네이버페이센터 발송기한 — 이 주문의 npay_delay 줄들 */
export function npayOf(r, npay, today) {
  const keys = keysOf(r);
  const rows = (npay?.items || []).filter((n) => keys.has(String(n.id)) || (r.mno && String(n.orderNo) === String(r.mno)));
  if (!rows.length) return null;
  const open = rows.filter((n) => !["done", "gone"].includes(n.status));
  const done = rows.filter((n) => n.status === "done");
  const deadline = open.map((n) => n.deadline).filter(Boolean).sort()[0] || "";
  return {
    deadline,
    dday: deadline ? daysBetween(today, deadline) : null,
    done: !open.length && done.length > 0,
    doneDeadline: done.map((n) => n.deadline).filter(Boolean).sort().slice(-1)[0] || "",
    queued: open.some((n) => n.status === "queued"),
    error: open.find((n) => n.status === "error")?.error || "",
  };
}

/**
 * 늦는 주문 한 줄씩 — 출고 전(N10·N20·N21·N22)·결제 끝난 카페24 주문 중
 * 결제 다음 날부터 평일 2일↑ 이거나, 거래처 입고 예정상 결제 3평일째 날을 넘길 게 정해진 것.
 * state: done(안내함) · planned(보낼 예정) · board(리오더 안내 보고 산 주문 — 7일 전) · need(안내 안 함) · watch(아직 2일째)
 */
export function lateRows({ rows = [], npay, sms, manual, cs = [], sent, inbound, stock, today }) {
  const out = [];
  for (const r of rows) {
    if (!r?.paid) continue;
    const items = (r.items || []).filter((i) => !/^[CRE]/.test(i.s || ""));
    const un = items.filter((i) => UNSHIP.includes(i.s));
    if (!un.length) continue;
    const payDay = dayOf(r.pay || r.at);
    const days = weekdaysAfter(payDay, today);
    const due = addWeekdays(payDay, NOTICE_DAYS); // 이날까지 나가면 늦은 게 아님
    const lines = items.map((i) => {
      const ship = !UNSHIP.includes(i.s);
      const eta = ship ? null : itemEta(inbound, stock, i, today);
      const late = !!eta && eta.tone === "wait" && (!eta.by || eta.by > due);
      return { n: cleanName(i.n).replace(/\s*\(\d+\s*colou?r\)|\s*\(one colou?r\)/gi, ""), full: i.n, o: String(i.o || "").replace(/,\s*1\+1 할인!=선택안함/, ""), q: i.q || 1, s: i.s, st: i.st, ship, eta, late, t: i.t };
    });
    const unl = lines.filter((l) => !l.ship);
    const lateItems = unl.filter((l) => l.late);
    if (days < LIST_DAYS && !lateItems.length) continue;
    const ready = unl.filter((l) => ["ok", "due"].includes(l.eta.tone));
    const waiting = unl.filter((l) => !["ok", "due"].includes(l.eta.tone));
    const board = unl.some((l) => /순차\s*출고|리오더/.test(l.full || ""));
    const cal = daysBetween(payDay, today);
    const contacts = contactsOf(r, { sms, npay, manual, cs, sent, today });
    const notice = contacts.find((c) => c.kind === "notice") || null;
    const tOf = (s) => {
      const t = new Date(s || "").getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const changedAt = notice ? waiting.map((l) => l.eta.at).filter((a) => tOf(a) > tOf(notice.on)).sort().slice(-1)[0] || "" : "";
    const noticeAge = notice && tOf(notice.on) ? daysBetween(ymd(new Date(tOf(notice.on))), today) : null;
    const planned = contacts.find((c) => c.kind === "planned") || null;
    const np = npayOf(r, npay, today);
    const needDays = days >= NOTICE_DAYS || lateItems.length > 0;
    const state = notice ? "done" : planned ? "planned" : board && cal <= BOARD_DAYS ? "board" : needDays ? "need" : "watch";
    // (일정) — 기다리는 옵션의 출고 예정(입고 예정 표에서), 옵션마다 다르면 이어서
    const sched = [...new Set(waiting.map((l) => l.eta.sched).filter(Boolean))].join(", ");
    out.push({
      id: r.id,
      at: r.at,
      payDay,
      days,
      cal,
      due,
      place: placeOf(r.place),
      mno: r.mno || "",
      name: r.name || r.buyer || "",
      tel4: r.tel4 || "",
      amount: r.amount || 0,
      lines,
      lateItems: lateItems.length,
      mixed: ready.length > 0 && waiting.length > 0,
      reorder: unl.some((l) => /리오더/.test(l.eta?.memo || "") || /순차\s*출고/.test(l.full || "")),
      board,
      boardUntil: board ? ymd(new Date(new Date(`${payDay}T00:00:00`).getTime() + BOARD_DAYS * 864e5)) : "",
      sched,
      np,
      contacts,
      notice,
      planned,
      open: contacts.filter((c) => c.kind === "open"),
      room: contacts.find((c) => c.url && ["kakao", "naver"].includes(c.ch)) || null,
      noticeAge,
      // 안내했지만 그 뒤 입고 예정이 바뀌었거나 7일이 넘었는데 아직 안 나감 → '다시 안내?'
      stale: state === "done" ? (changedAt ? `안내한 뒤 입고 예정이 바뀌었어요(${md(changedAt)})` : noticeAge !== null && noticeAge > OLD_NOTICE ? `안내한 지 ${noticeAge}일` : "") : "",
      state,
      why: lateItems.length && days < NOTICE_DAYS ? `입고 예정 ${lateItems[0].eta.sched || lateItems[0].eta.label}` : `평일 ${days}일째`,
    });
  }
  const rank = (x) => ({ need: 0, planned: 2, board: 3, watch: 4, done: x.stale ? 1 : 5 })[x.state];
  return out.sort((a, b) => {
    const sa = npaySoon(a) ? -1 : 0;
    const sb = npaySoon(b) ? -1 : 0;
    return rank(a) - rank(b) || sa - sb || b.days - a.days || String(a.payDay).localeCompare(String(b.payDay));
  });
}
/** 네이버 발송기한이 3일 안인데 아직 발송지연 처리 전 */
export const npaySoon = (x) => !!(x.np && !x.np.done && x.np.dday !== null && x.np.dday <= NPAY_SOON);

/** 맨 위 요약 숫자 */
export function lateSummary(list) {
  return {
    all: list.length,
    need: list.filter((x) => x.state === "need").length,
    npaySoon: list.filter(npaySoon).length,
    board: list.filter((x) => x.state === "board").length,
    redo: list.filter((x) => x.state === "done" && x.stale).length,
  };
}

/**
 * [안내 초안] — 세원 틀(lib/cs DELAY_TEMPLATE, 11/11)만. 카페24 문자·카톡·톡톡에는 네이버 문단을 넣지 않는다(세원 11/11).
 * reorder = 11/17 리오더판 둘째 줄로 바꿈 · partial = 섞인 주문이면 부분 배송 한 줄. 취소를 권하는 말은 넣지 않는다.
 * (일정)을 모르면 '(일정)' 그대로 남겨 둔다 — 채우기 전엔 복사·넣기가 막힌다.
 */
export function delayDraft(row, { reorder = false, partial = !!row?.mixed, when } = {}) {
  let t = fillDelay(DELAY_TEMPLATE, { when: when ?? row?.sched ?? "", naver: false });
  if (reorder) t = t.replace(FIRST_LINE, REORDER_LINE);
  if (partial) t = t.replace(/(에 출고될 예정이에요!)/, `$1${NL}${PARTIAL_LINE}`);
  return t;
}
/** 아직 안 채운 칸이 남았나 */
export const draftBlank = (t) => /\(일정\)|\(2주뒤\)|\(예상일자\)/.test(String(t || ""));
