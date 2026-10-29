// 모델 기본 가이드 (10/29) — 세원: "기본 동선 같은 건 기본으로 깔아 두자. 아니면 그냥 모델한테 보내는 기본 가이드를 만들자.
//   동선부터 해서 어떤 영상을 찍을 것이고, 우리는 어떤 걸 추구하고, 어떤 사진의 어떤 포즈, 기본 포즈는 이런 포즈.
//   예를 들어 셀카를 찍을 때에는 휴대폰을 들고 있는 반대 팔을 허리 뒤로, 손은 이렇게… 이건 계속해서 쌓아 나가자."
//
// settings model_guide {items:[{id, title, text, photos:[{key, cap}], clips:[릴스 장면 — lib/refClips], links:[{id, name, url}]}]}
//   — 촬영마다가 아니라 하나(모든 촬영 시트에 같이 간다, lib/shootSheet v4 base). clips·links = 칸마다 참고 영상(세원: "거울 셀카 포즈는 내가 레퍼런스를 첨부해야 될 듯").
// 한 번도 저장 안 했으면 DEFAULT_GUIDE(세원이 준 기본 동선)를 보여 주고, 처음 고칠 때 그대로 저장된다.
// 글 쓰는 법(guideBlocks 가 읽는다): 한 줄에 하나 · 앞의 * - • 는 점 · 들여 쓰면 아래 단계 · '→' 로 이으면 순서(동선 — 번호 단계로) · 단계 앞 (사진)/(영상) 은 표시로.
import { putPhoto } from "./shoot";

export const GUIDE_KEY = "model_guide";

// 세원이 10/29 에 준 기본 동선 그대로 (붙여 넣은 글 — 들여쓰기·화살표 유지)
const FLOW = `* 아우터 X
  * 모델 옷 갈아입고 나오면 지정해주는 자리에 서서 포즈 취하기 → (사진) 상의 촬영 → (사진) 하의 촬영 → (사진) 전신촬영 → (영상) 상의 실루엣 촬영 → (영상) 하의 실루엣 촬영 → (사진) 거울셀카 상의,하의,전신 → (영상) 해당 코디에 필요한 영상 촬영 → 다음코디
* 아우터 O
  * 모델 옷 갈아입고 나오면 지정해주는 자리에 서서 포즈 취하기 → (사진) 상의 촬영 → (사진) 하의 촬영 → (사진) 전신촬영 → (영상) 상의 실루엣 촬영 → (영상) 하의 실루엣 촬영 → (사진) 아우터 입고 아우터 촬영 - 지퍼 열고, 닫고 → (사진) 전신 촬영 → (영상) 해당 코디에 필요한 영상 촬영 → 다음코디`;
// 10/29 세원: "코디 찍어야 될 영상에서 기본적으로 찍어야 될 영상을 넣어야 할 듯 — 거울 셀카(다양한 포즈 및 구도, 상의·하의) / 삼각대(거울에 뽁뽁이) …"
// (코디마다 '찍을 영상' 기본 목록은 lib/styling DEFAULT_OPTS.videos — 같은 내용을 체크 목록용으로 짧게)
const VIDEOS = `* 거울 셀카
  * 거울 셀카로 다양한 포즈 및 구도 영상 보여주기
  * 상의
  * 하의
* 삼각대 (거울에 뽁뽁이)
  * 휴대폰 녹화 누르고 뒷걸음질 → 자연스러운 포즈 취하다가 (약 3~5초) → 한 바퀴 돌기 → 동, 서, 남, 북 정확히 돌고 한 번 찍을 때마다 2초씩 서 있기 → 다시 다가와서 중지 버튼 누르기`;
export const DEFAULT_GUIDE = {
  items: [
    { id: "mg-flow", title: "기본 동선", text: FLOW, photos: [] },
    { id: "mg-video", title: "기본으로 찍는 영상", text: VIDEOS, photos: [] },
  ],
};

/** 더할 칸 — 세원이 말한 갈래(이름만, 내용은 세원이 채운다) */
export const SUGGEST = [
  { title: "포클로가 추구하는 느낌", hint: "예: 꾸민 듯 안 꾸민 데일리 · 표정은 자연스럽게" },
  { title: "기본 포즈", hint: "예: 한쪽 다리에 무게 · 손은 주머니나 옷자락" },
  { title: "셀카 포즈", hint: "예: 휴대폰을 든 반대 팔은 허리 뒤로 · 손은 가볍게 쥐기" },
];

const BULLET = /^(\s*)(?:[*•·-]|\d+[.)])\s+/;
/** '(사진) 상의 촬영' → {kind:"photo", text:"상의 촬영"} */
function stepOf(s) {
  const m = s.match(/^\(\s*(사진|영상)\s*\)\s*(.*)$/);
  return m ? { kind: m[1] === "사진" ? "photo" : "video", text: m[2].trim() } : { kind: "", text: s };
}
/**
 * 글 → 블록 [{type: "head"|"flow"|"item"|"text", depth, text, steps}]
 * - '→' 가 든 줄 = 순서(flow, 단계마다 사진/영상 표시)
 * - 아래에 더 들여 쓴 줄이 있는 줄 = 머리(head — '아우터 X' 처럼)
 * - 점(* -)으로 시작한 줄 = item, 그 밖 = text(문단)
 */
export function guideBlocks(text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((raw) => {
      const ind = (raw.match(/^\s*/)[0] || "").replace(/\t/g, "  ").length;
      const bullet = BULLET.test(raw);
      return { ind, bullet, text: raw.replace(BULLET, "").trim() };
    })
    .filter((l) => l.text);
  const levels = [...new Set(lines.map((l) => l.ind))].sort((a, b) => a - b);
  return lines.map((l, i) => {
    const depth = Math.min(3, levels.indexOf(l.ind));
    if (l.text.includes("→"))
      return {
        type: "flow",
        depth,
        steps: l.text
          .split("→")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(stepOf),
      };
    const next = lines[i + 1];
    if (next && next.ind > l.ind) return { type: "head", depth, text: l.text };
    return { type: l.bullet ? "item" : "text", depth, text: l.text };
  });
}

/** 비어 있지 않은 칸만 */
export const filledItems = (items) => (items || []).filter((x) => (x.text || "").trim() || (x.photos || []).length || (x.clips || []).length || (x.links || []).length);

/** 가이드 사진 보관 — 긴 변 1600(세로로 긴 안내 그림은 폭 1080), 이 기기 저장 모드면 작은 data URL (촬영 창 '모델에게 보낼 가이드'와 같이 쓴다) */
export async function guidePhoto(file, online) {
  const key = await putPhoto(file, online, { edge: 1600, tallWidth: 1080 });
  if (key) return key;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const s = Math.min(1, 600 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}
