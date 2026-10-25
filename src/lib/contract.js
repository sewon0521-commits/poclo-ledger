// 모델 계약서 — 모바일 서명 (10/25)
// 세원: "모바일로 계약서 진행할 수 있게" → 테스트 촬영(10/28) 전에 모델에게 링크를 DM 으로 보내고, 모델은 폰에서 읽고 서명한다.
//
// 흐름
//   ERP(로그인) 촬영 › 모델 계약서 — 이름·촬영일·시각·시간·시급·얼굴 노출·이용 범위·장소로 계약을 만든다 → 무작위 토큰 링크 #sign=<토큰>
//   모델(로그인 없음) — main.jsx 가 #sign= 이면 App 대신 SignPage 만 그린다 → 읽고 · 정보 · 동의 3개 · 손가락 서명 → 제출
//
// 저장 (공유 장부): Supabase 표 contracts {id, token, terms, signed, signed_at, created_at}
//   로그인한 사람은 표를 그대로 읽고 쓴다(RLS authenticated). 모델(anon)은 표에 직접 못 가고
//   SECURITY DEFINER 함수 둘만 부른다 — contract_get(토큰) · contract_sign(토큰, 서명 내용). SQL 은 supabase/contracts.sql.
//   이 기기 저장 모드(VITE_SUPABASE_URL 없음)는 localStorage 'poclo_contracts' 로 같은 동작(시험용).
//
// terms 는 만들 때 틀에 값을 채운 글(text)까지 통째로 남긴다 — 나중에 틀을 고쳐도 이미 보낸 계약서는 안 바뀐다.
// 주민등록번호는 받지 않는다(암호화 저장 의무 — 보수 줄 때 따로 받아 세무 신고에만 쓴다). 계약서 문구에도 그렇게 적었다.
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
· 사업소득 3.3%를 원천징수한 뒤, 촬영일로부터 7일 안에 모델이 적은 계좌로 보냅니다.
· 원천징수 신고에 필요한 주민등록번호는 보수를 지급할 때 따로 안내해 받습니다.

제4조 (촬영물 권리와 이용 범위)
· 촬영한 사진·영상은 회사가 아래 범위에서 쓸 수 있습니다: {이용범위}
· 이용 기간은 촬영일로부터 2년이며, 회사는 사진·영상을 보정·편집해 쓸 수 있습니다.
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
  ["수집 항목", "이름, 생년월일, 연락처, 계좌(은행·계좌번호·예금주), 서명"],
  ["목적", "촬영 보수 지급, 계약 확인과 촬영 일정 연락"],
  ["보유 기간", "계약이 끝난 뒤 5년 동안 보관하고 그 뒤 파기합니다"],
  ["안내", "동의하지 않을 수 있지만, 동의하지 않으면 보수를 보내 드리기 어렵습니다"],
];

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

/** ERP — 계약 목록(최근 것 먼저) */
export async function listContracts(online) {
  if (!(isRemote && online)) return readLocal().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const { data, error } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
  if (error) throw isMissing(error) ? new ContractError("missing", "contracts 표가 아직 없어요") : error;
  return data || [];
}

export async function createContract(online, terms) {
  const row = { token: newToken(), terms, signed: null, signed_at: null };
  if (!(isRemote && online)) {
    const r = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    writeLocal([r, ...readLocal()]);
    return r;
  }
  const { data, error } = await supabase.from("contracts").insert(row).select("*").single();
  if (error) throw isMissing(error) ? new ContractError("missing", "contracts 표가 아직 없어요") : error;
  return data;
}

export async function removeContract(online, id) {
  if (!(isRemote && online)) return writeLocal(readLocal().filter((x) => x.id !== id));
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) throw error;
}

/** 모델 — 토큰으로 계약 읽기. 없으면 null */
export async function getByToken(token) {
  if (!isRemote) {
    const r = readLocal().find((x) => x.token === token);
    return r ? { terms: r.terms, signed: r.signed, signed_at: r.signed_at } : null;
  }
  const { data, error } = await supabase.rpc("contract_get", { p_token: token });
  if (error) throw isMissing(error) ? new ContractError("missing", "계약서 준비가 아직 안 됐어요") : error;
  return data || null;
}

/** 모델 — 서명 보내기(한 번만) */
export async function signByToken(token, signed) {
  if (!isRemote) {
    const list = readLocal();
    const i = list.findIndex((x) => x.token === token);
    if (i < 0) throw new ContractError("notfound", "없는 계약서예요");
    if (list[i].signed_at) throw new ContractError("already", "이미 서명했어요");
    const at = new Date().toISOString();
    list[i] = { ...list[i], signed: { ...signed, at }, signed_at: at };
    writeLocal(list);
    return { ok: true, signed_at: at };
  }
  const { data, error } = await supabase.rpc("contract_sign", { p_token: token, p_signed: signed });
  if (error) {
    const m = error.message || "";
    if (/already signed/.test(m)) throw new ContractError("already", "이미 서명했어요");
    if (/not found/.test(m)) throw new ContractError("notfound", "없는 계약서예요");
    if (/too big|bad sign/.test(m)) throw new ContractError("big", "서명 그림이 너무 커요 — 지우고 다시 한 번 그려 주세요");
    throw isMissing(error) ? new ContractError("missing", "계약서 준비가 아직 안 됐어요") : error;
  }
  return data;
}
