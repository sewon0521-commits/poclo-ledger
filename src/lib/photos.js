// 장끼 사진 저장소.
//
// localStorage(5MB)에 사진을 넣으면 몇 장 만에 꽉 차서 장부 자체가 저장이 안 된다.
// 그래서 사진만 IndexedDB에 따로 두고, 거래에는 hasPhoto 플래그만 남긴다.
// M2에서 Supabase Storage로 옮길 때도 이 파일만 갈아끼우면 된다.

const DB_NAME = "poclo_photos";
const STORE = "photos";
const MAX_EDGE = 1400;
const QUALITY = 0.8;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB 없음"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 저장 전에 긴 변 1400px로 줄인다. 장끼는 글자만 읽히면 되므로 원본을 둘 이유가 없다. */
export async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/** 실패해도 던지지 않는다 — 사진이 없다고 장부를 못 쓰면 안 되므로 */
export async function putPhoto(txId, file) {
  try {
    const dataUrl = await shrink(file);
    await run("readwrite", (s) => s.put(dataUrl, txId));
    return true;
  } catch {
    return false;
  }
}

export async function getPhoto(txId) {
  try {
    return (await run("readonly", (s) => s.get(txId))) || null;
  } catch {
    return null;
  }
}

export async function deletePhoto(txId) {
  try {
    await run("readwrite", (s) => s.delete(txId));
  } catch {
    /* 사진이 안 지워져도 거래 삭제 자체는 진행한다 */
  }
}
