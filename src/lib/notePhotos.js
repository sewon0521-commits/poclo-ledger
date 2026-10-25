// 노션식 메모의 사진 — 업무일지(JournalPage)와 소싱 관리 메모(SourcingMemo)가 같이 쓴다 (10/25 업무일지에서 떼어 냄)
// 공유 장부면 Storage(reels/shoot/… — 신상 관리와 같은 보관함), 이 기기 저장이면 이 기기(localStorage 'poclo_journal_photos').
// 글에는 '[사진:키]' 줄, 노션식 편집기 사진 블록에는 'photo:키' 로 남는다(lib/journalBlocks).
import { putPhoto, photoUrls } from "./shoot";
import { newId } from "./id";

export const LOCAL_PHOTOS = "poclo_journal_photos";
export const PHOTO_URLS = new Map(); // 보관 키 → {url, exp} (서명은 4시간)

export function localPhoto(k) {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PHOTOS) || "{}")[k] || null;
  } catch {
    return null;
  }
}

function shrink(file, edge) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("사진을 열지 못했어요."));
    };
    img.src = u;
  });
}

/** 사진 한 장 보관 → 키 */
export async function addPhoto(file, online) {
  const key = await putPhoto(file, online);
  if (key) return key;
  const data = await shrink(file, 900);
  const k = `local/${newId("p")}`;
  const m = JSON.parse(localStorage.getItem(LOCAL_PHOTOS) || "{}");
  m[k] = data;
  localStorage.setItem(LOCAL_PHOTOS, JSON.stringify(m));
  return k;
}

/** 보관 키 → 보이는 주소 (노션식 편집기의 사진 블록) */
export async function photoUrlOf(k, online) {
  if (/^https?:/.test(k)) return k;
  if (k.startsWith("local/")) return localPhoto(k);
  const c = PHOTO_URLS.get(k);
  if (c && c.exp > Date.now()) return c.url;
  const got = await photoUrls([k], online);
  if (got[k]) PHOTO_URLS.set(k, { url: got[k], exp: Date.now() + 3 * 3600 * 1000 });
  return got[k] || "";
}
