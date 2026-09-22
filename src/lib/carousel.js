// 캐러셀 기획 서버 함수(/api/carousel) 부르기 + 올린 사진 줄이기.

async function call(body) {
  let res;
  try {
    res = await fetch("/api/carousel", {
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
    /* JSON 이 아닌 응답 */
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        data?.message ||
        (res.status === 413
          ? "사진이 너무 커요. 장 수를 줄여서 넣어주세요."
          : res.status === 504
            ? "시간이 오래 걸려 끊겼어요. 다시 해주세요."
            : "잠시 뒤 다시 시도해 주세요."),
    };
  }
  return { ok: true, data };
}

/** 캐러셀 장 사진(base64) → 구조 분석 */
export const analyzeCarousel = ({ slides, meta, memo }) =>
  call({ mode: "analyze", slides, meta, memo });

/** 상품(1~6개: [{url, stats}]) + 레퍼런스 요약 → 장별 기획. 여러 개면 묶음 캐러셀 */
export const planCarousel = ({ products, refs, memo }) =>
  call({ mode: "plan", products, refs, memo });

/**
 * 사진 파일을 줄인다. 분석용(긴 변 900, base64)과 보관용(긴 변 1080, Blob) 둘을 만든다.
 * @returns {Promise<{data: string, blob: Blob}>}
 */
export async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`${file.name} 을(를) 열지 못했어요.`));
      i.src = url;
    });
    const draw = (edge) => {
      const s = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c;
    };
    const data = draw(900).toDataURL("image/jpeg", 0.7).split(",")[1];
    const blob = await new Promise((r) => draw(1080).toBlob(r, "image/jpeg", 0.85));
    return { data, blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 기획에 넣을 레퍼런스 요약 — 서버 프롬프트가 길어지지 않게 필요한 것만 */
export function refSummary(r, kind) {
  if (kind === "carousel") {
    const a = r.analysis || {};
    return {
      kind,
      title: a.title || r.title,
      format: a.format,
      cover: a.cover?.text,
      flow: a.structure?.flow,
      why: a.structure?.whyItWorks,
      performance: a.performance,
      template: a.template,
    };
  }
  const x = r.reference || {};
  return {
    kind: "reel",
    title: x.title || r.title,
    hook: x.hook,
    hookType: x.structure?.hookType,
    flow: x.structure?.flow,
    why: x.structure?.whyItWorks,
    performance: x.performance,
  };
}
