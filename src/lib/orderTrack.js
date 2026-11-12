// 일 › 주문내역 (2026-11-12 세원 "요런 식으로 제작 가능? erp 일 칸에" — 넥스트팩식 주문내역 화면 캡처)
// 자료는 사무실 PC poclo-cafe24/orders_track.py 가 카페24 주문 API 로 올린다(게시판 API 아님, 어사이드 안 씀):
//   orders_track      {at, days, rows}  최근 60일 전부 — 하루 한 번
//   orders_track_live {at, rows}        최근 3일 + 아직 안 나간 주문 — 10분마다 (같은 주문이면 이게 이김)
// row = {id, at, pay, paid, name, tel4, place, method, amount, items:[{n, o, q, s, st, t, c, sh, dl}]}
// 전화는 끝 4자리만 저장된다. 지연은 배송지연 안내(delay_sms.py)와 같은 셈 — 결제 다음 날부터 오늘까지 평일 수, 3일↑이면 지연.

export const ORDER_KEYS = ["orders_track", "orders_track_live"];
export const LATE_DAYS = 3;

/** 단계 — 카페24 상태 코드로. '접수' = 배송준비중(창고가 받음), '송장' = 송장은 나왔는데 아직 배송중 전 */
export const STAGES = [
  ["all", "전체"],
  ["wait", "입금 전"],
  ["recv", "접수"],
  ["inv", "송장"],
  ["ship", "배송"],
  ["done", "완료"],
  ["claim", "취소·반품"],
];
export const PERIODS = [
  ["0", "오늘"],
  ["7", "7일"],
  ["14", "14일"],
  ["30", "30일"],
  ["60", "2달"],
];

const UNSHIP = ["N10", "N20", "N21", "N22"];
const isClaim = (s) => /^[CRE]/.test(s || "");

export function mergeOrders(full, live) {
  const m = new Map();
  for (const r of full?.rows || []) if (r?.id) m.set(r.id, r);
  for (const r of live?.rows || []) if (r?.id) m.set(r.id, r);
  return [...m.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function stageOf(r) {
  const its = (r.items || []).filter((i) => !isClaim(i.s));
  if (!its.length) return "claim";
  if (its.some((i) => i.s === "N00") || !r.paid) return "wait";
  const un = its.filter((i) => UNSHIP.includes(i.s));
  if (un.length) return un.every((i) => i.t) ? "inv" : "recv";
  if (its.some((i) => i.s === "N30")) return "ship";
  return "done";
}

const dayOf = (iso) => String(iso || "").slice(0, 10);
/** 그날 다음 날부터 today 까지 평일 수 (delay_sms.weekdays_after 와 같다) */
export function weekdaysAfter(day, today) {
  if (!day) return 0;
  let n = 0;
  const d = new Date(`${day}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + 1);
  while (d <= end) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 아직 안 나간(접수·송장) 주문의 결제 뒤 평일 수 — 아니면 null */
export function waitDays(r, stage, today) {
  if (stage !== "recv" && stage !== "inv") return null;
  return weekdaysAfter(dayOf(r.pay || r.at), today);
}

export const mdhm = (iso) => {
  const s = String(iso || "");
  return s.length >= 16 ? `${s.slice(5, 10)} ${s.slice(11, 16)}` : s.slice(5, 10);
};
/** '[얼리윈터☃️/MD추천] 두톤 후리스 …' → '두톤 후리스 …' (앞 꼬리표만 뗌) */
export const cleanName = (n) => String(n || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim() || String(n || "");

export function qtyOf(r) {
  return (r.items || []).filter((i) => !isClaim(i.s)).reduce((a, i) => a + (i.q || 1), 0) || (r.items || []).reduce((a, i) => a + (i.q || 1), 0);
}
export function trackingOf(r) {
  const i = (r.items || []).find((x) => x.t);
  return i ? { no: i.t, carrier: i.c } : null;
}

/** 찾기 — 받는 사람·전화 끝 4자리·주문번호·송장·상품명·옵션 (띄어쓰기 무시) */
export function hit(r, q) {
  const k = String(q || "").replace(/\s+/g, "").toLowerCase();
  if (!k) return true;
  const digits = k.replace(/\D/g, "");
  const hay = [r.name, r.id, r.tel4, ...(r.items || []).flatMap((i) => [i.n, i.o, i.t])].join("|").replace(/\s+/g, "").toLowerCase();
  if (hay.includes(k)) return true;
  // 전화번호를 통째로 쳐도 끝 4자리로 찾게
  return digits.length >= 4 && r.tel4 && digits.endsWith(r.tel4);
}

export function inPeriod(r, period, today) {
  const n = Number(period);
  const day = dayOf(r.at);
  if (!day) return false;
  if (n === 0) return day === today;
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - (n - 1));
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return day >= from;
}
