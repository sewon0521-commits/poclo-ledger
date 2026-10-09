// 릴스 기획 서버 함수(/api/reels) 부르기. 키는 서버에만 있다.

// 요즘 트렌드 메모 — 트렌드 칸(TrendBox)이 서버에서 읽어 이 기기에 둔 것을 기획 요청에 붙인다 (분석·보관에는 안 붙임 — 돈 아끼기)
const PLAN_MODES = ["product", "adapt", "revise", "plan"];
function withTrends(body) {
  if (!PLAN_MODES.includes(body?.mode)) return body;
  try {
    const t = JSON.parse(localStorage.getItem("poclo_reel_trends") || "null")?.text;
    return t ? { ...body, trends: t } : body;
  } catch {
    return body;
  }
}

async function call(body) {
  let res;
  try {
    res = await fetch("/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withTrends(body)),
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
export const productReel = ({ looks, stats, candidates, memo, avoid, direction, mix, closeness }) =>
  call({ mode: "product", looks: looksPayload(looks), stats, candidates, memo, avoid, direction, mix, closeness });

/** 라이브러리 항목을 후보 요약으로 (서버 프롬프트가 길어지지 않게) */
export const candidateOf = (it) => {
  const r = it.reference || {};
  return {
    id: it.id,
    title: (it.best ? "★BEST " : "") + (r.title || it.title),
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

// ---------------------------------------------------------------- 섞어 만들기 (9/29)
// 세원: "레퍼런스를 그대로 가져오기보다 초반 후킹은 이 영상, 내용은 저 영상, 구도는 또 다른 영상, 대본은 부분부분 — 짬뽕시킬 수 있게"

export const MIX_PARTS = [
  ["hook", "첫 1~3초 훅", "이 영상의 시작 방식·훅 공식을 빌려요"],
  ["flow", "내용 흐름", "이 영상의 전개 순서(무엇을 어떤 순서로 보여 주는지)"],
  ["shots", "구도·촬영", "이 영상의 장면 구도·카메라·동작"],
  ["script", "대본 말투", "이 영상의 말투·문장 길이·리듬"],
];

/** 부분마다 필요한 것만 서버로 (프롬프트가 길어지지 않게) */
export function mixPayload(library, mix) {
  const out = {};
  for (const [key] of MIX_PARTS) {
    const it = library.find((i) => i.id === mix?.[key]);
    if (!it) continue;
    const r = it.reference || {};
    out[key] = {
      id: it.id,
      title: r.title || it.title,
      ...(key === "hook" && { hook: r.hook, hookType: r.structure?.hookType, formula: r.hookFormula, empathy: r.empathy }),
      // 대본 바탕(10/3)은 '대본 말투' 레퍼런스 — 없으면 '내용 흐름' 레퍼런스 대본을 바탕으로
      ...(key === "flow" && { flow: r.structure?.flow, cta: r.structure?.cta, lines: (r.lines || []).map((l) => `${l.role}: ${l.text}`).slice(0, 12), ...(!mix?.script && { script: String(r.script || "").slice(0, 2000) }) }),
      ...(key === "shots" && { scenes: (r.scenes || []).map((s) => `${s.at} ${s.visual}`).slice(0, 14), seconds: r.seconds }),
      ...(key === "script" && { script: String(r.script || "").slice(0, 2000), kind: r.kind }),
    };
  }
  return out;
}

/** 채팅으로 고치기 (9/29) — 지금 기획 + 대화 + 요청 → 고친 기획 + reply */
export const reviseReel = ({ plan, history, message }) => call({ mode: "revise", plan, history, message });

/** 사람이 고친 대본으로 구조·문장별 분석·빈칸 틀 다시 짜기 (10/2) — 글만 보내서 싸다 */
export const restructureReel = ({ reference, script, meta }) =>
  call({
    mode: "restructure",
    effort: "low",
    script,
    reference: { scenes: reference?.scenes || [], kind: reference?.kind || "", seconds: reference?.seconds || 0, captionStyle: reference?.captionStyle || "" },
    meta,
  });

/** 대본 줄 앞 시각 '[0:03.5]' → {t: 초, label, rest} */
export const STAMP = /^\s*\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]\s*/;
export function stampOf(line) {
  const m = String(line || "").match(STAMP);
  return m ? { t: Number(m[1]) * 60 + Number(m[2]), label: `${m[1]}:${m[2]}`, rest: line.slice(m[0].length) } : null;
}

/** 레퍼런스 대본 + 우리 상품 주소 → 우리 릴스 기획 */
export const adaptScript = ({ reference, looks, memo, avoid, direction, closeness }) =>
  call({ mode: "adapt", reference, looks: looksPayload(looks), memo, avoid, direction, closeness });

// ---------------------------------------------------------------- 레퍼런스를 얼마나 가져올지

/**
 * 10/9 세원: "이 정도로 복붙하면 안 돼. 내용이랑 분위기, 멘트들을 조금씩은 가져가되 한 번에 베껴 오면 안 될 것 같아."
 * 서버 api/reels.js 의 BASE_COPY / BASE_REMIX / BASE_FRESH 와 짝. 기본 = remix.
 */
export const CLOSENESS = [
  { id: "copy", label: "거의 그대로", hint: "레퍼 문장에 우리 상품 말만 바꿔 넣어요 (예전 방식)" },
  { id: "remix", label: "흐름·분위기만", hint: "줄마다 역할·말투는 따라가고 문장은 우리 말로 — 멘트는 2~3개만 빌려요" },
  { id: "fresh", label: "구조만", hint: "훅 방식·전개만 빌리고 대본은 새로 써요" },
];
const CLOSE_KEY = "poclo_reel_closeness";
export function readCloseness() {
  try {
    const v = localStorage.getItem(CLOSE_KEY);
    return CLOSENESS.some((c) => c.id === v) ? v : "remix";
  } catch {
    return "remix";
  }
}
export function saveCloseness(v) {
  try {
    localStorage.setItem(CLOSE_KEY, v);
  } catch {
    /* 기억 못 해도 된다 */
  }
}

/** 견줄 글자만 — 띄어쓰기·문장부호·이모지·'말:' 빼고 */
const bare = (t) =>
  String(t || "")
    .replace(/^\s*말\s*:/, "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");

/** 두 줄이 얼마나 같은지 0~1 (글자 두 개씩 묶어 겹치는 비율) */
export function lineSim(a, b) {
  const x = bare(a);
  const y = bare(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (t) => {
    const m = new Map();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let hit = 0;
  for (const [g, n] of gx) hit += Math.min(n, gy.get(g) || 0);
  return (2 * hit) / (x.length - 1 + y.length - 1);
}

/** baseLines → {pct: 대본 전체가 레퍼와 겹치는 정도(%), same: 거의 그대로인 줄 수, sims: 줄마다} */
export function overlapOf(lines) {
  const sims = (lines || []).map((l) => lineSim(l.ref, l.ours));
  let w = 0;
  let sum = 0;
  (lines || []).forEach((l, i) => {
    const n = bare(l.ours).length;
    w += n;
    sum += n * sims[i];
  });
  return { pct: w ? Math.round((sum / w) * 100) : 0, same: sims.filter((v) => v >= 0.8).length, sims };
}

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
