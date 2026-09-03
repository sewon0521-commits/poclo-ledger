// 영수증 사진 → 서버리스 함수(/api/read-receipt) → 입력 폼 프리필.
// API 키는 서버 쪽에만 있으므로 여기서는 절대 다루지 않는다.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** 업로드 전에 긴 변 1600px로 줄여 요청 크기와 실패율을 낮춘다 */
async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { image: dataUrl.split(",")[1], mediaType: "image/jpeg" };
}

async function toBase64(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    r.readAsDataURL(file);
  });
  return { image: dataUrl.split(",")[1], mediaType: file.type || "image/jpeg" };
}

/**
 * 성공하면 { ok: true, data }, 실패하면 { ok: false, message }.
 * 실패해도 던지지 않는다 — 호출부는 어느 쪽이든 수동 입력 폼을 연다.
 */
export async function readReceipt(file) {
  let payload;
  try {
    payload = await downscale(file);
  } catch {
    try {
      payload = await toBase64(file);
    } catch {
      return { ok: false, message: "사진을 열지 못했어요. 직접 입력해 주세요." };
    }
  }

  try {
    const res = await fetch("/api/read-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: body.message || "사진을 읽지 못했어요. 직접 입력해 주세요.",
      };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return {
      ok: false,
      message: "네트워크가 불안정해요. 직접 입력하거나 잠시 뒤 다시 시도해 주세요.",
    };
  }
}
