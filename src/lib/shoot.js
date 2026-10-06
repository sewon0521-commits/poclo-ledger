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
//   shoot_tags   꼬리표    {clothes:[], cuts:[], places:[]}  (세원이 더하고 뺀다)
// 사진은 Storage 'reels' 버킷의 shoot/<id>.jpg (긴 변 1400).
// 신상마켓 링크(url)는 지금은 적어만 둔다 — 연동하면 이 칸에서 사진·이름·거래처·위치·가격을 채운다.

import { isRemote, supabase } from "./supabase";
import { newId } from "./id";

export const DEFAULT_TAGS = {
  clothes: ["상의", "하의", "원피스·세트", "아우터", "신발·잡화"],
  cuts: ["전신 정면", "측면·뒷모습", "워킹", "앉은 컷", "상반신", "디테일", "거울 셀카", "소품·연출"],
  places: ["실내", "거리", "카페", "계단·벽"],
  shops: [], // 사진을 가져온 쇼핑몰 (10/6) — 레퍼런스의 shop
};

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
