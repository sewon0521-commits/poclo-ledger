// 모델 계약서 — 모바일 서명 (10/25)
// 세원: "모바일로 계약서 진행할 수 있게" → 테스트 촬영(10/28) 전에 모델에게 링크를 DM 으로 보내고, 모델은 폰에서 읽고 서명한다.
//
// 흐름
//   ERP(로그인) 일 › 모델 계약서(10/28 촬영 갈래에서 옮김) — 이름·촬영일·시각·시간·시급·얼굴 노출·이용 범위·장소로 계약을 만든다 → 무작위 토큰 링크 #sign=<토큰>
//   모델(로그인 없음) — main.jsx 가 #sign= 이면 App 대신 SignPage 만 그린다 → 읽고 · 정보 · 동의 3개 · 손가락 서명 → 제출
//
// 저장 (공유 장부): Supabase 표 contracts {id, token, terms, signed, signed_at, created_at}
//   로그인한 사람은 표를 그대로 읽고 쓴다(RLS authenticated). 모델(anon)은 표에 직접 못 가고
//   SECURITY DEFINER 함수 둘만 부른다 — contract_get(토큰) · contract_sign(토큰, 서명 내용). SQL 은 supabase/contracts.sql.
//   이 기기 저장 모드(VITE_SUPABASE_URL 없음)는 localStorage 'poclo_contracts' 로 같은 동작(시험용).
//
// terms 는 만들 때 틀에 값을 채운 글(text)까지 통째로 남긴다 — 나중에 틀을 고쳐도 이미 보낸 계약서는 안 바뀐다.
//
// 주민등록번호 (10/25 세원: "3.3% 원천징수 신고용 — 번호만(신분증 사진 X), 암호화 저장, ERP 목록·상세는 뒷자리 가리고 '신고용 보기'에서만 전체")
//   서명 화면이 숫자 13자리를 contract_sign(…, p_rrn) 에 따로 넘기고, DB 함수가 그 자리에서 AES-256 으로 암호화해 contracts.rrn_enc 에만 둔다
//   (키 = Supabase Vault 'contract_rrn_key', DB 안에서 만든 것). signed(jsonb)·사본 이미지·인쇄에는 가린 번호 rrnMask('020521-*******')만.
//   전체 번호는 ERP '신고용 보기'(revealRrn → contract_rrn) — 로그인한 사람만, 부를 때마다 contract_rrn_log 에 누가·언제. 화면엔 1분만 보이고 가려진다.
//   SQL 을 아직 안 돌렸으면(rrnReady false) 서명 화면은 예전처럼 주민번호 칸 없이, ERP 는 '계약서 만들기'를 막고 SQL 안내.
//   이 기기 저장 모드(시험용)는 브라우저 AES-GCM 키(localStorage)로 흉내만 낸다.
import { isRemote, supabase } from "./supabase";

export const TEMPLATE_KEY = "contract_template";
const LOCAL = "poclo_contracts";

export const USES = ["자사몰(포클로 홈페이지)", "인스타그램", "인스타그램 광고"];
export const PLACE = "우베리 스튜디오 (서울 서대문구 북아현로 100, 2층)";

export const DEFAULT_TEMPLATE = {
  title: "촬영 용역 및 촬영물 이용 동의서",
  place: PLACE,
  body: `{상호}(대표 {대표}, 이하 '회사')와 {모델이름}(이하 '모델')은 아래와 같이 촬영 용역과 촬영물 이용에 대해 약속합니다.

제1조 (용역 내용)
모델은 회사가 판매하는 의류를 입고 피팅 사진과 짧은 영상 촬영에 참여합니다.

제2조 (일시와 장소)
· 일시: {촬영일} {시각}부터 {시간}
· 장소: {장소}

제3조 (보수)
· 시급 {시급} × 실제 촬영 시간
· 사업소득 3.3%를 원천징수한 뒤, 촬영일로부터 3일 안에 모델이 적은 계좌로 보냅니다.
· 원천징수 신고에 필요한 주민등록번호는 서명할 때 함께 받아 암호화해 보관하고, 신고에만 씁니다.

제4조 (촬영물 권리와 이용 범위)
· 촬영한 사진·영상은 회사가 아래 범위에서 쓸 수 있습니다: {이용범위}
· 이용 기간은 따로 정하지 않으며, 계약이 끝난 뒤에도 이미 올린 사진·영상은 계속 쓸 수 있습니다.
· 회사는 사진·영상을 보정·편집해 쓸 수 있습니다.
· 위 범위 밖에서 쓰려면 모델에게 따로 동의를 받습니다.

제5조 (얼굴 노출)
{얼굴}

제6조 (관계)
이 약속은 근로계약이 아닌 프리랜서 촬영 용역입니다.

제7조 (비밀 유지)
모델은 공개 전 상품과 촬영물을 회사의 동의 없이 외부에 알리거나 올리지 않습니다.

제8조 (일정 변경·취소)
일정을 바꾸거나 취소할 때는 서로 촬영 하루 전까지 알립니다.`,
};

export const HOLES = ["{모델이름}", "{촬영일}", "{시각}", "{시간}", "{시급}", "{장소}", "{얼굴}", "{이용범위}", "{상호}", "{대표}"];

/** 개인정보 수집·이용 동의 — 서명 화면에 늘 같은 글 */
export const PRIVACY = [
  ["수집 항목", "이름, 생년월일, 주민등록번호, 연락처, 계좌(은행·계좌번호·예금주), 서명"],
  ["목적", "촬영 보수 지급과 원천징수(사업소득 3.3%) 신고, 계약 확인과 촬영 일정 연락"],
  ["주민등록번호", "세법에 따른 원천징수 신고에만 쓰고, 암호화해 보관합니다. 신분증 사진은 받지 않습니다"],
  ["보유 기간", "계약이 끝난 뒤 5년 동안(세무 신고 자료 보관 기간) 보관하고 그 뒤 파기합니다 — 주민등록번호도 같습니다"],
  ["안내", "동의하지 않을 수 있지만, 동의하지 않으면 보수를 보내 드리기 어렵습니다"],
];
/** 주민번호 칸이 없던 때(SQL 전) 서명 화면에 보이던 개인정보 글 */
export const PRIVACY_OLD = [
  ["수집 항목", "이름, 생년월일, 연락처, 계좌(은행·계좌번호·예금주), 서명"],
  ["목적", "촬영 보수 지급, 계약 확인과 촬영 일정 연락"],
  ["보유 기간", "계약이 끝난 뒤 5년 동안 보관하고 그 뒤 파기합니다"],
  ["안내", "동의하지 않을 수 있지만, 동의하지 않으면 보수를 보내 드리기 어렵습니다"],
];

// ------------------------------------------------------------ 주민등록번호

export const rrnDigits = (s) => String(s || "").replace(/\D/g, "").slice(0, 13);
/** '020521-*******' — 뒷자리는 다 가린다 */
export const maskRrn = (d) => (rrnDigits(d).length === 13 ? `${rrnDigits(d).slice(0, 6)}-*******` : "");
/** 생년월일 'YYYY-MM-DD' → 주민번호 앞자리 'YYMMDD' */
export const rrnFrontOf = (birth) => (/^\d{4}-\d{2}-\d{2}$/.test(birth || "") ? birth.slice(2).replace(/-/g, "") : "");
/** 고칠 것이 있으면 그 말, 없으면 "" — 앞자리는 실제 있는 날짜, 뒷자리 첫 숫자 1~8(외국인등록번호 5~8), 생년월일을 적었으면 같아야 */
export function rrnProblem(d, birth) {
  d = rrnDigits(d);
  if (d.length !== 13) return "주민등록번호 13자리를 확인해 주세요";
  const g = d[6];
  if (!"12345678".includes(g)) return "주민등록번호 뒷자리 첫 숫자를 확인해 주세요";
  const year = ("1256".includes(g) ? "19" : "20") + d.slice(0, 2);
  const ymd = `${year}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  const t = new Date(ymd + "T00:00:00Z");
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== ymd) return "주민등록번호 앞자리(생년월일)를 확인해 주세요";
  if (/^\d{4}-\d{2}-\d{2}$/.test(birth || "") && birth !== ymd) return "생년월일과 주민등록번호 앞자리가 달라요";
  return "";
}
const WHO = { "sewon0521@gmail.com": "세원", "ppoclo0601@gmail.com": "지원" };
export const whoOf = (email) => WHO[String(email || "").toLowerCase()] || email || "누군가";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function dateText(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return d || "";
  const t = new Date(d + "T00:00:00");
  return `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${DAYS[t.getDay()]})`;
}
export const wonText = (n) => (Number(n) ? Number(n).toLocaleString("ko-KR") + "원" : "");
export const hoursText = (h) => (Number(h) ? `약 ${Number(h)}시간` : "");
export const usesText = (t) => [...(t.uses || []), ...(t.usesEtc ? [t.usesEtc] : [])].filter(Boolean).join(", ");
export const faceText = (face) =>
  face === "off" ? "얼굴 비노출 — 얼굴이 나오지 않게 촬영하고, 얼굴이 나온 컷은 쓰지 않습니다." : "얼굴 노출 가능 — 촬영물에 모델의 얼굴이 나올 수 있습니다.";

/** 틀의 빈자리를 채운 글 */
export function fillText(body, t) {
  const map = {
    "{모델이름}": t.name || "",
    "{촬영일}": dateText(t.date),
    "{시각}": t.time || "",
    "{시간}": hoursText(t.hours),
    "{시급}": wonText(t.wage),
    "{장소}": t.place || "",
    "{얼굴}": faceText(t.face),
    "{이용범위}": usesText(t) || "-",
    "{상호}": t.bizName || "포클로 POCLO",
    "{대표}": t.ceo || "최지원",
  };
  return String(body || "").replace(/\{[^{}]+\}/g, (m) => (m in map ? map[m] : m));
}

/** 글 → 덩어리 [{kind: "h" | "li" | "p" | "gap", text}] — '제N조' 줄은 제목, '·' 줄은 점 */
export function blocksOf(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .map((l) => (!l ? { kind: "gap" } : /^제\s*\d+\s*조/.test(l) ? { kind: "h", text: l } : /^[·•-]\s*/.test(l) ? { kind: "li", text: l.replace(/^[·•-]\s*/, "") } : { kind: "p", text: l }));
}

/** 24바이트 무작위 → base64url (32자) */
export function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const signLink = (token) => `${window.location.origin}/#sign=${token}`;
export const tokenOfHash = (h) => {
  const m = String(h || "").match(/^#sign=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : "";
};
/** 'OO님' — 한글 세 글자 이름이면 성을 뗀다(이주현 → 주현님), 나머지는 그대로 */
export const callName = (name) => {
  const n = String(name || "").replace(/\s/g, "").replace(/\(.*\)$/, "");
  if (!n) return "모델님";
  return (/^[가-힣]{3}$/.test(n) ? n.slice(1) : n) + "님";
};
export const dmText = (name, token) => `${callName(name)}! 테스트 촬영 전에 계약서 확인 부탁드려요 ☺️\n링크 열어서 읽어 보시고 서명해 주시면 돼요 💗\n${signLink(token)}`;

// ------------------------------------------------------------ 저장 — 공유 장부면 표, 아니면 이 기기

const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || "[]");
  } catch {
    return [];
  }
};
const writeLocal = (list) => localStorage.setItem(LOCAL, JSON.stringify(list));

/** 표가 아직 없음(SQL 안 돌림) */
export const isMissing = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|Could not find the (table|function)/i.test(e.message || ""));

export class ContractError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** 화면에는 암호문을 안 넘긴다 — 있는지만(hasRrn) */
const clean = ({ rrn_enc, rrn_log, ...r }) => ({ ...r, hasRrn: !!rrn_enc }); // eslint-disable-line no-unused-vars

/** ERP — 계약 목록(최근 것 먼저) */
export async function listContracts(online) {
  if (!(isRemote && online)) return readLocal().map(clean).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
  if (error) throw isMissing(error) ? new ContractError("missing", "contracts 표가 아직 없어요") : error;
  return (data || []).map(clean);
}

export async function createContract(online, terms) {
  const row = { token: newToken(), terms, signed: null, signed_at: null };
  if (!(isRemote && online)) {
    const r = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    writeLocal([r, ...readLocal()]);
    return clean(r);
  }
  const { data, error } = await supabase.from("contracts").insert(row).select("*").single();
  if (error) throw isMissing(error) ? new ContractError("missing", "contracts 표가 아직 없어요") : error;
  return clean(data);
}

/** ERP — 주민번호를 받을 준비(이번 SQL)가 됐는지 */
export async function rrnReady(online) {
  if (!(isRemote && online)) return true;
  const { data, error } = await supabase.rpc("contract_rrn_ready");
  if (error) return false;
  return data === true;
}

/** ERP '신고용 보기' — 전체 번호 + 최근 조회 기록(부를 때마다 기록이 남는다) */
export async function revealRrn(online, id) {
  if (!(isRemote && online)) {
    const list = readLocal();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0 || !list[i].rrn_enc) return { rrn: null, log: [] };
    const d = await testDecrypt(list[i].rrn_enc);
    const log = [{ who: "이 기기", at: new Date().toISOString() }, ...(list[i].rrn_log || [])].slice(0, 5);
    list[i] = { ...list[i], rrn_log: log };
    writeLocal(list);
    return { rrn: `${d.slice(0, 6)}-${d.slice(6)}`, log };
  }
  const { data, error } = await supabase.rpc("contract_rrn", { p_id: id });
  if (error) throw isMissing(error) ? new ContractError("missing", "주민번호 SQL 이 아직 없어요") : error;
  return data || { rrn: null, log: [] };
}

// 이 기기 저장 모드(시험용) — 브라우저 AES-GCM 으로 흉내만. 공유 장부는 DB 함수가 암호화한다.
const TESTKEY = "poclo_rrn_testkey";
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function testKey() {
  let raw = localStorage.getItem(TESTKEY);
  if (!raw) {
    raw = b64(crypto.getRandomValues(new Uint8Array(32)));
    localStorage.setItem(TESTKEY, raw);
  }
  return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function testEncrypt(d) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await testKey(), new TextEncoder().encode(d)));
  return b64(iv) + "." + b64(ct);
}
async function testDecrypt(s) {
  const [iv, ct] = s.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await testKey(), unb64(ct)));
}

/** ERP — 서명 전 계약서 내용 고치기(10/25 세원 "촬영 계약서 우리가 좀 편집할 수 있게"). 서명한 것은 못 고친다 */
export async function updateContract(online, id, terms) {
  if (!(isRemote && online)) {
    const list = readLocal();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0 || list[i].signed_at) throw new ContractError("signed", "이미 서명한 계약서는 고칠 수 없어요");
    list[i] = { ...list[i], terms };
    writeLocal(list);
    return clean(list[i]);
  }
  const { data, error } = await supabase.from("contracts").update({ terms }).eq("id", id).is("signed_at", null).select("*");
  if (error) throw error;
  if (!data?.length) throw new ContractError("signed", "이미 서명한 계약서는 고칠 수 없어요");
  return clean(data[0]);
}

export async function removeContract(online, id) {
  if (!(isRemote && online)) return writeLocal(readLocal().filter((x) => x.id !== id));
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) throw error;
}

/** 모델 — 토큰으로 계약 읽기. 없으면 null. rrnReady = 주민번호 칸을 띄울지(이번 SQL 을 돌렸는지) */
export async function getByToken(token) {
  if (!isRemote) {
    const r = readLocal().find((x) => x.token === token);
    return r ? { terms: r.terms, signed: r.signed, signed_at: r.signed_at, rrnReady: true } : null;
  }
  const { data, error } = await supabase.rpc("contract_get", { p_token: token });
  if (error) throw isMissing(error) ? new ContractError("missing", "계약서 준비가 아직 안 됐어요") : error;
  return data || null;
}

/** 모델 — 서명 보내기(한 번만). rrn = 주민번호 숫자(준비 안 됐으면 null — 예전처럼 안 보냄). signed 에는 절대 안 넣는다 */
export async function signByToken(token, signed, rrn) {
  const d = rrn ? rrnDigits(rrn) : "";
  if (!isRemote) {
    const list = readLocal();
    const i = list.findIndex((x) => x.token === token);
    if (i < 0) throw new ContractError("notfound", "없는 계약서예요");
    if (list[i].signed_at) throw new ContractError("already", "이미 서명했어요");
    if (rrn && rrnProblem(d)) throw new ContractError("rrn", "주민등록번호를 다시 확인해 주세요");
    const at = new Date().toISOString();
    const rrnMask = d ? maskRrn(d) : undefined;
    list[i] = { ...list[i], signed: { ...signed, ...(rrnMask ? { rrnMask } : {}), at }, signed_at: at, ...(d ? { rrn_enc: await testEncrypt(d) } : {}) };
    writeLocal(list);
    return { ok: true, signed_at: at, rrnMask };
  }
  const { data, error } = await supabase.rpc("contract_sign", d ? { p_token: token, p_signed: signed, p_rrn: d } : { p_token: token, p_signed: signed });
  if (error) {
    const m = error.message || "";
    if (/already signed/.test(m)) throw new ContractError("already", "이미 서명했어요");
    if (/not found/.test(m)) throw new ContractError("notfound", "없는 계약서예요");
    if (/too big|bad sign/.test(m)) throw new ContractError("big", "서명 그림이 너무 커요 — 지우고 다시 한 번 그려 주세요");
    if (/bad rrn/.test(m)) throw new ContractError("rrn", "주민등록번호를 다시 확인해 주세요");
    if (/no key/.test(m)) throw new ContractError("missing", "계약서 준비가 아직 안 됐어요 — 포클로 DM 으로 알려 주세요");
    throw isMissing(error) ? new ContractError("missing", "계약서 준비가 아직 안 됐어요") : error;
  }
  return data;
}
