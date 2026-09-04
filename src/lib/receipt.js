// 장끼 사진 → 서버리스 함수(/api/read-receipt) → 입력 폼 프리필.
// API 키는 서버 쪽에만 있으므로 여기서는 절대 다루지 않는다.

import { shrink } from "./photos";

async function toPayload(file) {
  try {
    // 저장할 때와 같은 크기로 줄여 보낸다 — 요청 크기와 실패율을 낮춘다
    return { image: (await shrink(file)).split(",")[1], mediaType: "image/jpeg" };
  } catch {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
      r.readAsDataURL(file);
    });
    return { image: dataUrl.split(",")[1], mediaType: file.type || "image/jpeg" };
  }
}

/**
 * 성공하면 { ok: true, data }, 실패하면 { ok: false, message }.
 * 실패해도 던지지 않는다 — 호출부는 어느 쪽이든 수동 입력 폼을 연다.
 */
export async function readReceipt(file) {
  let payload;
  try {
    payload = await toPayload(file);
  } catch {
    return { ok: false, message: "사진을 열지 못했어요. 직접 입력해 주세요." };
  }

  try {
    const res = await fetch("/api/read-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.message || "장끼를 읽지 못했어요. 직접 입력해 주세요." };
    }
    return { ok: true, data: await res.json() };
  } catch {
    return {
      ok: false,
      message: "네트워크가 불안정해요. 직접 입력하거나 잠시 뒤 다시 시도해 주세요.",
    };
  }
}
