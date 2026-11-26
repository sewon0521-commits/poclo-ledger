// 신마 '제품 설명' 글은 신상 관리 상품(shoot_items)과 따로 둔다 (11/26)
//
// 세원: "신상관리가 이상해 내가 요청함을 눌러도 돌아오고" — 화면 위에 'canceling statement due to statement timeout'.
// shoot_items 가 2.5MB 한 덩어리라 요청함 하나 눌러도 통째로 다시 써서 서버 시간 제한(8초)에 걸렸다. 그중 0.56MB 가 제품 설명 글(desc, 상품마다 800자까지).
// 설명 글은 담을 때 연락처(contact)·실측(sizeText)을 이미 뽑아 두고, 화면에선 상품 창 '전체 글 보기'에만 쓴다 → 따로 키에 두고 그 창을 열 때만 읽는다.
//
//   settings shoot_desc = { d: { 상품 id: 설명 글 } }
//
// 예전 상품에 desc 가 그대로 들어 있어도(옮기기 전에 담은 것·파이썬이 쓴 것) 화면은 그걸 먼저 쓴다.
import { loadKey, changeKey } from "./shoot";

const KEY = "shoot_desc";
const EMPTY = { d: {} };
let cache = null;
let at = 0;

/** 상품 하나의 설명 글 (1분 동안은 받아 둔 것을 쓴다) */
export async function descOf(id, online) {
  if (!id) return "";
  if (!cache || Date.now() - at > 60000) {
    cache = (await loadKey(KEY, online, EMPTY)).d || {};
    at = Date.now();
  }
  return cache[id] || "";
}

/** 설명 글이 이미 있나 */
export async function hasDesc(id, online) {
  return !!(await descOf(id, online));
}

/** 설명 글 담기 (빈 글이면 안 함) */
export async function saveDesc(id, text, online) {
  if (!id || !String(text || "").trim()) return;
  const v = await changeKey(KEY, online, (cur) => ({ ...cur, d: { ...(cur.d || {}), [id]: text } }), EMPTY);
  cache = v.d || {};
  at = Date.now();
}
