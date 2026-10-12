// 촬영 갈래 (2026-09-30) — 촬영 목록(동대문클릭처럼 상품 블록 → 코디) + 촬영 레퍼런스(착용샷 참고 사진).
//
// 세원: "노션에 주먹구구로 레퍼런스 모아서 촬영 때마다 보면서 하는데 힘들다. 딱 보고 '이 착용샷은 이 사진 보면서 찍겠구나' 하는 공간."
//       "나중에 신상마켓이랑 연동할 수 있게, 동대문클릭처럼 촬영 목록을."
// 예전 노션 흐름(9/6 구술): 샘플 요청 → 입고 → 샘플 픽(코디 짠 것) → 코디 촬영 관리(촬영 완료). 반납·보류.
//
// 저장 (settings, 모두 {items}):
//   shoot_items  상품 블록 [{id, name, vendor, place, kind, price, url, photo, status, shootDate, options, size, memo, createdAt}]
//   shoot_codis  코디      [{id, name, itemIds, refIds, shootDate, memo, done, createdAt}]
//   shoot_refs   레퍼런스  [{id, photo, folderId, cuts:[], place, shop, memo, createdAt}]  (shop = 사진을 가져온 쇼핑몰, 10/6)
//   shoot_tags   꼬리표    {clothes:[], cuts:[], cutSubs:{}, places:[], shops:[]}  (세원이 더하고 빼고 이름을 바꾼다 — 컷은 '컷 편집')
// 사진은 Storage 'reels' 버킷의 shoot/<id>.jpg (긴 변 1400).
// 신상마켓 링크(url)는 지금은 적어만 둔다 — 연동하면 이 칸에서 사진·이름·거래처·위치·가격을 채운다.

import { isRemote, supabase } from "./supabase";
import { newId } from "./id";
import { guessMeasureCat } from "./measure";

export const DEFAULT_TAGS = {
  clothes: ["상의", "하의", "원피스·세트", "아우터", "신발·잡화"],
  cuts: ["전신 정면", "측면·뒷모습", "워킹", "앉은 컷", "상반신", "디테일", "거울 셀카", "소품·연출"],
  places: ["실내", "거리", "카페", "계단·벽"],
  shops: [], // 사진을 가져온 쇼핑몰 (10/6) — 레퍼런스의 shop
  cutSubs: {}, // 세부 컷 (10/7) {'거울 셀카': ['정면', '측면']} — 사진에는 '거울 셀카 › 정면'
};

// 컷 — '거울 셀카' 로 거르면 '거울 셀카 › 정면' 같은 세부 컷 사진까지 (components/CutBits.jsx)
export const CUT_SEP = " › ";
export const subsOf = (tags, top) => (top && tags?.cutSubs?.[top]) || [];
export const hasCut = (r, cut) => !cut || (r.cuts || []).some((c) => c === cut || c.startsWith(cut + CUT_SEP));
export const cutLabel = (c) => String(c || "").replace(CUT_SEP, "·");

/** 쇼핑몰 이름 목록 — 꼬리표에 있는 것 + 사진에 달린 것 (먼저 만든 순서) */
export const shopsOf = (tags, refs) => [...new Set([...(tags?.shops || []), ...(refs || []).map((r) => r.shop).filter(Boolean)])];

export const FIELD = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600";
export const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
export const won = (n) => (Number(n) ? Number(n).toLocaleString("ko-KR") + "원" : "");

const local = (key) => `poclo_${key}`;

export async function loadKey(key, online, fallback = { items: [] }) {
  if (!(isRemote && online)) {
    try {
      return JSON.parse(localStorage.getItem(local(key)) || "null") || fallback;
    } catch {
      return fallback;
    }
  }
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  const v = data?.value || fallback;
  try {
    localStorage.setItem(local(key), JSON.stringify(v));
  } catch {
    /* 가득 참 — 서버엔 있다 */
  }
  return v;
}

/** 서버 최신을 읽어 change(value) 로 바꿔 쓴다 (둘이 동시에 고쳐도 서로 안 지워지게) */
export async function changeKey(key, online, change, fallback = { items: [] }) {
  const base = await loadKey(key, online, fallback);
  const next = change(base);
  try {
    localStorage.setItem(local(key), JSON.stringify(next));
  } catch {
    /* 무시 */
  }
  if (isRemote && online) {
    const { error } = await supabase.from("settings").upsert({ key, value: next });
    if (error) throw error;
  }
  return next;
}

/** 목록 한 줄 넣기/고치기 · 지우기 */
export const upsert = (item) => (v) => {
  const items = v.items || [];
  return { ...v, items: items.some((x) => x.id === item.id) ? items.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [item, ...items] };
};
export const remove = (id) => (v) => ({ ...v, items: (v.items || []).filter((x) => x.id !== id) });

/** 사진 줄여서 보관 → 보관 이름 */
export async function putPhoto(file, online) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`${file.name || "사진"} 을(를) 열지 못했어요.`));
      i.src = url;
    });
    const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    const key = `shoot/${newId("s")}.jpg`;
    if (!(isRemote && online)) return null;
    const { error } = await supabase.storage.from("reels").upload(key, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) throw new Error(`사진을 보관하지 못했어요 (${error.message}).`);
    return key;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 보관 이름들 → 볼 수 있는 주소 (4시간) */
export async function photoUrls(keys, online) {
  if (!(isRemote && online) || !keys.length) return {};
  const { data } = await supabase.storage.from("reels").createSignedUrls(keys, 60 * 60 * 4);
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

// ---------------------------------------------------------------- 코디 이름 (10/11)
//
// 세원: "코디 이름을 '이름 없는 코디' 말고 기모면모달보트넥언발긴팔티 + 로이 하이넥 집업 + 쭈리 라운드 팬츠 이런 식으로. 파일 만들 때도 이렇게 만드는데
// 촬영을 다 진행하면 각 상품명 뒤에 어떤 색상 촬영했는지 쓰거든? 그것도 최적화." — 촬영본 폴더 이름이 '260828_나그랑Y(라이트블루) + 마카롱9031(블랙S)'.
// codi.name = 직접 지은 이름(비면 상품 이름으로), codi.colors = {상품 id: [찍은 색상…]} — 한 상품을 두 색으로 찍으면 '소프트유넥(차콜) + 소프트유넥(레드)'.

export const NONAME = "이름 없는 코디";
/** 상품의 색상 글 → 낱낱 ('블랙, 아이보리' → [블랙, 아이보리]) */
export const colorList = (x) =>
  String(x?.colors || "")
    .split(/[,/·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
// 코디 안 상품 순서 (10/12 세원: "이름을 이너, 상의, 아우터, 하의, 신발, 가방, 기타 이 순서대로")
// 원피스·세트는 상의 다음(위에 아우터를 걸치니까). 같은 자리끼리는 코디에 넣은 순서 그대로
export const WEAR_ORDER = ["이너", "상의", "원피스·세트", "아우터", "하의", "신발", "가방", "기타"];
const INNER = /나시|캐미|민소매|슬리브리스|뷔스티에|(?<!자)이너|탱크|브라렛/;
const BAG = /가방|백$|백\s|크로스백|숄더백|토트|에코백|파우치|클러치/;
const OUTER = /자켓|재킷|코트|점퍼|야상|패딩|바람막이|트렌치|블레이저|무스탕/;
/** 상품이 코디에서 어느 자리인지 — 종류(kind)를 먼저, 없으면 이름으로 짐작 */
export function wearPart(x) {
  const k = x?.kind || "";
  const t = `${x?.name || ""} ${x?.fullName || ""}`.toLowerCase();
  if (WEAR_ORDER.includes(k) && k !== "상의") return k;
  if (k === "상의") return INNER.test(t) ? "이너" : "상의";
  if (k === "하의") return "하의";
  const g = guessMeasureCat(x);
  if (g === "shoes") return "신발";
  if (g === "etc" || k === "신발·잡화") return BAG.test(t) ? "가방" : "기타";
  if (g === "sleeveless") return "이너";
  if (g === "bottom" || g === "skirt") return "하의";
  return OUTER.test(t) ? "아우터" : "상의";
}
/** 코디 상품 — 입는 순서로 */
export function codiItems(c, items) {
  return (c?.itemIds || [])
    .map((id) => (items || []).find((x) => x.id === id))
    .filter(Boolean)
    .map((x, i) => ({ x, i, r: WEAR_ORDER.indexOf(wearPart(x)) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((o) => o.x);
}
/** 코디 조각 — 상품명(색상), 입는 순서로 */
export function codiParts(c, items) {
  return codiItems(c, items)
    .flatMap((x) => {
      const cs = (c.colors?.[x.id] || []).filter(Boolean);
      return cs.length ? cs.map((col) => `${x.name}(${col})`) : [x.name];
    });
}
export const codiAuto = (c, items) => codiParts(c, items).join(" + ");
/** 보이는 코디 이름 — 직접 지은 이름이 없으면 상품 이름들로 */
export const codiName = (c, items) => (c?.name && c.name !== NONAME ? c.name : codiAuto(c, items) || NONAME);
/** 촬영본 폴더·파일 이름 — '261011_상품(색상) + 상품(색상)' */
export function codiFileName(c, items) {
  const on = String(c?.doneOn || c?.shootDate || "").replace(/-/g, "").slice(2);
  return (on ? on + "_" : "") + codiParts(c, items).join(" + ");
}
