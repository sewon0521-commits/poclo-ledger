/**
 * 릴스 유형 (2026-10-19 밤, 세원 — 쇼만마 콘텐츠 트래커 유형): 1~5 는 우리 소재 틀, 6·7 은 코디·실루엣 참고용.
 * 라이브러리 릴스(settings reels)를 분석 글(제목·훅·구조·장면·캡션)의 낱말로 저절로 나누고,
 * 사람이 고친 것은 settings 'reel_types' {map:{릴스id: 유형}} 에 남겨 그걸 먼저 쓴다.
 */
export const CTYPES = [
  { key: "brand", n: "01", icon: "🏷️", name: "브랜드 소개형", desc: "쇼핑몰·브랜드 이야기, 신상·베스트·룩북을 몰아서 소개 — 우리 '지원 이야기' 같은 것", use: "소재 틀" },
  { key: "codi", n: "02", icon: "👗", name: "코디 제안형", desc: "출근룩·데이트룩 같은 상황별 착장, 한 벌로 여러 코디", use: "소재 틀" },
  { key: "color", n: "03", icon: "🎨", name: "컬러칩 제안", desc: "같은 옷 여러 색 — 색감으로 고르게", use: "소재 틀" },
  { key: "silhouette", n: "04", icon: "🧍", name: "실루엣 직관형", desc: "말 없이 입은 핏·실루엣을 바로 보여 주기", use: "소재 틀" },
  { key: "detail", n: "05", icon: "🔍", name: "제품 디테일", desc: "소재·짜임·디테일 클로즈업, 기능 설명", use: "소재 틀" },
  { key: "sale", n: "06", icon: "🛍️", name: "플랫폼 세일 시즌", desc: "세일·기획전 시즌 영상", use: "코디 참고" },
  { key: "showroom", n: "07", icon: "🏬", name: "오프라인 쇼룸 활용", desc: "매장·쇼룸·팝업에서 찍은 것", use: "코디 + 실루엣 참고" },
];
export const CTYPE = Object.fromEntries(CTYPES.map((t) => [t.key, t]));

// 앞에 있을수록 먼저 — 세일·쇼룸처럼 분명한 것부터
const RULES = [
  ["sale", /세일|할인|블프|블랙\s*프라이데이|기획전|무신사|지그재그|에이블리|29cm|쿠폰|특가|라방|라이브\s*방송/i],
  ["showroom", /쇼룸|오프라인|매장|팝업|showroom|피팅룸/i],
  ["brand", /브랜드|스토리|런칭|저점매수|발굴|대표|사장님|고백|우리\s*쇼핑몰|쇼핑몰\s*모델|룩북/i],
  ["color", /컬러칩|\d+\s*(컬러|color)|컬러\s*(추천|별|비교|모음)|색감|색\s*(별|비교|조합)|톤\s*별/i],
  ["detail", /디테일|소재|원단|짜임|클로즈업|두께|촉감|기능|안감|재질|봉제|마감/i],
  ["silhouette", /실루엣|무자막|자막\s*없이|거울\s*셀카만|핏\s*(만|보여|체크)|전신\s*(만|컷)/i],
  ["codi", /코디|룩|출근|데이트|하객|추구미|스타일링|가지|outfit|아웃핏|ootd|입는\s*법|매치/i],
];

export function textOf(r) {
  const ref = r.reference || {};
  const scenes = (ref.scenes || []).map((s) => `${s.text || ""} ${s.visual || ""}`).join(" ");
  return [r.title, ref.title, ref.hook, ref.hookType, ref.kind, ref.empathy, scenes, r.meta?.caption, (ref.script || "").slice(0, 400)].filter(Boolean).join(" ");
}

export function autoType(r) {
  const t = textOf(r);
  for (const [k, re] of RULES) if (re.test(t)) return k;
  return "";
}
