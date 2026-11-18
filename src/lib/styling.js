// 코디 스타일링 (10/25) — components/Styling.jsx 의 상수·요약.
// 코디에 styling {hair, shoes, bag, necklace, ring, socks, memo, codiPhotos, refIds} (예전 acc 칩은 읽기만 — 10/25 세원 "목걸이, 반지, 가방, 양말 이 정도만 나눠줘").
// 헤어 칩 목록은 settings styling_opts {hair} (세원이 '칩 고치기'로 더하고 뺀다).
import { wearPart } from "./shoot";

export const OPTS_KEY = "styling_opts";
export const DEFAULT_OPTS = {
  hair: ["푼 머리", "반묶음", "포니테일", "낮은 묶음", "똥머리", "집게핀", "웨이브", "스트레이트"],
  acc: ["반지", "목걸이", "귀걸이", "팔찌", "시계", "헤어핀", "벨트", "양말", "스타킹"],
  // 10/29 세원: "코디 찍어야 될 영상에서 기본적으로 찍어야 될 영상을 넣어야 할 듯" — 코디마다 '찍을 영상'에 처음부터 깔린다(Styling — videosInit).
  // 모델이 보는 설명(뒷걸음질 · 동서남북 …)은 모델 기본 가이드 '기본으로 찍는 영상'(lib/modelGuide).
  videos: [
    "거울 셀카 · 상의 — 다양한 포즈·구도",
    "거울 셀카 · 하의 — 다양한 포즈·구도",
    "삼각대(거울에 뽁뽁이) — 뒷걸음질 → 자연스러운 포즈 3~5초 → 한 바퀴 → 동·서·남·북 2초씩 → 다가와 중지",
  ],
};
// 10/27 cuts · videos = 이 코디의 찍을 컷 · 찍을 영상 [{id, text, done}](예전엔 촬영 줄에 하나) · refVideos = 참고 영상 [{id, name, url}](인스타는 창 안에서 임베드로)
// 10/29 clips = 릴스 기획에서 잘라 온 장면 [{id, reelId, start, end, note, ver, at}] (lib/refClips.js)
// 11/7 lookDone = 그날 룩북 영상(lib/lookbook) 중 이 코디에서 찍은 것 [룩북 영상 id]
// 11/18 belt · hat · etc = 신발·잡화 새 칸(벨트 · 모자·머플러 · 기타)
export const EMPTY_STYLING = { cuts: [], videos: [], lookDone: [], hair: [], shoes: [], bag: [], necklace: [], ring: [], socks: [], belt: [], hat: [], etc: [], acc: [], memo: "", codiPhotos: [], refIds: [], refCuts: [], refVideos: [], clips: [] };

// 참고 사진 카테고리 (11/6 세원: "우리 스타일링 → 참고 사진도 모델 레퍼런스처럼 카테고리 나누자") — 모델 레퍼런스(lib/modelRefs)와 같은 모양:
// 카테고리(cloth) 탭 → 그 안에 세원이 만든 컷 → 컷마다 촬영 레퍼런스 사진. refCuts [{id, cloth, title, refIds}], cloth 가 없으면 공통.
// refIds 는 예전처럼 **이 코디 참고 사진 전부**(컷 사진 + 컷에 안 든 사진) — 촬영 관리 카드의 '참고 사진 N' 이 그대로 센다.
// 컷에 안 든 사진(예전에 넣은 것)은 '공통' 탭에 그대로 보인다. 카테고리 목록 = styling_opts.cloths(고치기 전엔 모델 레퍼런스 카테고리 목록으로 시작).
export const REF_CUT_SUGGEST = ["거울셀카", "앉아서 찍는 컷", "전신 포즈", "디테일 컷"];
export const refCutsOf = (st) => st?.refCuts || [];
/** 어느 컷에도 안 든 참고 사진 */
export function looseRefIds(st) {
  const inCut = new Set(refCutsOf(st).flatMap((c) => c.refIds || []));
  return (st?.refIds || []).filter((id) => !inCut.has(id));
}
/** 컷을 고친 뒤 refIds(전부)를 다시 맞춘다 — loose 는 고치기 전에 센 것 */
export const withRefCuts = (st, cuts, loose = looseRefIds(st)) => ({ ...st, refCuts: cuts, refIds: [...new Set([...loose, ...cuts.flatMap((c) => c.refIds || [])])] });
/** 카테고리 이름 바꾸기·지우기를 한 코디 스타일링에 (to 가 "" 이면 공통으로) */
export function mapRefCloth(st, from, to) {
  if (!refCutsOf(st).some((c) => c.cloth === from)) return st;
  return { ...st, refCuts: refCutsOf(st).map((c) => (c.cloth !== from ? c : to ? { ...c, cloth: to } : (({ cloth: _gone, ...rest }) => rest)(c))) };
}

// 신발·잡화 (11/18 다시 — 세원: "신발, 가방, 목걸이등 악세를 선택할 수 있는 칸이 업데이트가 안되고 너무 고르기가 빡센데 포즈판처럼 하나씩 고르는게 어떻까?")
// 고르기는 큰 창 하나(components/GoodsPick) — 종류 탭 · 찾기 · 최근 담은 것 먼저 · 큰 사진 격자. 저장은 예전 그대로 styling.<key> [{itemId}|{text}],
// 벨트 · 모자·머플러 · 기타 칸만 새로(belt · hat · etc). 목걸이 칸에 귀걸이, 반지 칸에 팔찌, 양말 칸에 스타킹도 같이 든다(예전 고른 것 안 끊기게 키는 그대로).
// '업데이트 안 됨' 원인: 예전엔 종류마다 상품 **이름 말**(가방·목걸이·반지·양말)로만 가려서 신발·잡화 31개 중 18개(모자·머플러·비니·벨트·스카프·집게핀,
//   '르아 스틸레토 힐 no'·'CNK 475 어그' 같은 신발까지)가 어느 칸에도 안 떴다 — 11/16 담은 모자·머플러·벨트가 안 보인 것. 이제 종류가 신발·잡화면 늘 어느 탭(없으면 기타)에 든다.
// 옷 종류(상의·하의…) 상품은 예전처럼 가방·목걸이·반지·양말 이름 말에 걸릴 때만(10/25 '벤또 파우치'가 상의로 적혀 있어서).
// 긴 신마 상품명(fullName)은 안 본다 — '…경량패딩(…파우치)' 처럼 꾸밈말에 걸려서.
export const GOODS = [
  { key: "shoes", label: "신발", place: "모델 개인 검정 로퍼" },
  { key: "bag", label: "가방", place: "가방 없이", re: /가방|백(?=\s|$|\))|토트|파우치|클러치|\bbag\b/i, old: true },
  { key: "necklace", label: "목걸이·귀걸이", place: "얇은 은색 체인", re: /목걸이|네크리스|necklace|초커|펜던트|귀걸이|이어링|earring|피어싱|귀찌/i, old: true },
  { key: "ring", label: "반지·팔찌", place: "얇은 금반지 2개", re: /반지|(^|\s)링(?=\s|$)|\bring\b|팔찌|브레이슬릿|bracelet|뱅글|발찌/i, old: true },
  { key: "socks", label: "양말·스타킹", place: "흰 발목 양말", re: /양말|삭스|socks|레그워머|발토시|스타킹|타이즈/i, old: true },
  { key: "belt", label: "벨트", place: "얇은 검정 벨트", re: /벨트|belt/i },
  { key: "hat", label: "모자·머플러", place: "회색 비니", re: /모자|비니|볼캡|버킷햇|베레모|(^|\s)(캡|햇)(?=\s|$)|머플러|목도리|스카프|넥워머|(?<![가-힣])숄(?!더)|귀마개|귀도리|바라클라바|발라클라바/i },
  { key: "etc", label: "기타", place: "집게핀" },
];
export const goodsOf = (key) => GOODS.find((p) => p.key === key);
// 신발·잡화로 적혔지만 옷인 것('노드9부팬츠' · '…야상 벨트' · '노스경량패딩') — 잡화 말이 있어도 기타로
const CLOTH = /트렌치|자켓|재킷|코트|팬츠|바지|야상|패딩|점퍼|가디건|원피스|스커트/;

/** 이 상품이 어느 신발·잡화 탭인가 — 신발·잡화가 아니면 null */
export function goodsKey(x) {
  if (!x) return null;
  if (wearPart(x) === "신발") return "shoes";
  const n = x.name || "";
  if (x.kind && x.kind !== "신발·잡화") return GOODS.find((p) => p.old && p.re.test(n))?.key || null;
  if (CLOTH.test(n)) return "etc";
  return GOODS.find((p) => p.re?.test(n))?.key || "etc";
}

/** 이 코디에 고른 신발·잡화 전부 [{key, s}] — 탭 순서대로 */
export const pickedGoods = (st) => GOODS.flatMap((p) => (st?.[p.key] || []).map((s) => ({ key: p.key, s })));

/** 스타일링이 한 줄로 — 카드 요약용 ('포니테일 · 로퍼 · 숄더백 · 목걸이') */
export function stylingLine(st, items) {
  if (!st) return "";
  const wear = (list) => (list || []).map((s) => (s.itemId ? (items || []).find((x) => x.id === s.itemId)?.name : s.text)).filter(Boolean);
  return [(st.hair || []).join("·"), ...GOODS.map((p) => wear(st[p.key]).join("·")), (st.acc || []).join("·")].filter(Boolean).join(" · ");
}
