// 포클로 매입 장부 — 도메인 계산
//
// 거래는 '거래처'가 아니라 '거래 건' 단위로 저장한다. 한 거래처 안에
// 이체 건과 삼촌(현금) 건이 섞일 수 있기 때문이다.
//   transfer(이체)  = 부가세 포함 지급 → 부가세를 이미 낸 것
//   samchon(삼촌송금) = 부가세 미포함 현금 지급 → 부가세를 아직 안 낸 것("미증빙")

export const VAT_RATE = 0.1;

/** 간이과세 기간에 세금계산서를 챙길 만한 거래처인지 가르는 총매입 기준선 */
export const INVOICE_THRESHOLD = 300000;

export const won = (n) =>
  "₩" + new Intl.NumberFormat("ko-KR").format(Math.round(n || 0));

export const monthOf = (d) => (d || "").slice(0, 7);

export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
 *  - simple(간이): 총매입 ≥ 30만원 이면서 삼촌분이 있거나 계산서 미수취 건이 있을 때
 *  - general(일반): 삼촌분이 있거나 계산서 미수취 건이 있는 거래처 전부
 */
export function groupByVendor(rows, taxType) {
  const m = new Map();
  for (const t of rows) {
    if (!m.has(t.vendor)) {
      m.set(t.vendor, {
        vendor: t.vendor,
        count: 0,
        supply: 0,
        transferSupply: 0,
        samchonSupply: 0,
        invoiceCount: 0,
      });
    }
    const v = m.get(t.vendor);
    v.count += 1;
    v.supply += t.supply;
    if (t.method === "transfer") v.transferSupply += t.supply;
    else v.samchonSupply += t.supply;
    if (t.invoice) v.invoiceCount += 1;
  }

  return [...m.values()]
    .map((v) => {
      // 삼촌(미증빙) 건을 세금계산서로 돌리면 추가로 낼 부가세
      const switchCost = v.samchonSupply * VAT_RATE;
      const needsWork = v.samchonSupply > 0 || v.invoiceCount < v.count;
      const flag =
        taxType === "general"
          ? needsWork
          : v.supply >= INVOICE_THRESHOLD && needsWork;
      const status =
        v.transferSupply > 0 && v.samchonSupply > 0
          ? "mixed"
          : v.samchonSupply > 0
            ? "samchon"
            : "transfer";
      return { ...v, switchCost, flag, status };
    })
    .sort((a, b) => b.supply - a.supply);
}

/** 상단 KPI용 월 합계 */
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
