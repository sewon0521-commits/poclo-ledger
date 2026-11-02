// 캐러셀 기획 서버 함수(/api/carousel) 부르기 + 올린 사진 줄이기.

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
    res = await fetch("/api/carousel", {
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

/**
 * 유형·주제 + 상품(0~6개: [{url, stats}]) + 레퍼런스 요약 → 장별 기획. 여러 개면 묶음 캐러셀.
 * 상품이 없으면 noProduct — 소재·색·가격은 [대괄호]로 비워 두고, 나중에 상품을 고르면 fillFrom(앞 기획)으로 채운다.
 */
export const planCarousel = ({ kind, topic, postOn, products = [], noProduct, fillFrom, refs, memo }) =>
  call({ mode: "plan", kind, topic, postOn, products, noProduct, fillFrom, refs, memo });

/**
 * 캐러셀 4유형 (11/2 세원): 사진만 올리는 피드는 고감도만, 나머지는 캐러셀. 타겟 기준은 실루엣, 157cm·체형 커버는 안 쓴다.
 * key 는 기획안의 kind 그대로 저장된다 — 바꾸면 '11/5 시즌형' 같은 예전 기획안이 유형 없음으로 보인다.
 */
export const CAROUSEL_TYPES = [
  { key: "target", name: "타겟형", hint: "실루엣을 보는 사람에게", eg: "예: 어깨부터 일자로 떨어지는 핏만 찾는 사람의 아우터" },
  { key: "situation", name: "상황형", hint: "구체적인 상황 하나", eg: "예: 전남친 마주칠 수 있는 하객룩 코디" },
  { key: "aesthetic", name: "미감형", hint: "바닥에 두고 찍은 컷", eg: "예: 겨울 니트 컬러를 바닥에 모아 본 컷" },
  { key: "season", name: "시즌형", hint: "날씨·행사에 맞춰", eg: "예: 빙하기 오기 전 아우터 쟁여두자" },
];
export const typeOf = (key) => CAROUSEL_TYPES.find((t) => t.key === key) || null;

/**
 * 기본 폴더 — 처음엔 흔한 갈래 셋, 거기에 4유형을 한 번만 더한다(typesAdded).
 * 지운 폴더가 되살아나지 않게 한 번만, 이미 있는 폴더·거기 든 레퍼런스는 안 건드린다.
 */
const BASE_FOLDERS = ["코디 모음", "상품 소개", "정보·꿀팁"];
export function withTypeFolders(v, makeId) {
  if (v.typesAdded) return v;
  const items = (v.items || []).length ? v.items : BASE_FOLDERS.map((name) => ({ id: makeId("f"), name, parent: null }));
  const have = new Set(items.map((f) => f.name));
  const more = CAROUSEL_TYPES.filter((t) => !have.has(t.name)).map((t) => ({ id: makeId("f"), name: t.name, parent: null }));
  return { ...v, typesAdded: true, items: [...items, ...more] };
}

/** 장 그림 — 새 기획안은 서버가 source 를 준다. 예전 기획안은 shot 글로 글 중심인지 본다 */
const DESIGN_SHOT = /글\s*(중심|위주|만\b)|텍스트\s*(중심|위주|만\b)|사진\s*없이/;
export function slideSource(s) {
  if (s.photo > 0) return "photo";
  if (["shoot", "floor", "design"].includes(s.source)) return s.source;
  return DESIGN_SHOT.test(String(s.shot || "")) ? "design" : "shoot";
}

/** 기획안 이름 — '11/5 시즌형 · 빙하기 오기 전 아우터 5벌' */
export function planTitle({ kind, postOn, topic }) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(postOn || "") ? `${+postOn.slice(5, 7)}/${+postOn.slice(8)} ` : "";
  const name = typeOf(kind)?.name || "캐러셀";
  return `${d}${name}${topic ? ` · ${topic}` : ""}`;
}

/** 어림 비용 — 실측(11/2): 상품 3개 + 사진 12장 234원, 상품 없이는 사진이 안 가서 더 싸다 */
export const planCost = (products) => (products === 0 ? "약 100~250원" : products === 1 ? "약 200~350원" : "약 250~500원");

/** 게시 뒤 볼 숫자 — 기획안에 칸마다 바로 저장한다(비어 있으면 안 적음, 0 은 진짜 0) */
export const PLAN_STATS = [
  ["saves", "저장"],
  ["shares", "공유"],
  ["visits", "프로필 방문"],
];
export const STAT_WAIT_DAYS = 3;
const hasNum = (v) => typeof v === "number" && Number.isFinite(v);

/** 숫자를 적는 날 — 게시 3일 뒤 (위키 캐러셀-4유형) */
export function statDay(postOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postOn || "")) return "";
  const d = new Date(`${postOn}T00:00:00`);
  d.setDate(d.getDate() + STAT_WAIT_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 유형별 비교 — 줄마다 기획안 수 · 숫자를 적은 기획안 수 · 칸마다 평균(적은 것만으로).
 * 안 적은 기획안을 0 으로 세면 평균이 깎인다. 유형을 안 정한 예전 기획안은 있을 때만 맨 아래 줄.
 */
export function typeCompare(plans) {
  const row = (key, name, list) => {
    const avg = {};
    for (const [k] of PLAN_STATS) {
      const nums = list.map((p) => p[k]).filter(hasNum);
      avg[k] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    }
    return { key, name, count: list.length, measured: list.filter((p) => PLAN_STATS.some(([k]) => hasNum(p[k]))).length, avg };
  };
  const rows = CAROUSEL_TYPES.map((t) => row(t.key, t.name, plans.filter((p) => p.kind === t.key)));
  const rest = plans.filter((p) => !typeOf(p.kind));
  if (rest.length) rows.push(row("none", "유형 없음", rest));
  // 칸마다 가장 높은 값 — 비교할 유형이 둘 이상일 때만
  const best = {};
  for (const [k] of PLAN_STATS) {
    const vals = rows.map((r) => r.avg[k]).filter((v) => v != null);
    if (vals.length >= 2) best[k] = Math.max(...vals);
  }
  return { rows, best };
}

/**
 * 사진 파일을 줄인다. 분석용(긴 변 900, base64)과 보관용(긴 변 1600, Blob) 둘을 만든다.
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
    // 보관용은 긴 변 1600 (10/3 — 크게·확대해 볼 때 글씨가 깨지지 않게. 예전엔 1080)
    const blob = await new Promise((r) => draw(1600).toBlob(r, "image/jpeg", 0.85));
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
