// 포클로 매입 장부 — 도메인 계산
//
// 거래는 '거래 건' 단위로 저장한다. 한 거래처 안에 이체 건과 삼촌 대납 건이
// 섞일 수 있기 때문이다.
//   transfer(이체)     = 부가세 포함 지급 → 부가세를 이미 낸 것
//   samchon(삼촌 대납) = 부가세 미포함 현금 지급 → 아직 안 낸 것("미증빙")
//
// 장부 금액은 품목 합계가 아니라 거래의 supply(당일합계)다. 에누리 등으로
// 둘이 다를 수 있고, 실제로 주고받은 쪽은 당일합계다.

export const VAT_RATE = 0.1;

/** 간이과세 기간에 세금계산서를 챙길 만한 거래처인지 가르는 총매입 기준선 */
export const INVOICE_THRESHOLD = 300000;

// 반품·교환은 수량이 음수라 금액도 음수가 된다. 부호는 통화기호 앞에 붙인다.
export const won = (n) => {
  const v = Math.round(n || 0);
  return (v < 0 ? "-₩" : "₩") + new Intl.NumberFormat("ko-KR").format(Math.abs(v));
};

export const monthOf = (d) => (d || "").slice(0, 7);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => iso(new Date());
export const thisMonth = () => monthOf(todayISO());

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export const dayLabel = (d) => {
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})`;
};

export const monthLabel = (m) => {
  const [y, mm] = (m || "").split("-");
  return y && mm ? `${y}년 ${Number(mm)}월` : m;
};

// ------------------------------------------------------------------ 날짜 범위

/** 오늘 / 이번달 / 저번달 / 임의 기간 */
export function rangeOf(preset, custom) {
  const now = new Date();
  if (preset === "today") return { from: todayISO(), to: todayISO() };
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: iso(first), to: iso(last) };
  }
  if (preset === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  return { from: custom?.from || "", to: custom?.to || "" };
}

export const rangeLabel = ({ from, to }) => {
  if (!from && !to) return "전체 기간";
  if (from === to) return dayLabel(from);
  return `${from || "처음"} ~ ${to || "오늘"}`;
};

export const inRange = (date, { from, to }) =>
  (!from || date >= from) && (!to || date <= to);

export const filterRange = (rows, range) => rows.filter((t) => inRange(t.date, range));

// -------------------------------------------------------------------- 파생값

/** 거래 한 건에서 파생되는 금액들 */
export function derive(t) {
  const supply = t.supply || 0;
  const vat = supply * VAT_RATE;
  const isTransfer = t.method === "transfer";
  return {
    vat,
    paidVat: isTransfer ? vat : 0,
    pendingVat: isTransfer ? 0 : vat,
    actualPaid: isTransfer ? supply + vat : supply,
  };
}

/** 품목 행 합계 — 당일합계와 다를 수 있어 참고용으로만 보여준다 */
export const itemsTotal = (items = []) => items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

export const hasPending = (t) => (t.items || []).some((i) => i.pending);

// ------------------------------------------------------------------ 묶어보기

/** 날짜별로 묶어 최신순으로 */
export function groupByDay(rows) {
  const m = new Map();
  for (const t of rows) {
    if (!m.has(t.date)) m.set(t.date, []);
    m.get(t.date).push(t);
  }
  return [...m.keys()]
    .sort()
    .reverse()
    .map((date) => {
      const items = m.get(date);
      return {
        date,
        items,
        supply: items.reduce((s, t) => s + t.supply, 0),
        actualPaid: items.reduce((s, t) => s + derive(t).actualPaid, 0),
      };
    });
}

/**
 * 거래처별 집계 + 세금계산서 우선순위 하이라이트.
 * 과세 유형에 따라 하이라이트 규칙이 달라진다.
 *  - simple(간이): 총매입 ≥ 30만원 이면서 대납분이 있거나 계산서 미수취 건이 있을 때
 *  - general(일반): 대납분이 있거나 계산서 미수취 건이 있는 거래처 전부
 */
export function summarizeVendors(rows, vendors, taxType) {
  const m = new Map();
  for (const v of vendors) {
    m.set(v.id, {
      ...v,
      count: 0,
      supply: 0,
      transferSupply: 0,
      samchonSupply: 0,
      invoiceCount: 0,
      pendingCount: 0,
      noPhotoCount: 0,
      lastDate: "",
    });
  }

  for (const t of rows) {
    const s = m.get(t.vendorId);
    if (!s) continue; // 거래처가 지워진 고아 거래
    s.count += 1;
    s.supply += t.supply;
    if (t.method === "transfer") s.transferSupply += t.supply;
    else s.samchonSupply += t.supply;
    if (t.invoice) s.invoiceCount += 1;
    if (hasPending(t)) s.pendingCount += 1;
    if (!t.hasPhoto) s.noPhotoCount += 1;
    if (t.date > s.lastDate) s.lastDate = t.date;
  }

  return [...m.values()].map((s) => {
    // 대납(미증빙) 건을 세금계산서로 돌리면 추가로 낼 부가세
    const switchCost = s.samchonSupply * VAT_RATE;
    const needsWork = s.samchonSupply > 0 || s.invoiceCount < s.count;
    const flag =
      s.count === 0
        ? false
        : taxType === "general"
          ? needsWork
          : s.supply >= INVOICE_THRESHOLD && needsWork;
    const status =
      s.transferSupply > 0 && s.samchonSupply > 0
        ? "mixed"
        : s.samchonSupply > 0
          ? "samchon"
          : s.count > 0
            ? "transfer"
            : "none";
    return { ...s, switchCost, flag, status };
  });
}

/** 거래·순위 — 기간 안에서 거래액 높은 순 */
export function ranking(rows, vendors, range) {
  const inside = filterRange(rows, range);
  const summary = summarizeVendors(inside, vendors, "simple")
    .filter((v) => v.count > 0)
    .sort((a, b) => b.supply - a.supply);
  return {
    rows: inside,
    vendors: summary,
    totalSupply: summary.reduce((s, v) => s + v.supply, 0),
    vendorCount: summary.length,
    txCount: inside.length,
  };
}

/** 상단 KPI용 합계 */
export function totals(rows) {
  let supply = 0;
  let samchon = 0;
  let paidVat = 0;
  let actualPaid = 0;
  let invoiced = 0;
  for (const t of rows) {
    const d = derive(t);
    supply += t.supply;
    paidVat += d.paidVat;
    actualPaid += d.actualPaid;
    if (t.method === "samchon") samchon += t.supply;
    if (t.invoice) invoiced += 1;
  }
  return {
    supply,
    samchon,
    paidVat,
    actualPaid,
    switchCost: samchon * VAT_RATE,
    invoiced,
    count: rows.length,
    invoiceRate: rows.length ? invoiced / rows.length : 0,
  };
}
