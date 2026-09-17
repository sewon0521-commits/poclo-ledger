// 릴스 기획 서버 함수(/api/reels) 부르기. 키는 서버에만 있다.

async function call(body) {
  let res;
  try {
    res = await fetch("/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "인터넷이 끊겼어요. 연결되면 다시 해주세요." };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 서버가 JSON이 아닌 걸 돌려줄 때 */
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        data?.message ||
        (res.status === 413
          ? "영상이 너무 커요. 더 짧게 잘라서 넣어주세요."
          : res.status === 504
            ? "시간이 오래 걸려 끊겼어요. 더 짧은 영상으로 해보세요."
            : "잠시 뒤 다시 시도해 주세요."),
    };
  }
  return { ok: true, data };
}

/** 장면 사진 + (선택) 받아쓴 말 → 한글 대본 + 구조 */
export const readScript = ({ frames, kind, transcript, memo }) =>
  call({ mode: "script", frames, kind, transcript, memo });

/** 레퍼런스 대본 + 우리 상품 주소 → 우리 릴스 기획 */
export const adaptScript = ({ reference, url, memo }) =>
  call({ mode: "adapt", reference, url, memo });
