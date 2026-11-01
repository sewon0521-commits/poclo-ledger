// 재무 비서 (세원 10/15 결정, 11/1 엑셀 방식 확정) — 국민은행·국민카드 엑셀을 끌어다 놓으면 분류하고 월별 손익·자금일보를 본다.
// 원본 파일은 어디에도 올리지 않는다(저장소 한도 초과 중) — 브라우저가 읽어 아래 칸만 settings 에 쓴다.
// 계좌·카드번호는 끝 4자리만 저장한다. 가맹점 사업자번호·대표자·주소·전화는 안 읽는다.
//
// settings
//   finance_YYYY_MM  {rows:[row]} — 달마다 한 키(확인 체크 하나에 전체를 다시 쓰지 않게)
//   finance_index    {months:["2026-09"], accounts:{끝4자리:이름}, imports:[…], aiWon}
//   finance_rules    {rules:{ruleKey:{cat, by:"user"|"ai", name, why, at}}}
// row = {id, s:"bank"|"card", src:끝4자리, d, t, name, sub(적요·업종), br(처리점), amt(입금 +, 출금 −), bal(통장 잔액),
//        usd·pend(달러만 있고 원화가 아직 없음)·fee·oid·cid(해외), cancel, cat, by, sure, ok}
//
// ⚠ 두 번 세지 않기 — 9월로 확인: 통장 '체크카드' 출금 합 = 카드 승인내역 체크카드(원화) 합(1원까지 같다). 통장의 '직불출금'(비자해외승인대금)은 체크카드 해외 결제,
//   '국민카드'(KB카드출금)는 신용카드 대금이다. 그래서 카드 쓴 돈은 카드 내역으로 세고, 통장 쪽 줄은 '카드 대금'(손익 제외)으로 둔다.
// ⚠ 해외 결제(메타 광고비)는 승인내역에 달러만 있다 → 해외매입내역의 원화(결제원금+수수료)로 채운다. 채우기 전엔 손익에 안 들어가고 화면에 알린다.
// ⚠ 같은 결제가 승인내역·국내매입내역에 둘 다 있다 → 끝 4자리 + 승인번호 + 부호로 하나로 본다. 매입 취소는 번호가 '43212827(30002659)' 꼴이라 괄호 안(원래 번호)을 쓴다.
import { parseTable } from "./stock";
import { DEFAULT_COSTS, dayPnl } from "./sales";

export { parseTable };

export const CATS = [
  { k: "매출 입금", type: "income" },
  { k: "기타 수입", type: "income" },
  { k: "상품 매입", type: "expense" },
  { k: "광고비", type: "expense" },
  { k: "택배·물류", type: "expense" },
  { k: "인건비·외주", type: "expense" },
  { k: "구독·프로그램", type: "expense" },
  { k: "수수료·세무", type: "expense" },
  { k: "임차·관리비", type: "expense" },
  { k: "통신비", type: "expense" },
  { k: "소모품·사무", type: "expense" },
  { k: "식대·복리후생", type: "expense" },
  { k: "교통·차량", type: "expense" },
  { k: "세금·공과", type: "expense" },
  { k: "이자·금융비용", type: "expense" },
  { k: "기타 경비", type: "expense" },
  { k: "카드 대금", type: "skip" },
  { k: "내 계좌 이동", type: "skip" },
  { k: "대출 원금", type: "skip" },
  { k: "대표·개인", type: "skip" },
];
const TYPE_OF = Object.fromEntries(CATS.map((c) => [c.k, c.type]));
export const catType = (k) => TYPE_OF[k] || "";

export const INDEX_KEY = "finance_index";
export const RULES_KEY = "finance_rules";
export const monthKey = (m) => `finance_${m.replace("-", "_")}`;
export const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
export const shiftMonth = (m, n) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const shiftDay = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 글 속 긴 번호(계좌·카드)는 끝 4자리만 — 파일 이름에도 계좌번호가 들어 있다 */
export const maskText = (s) => String(s ?? "").replace(/\d[\d-]{8,}\d/g, (m) => `****${m.replace(/\D/g, "").slice(-4)}`);
/** '4632-35**-****-9913' → 9913 · 가려져 있으면 보이는 끝 숫자만 */
export const last4 = (s) => (String(s ?? "").match(/(\d{1,4})\D*$/) || [])[1] || "";

const clean = (s) => maskText(String(s ?? "").replace(/　/g, " ").replace(/\s+/g, " ").trim());
const headOf = (row) => row.map((c) => String(c ?? "").replace(/\s|\(원\)/g, ""));
const at = (h, ...names) => {
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};
const toDay = (s) => {
  const m = String(s ?? "").match(/(20\d{2})[.\-/]?\s*(\d{1,2})[.\-/]?\s*(\d{1,2})/) || String(s ?? "").match(/^\s*()(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*$/); // 명세서는 '26.08.01'
  if (!m) return "";
  return m.length === 5 ? `20${m[2]}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}` : `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};
const toTime = (s) => (String(s ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/) || [""])[0];
const toNum = (s) => {
  const t = String(s ?? "").replace(/[^\d.()-]/g, "");
  if (!t || t === "-") return 0;
  const v = Number(t.replace(/[()]/g, "")) || 0;
  return /^\(.*\)$/.test(t) ? -v : v;
};
const whichRow = (table, test) => table.findIndex((r) => test(headOf(r)));

// ---------------------------------------------------------------- 파일 읽기

function readBank(table, h, hi) {
  const before = table.slice(0, hi).flat().map((c) => String(c ?? ""));
  const acct = before.map((c) => c.match(/계좌번호\s*[:：]?\s*(.+)/)?.[1]).find(Boolean);
  const label = before.map((c) => c.match(/계좌명\s*[:：]\s*(.+)/)?.[1]).find(Boolean);
  const c = {
    day: at(h, "거래일시", "거래일자", "거래일"),
    time: at(h, "거래시간"),
    name: at(h, "보낸분/받는분", "보낸분받는분", "거래내용", "내용"),
    out: at(h, "출금액", "출금", "찾으신금액"),
    in: at(h, "입금액", "입금", "맡기신금액"),
    bal: at(h, "잔액", "거래후잔액"),
    sub: at(h, "적요"),
    br: at(h, "처리점", "거래점"),
    kind: at(h, "구분"),
    acct: at(h, "계좌번호"),
  };
  const src0 = last4(acct);
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const d = toDay(r[c.day]);
    if (!d) continue;
    const amt = toNum(r[c.in]) - toNum(r[c.out]);
    const t = toTime(r[c.day]) || toTime(r[c.time]);
    const src = src0 || last4(r[c.acct]) || "통장";
    const bal = c.bal >= 0 ? toNum(r[c.bal]) : undefined;
    const row = { id: `b|${src}|${d}${t}|${amt}|${bal ?? ""}`, s: "bank", src, d, t, name: clean(r[c.name]) || clean(r[c.sub]) || "(이름 없음)", sub: clean(r[c.sub]), br: clean(r[c.br]), amt, bal };
    if (/취소/.test(String(r[c.kind] ?? ""))) row.cancel = true;
    rows.push(row);
  }
  return { kind: "bank", label: "국민은행 통장", rows, accounts: { [src0 || "통장"]: clean(label) || "통장" } };
}

function readCard(table, h, hi, kind) {
  const c = {
    buy: at(h, "매입일"),
    day: at(h, "승인일", "이용일", "이용일자", "거래일"),
    time: at(h, "승인시간", "이용시간"),
    card: at(h, "카드번호", "이용카드"),
    name: at(h, "가맹점명", "이용하신곳", "이용가맹점", "가맹점"),
    sub: at(h, "업종명", "업종"),
    amt: at(h, "승인금액", "이용금액", "결제금액", "이용원금"),
    no: at(h, "승인번호"),
    state: at(h, "상태"),
  };
  const seen = {};
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const buyDay = toDay(r[c.buy]);
    const useDay = toDay(r[c.day]);
    const raw = String(r[c.amt] ?? "");
    const v = toNum(raw);
    const canceled = v < 0 || /취소/.test(String(r[c.state] ?? ""));
    // 매입 취소의 승인일은 원래 결제일이다 — 돈이 돌아온 날(매입일)로 둔다
    const d = canceled && buyDay ? buyDay : useDay || buyDay;
    if (!d || (!v && !raw.trim())) continue;
    const src = last4(r[c.card]) || "카드";
    const name = clean(r[c.name]) || "(이름 없음)";
    const signed = canceled ? -Math.abs(v) : v;
    const no = String(r[c.no] ?? "").match(/\((\d+)\)/)?.[1] || String(r[c.no] ?? "").replace(/\D/g, "");
    let id = `c|${src}|${no}|${signed < 0 ? "-" : "+"}`;
    if (!no) {
      const base = `c|${src}|${d}|${toTime(r[c.time])}|${name}|${signed}`;
      seen[base] = (seen[base] || 0) + 1;
      id = `${base}|${seen[base]}`;
    }
    const row = { id, s: "card", src, d, t: toTime(r[c.time]), name, sub: clean(r[c.sub]).replace(/^-$/, ""), amt: -signed };
    if (/\$/.test(raw)) Object.assign(row, { amt: 0, usd: signed, pend: true }); // 달러만 — 원화는 해외매입내역에서
    if (canceled) row.cancel = true;
    rows.push(row);
  }
  // 해외 승인이지만 청구가 안 되는 것 — 승인 뒤 바로 취소된 짝, 1달러 미만 카드 확인 결제($0.66 등). 해외매입내역에 안 나와서 '원화 대기'로 남기면 안 된다
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    if (!r.pend) continue;
    const pair = ids.has(r.id.replace(/\|[+-]$/, r.usd < 0 ? "|+" : "|-"));
    if (pair || Math.abs(r.usd) < 1) r.pend = false;
  }
  return { kind: "card", label: kind === "buy" ? "국민카드 국내매입내역" : kind === "use" ? "국민카드 이용내역" : "국민카드 승인내역", rows };
}

function readOverseas(table, h, hi) {
  const c = {
    buy: at(h, "매입일"),
    day: at(h, "승인일"),
    card: at(h, "카드번호"),
    name: at(h, "가맹점명"),
    usd: at(h, "미화환산금액"),
    fee: at(h, "수수료"),
    total: at(h, "총결제금액"),
  };
  const seen = {};
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const bd = toDay(r[c.buy]);
    const ad = toDay(r[c.day]);
    if (!bd && !ad) continue;
    const src = last4(r[c.card]) || "카드";
    const name = clean(r[c.name]) || "(이름 없음)";
    const total = toNum(r[c.total]);
    const usd = toNum(r[c.usd]);
    const base = `o|${src}|${bd}|${ad}|${name}|${usd}|${total}`;
    seen[base] = (seen[base] || 0) + 1;
    const oid = `${base}|${seen[base]}`;
    rows.push({ id: oid, oid, s: "card", src, d: ad || bd, t: "", name, sub: "해외", amt: -total, usd, fee: toNum(r[c.fee]), ad, bd, ...(total < 0 ? { cancel: true } : {}) });
  }
  return { kind: "overseas", label: "국민카드 해외매입내역", rows };
}

/**
 * 국민카드 이용대금명세서 — 낸 돈은 '이번달 결제금액'의 원금 + 수수료(리볼빙).
 * 'KB ALL 해외할인' 줄은 날짜가 없고 원금에 이미 빠져 있어서 안 읽는다. 합계 줄도 날짜가 없다.
 */
function readStatement(table, h, hi) {
  const sub = table.slice(hi + 1, hi + 4).map(headOf).find((r) => r.includes("원금")) || [];
  const c = { day: at(h, "이용일자", "이용일"), card: at(h, "이용카드"), kind: at(h, "구분"), name: at(h, "이용가맹점"), amt: at(h, "이용금액"), paid: sub.indexOf("원금"), fee: sub.indexOf("수수료") };
  const seen = {};
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const d = toDay(r[c.day]);
    if (!d) continue;
    const paid = c.paid >= 0 ? toNum(r[c.paid]) : 0;
    const fee = c.fee >= 0 ? toNum(r[c.fee]) : 0;
    const total = paid || fee ? paid + fee : toNum(r[c.amt]);
    if (!total) continue;
    const src = last4(r[c.card]) || "카드";
    const name = clean(r[c.name]) || "(이름 없음)";
    const base = `s|${src}|${d}|${name}|${total}`;
    seen[base] = (seen[base] || 0) + 1;
    const row = { id: `${base}|${seen[base]}`, s: "card", src, d, t: "", name, sub: clean(r[c.kind]), amt: -total };
    if (fee) row.fee = fee;
    if (total < 0) row.cancel = true;
    rows.push(row);
  }
  return { kind: "card", label: "국민카드 이용대금명세서", rows };
}

/** 머리 줄을 보고 어느 파일인지 가려 읽는다 → {kind, label, rows, accounts} 또는 {error} */
export function parseFinance(table) {
  if (!table?.length) return { error: "표를 읽지 못했어요. .xls · .xlsx · .csv 파일인지 확인해 주세요." };
  let hi = whichRow(table, (h) => at(h, "거래일시", "거래일자", "거래일") >= 0 && at(h, "출금액", "출금", "찾으신금액") >= 0 && at(h, "입금액", "입금", "맡기신금액") >= 0);
  if (hi >= 0) return readBank(table, headOf(table[hi]), hi);
  hi = whichRow(table, (h) => h.includes("매입일") && h.includes("총결제금액"));
  if (hi >= 0) return readOverseas(table, headOf(table[hi]), hi);
  hi = whichRow(table, (h) => h.includes("매입일") && h.includes("승인금액"));
  if (hi >= 0) return readCard(table, headOf(table[hi]), hi, "buy");
  hi = whichRow(table, (h) => h.includes("승인일") && h.includes("승인금액"));
  if (hi >= 0) return readCard(table, headOf(table[hi]), hi, "approve");
  hi = whichRow(table, (h) => h.includes("이용가맹점") && h.includes("이번달결제금액"));
  if (hi >= 0) return readStatement(table, headOf(table[hi]), hi);
  hi = whichRow(table, (h) => at(h, "이용일", "이용일자") >= 0 && at(h, "이용금액", "결제금액", "이용원금") >= 0);
  if (hi >= 0) return readCard(table, headOf(table[hi]), hi, "use");
  if (whichRow(table, (h) => h.includes("결제일") && h.includes("청구합계")) >= 0) return { error: "카드 결제 요약이라 거래가 한 줄씩 없어요. 승인내역이나 국내매입내역을 넣어 주세요." };
  return { error: "국민은행 거래내역이나 국민카드 내역 모양이 아니에요." };
}

// ---------------------------------------------------------------- 분류

/** 같은 곳을 하나로 — 'Toss정산0908' → toss정산, 'FACEBK *V56YU6' → facebk */
export const normName = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|유한회사/g, "")
    .replace(/\*.*$/, "")
    .replace(/\d+$/, "")
    .replace(/[\s()[\]_.,·\-　]/g, "");
/** 규칙 열쇠 — 카드는 취소도 같은 곳이라 방향을 안 본다 */
export const ruleKey = (r) => (r.s === "card" ? `card|${normName(r.name)}` : `bank|${r.amt >= 0 ? "in" : "out"}|${normName(r.name)}`);

const bitsOf = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|유한회사/g, " ")
    .split(/[\s()[\]/,.·_　-]+/)
    .filter((x) => x.length >= 2);

/** 규칙·돈 › 거래처·구독 목록을 분류에 쓰기 좋게 */
export function makeCtx({ rules, vendors, subs } = {}) {
  const vendorBits = new Set();
  for (const v of vendors || []) {
    for (const b of bitsOf(v.name)) vendorBits.add(b);
    for (const a of v.accounts || []) for (const b of bitsOf(a.holder)) vendorBits.add(b);
  }
  const subNames = (subs || [])
    .filter((s) => s.status !== "ended")
    .map((s) => String(s.name || "").toLowerCase().replace(/\s/g, ""))
    .filter((s) => s.length >= 3);
  return { rules: rules || {}, vendorBits, subNames };
}

const CARD_MONEY = /^(체크카드|직불출금|카드입금|국민카드)$/;
const SALES_IN = /npay|네이버페이|톡체크아웃|카페24페이|toss정산|토스페이먼츠|쿠팡페이|이니시스|나이스페이|kcp/i;
const NAME_RULES = [
  [/facebk|facebook|meta ?platforms|google ?ads|구글애즈|카카오모먼트/i, "광고비"],
  [/대한통운|cj ?logistics|우체국|로젠|한진택배|롯데택배|넥스트팩/i, "택배·물류"],
  [/anthropic|openai|notion|capcut|canva|adobe|figma|vercel|supabase|github|vrew|cafe24|카페24|신상마켓/i, "구독·프로그램"],
  [/회계|세무사|법무|노무/, "수수료·세무"],
  [/관리단|관리비|임대료|월세/, "임차·관리비"],
  [/lguplus|lg ?u\+|sk텔레콤|통신요금/i, "통신비"],
  [/국세|지방세|세무서|건강보험|국민연금|고용보험|산재보험|위택스|홈택스/, "세금·공과"],
  [/배민|배달의민족|우아한형제들|요기요|쿠팡이츠|맥도날드/, "식대·복리후생"],
  [/카카오t|티머니|하이패스|코레일|srt/i, "교통·차량"],
  [/다이소/, "소모품·사무"],
];
const KIND_RULES = [
  [/한식|일식|중식|양식|음식점|패스트푸드|커피|제과|베이커리|주점/, "식대·복리후생"],
  [/주유소|주차|택시|고속|철도|항공|렌터카/, "교통·차량"],
  [/슈퍼마켓|편의점|잡화|문구|사무/, "소모품·사무"],
  [/전화요금|통신/, "통신비"],
];

/** 한 줄 분류 — 규칙 → 통장의 카드 줄 → 대출·이자 → 매출 입금 → 거래처 → 이름 → 업종 → 구독. 못 찾으면 빈 분류 */
export function classify(r, ctx) {
  const rule = ctx.rules[ruleKey(r)];
  if (rule) return { cat: rule.cat, by: rule.by === "ai" ? "ai" : "rule" };
  const isOut = r.amt < 0;
  const hit = (cat, by = "auto") => ({ cat, by });
  if (r.usd && !r.amt && !r.pend) return hit("기타 경비"); // 청구 없는 해외 승인 — 0원이라 손익엔 영향 없고, 미분류로 남지 않게
  if (r.s === "bank") {
    if (CARD_MONEY.test(r.sub) || r.br === "KB카드" || /kb카드|kb체크|해외승인대금/i.test(r.name)) return hit("카드 대금");
    if (/보증료/.test(r.name)) return hit("이자·금융비용");
    if (r.br === "대출실" && !isOut) return hit("대출 원금");
    if (/결산이자/.test(r.sub) && !isOut) return hit("기타 수입");
    if (!isOut && SALES_IN.test(r.name)) return hit("매출 입금");
    if (isOut) {
      const bits = bitsOf(r.name);
      const plain = r.name.toLowerCase().replace(/\s/g, "");
      if (bits.some((b) => ctx.vendorBits.has(b)) || [...ctx.vendorBits].some((v) => v.length >= 3 && plain.includes(v))) return hit("상품 매입", "erp");
    }
  }
  if (isOut || r.s === "card") {
    for (const [re, cat] of NAME_RULES) if (re.test(r.name)) return hit(cat);
    if (r.s === "card") for (const [re, cat] of KIND_RULES) if (re.test(r.sub)) return hit(cat);
    const plain = r.name.toLowerCase().replace(/\s/g, "");
    if (ctx.subNames.some((n) => plain.includes(n))) return hit("구독·프로그램", "erp");
  }
  return { cat: "", by: "" };
}

// ---------------------------------------------------------------- 넣기 (이미 넣은 거래는 안 들어가게)

const lc = (s) => String(s || "").toLowerCase();
const sameAbroad = (a, o) => {
  if (a.src !== o.src || lc(a.name) !== lc(o.name) || Math.abs(a.usd - o.usd) > 0.011) return false;
  if (o.ad) return a.d === o.ad;
  const gap = (new Date(o.bd) - new Date(a.d)) / 86400000; // 승인일이 빈 해외 줄은 매입일 일주일 안에서
  return gap >= 0 && gap <= 7;
};

/**
 * 읽은 파일들 + 이미 있는 줄 → 무엇을 더하고 고칠지. 저장은 안 한다(미리 보기·저장 둘 다 이 결과를 쓴다).
 * 해외매입 → 달러만 있던 승인 줄에 원화를 채우고, 해외매입이 먼저면 나중 승인 줄은 이미 있는 것으로 본다.
 */
export function planImport(files, existing, ctx) {
  const seen = new Set();
  const pool = [];
  for (const r of existing) {
    pool.push(r);
    for (const k of [r.id, r.oid, r.cid]) if (k) seen.add(k);
  }
  const adds = [];
  const patches = new Map();
  const put = (r, patch) => {
    const cur = patches.get(r.id) || {};
    patches.set(r.id, { ...cur, ...patch });
    Object.assign(r, patch);
  };
  const report = files.map((f) => {
    const out = { kind: f.kind, label: f.label, file: f.file, lines: f.rows.length, added: 0, dup: 0, filled: 0, from: "", to: "", srcs: [] };
    const srcs = new Set();
    for (const row of f.rows) {
      srcs.add(row.src);
      if (!out.from || row.d < out.from) out.from = row.d;
      if (!out.to || row.d > out.to) out.to = row.d;
      if (f.kind === "overseas") {
        if (seen.has(row.oid)) {
          out.dup++;
          continue;
        }
        seen.add(row.oid);
        const wait = pool.find((p) => p.pend && sameAbroad(p, row));
        if (wait) {
          put(wait, { amt: row.amt, fee: row.fee, oid: row.oid, pend: false });
          out.filled++;
          continue;
        }
      } else {
        if (seen.has(row.id)) {
          out.dup++;
          // 승인 '네이버페이' ↔ 매입 '네이버페이-오늘의집' — 긴 이름이 어디서 샀는지 알려 준다
          const old = pool.find((p) => p.id === row.id);
          if (old && row.name.length > old.name.length && row.name.startsWith(old.name)) {
            const patch = { name: row.name };
            if (!old.ok && old.by !== "user") Object.assign(patch, classify({ ...old, name: row.name }, ctx));
            put(old, patch);
          }
          continue;
        }
        if (row.pend) {
          const paid = pool.find((p) => p.oid && !p.cid && sameAbroad(row, p));
          if (paid) {
            put(paid, { cid: row.id });
            seen.add(row.id);
            out.dup++;
            continue;
          }
        }
        seen.add(row.id);
      }
      const got = classify(row, ctx);
      // 통장의 카드값 줄은 볼 일이 없어서 확인된 채로 — '확인 전'이 짧아야 체크한다
      const fresh = { ...row, ...got, ok: (got.by === "auto" && got.cat === "카드 대금") || (!!row.usd && !row.amt && !row.pend) };
      adds.push(fresh);
      pool.push(fresh);
      out.added++;
    }
    out.srcs = [...srcs];
    return out;
  });
  return { adds, patches, report };
}

const byTimeDesc = (a, b) => `${b.d} ${b.t}`.localeCompare(`${a.d} ${a.t}`);
/** 달 키에 더하고 고치기 — 여러 번 불려도 같은 결과(이미 있는 줄은 안 더한다) */
export const addRows = (adds, patches) => (v) => {
  const rows = (v?.rows || []).map((r) => (patches?.has(r.id) ? { ...r, ...patches.get(r.id) } : r));
  const have = new Set(rows.flatMap((r) => [r.id, r.oid, r.cid].filter(Boolean)));
  for (const a of adds || []) if (!have.has(a.id)) rows.push(a);
  rows.sort(byTimeDesc);
  return { ...v, rows };
};
export const patchRows = (patches) => (v) => ({ ...v, rows: (v?.rows || []).map((r) => (patches.has(r.id) ? { ...r, ...patches.get(r.id) } : r)) });
export const groupByMonth = (rows) => {
  const out = {};
  for (const r of rows) (out[r.d.slice(0, 7)] ||= []).push(r);
  return out;
};

// ---------------------------------------------------------------- Claude 에게 물을 것

/** 미분류를 곳마다 하나로 — 돈이 큰 곳부터 */
export function asksOf(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.cat) continue;
    const key = ruleKey(r);
    const g = m.get(key) || { key, s: r.s, io: r.amt >= 0 ? "입금" : "출금", name: r.name, sub: r.sub, n: 0, total: 0 };
    g.n++;
    g.total += Math.abs(r.amt);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
/** 물어보기 전 어림 비용(원) — 곳당 입력 45·출력 45토큰 + 안내문, Opus 5.5 $4·$20, 1달러 1,400원. 생각 몫으로 30% 더 */
export const askEstimate = (n) => Math.max(1, Math.ceil(((((900 + 45 * n) * 4 + 45 * n * 20) / 1e6) * 1400 * 1.3) / 5) * 5);

// ---------------------------------------------------------------- 숫자

/**
 * 매출 장부 → 달마다 {gross, refund, net, fee, days} (11/1 세원: "수입은 포클로 매출 장부랑 계산해 봐야 하는 거 아닌가")
 * 순매출 = 결제합계 − 환불합계(카페24 화면과 같은 값). 수수료는 돈 › 손익과 같은 계산 — 정산금에서 빠져 들어와서 통장·카드에 안 찍힌다.
 */
export function salesByMonth(salesRows, conf) {
  const costs = { ...DEFAULT_COSTS, ...conf?.costs };
  const out = {};
  for (const row of salesRows || []) {
    if (!row.cafeGross && !row.cafeRefund) continue;
    const d = dayPnl(row, costs, null, conf?.monthly);
    const m = (out[row.date.slice(0, 7)] ||= { gross: 0, refund: 0, net: 0, fee: 0, days: 0 });
    m.gross += d.revenue;
    m.refund += d.refund;
    m.net += d.net;
    m.fee += Math.round(d.fee);
    m.days++;
  }
  return out;
}

/**
 * 한 달 손익. sales(salesByMonth 의 그 달)가 있으면 수입 = 장부 순매출 + 기타 수입, 지출에 결제 수수료를 더한다.
 * 통장의 '매출 입금'은 같은 돈이 수수료 빠지고 며칠 뒤 들어온 것이라 수입에 또 안 넣는다(settled 로 비교만). 장부가 없는 달만 통장 입금으로 본다.
 */
export function monthStats(rows, sales) {
  const s = { income: 0, expense: 0, profit: 0, byCat: {}, none: { n: 0, inn: 0, out: 0 }, todo: 0, pend: { n: 0, usd: 0 }, cardOut: 0, cardRows: 0, bankRows: 0, settled: 0, sales: sales || null, rows: rows.length };
  for (const r of rows) {
    if (!r.ok) s.todo++;
    if (r.s === "card") s.cardRows++;
    else s.bankRows++;
    if (r.pend) {
      s.pend.n++;
      s.pend.usd += r.usd || 0;
    }
    if (!r.cat) {
      s.none.n++;
      if (r.amt >= 0) s.none.inn += r.amt;
      else s.none.out -= r.amt;
      continue;
    }
    const type = catType(r.cat);
    const v = type === "income" ? r.amt : -r.amt;
    s.byCat[r.cat] = (s.byCat[r.cat] || 0) + v;
    if (r.cat === "매출 입금") {
      s.settled += r.amt;
      if (!sales) s.income += r.amt;
    } else if (type === "income") s.income += r.amt;
    else if (type === "expense") s.expense -= r.amt;
    if (r.s === "bank" && r.cat === "카드 대금") s.cardOut -= r.amt;
  }
  if (sales) {
    s.income += sales.net;
    s.expense += sales.fee;
  }
  s.profit = s.income - s.expense;
  return s;
}

const inOrder = (a, b) => {
  const c = `${a.d} ${a.t}`.localeCompare(`${b.d} ${b.t}`);
  if (c) return c;
  if (a.bal === b.bal - b.amt) return -1; // 같은 초면 잔액으로 앞뒤를 가린다
  if (b.bal === a.bal - a.amt) return 1;
  return 0;
};
/** 자금일보 — 통장별 전일 잔액·입금·출금·잔액 + 그날 내역 + 카드 사용 */
export function dailyReport(rows, day) {
  const bank = rows.filter((r) => r.s === "bank");
  const accounts = [...new Set(bank.map((r) => r.src))].sort().map((src) => {
    const mine = bank.filter((r) => r.src === src).sort(inOrder);
    const today = mine.filter((r) => r.d === day);
    const last = mine.filter((r) => r.d < day).at(-1);
    const open = today.length ? today[0].bal - today[0].amt : (last?.bal ?? null);
    const close = today.length ? today.at(-1).bal : (last?.bal ?? null);
    return { src, open, close, inn: today.filter((r) => r.amt > 0).reduce((a, r) => a + r.amt, 0), out: -today.filter((r) => r.amt < 0).reduce((a, r) => a + r.amt, 0) };
  });
  const today = bank.filter((r) => r.d === day).sort(inOrder);
  const cards = rows.filter((r) => r.s === "card" && r.d === day).sort(inOrder);
  return { accounts, inn: today.filter((r) => r.amt > 0), out: today.filter((r) => r.amt < 0), cards, cardTotal: -cards.reduce((a, r) => a + r.amt, 0), pend: cards.filter((r) => r.pend).length };
}
