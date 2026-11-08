// 정산 달력 (11/8) — 세원: "카페24 페이먼츠, 네이버페이(주문형, 결제형), 카카오 비즈니스 요 3개 정산주기 계산해 주는 거 ERP 에.
//   돈이 언제 들어오고 언제 도는지 정확하게 아는 게 중요하니까."
//
// 규칙은 두 군데로 맞췄다 — ① 각 회사 공식 안내(어사이드로 찾음, 아래 CHANNELS.official) ② 우리 국민은행 통장 7~9월 입금(정산 입금 483건 ↔ 주문 3,186건).
//   카페24 페이먼츠  결제일 + 5영업일           공식 "결제일로부터 D+5일(영업일 기준)"          통장: 하루 오차 8%, 수수료 실제 약 2.2%
//   토스페이        결제일 + 7영업일           공식 "D+4 이상"(계약마다) — 우리 통장은 7이 맞음  통장: 하루 오차 7%, 약 2.8% · 'Toss정산MMDD'
//   네이버 주문형    발송(집화) 다음 영업일      공식 빠른정산 "집화처리일의 다음날 100%" — 8/1 발송분부터 이 모양(그 전엔 구매확정+1) · 'Npay정산'
//   네이버 결제형    결제일 + 8영업일           공식 결제형 일정산 "결제일+7영업일" → 충전금으로 받아 다음 영업일 출금 · 'Npay충전금'
//   카카오 톡체크아웃 구매결정 + 1영업일         공식 "구매결정 +1 영업일" · 자동 구매결정 = 배송완료 + 8일 · 통장: 26일 중 24일이 3% 안
//   공휴일은 통장으로도 확인: 6/3 선거 · 7/17 제헌절(2026 공휴일) · 8/17 · 9/24~25 · 10/5 · 10/9 엔 정산이 안 들어왔다. 9/28(월)은 들어왔다(추석 대체공휴일 없음).
//
// settings
//   settle_orders  {updated, from, to, cols, rows:[[ch, pay, ship, deliv, conf, amt, refund, refundDay]]} — 사무실 PC poclo-cafe24/settle_feed.py (새벽 1시 갱신 · 60일)
//   settle_rules   {ch:{basis, n, fee}, holidays:[추가 쉬는 날]} — 화면에서 고친다(없으면 아래 기본값)
// 결제일 기준(c24·toss·npp): 취소·반품 금액은 취소일 + 같은 영업일 정산에서 빠진다(공식 "다음 정산금에서 차감" · 통장으로 맞춰 봄).
// 주문형(npo·kko): 살아 있는 품목만 온다(취소·반품된 건 정산 안 됨). 발송 전이면 날짜를 못 정해 '발송 기다리는 돈'으로 따로 센다.

export const ORDERS_KEY = "settle_orders";
export const RULES_KEY = "settle_rules";

// 은행·PG 가 쉬는 날(주말 빼고). 대체공휴일 포함. 날짜가 바뀌면 화면 '쉬는 날'에서 더한다.
export const HOLIDAYS = [
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-02", "2026-05-01", "2026-05-05", "2026-05-25", "2026-06-03",
  "2026-07-17", "2026-08-17", "2026-09-24", "2026-09-25", "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13", "2027-08-16", "2027-09-14", "2027-09-15",
  "2027-09-16", "2027-10-04", "2027-10-11", "2027-12-27",
];

export const BASIS = {
  pay: { label: "결제일", short: "결제" },
  ship: { label: "발송일(집화)", short: "발송" },
  conf: { label: "구매확정일", short: "구매확정" },
};

// 색은 dataviz 기본 순서(파랑·주황·청록·노랑·분홍) — 채널마다 고정, 금액 순위가 바뀌어도 그대로
export const CHANNELS = [
  {
    k: "npo",
    name: "네이버페이 주문형",
    bank: "Npay정산",
    color: "#2a78d6",
    rule: { basis: "ship", n: 1, fee: 3.0 },
    note: "빠른정산 — 발송(택배 집화) 다음 영업일에 100%. 반품이 들어오면 그다음 영업일 정산에서 빠져요.",
    official: [
      { q: "집화처리일의 다음날 바로 100% 정산 받을 수 있는 무료 서비스입니다. (영업일 기준)", url: "https://help.admin.pay.naver.com/faq/content.help?faqId=14148" },
      { q: "상품주문번호 단위로 주문종료(구매확정, 반품완료, 교환완료) 시점으로 부터, 1영업일째 정산됩니다.", url: "https://help.admin.pay.naver.com/faq/content.help?faqId=1131" },
    ],
    checked: "우리 통장: 8/1 발송분부터 '발송 다음 영업일'로 들어옴(그 전 7월은 구매확정 + 1영업일). 빠른정산 조건(3개월 연속 20건↑ · 반품률 20% 미만)이 깨지면 구매확정 기준으로 바뀌어요.",
    alt: { basis: "conf", n: 1, label: "빠른정산이 꺼지면: 구매확정 + 1영업일" },
  },
  {
    k: "npp",
    name: "네이버페이 결제형",
    bank: "Npay충전금",
    color: "#eb6834",
    rule: { basis: "pay", n: 8, fee: 2.8 },
    note: "쇼핑몰 결제창에서 네이버페이로 낸 돈. 결제일 + 7영업일에 네이버 충전금으로 정산 → 다음 영업일 통장으로.",
    official: [{ q: "일 정산 : 전일 '결제건' 또는 '이용완료' 건을 선택한 정산 시점에 정산('결제일+7영업일', '이용완료일+1영업일' 중 선택)", url: "https://help.admin.pay.naver.com/faq/content.help?faqId=5849" }],
    checked: "우리 통장: 'Npay충전금' 이름으로 결제일 + 8영업일에 들어옴(8월부터 잘 맞음). 가끔 하루 쉬었다가 다음 날 몰아서 들어와요.",
  },
  {
    k: "c24",
    name: "카페24 페이먼츠",
    bank: "카페24페이먼",
    color: "#1baf7a",
    rule: { basis: "pay", n: 5, fee: 2.2 },
    note: "쇼핑몰 결제창 카드 결제. 취소한 돈은 취소일 + 5영업일 정산에서 빠져요.",
    official: [
      { q: "결제일로부터 D+5일(영업일 기준)에 지급되어요.", url: "https://support.cafe24.com/hc/ko/articles/8468118380825" },
      { q: "최초 계약 시, 월 정산 한도 1000만 원이 설정되어요. / 매월 3영업일에 월 정산 한도가 초기화되어요.", url: "https://support.cafe24.com/hc/ko/articles/17394669621273" },
    ],
    checked: "우리 통장: 7~9월 하루 오차 8% — 결제일 + 5영업일이 맞음. 실제로 빠지는 수수료 약 2.2%.",
    limit: 10000000,
  },
  {
    k: "toss",
    name: "토스페이",
    bank: "Toss정산",
    color: "#eda100",
    rule: { basis: "pay", n: 7, fee: 2.8 },
    note: "결제창의 토스페이(토스 직접 계약). 통장에 'Toss정산 + 입금 날짜'로 찍혀요.",
    official: [{ q: "공휴일 및 주말은 '+N'에 포함되지 않습니다.", url: "https://docs.tosspayments.com/resources/glossary/settlement" }],
    checked: "우리 통장: 7~9월 하루 오차 7% — 결제일 + 7영업일이 맞음(토스 안내는 'D+4 이상'이라 계약마다 다름). 수수료 약 2.8%.",
  },
  {
    k: "kko",
    name: "카카오 톡체크아웃",
    bank: "톡체크아웃",
    color: "#e87ba4",
    rule: { basis: "conf", n: 1, fee: 2.0 },
    note: "구매결정 다음 영업일. 손님이 안 누르면 배송완료 + 8일에 자동 구매결정 — 그 전에 누르면 더 빨리 들어와요.",
    official: [{ q: "톡체크아웃 서비스의 정산 주기는 일정산으로, 구매결정 +1 영업일에 구매자의 결제대금 및 공제내역을 합산하여 지급됩니다.", url: "https://kakaobusiness.gitbook.io/main/tool/checkout/calculate" }],
    checked: "우리 통장: 구매결정 + 1영업일이 26일 중 24일 3% 안으로 맞음. 수수료 약 2%.",
  },
];
export const CH = Object.fromEntries(CHANNELS.map((c) => [c.k, c]));
export const AUTO_CONFIRM = 8; // 배송완료 + 8일 자동 구매확정(네이버·카카오 둘 다)

/** 통장 입금 이름 → 채널 (재무 비서 통장 줄과 맞춰 볼 때) */
export function bankChannel(name) {
  const n = String(name || "").toLowerCase();
  if (/^npay정산/.test(n)) return "npo";
  if (/^npay충전/.test(n)) return "npp";
  if (/카페24페이/.test(n)) return "c24";
  if (/^toss정산|tosspay/.test(n)) return "toss";
  if (/톡체크아웃/.test(n)) return "kko";
  return "";
}

// ------------------------------------------------------------ 날짜

const pad = (v) => String(v).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => ymd(new Date());
export const plusDays = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const weekday = (day) => new Date(`${day}T00:00:00`).getDay(); // 0 일 … 6 토
export const WD = "일월화수목금토";
export const md = (day) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
export const mdw = (day) => `${md(day)} (${WD[weekday(day)]})`;

export function holidaySet(rules) {
  return new Set([...HOLIDAYS, ...((rules && rules.holidays) || [])]);
}
export const isBiz = (day, hol) => {
  const w = weekday(day);
  return w !== 0 && w !== 6 && !hol.has(day);
};
/** 그날 다음부터 세어 n번째 영업일 (그날이 주말이어도 굴리지 않는다 — 통장으로 맞춰 본 셈법) */
export function addBiz(day, n, hol) {
  let d = day;
  let k = 0;
  while (k < n) {
    d = plusDays(d, 1);
    if (isBiz(d, hol)) k++;
  }
  return d;
}
/** 쉬는 날이면 다음 영업일 */
export function rollBiz(day, hol) {
  let d = day;
  while (!isBiz(d, hol)) d = plusDays(d, 1);
  return d;
}

// ------------------------------------------------------------ 규칙

export function rulesOf(saved) {
  const out = {};
  for (const c of CHANNELS) out[c.k] = { ...c.rule, ...((saved && saved[c.k]) || {}) };
  return out;
}
export const ruleText = (r) => `${BASIS[r.basis]?.label || r.basis} + ${r.n}영업일`;
const net = (gross, fee) => Math.round(gross * (1 - (Number(fee) || 0) / 100));

/**
 * 주문 한 줄 → 정산 [{day, gross, kind:"pay"|"refund", est, basisDay}] 또는 {wait:true}(발송 전 — 날짜 모름)
 * est = 손님이 구매확정을 안 눌렀다고 보고 자동 구매확정일로 셈(더 빨리 들어올 수 있음)
 */
export function settleOf(row, rule, hol) {
  const [, pay, ship, deliv, conf, amt, refund, refundDay] = row;
  if (rule.basis === "pay") {
    const out = [{ day: addBiz(pay, rule.n, hol), gross: amt, kind: "pay", basisDay: pay }];
    if (refund && refundDay) out.push({ day: addBiz(refundDay, rule.n, hol), gross: -refund, kind: "refund", basisDay: refundDay });
    return out;
  }
  if (rule.basis === "ship") {
    if (!ship) return { wait: true };
    // 쉬는 날 발송 처리하면 택배 집화는 다음 영업일 → 그 다음 영업일 입금 (8/17 대체공휴일 발송분이 8/19 에 들어옴)
    return [{ day: addBiz(rollBiz(ship, hol), rule.n, hol), gross: amt, kind: "pay", basisDay: ship }];
  }
  // 구매확정 기준
  if (conf) return [{ day: addBiz(conf, rule.n, hol), gross: amt, kind: "pay", basisDay: conf }];
  const d0 = deliv || (ship ? plusDays(ship, 1) : "");
  if (!d0) return { wait: true };
  const c0 = plusDays(d0, AUTO_CONFIRM);
  return [{ day: addBiz(c0, rule.n, hol), gross: amt, kind: "pay", est: true, basisDay: c0 }];
}

/**
 * 날짜별로 모으기.
 * days: {day: {day, net, gross, n, ch:{k:{net, gross, n, est, refund, from:Set(기준일)}}}}
 * wait: {k:{gross, net, n}} — 발송 전(주문형)
 */
export function plan(feed, savedRules) {
  const rules = rulesOf(savedRules);
  const hol = holidaySet(savedRules);
  const days = {};
  const wait = {};
  for (const row of (feed && feed.rows) || []) {
    const k = row[0];
    const rule = rules[k];
    if (!rule) continue; // 무통장·기타 = 정산 없음
    const s = settleOf(row, rule, hol);
    if (s.wait) {
      const w = (wait[k] = wait[k] || { gross: 0, net: 0, n: 0 });
      w.gross += row[5];
      w.net += net(row[5], rule.fee);
      w.n++;
      continue;
    }
    for (const e of s) {
      const d = (days[e.day] = days[e.day] || { day: e.day, net: 0, gross: 0, n: 0, ch: {} });
      const c = (d.ch[k] = d.ch[k] || { net: 0, gross: 0, n: 0, est: 0, refund: 0, from: {} });
      const v = net(e.gross, e.kind === "refund" ? 0 : rule.fee);
      c.net += v;
      c.gross += e.gross;
      d.net += v;
      d.gross += e.gross;
      if (e.kind === "refund") c.refund += -e.gross;
      else {
        c.n++;
        d.n++;
        if (e.est) c.est += v;
        c.from[e.basisDay] = (c.from[e.basisDay] || 0) + 1;
      }
    }
  }
  return { days, wait, rules, hol };
}

/** 앞으로 들어올 돈 요약 — today 부터(오늘 포함) */
export function ahead(p, today) {
  const list = Object.values(p.days)
    .filter((d) => d.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day));
  const total = list.reduce((a, d) => a + d.net, 0);
  const est = list.reduce((a, d) => a + Object.values(d.ch).reduce((x, c) => x + c.est, 0), 0);
  const next = list.find((d) => d.net > 0) || null;
  // 이번 주 = 오늘 ~ 그 주 일요일. 주말이면(정산이 없으니) 다가오는 월~일을 이번 주로 본다
  const w0 = weekday(today);
  const sun = w0 === 0 ? plusDays(today, 7) : w0 === 6 ? plusDays(today, 8) : plusDays(today, 7 - w0);
  const week = list.filter((d) => d.day <= sun).reduce((a, d) => a + d.net, 0);
  const nextSun = plusDays(sun, 7);
  const nextWeek = list.filter((d) => d.day > sun && d.day <= nextSun).reduce((a, d) => a + d.net, 0);
  const waitNet = Object.values(p.wait).reduce((a, w) => a + w.net, 0);
  const waitN = Object.values(p.wait).reduce((a, w) => a + w.n, 0);
  const byCh = {};
  for (const d of list) for (const [k, c] of Object.entries(d.ch)) byCh[k] = (byCh[k] || 0) + c.net;
  return { list, total, est, next, week, nextWeek, sun, nextSun, waitNet, waitN, byCh };
}

/** 이번 달 카페24 페이먼츠 결제 합계 — 월 정산 한도(처음 계약 1,000만 원) 넘으면 미뤄질 수 있다 */
export function c24Month(feed, today) {
  const m = today.slice(0, 7);
  return ((feed && feed.rows) || []).filter((r) => r[0] === "c24" && r[1].startsWith(m)).reduce((a, r) => a + r[5] - (r[7]?.startsWith(m) ? r[6] : 0), 0);
}

/** 재무 비서 통장 줄 → {day:{k: 입금}} (정산 입금만) */
export function bankByDay(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.s !== "bank" || !(r.amt > 0)) continue;
    const k = bankChannel(r.name);
    if (!k) continue;
    const d = (out[r.d] = out[r.d] || {});
    d[k] = (d[k] || 0) + r.amt;
  }
  return out;
}

/** 지난 영업일 예상 ↔ 실제 (통장 줄이 있는 날만). since 전 날은 주문 자료(60일)가 덜 차서 예상이 모자라므로 안 본다 */
export function compare(p, bank, today, since = "", count = 15) {
  const out = [];
  // 통장 파일의 마지막 날은 중간에 끊겼을 수 있다(10/15 새벽 2시에 받은 파일엔 그날 오전 카페24·토스가 없다) → 그 전날부터
  const last = Object.keys(bank || {}).sort().pop() || today;
  let d = plusDays(last < today ? last : today, -1);
  let guard = 0;
  while (out.length < count && guard++ < 70 && d >= since) {
    if (isBiz(d, p.hol) && bank[d]) {
      const ex = p.days[d];
      const row = { day: d, expect: ex ? ex.net : 0, actual: 0, ch: {} };
      for (const c of CHANNELS) {
        const e = ex?.ch[c.k]?.net || 0;
        const a = bank[d][c.k] || 0;
        if (e || a) row.ch[c.k] = { e, a };
        row.actual += a;
      }
      out.push(row);
    }
    d = plusDays(d, -1);
  }
  return out;
}

/** 달력 칸 — 그 달 1일이 있는 주 일요일부터 6주 */
export function monthGrid(month) {
  const first = `${month}-01`;
  const start = plusDays(first, -weekday(first));
  return Array.from({ length: 42 }, (_, i) => plusDays(start, i));
}
export const shiftMonth = (m, n) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
