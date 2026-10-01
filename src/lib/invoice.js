// 계산서 발행 요청·확인 (2026-10-02) — 오토장끼의 '계산서 발행 요청·확인' 을 포클로 장부에 맞춰.
//
// 세원: "오토장끼 참고해서 계산서 발행 요청, 확인 란 만들자. 누르면 거래처 상세, 위에 '거래처 부가세 송금' 누르면 아직 안 낸
//        부가세가 나오고 바로 알림톡도. 알림톡은 우리가 직접 설정하고 말하면 세팅해 줘도 돼. 우리는 다른 게 조금 있으니 포클로 ERP 에 맞게."
//
// 한 달 · 거래처마다 장끼(결제방식)를 세 갈래로 나눈다 (calc.MODES):
//   부가세 후입금 — 이체·부가세X : 공급가만 보냈다. 부가세(공급가 10%)를 **먼저 따로 보내고** 계산서는 전액(공급가+부가세)으로 받는다.
//   부가세 포함   — 이체·부가세O : 이미 전액 보냈다. 계산서만 받으면 된다.
//   삼촌 대납     — 계산서를 안 받는다(미증빙). 참고로만 보여 준다.
// 계산서를 받았는지는 **장끼마다 있던 '세금계산서 받음'(t.invoice)** 이 기준이다 — 매입 장부·세금계산서 대조와 같은 값.
// 부가세를 따로 보내면(이체 완료 처리) 그 장끼들을 부가세O(vatPaid) 로 바꾸고, 보낸 기록을 settings 'vat_sends' 에 남긴다
//   → 매입 장부의 '부가세 안 낸 매입' 도 맞게 줄고, 이 화면은 기록으로 '후입금이었다'를 안다. 취소하면 되돌린다.
// 잔액(전잔·당잔)은 vatPaid 를 안 본다(pending.js) — 바꿔도 장끼 잔액은 그대로.
//
// settings
//   vat_sends    {items:[{id, month, vendorId, txIds[], amount, on, account}]}
//   invoice_reqs {items:[{id:"월|거래처", month, vendorId, on}]}   — 요청 글을 보낸 날
//   biz_info     {name, bizNo, ceo, address, type, item, email, phone, certKey}  — 요청 글에 넣는 우리 사업자 정보

import { VAT_RATE } from "./calc";
import { won } from "./sales"; // ₩ 없이 숫자만 (글에 '원'을 붙인다)

export const vatOf = (supply) => Math.round((supply || 0) * VAT_RATE);

export function monthRange(m) {
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(y, mm, 0).getDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
}
export const monthTitle = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
export const shiftMonth = (m, d) => {
  const [y, mm] = m.split("-").map(Number);
  const t = new Date(y, mm - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
};

/** 그 달 · 거래처마다 계산서 줄 */
export function monthBoard(tx, vendors, month, sends = []) {
  const sentIds = new Set(sends.filter((s) => s.month === month).flatMap((s) => s.txIds || []));
  const vmap = new Map(vendors.map((v) => [v.id, v]));
  const by = new Map();
  for (const t of tx) {
    if (!String(t.date || "").startsWith(month)) continue;
    const r = by.get(t.vendorId) || { vendorId: t.vendorId, late: [], paid: [], samchon: [] };
    if (t.method === "samchon") r.samchon.push(t);
    else if (!t.vatPaid || sentIds.has(t.id)) r.late.push(t); // 부가세를 나중에 따로 보내는(보낸) 장끼
    else r.paid.push(t);
    by.set(t.vendorId, r);
  }
  const sum = (l) => l.reduce((a, t) => a + (t.supply || 0), 0);
  return [...by.values()].map((r) => {
    const v = vmap.get(r.vendorId) || { id: r.vendorId, name: "지워진 거래처", accounts: [] };
    const inv = [...r.late, ...r.paid];
    const supply = sum(inv);
    const unsent = r.late.filter((t) => !sentIds.has(t.id));
    const issued = inv.filter((t) => t.invoice).length;
    return {
      vendor: v,
      id: r.vendorId,
      kind: r.late.length ? "late" : inv.length ? "paid" : "samchon",
      inv,
      late: r.late,
      unsent,
      samchon: r.samchon,
      supply,
      vat: vatOf(supply),
      total: supply + vatOf(supply),
      lateSupply: sum(r.late),
      vatDue: vatOf(sum(unsent)),
      vatSent: vatOf(sum(r.late.filter((t) => sentIds.has(t.id)))),
      samchonSupply: sum(r.samchon),
      issued,
      status: !inv.length ? "none" : issued === inv.length ? "done" : issued ? "part" : "todo",
    };
  });
}

/** 부가세를 보낼 계좌 — 그 거래처 장끼에 적힌 송금 계좌(최근 것), 없으면 첫 계좌 */
export function accountFor(row) {
  const accs = (row.vendor.accounts || []).filter((a) => a.number);
  const used = [...row.late].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((t) => t.accountId).find(Boolean);
  return accs.find((a) => a.id === used) || accs[0] || null;
}
export const accountText = (a) => (a ? [a.bank, a.number, a.holder && `(${a.holder})`].filter(Boolean).join(" ") : "계좌 없음 — 돈 › 거래처에서 넣어 주세요");

/** 우리 사업자 정보 몇 줄 (비어 있는 칸은 뺀다) */
export function bizLines(b = {}) {
  return [
    b.name && `상호: ${b.name}`,
    b.bizNo && `사업자등록번호: ${b.bizNo}`,
    b.ceo && `대표자: ${b.ceo}`,
    b.address && `사업장 주소: ${b.address}`,
    (b.type || b.item) && `업태·종목: ${[b.type, b.item].filter(Boolean).join(" / ")}`,
    b.email && `계산서 받을 이메일: ${b.email}`,
    b.phone && `담당자 연락처: ${b.phone}`,
  ].filter(Boolean);
}

/** 거래처에 보내는 계산서 발행 요청 글 (알림톡 연결 전 — 카톡에 붙여넣기) */
export function requestText(row, month, biz = {}, sentOn = "") {
  const m = Number(month.slice(5, 7));
  const lines = [
    `[${biz.name || "포클로"}] 세금계산서 발행 요청`,
    `안녕하세요 사장님, ${biz.name || "포클로"}입니다.`,
    `${m}월 거래분 세금계산서 발행 부탁드립니다.`,
    "",
    `· 공급가액 ${won(row.supply)}원`,
    `· 부가세 ${won(row.vat)}원`,
    `· 합계 ${won(row.total)}원 (${row.inv.length}건)`,
  ];
  if (row.late.length) lines.push(`· 부가세 ${won(row.vatSent || vatOf(row.lateSupply))}원은 ${sentOn ? `${Number(sentOn.slice(5, 7))}/${Number(sentOn.slice(8, 10))}에 ` : ""}따로 입금드렸어요.`);
  const b = bizLines(biz);
  if (b.length) lines.push("", "[저희 사업자 정보]", ...b);
  lines.push("", "감사합니다.");
  return lines.join("\n");
}

/** 부가세 따로 보낸 뒤 안내 글 */
export function vatDoneText(name, month, amount, biz = {}) {
  return [`[${biz.name || "포클로"}] 부가세 입금 안내`, `${name} 사장님, ${Number(month.slice(5, 7))}월 거래분 부가세 ${won(amount)}원 입금드렸어요.`, "확인 부탁드립니다. 감사합니다."].join("\n");
}

/** 대량이체용 표 — 은행마다 올리는 양식이 조금씩 달라서, 흔한 칸 이름으로 만든다(세원이 은행 양식을 주면 거기에 맞춘다) */
export function transferRows(rows, month, biz = {}) {
  return [
    ["입금은행", "입금계좌번호", "예금주", "입금액", "받는분 통장표시", "내 통장표시"],
    ...rows.map((r) => {
      const a = accountFor(r);
      return [a?.bank || "", (a?.number || "").replace(/[^0-9]/g, ""), a?.holder || "", r.vatDue, `${biz.name || "포클로"} ${Number(month.slice(5, 7))}월부가세`, `${r.vendor.name} 부가세`];
    }),
  ];
}
