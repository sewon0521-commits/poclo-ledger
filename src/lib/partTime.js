// 파트타이머 관리 (10/28)
// 세원: "모델 계약서 일 칸으로 옮겨 주고 거기서 파트타이머 관리도. 프리랜서 시급 관리도 하게.
//        파트타이머 계좌번호는 모델 계약서에서 직접 가져오고, 시급이나 프리랜서 3.3 떼고 진행하거나 하는 거 다 반영."
//
// 사람
//   서명한 모델 계약서가 곧 파트타이머다 — 연락처(숫자)가 같은 계약서끼리 한 사람(연락처가 없으면 이름).
//   id = "k" + 그 열쇠라서 저장 안 해도 늘 같은 사람으로 잡힌다. 계좌·연락처는 **그 사람의 가장 최근 서명 계약서에서 그때그때 읽는다**(복사해 두지 않음 —
//   계약서를 새로 쓰면 바로 바뀜). 시급 기본값도 가장 최근 계약서 시급. 계약서 없이 직접 넣은 사람(알바 등)만 계좌를 여기 적는다.
//   settings part_time.people 에는 고친 것만 남는다 — {id, name, phone, kind, wage, tax, bank, account, holder, memo, hidden}.
//
// 근무 · 지급
//   works [{id, personId, on, start, end, minutes, wage, tax, memo, paidOn, from:{type:'contract'|'day', id}, createdAt}]
//   지급액 = 시급 × 시간(분 단위, 원 미만 반올림). tax '3.3' = 프리랜서 사업소득 원천징수 — 소득세 3%(10원 미만 버림) + 지방소득세 = 소득세의 10%(10원 미만 버림).
//   tax 'none' = 떼지 않고 그대로. 지급 기한 = 근무일 + 3일(계약서 제3조 '촬영일로부터 3일 안에').
//   월별 정리는 **지급한 날(paidOn)** 기준 — 원천징수 신고 자료로 세무사에게 넘길 때 본다. 세무 판단은 앱에 넣지 않는다(계산·기록만).
//
// 넣을 근무 찾기 — 서명 계약서의 촬영일(시각·예상 시간·시급) · 촬영 관리(shoot_days)의 모델 이름이 오늘까지 지났는데 그 사람·그날 근무가 없으면
//   '넣을까요?' 로 띄운다. 건너뛴 것은 skip ["사람id|날짜"].
//
// 저장: settings 'part_time' {people, works, skip} — lib/shoot changeKey(둘이 동시에 고쳐도 안 지워지게). change 함수는 순수하게.

export const KEY = "part_time";
export const EMPTY = { people: [], works: [], skip: [] };
export const PAY_DAYS = 3;
export const TAXES = [
  ["3.3", "프리랜서 3.3% 떼기"],
  ["none", "떼지 않고 그대로"],
];
export const KINDS = [
  ["model", "모델"],
  ["staff", "알바·기타"],
];

const p2 = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
export const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const md = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");
export const mdw = (iso) => (md(iso) ? `${md(iso)} (${DOW[new Date(iso.slice(0, 10) + "T00:00:00").getDay()]})` : "");
export const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR") + "원";
export const newId = (p = "pt") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ------------------------------------------------------------ 시간 · 돈

/** '12:00' → 720 */
export const minOf = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null);
/** 시작·끝 → 분(끝이 시작보다 이르면 다음 날로) */
export function spanMinutes(start, end) {
  const a = minOf(start);
  const b = minOf(end);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a;
}
/** 시작 + 분 → 끝 시각 */
export function endOf(start, minutes) {
  const a = minOf(start);
  if (a == null || !minutes) return "";
  const m = (a + Number(minutes)) % 1440;
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}
export const hoursText = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return "0시간";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${h}시간` : "", r ? `${r}분` : ""].filter(Boolean).join(" ");
};

/** 지급 계산 — {gross, incomeTax, localTax, tax, net} */
export function payOf(w) {
  const gross = Math.round(((Number(w?.wage) || 0) * (Number(w?.minutes) || 0)) / 60);
  if (w?.tax !== "3.3") return { gross, incomeTax: 0, localTax: 0, tax: 0, net: gross };
  const incomeTax = Math.floor((gross * 0.03) / 10) * 10;
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;
  return { gross, incomeTax, localTax, tax: incomeTax + localTax, net: gross - incomeTax - localTax };
}
export const sumPay = (works) =>
  works.reduce(
    (s, w) => {
      const p = payOf(w);
      return { gross: s.gross + p.gross, incomeTax: s.incomeTax + p.incomeTax, localTax: s.localTax + p.localTax, tax: s.tax + p.tax, net: s.net + p.net, minutes: s.minutes + (Number(w.minutes) || 0), n: s.n + 1 };
    },
    { gross: 0, incomeTax: 0, localTax: 0, tax: 0, net: 0, minutes: 0, n: 0 },
  );
export const dueOf = (w) => (w?.on ? addDays(w.on, PAY_DAYS) : "");

// ------------------------------------------------------------ 사람 = 서명한 계약서 + 직접 넣은 사람

const digits = (s) => String(s || "").replace(/\D/g, "");
const bare = (s) => String(s || "").replace(/\s/g, "").replace(/\(.*\)$/, "");
/** 계약서 → 사람 열쇠(연락처 숫자, 없으면 이름) */
export const keyOfContract = (c) => {
  const ph = digits(c?.signed?.phone);
  return ph.length >= 9 ? ph : "n" + bare(c?.signed?.name || c?.terms?.name);
};

/**
 * 사람 목록 — 저장된 사람 + 서명 계약서에서 생긴 사람을 합친다.
 * 돌려주는 사람: {id, name, phone, kind, wage, tax, memo, hidden, contracts:[최근 서명 먼저], contract(최근), bank, account, holder, accountFrom:'contract'|'self'|''}
 */
export function peopleOf(saved, contracts) {
  const stored = saved?.people || [];
  const signed = (contracts || []).filter((c) => c.signed_at && c.signed).sort((a, b) => (b.signed_at || "").localeCompare(a.signed_at || ""));
  const groups = new Map();
  for (const c of signed) {
    const k = keyOfContract(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const used = new Set();
  const out = [];
  for (const [k, cs] of groups) {
    const last = cs[0];
    const ph = k.startsWith("n") ? "" : k;
    const nm = bare(last.signed?.name || last.terms?.name);
    // 직접 넣어 둔 사람과 연락처·이름이 같으면 그 사람에 붙인다
    const s =
      stored.find((x) => x.id === "k" + k) ||
      stored.find((x) => !used.has(x.id) && ph && digits(x.phone) === ph) ||
      stored.find((x) => !used.has(x.id) && !digits(x.phone) && nm && bare(x.name) === nm);
    if (s) used.add(s.id);
    out.push(withAccount({ kind: "model", tax: "3.3", wage: Number(last.terms?.wage) || 0, ...s, id: s?.id || "k" + k, name: s?.name || last.signed?.name || last.terms?.name || "", phone: last.signed?.phone || s?.phone || "", contracts: cs, contract: last }));
  }
  for (const s of stored) if (!used.has(s.id) && !s.id.startsWith("k")) out.push(withAccount({ kind: "staff", tax: "3.3", wage: 0, ...s, contracts: [], contract: null }));
  // 계약서를 지웠는데 근무가 남은 사람(k…)도 보여 준다
  for (const s of stored) if (!used.has(s.id) && s.id.startsWith("k") && !out.some((x) => x.id === s.id)) out.push(withAccount({ kind: "model", tax: "3.3", wage: 0, ...s, contracts: [], contract: null }));
  return out;
}
function withAccount(p) {
  const sg = p.contract?.signed;
  if (sg?.account) return { ...p, bank: sg.bank || "", account: sg.account || "", holder: sg.holder || "", accountFrom: "contract", accountAt: p.contract.signed_at };
  return { ...p, bank: p.bank || "", account: p.account || "", holder: p.holder || "", accountFrom: p.account ? "self" : "" };
}
export const accountText = (p) => [p?.bank, p?.account, p?.holder].filter(Boolean).join(" ");

/** 촬영 관리 모델 이름 ↔ 사람 이름 — 같거나, 세 글자 이름에서 성을 뗀 것('주현' = 이주현) */
export function sameName(a, b) {
  a = bare(a);
  b = bare(b);
  if (!a || !b) return false;
  if (a === b) return true;
  const [l, s] = a.length > b.length ? [a, b] : [b, a];
  return s.length >= 2 && l.length === s.length + 1 && l.endsWith(s);
}

// ------------------------------------------------------------ 넣을 근무 찾기

/** [{key, personId, name, on, start, minutes, wage, tax, from, why}] — 오늘까지 지난 날만, 가까운 날 먼저 */
export function suggestionsOf(saved, people, days, today = todayISO()) {
  const works = saved?.works || [];
  const skip = new Set(saved?.skip || []);
  const have = new Set(works.map((w) => w.personId + "|" + w.on));
  const out = new Map();
  const put = (p, on, rest) => {
    const key = p.id + "|" + on;
    if (!on || on > today || have.has(key) || skip.has(key) || out.has(key)) return;
    out.set(key, { key, personId: p.id, name: p.name, on, tax: p.tax || "3.3", wage: Number(p.wage) || 0, start: "", minutes: 120, ...rest });
  };
  for (const p of people) {
    if (p.hidden) continue;
    for (const c of p.contracts || []) {
      const t = c.terms || {};
      put(p, t.date, { start: t.time || "", minutes: Math.round((Number(t.hours) || 2) * 60), wage: Number(p.wage) || Number(t.wage) || 0, from: { type: "contract", id: c.id }, why: "모델 계약서 촬영일" });
    }
  }
  for (const d of days?.items || []) {
    for (const nm of d.models || []) {
      const p = people.find((x) => !x.hidden && sameName(x.name, nm));
      if (!p) continue;
      const h = Number(p.contract?.terms?.hours) || 2;
      put(p, d.on, { start: d.time || "", minutes: Math.round(h * 60), from: { type: "day", id: d.id }, why: "촬영 관리" });
    }
  }
  return [...out.values()].sort((a, b) => b.on.localeCompare(a.on));
}

// ------------------------------------------------------------ 바꾸기 (changeKey 에 넘기는 순수 함수)

const base = (v) => ({ ...EMPTY, ...(v || {}) });
/** 사람 고친 것 저장 — null 인 칸은 지운다(계약서 값으로 돌아감) */
export const savePerson = (person) => (v) => {
  const x = base(v);
  const keep = ["id", "name", "phone", "kind", "wage", "tax", "bank", "account", "holder", "memo", "hidden", "createdAt"];
  const row = Object.fromEntries(keep.filter((k) => person[k] !== undefined).map((k) => [k, person[k]]));
  const merge = (p) => Object.fromEntries(Object.entries({ ...p, ...row }).filter(([, val]) => val !== null));
  const old = x.people.find((p) => p.id === row.id);
  return { ...x, people: old ? x.people.map((p) => (p.id === row.id ? merge(p) : p)) : [...x.people, merge({})] };
};
export const removePerson = (id) => (v) => {
  const x = base(v);
  return { ...x, people: x.people.filter((p) => p.id !== id), works: x.works.filter((w) => w.personId !== id) };
};
export const saveWork = (work) => (v) => {
  const x = base(v);
  return { ...x, works: x.works.some((w) => w.id === work.id) ? x.works.map((w) => (w.id === work.id ? { ...w, ...work } : w)) : [work, ...x.works] };
};
export const removeWork = (id) => (v) => {
  const x = base(v);
  return { ...x, works: x.works.filter((w) => w.id !== id) };
};
/** 여러 근무 지급 표시(paidOn = 날짜) · 되돌리기(null) */
export const markPaid = (ids, paidOn) => (v) => {
  const x = base(v);
  const set = new Set(ids);
  return { ...x, works: x.works.map((w) => (set.has(w.id) ? { ...w, paidOn: paidOn || null } : w)) };
};
export const skipSuggestion = (key) => (v) => {
  const x = base(v);
  return { ...x, skip: [...new Set([...(x.skip || []), key])] };
};

// ------------------------------------------------------------ 글로 옮기기

/** 이체할 것 한 줄 — '국민 123-456 홍길동 38,680원' */
export const transferLine = (p, net) => [accountText(p) || `${p.name} (계좌 없음)`, won(net)].join(" ");

/** 월별 정리 복사 글 — 지급한 날 기준. 주민등록번호는 넣지 않는다('신고용 보기'에서 따로) */
export function monthText(ym, rows, bizName = "포클로") {
  const [y, m] = ym.split("-");
  const taxed = rows.filter((r) => r.taxed.n);
  const plain = rows.filter((r) => r.plain.n);
  const L = [`${bizName} ${y}년 ${Number(m)}월 인건비 지급 (지급일 기준)`];
  if (taxed.length) {
    L.push("", "■ 프리랜서 사업소득 3.3% 원천징수");
    for (const r of taxed) L.push(`${r.name} · 지급 ${won(r.taxed.gross)} · 소득세 ${won(r.taxed.incomeTax)} · 지방소득세 ${won(r.taxed.localTax)} · 실지급 ${won(r.taxed.net)} · 지급일 ${r.paidDays.taxed.map(md).join(", ")}`);
    const t = sumPay(taxed.flatMap((r) => r.taxedWorks));
    L.push(`합계 · 지급 ${won(t.gross)} · 소득세 ${won(t.incomeTax)} · 지방소득세 ${won(t.localTax)} · 실지급 ${won(t.net)}`);
  }
  if (plain.length) {
    L.push("", "■ 떼지 않고 지급");
    for (const r of plain) L.push(`${r.name} · 지급 ${won(r.plain.gross)} · 지급일 ${r.paidDays.plain.map(md).join(", ")}`);
  }
  return L.join("\n");
}

/** 그 달(지급일 기준) 사람별로 — [{id, name, person, taxed, plain, taxedWorks, plainWorks, paidDays}] */
export function monthRows(works, people, ym) {
  const inMonth = works.filter((w) => w.paidOn && w.paidOn.startsWith(ym));
  const by = new Map();
  for (const w of inMonth) {
    if (!by.has(w.personId)) by.set(w.personId, []);
    by.get(w.personId).push(w);
  }
  return [...by.entries()]
    .map(([id, ws]) => {
      const person = people.find((p) => p.id === id);
      const taxedWorks = ws.filter((w) => w.tax === "3.3");
      const plainWorks = ws.filter((w) => w.tax !== "3.3");
      const days = (list) => [...new Set(list.map((w) => w.paidOn))].sort();
      return { id, name: person?.name || "지운 사람", person, taxed: sumPay(taxedWorks), plain: sumPay(plainWorks), taxedWorks, plainWorks, paidDays: { taxed: days(taxedWorks), plain: days(plainWorks) } };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
