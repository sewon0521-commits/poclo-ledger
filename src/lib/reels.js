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

/** 룩 카드를 서버가 읽는 모양으로 — [{products:[{url}]}] */
export const looksPayload = (looks) =>
  (looks || [])
    .map((l) => ({ products: (l.products || []).filter((p) => p.url).map((p) => ({ url: p.url })) }))
    .filter((l) => l.products.length);

/** 우리 상품(룩 단위) + 레퍼런스 후보들 → 가장 맞는 레퍼런스를 골라 우리 릴스 기획 */
export const productReel = ({ looks, stats, candidates, memo, avoid, direction }) =>
  call({ mode: "product", looks: looksPayload(looks), stats, candidates, memo, avoid, direction });

/** 라이브러리 항목을 후보 요약으로 (서버 프롬프트가 길어지지 않게) */
export const candidateOf = (it) => {
  const r = it.reference || {};
  return {
    id: it.id,
    title: r.title || it.title,
    hook: r.hook,
    hookType: r.structure?.hookType,
    flow: r.structure?.flow,
    cta: r.structure?.cta,
    why: r.structure?.whyItWorks,
    performance: r.performance?.summary,
    template: r.template,
    slots: r.slots,
    script: r.script,
  };
};

/** 레퍼런스 대본 + 우리 상품 주소 → 우리 릴스 기획 */
export const adaptScript = ({ reference, looks, memo, avoid, direction }) =>
  call({ mode: "adapt", reference, looks: looksPayload(looks), memo, avoid, direction });

// ---------------------------------------------------------------- 빈칸 틀

/** 빈칸 틀 + 채운 값 → 완성 대본 */
export function fillTemplate(template, filled) {
  const map = new Map((filled || []).map((f) => [f.key, f.value]));
  return String(template || "").replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_, k) => map.get(k) ?? `{{${k}}}`,
  );
}

/** 틀 한 줄을 글자와 빈칸 조각으로 쪼갠다 — 화면에서 빈칸만 칩으로 그리려고 */
export function splitTemplate(line) {
  const out = [];
  let rest = String(line || "");
  for (;;) {
    const m = rest.match(/\{\{\s*([^}]+?)\s*\}\}/);
    if (!m) {
      if (rest) out.push({ text: rest });
      return out;
    }
    if (m.index > 0) out.push({ text: rest.slice(0, m.index) });
    out.push({ slot: m[1] });
    rest = rest.slice(m.index + m[0].length);
  }
}

/** 사무실 PC 분석기가 90초 안에 "살아 있음"을 적었으면 켜진 것으로 본다 */
export const workerAlive = (w) => !!w?.at && Date.now() - new Date(w.at).getTime() < 90 * 1000;

// ---------------------------------------------------------------- 레퍼런스 틀 한눈에 (RefPicker)

/** '비주얼 무드형 : 자막 없이 …' → { name: '비주얼 무드형', note: '자막 없이 …' } */
export function hookKind(t) {
  const s = String(t || "");
  const i = s.search(/\s*[:：]\s*/);
  return i > 0 ? { name: s.slice(0, i).trim(), note: s.slice(i).replace(/^\s*[:：]\s*/, "") } : { name: s, note: "" };
}

/** 흐름 '훅 → 고민 → 착용컷' → ['훅','고민','착용컷'] (괄호 설명은 뗀다) */
export function flowSteps(f) {
  return String(f || "")
    .split(/\s*(?:→|->|>)\s*/)
    .map((x) => x.replace(/\s*\([^)]*\)\s*/g, "").trim())
    .filter(Boolean);
}
