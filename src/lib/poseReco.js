// 포즈 '진짜 추천' (11/18) — 세원(방향성 창 전달): "코디 추천 그대로 누르면 너무 많아지는데 ㅠㅠㅠ 우리가 소싱한 상품을 반영해서 진짜 추천을 해줄 수 있을까?"
//   예전 추천(poses.recommend 의 옷 종류 거르기)은 그 코디 옷 종류 폴더 카드를 거의 다 넣어서 코디당 30~38장이 됐다.
//   이제 그 안에서 코디 상품을 보고 약 10장(촬영 줄 recoN, 세원 11/14 "사진 1군 포즈 약 10개")을 고르고, 카드마다 고른 이유 한 줄을 단다.
//
// 고르는 법 — 돈 안 드는 규칙 점수(화면에서 바로):
//   ① 상품 특징: 우리 상품명 · 신마 원래 이름 · 종류 · 두께감 → 와이드 · 부츠컷 · 일자 · 짧은 기장 · 니트·털 · 넥라인 · 레이스 · 벨트 · 롱 기장 … (TRAITS)
//      + 그 상품에 이어진 소싱 레퍼런스(소싱 회차 refLooks)의 구도
//   ② 카드 특징: 카드 이름 · 설명 · 사진 설명 · 찍는 방식 + 사무실 PC Claude Code 가 사진을 보고 적어 둔 낱말(settings pose_ai — poclo-cafe24/pose_ai.py)
//      카드 절반은 제목 없이 사진만 있어서 ②의 사진 낱말이 없으면 그 카드는 묶음 기본으로만 들어간다.
//   ③ 특징이 맞으면 점수(TRAITS 의 w), 가장 큰 것이 고른 이유. 묶음(TOP·BTM·FULL·OUTER)마다 한 장 이상 → 나머지는 점수 순으로
//      묶음 몫(SHARE)을 넘거나 같은 구도가 겹치면 깎는다 → 사진 수가 recoN 이 되면 멈춘다.
//   거르기(옷 종류 · '가방 있을 때만' · 예비 빼기 · 실내/야외)는 예전 그대로 poses.recommend 가 먼저 한다. 확인 전 카드도 그대로 들어가되 확인된 카드가 조금 앞.
//   세원이 직접 고른 코디(posePicks)는 안 건드린다 — 추천 그대로인 코디와 '추천으로' 단추에만.
import { useCallback, useEffect, useState } from "react";
import { loadKey, onSettingsChange, watchKeys, wearPart } from "./shoot";

export const POSE_AI_KEY = "pose_ai";
export const RECO_N = 10; // (예전) 코디당 장수 — 지금은 묶음마다 장수(recoQ)를 쓴다
// 11/20 세원: "포즈 판 추천이 10장 밖에 안나오는데 이거 고쳐줘" — 코디당 10장 고정이라 겹이 많은 코디도 10장이었다.
//   이제 **묶음마다 몇 장**(촬영 줄 recoQ, 기본 5 — 고정 1군 5×5 · 세원이 11/19 직접 고른 코디가 18~26장): 그 코디 겹에 나오는 묶음(TOP·SELFIE·BTM·OUTER·FULL)마다 그만큼,
//   상의는 세부 카드가 맞는 겹(나시 …)마다 따로 그만큼 → 겹·옷이 많을수록 많아진다. 같은 구도는 깎고, 묶음 몫은 안 넘는다.
//   찍는 순서(lib/shootOrder)에서 상의·셀카 카드는 상의 겹마다 다시 찍으니 실제 찍는 장수는 겹 수만큼 더 늘어난다.
export const RECO_Q = 5;
export const RECO_Q_MIN = 1;
export const RECO_Q_MAX = 8;

// ---------------------------------------------------------------- 사무실 PC 가 적어 둔 사진 낱말 (pose_ai) — 화면 어디서나 같은 값을 쓰게 한 곳에
let AI = (() => {
  try {
    return JSON.parse(localStorage.getItem("poclo_" + POSE_AI_KEY) || "null") || {};
  } catch {
    return {};
  }
})();
export const poseAi = () => AI;
/** 테스트·미리 보기용 — 바깥에서 낱말을 바꿔 넣는다 */
export const setPoseAi = (v) => {
  AI = v || {};
};
/** 촬영 관리가 열려 있는 동안 pose_ai 를 읽어 둔다(바뀌면 다시) — 바뀌면 화면을 다시 그리게 상태를 돌려준다 */
export function usePoseAi(online) {
  const [v, setV] = useState(AI);
  const load = useCallback(
    () =>
      loadKey(POSE_AI_KEY, online, {})
        .then((x) => {
          AI = x || {};
          setV(AI);
        })
        .catch(() => {}),
    [online],
  );
  useEffect(() => {
    load();
    const off = onSettingsChange((k) => k === POSE_AI_KEY && load());
    const stop = watchKeys([POSE_AI_KEY], load, 30000);
    return () => {
      off();
      stop();
    };
  }, [load]);
  return v;
}

// ---------------------------------------------------------------- 카드 특징 낱말 (pose_ai.py 의 VIEWS · FRAMES … 와 같게)
// 낱말 = "v:정면" · "f:전신" · "a:걷기" · "s:통넓이" · "g:위에서" · "shot:거울셀카"
const TEXT_TAGS = [
  [/쭈그려/, ["a:쭈그려앉기", "a:앉기"]],
  [/앉/, ["a:앉기"]],
  [/걷/, ["a:걷기"]],
  [/기대/, ["a:기대기"]],
  [/다리.{0,4}들|한 다리/, ["a:한다리"]],
  [/허리.{0,3}손|한 손.{0,3}허리|손.{0,3}허리/, ["a:손허리"]],
  [/주머니/, ["a:주머니"]],
  [/폰.{0,4}(보|을 보)/, ["a:폰보기"]],
  [/가방/, ["a:가방"]],
  [/커피|소품|목도리/, ["a:소품"]],
  [/고개.{0,2}숙/, ["a:고개숙임"]],
  [/뒷모습|뒤태|뒤돌|뒷주머니|허리 아래 뒤/, ["v:뒤"]],
  [/옆모습|옆선|허리 아래 옆/, ["v:옆"]],
  [/사선/, ["v:사선"]],
  [/정면/, ["v:정면"]],
  [/전신|신발까지|기장이 다/, ["f:전신"]], // '허리부터 발끝까지'는 하반신이라 '발끝'은 안 본다
  [/허리 아래|허리부터|하반신|하의 강조|내려다본 하의/, ["f:하반신"]],
  [/가슴 위|근접|가깝게|가득/, ["f:근접"]],
  [/상반신|허리까지/, ["f:상반신"]],
  [/무릎 위/, ["f:무릎위"]],
  [/위에서|내려 찍|내려다/, ["g:위에서"]],
  [/넥라인/, ["s:넥라인"]],
  [/원단|결이/, ["s:원단결"]],
  [/기장/, ["s:기장"]],
  [/통 넓|통이/, ["s:통넓이"]],
  [/옆선/, ["s:옆선"]],
  [/뒷주머니|엉덩이/, ["s:뒤디테일"]],
  [/허리선/, ["s:허리선"]],
  [/부피/, ["s:부피감"]],
  [/실루엣|방이 보이게|멀리/, ["s:실루엣"]],
  [/신발/, ["s:신발"]],
];
const SHOT_TAG = { "거울 셀카": "shot:거울셀카", "찍어주는 컷": "shot:찍어주는" };

/** 카드 → {tags:Set, desc} — 글자 + 사진 낱말 */
export function cardTags(k, ai = AI) {
  const tags = new Set();
  const text = [k.title, k.sec?.text, ...(k.sec?.photos || []).map((p) => p.cap)].filter(Boolean).join(" ");
  for (const [re, t] of TEXT_TAGS) if (re.test(text)) t.forEach((x) => tags.add(x));
  if (SHOT_TAG[k.shot]) tags.add(SHOT_TAG[k.shot]);
  const a = ai?.cards?.[k.id];
  if (a) {
    if (a.view) tags.add("v:" + a.view);
    if (a.frame) tags.add("f:" + a.frame);
    for (const x of a.acts || []) tags.add("a:" + x);
    for (const x of a.shows || []) tags.add("s:" + x);
    if (a.angle) tags.add("g:" + a.angle);
    if (a.shot) tags.add("shot:" + a.shot);
  }
  const strip = String(k.title || "").replace(/^\s*☀?\s*(P\d+|(TOP|SELFIE|BTM|FULL|OUTER)·\S+)\s*/i, "");
  return { tags, desc: strip || k.sec?.text || a?.desc || "" };
}

// ---------------------------------------------------------------- 상품 특징 → 원하는 구도
// parts = 이 특징을 보는 상품 자리(wearPart), groups = 이 특징이 점수를 주는 카드 묶음.
// wants: t = 카드에 다 있어야 하는 낱말, w = 점수, why = 고른 이유 뒷부분(앞은 label)
const BOTTOM = ["하의", "원피스·세트"];
const TOPS = ["상의", "이너", "원피스·세트"];
const G_BTM = ["BTM", "FULL"];
const G_TOP = ["TOP", "SELFIE", "FULL"];
const G_OUT = ["OUTER", "FULL"];
export const TRAITS = [
  // 하의
  { key: "wide", label: "와이드 핏", re: /와이드|벌룬|배기|통바지|wide/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:걷기"], w: 3, why: "통 넓이가 보이는 걷기" },
    { t: ["v:옆", "f:하반신"], w: 2.5, why: "옆선으로 통 넓이" },
    { t: ["s:통넓이"], w: 2, why: "통 넓이가 보이는 컷" },
    { t: ["v:옆"], w: 1.5, why: "옆으로 통 넓이" },
  ] },
  { key: "boot", label: "부츠컷", re: /부츠컷|플레어|세미\s?부츠|나팔|bootcut|flare/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:한다리"], w: 3, why: "한 다리 들어 부츠컷 라인" },
    { t: ["f:전신", "v:정면"], w: 3, why: "밑단 퍼짐까지 보이는 전신 정면" },
    { t: ["s:밑단"], w: 2, why: "밑단 퍼짐" },
    { t: ["a:걷기"], w: 1.5, why: "밑단이 흔들리는 걷기" },
  ] },
  { key: "straight", label: "일자 핏", re: /일자|스트레이트|straight/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["f:전신", "v:정면"], w: 2.5, why: "곧은 라인이 보이는 전신 정면" },
    { t: ["f:하반신", "v:정면"], w: 2, why: "허리부터 일자 라인" },
  ] },
  { key: "slimb", label: "붙는 하의", re: /스키니|레깅스|슬림\s?핏\s?(팬츠|pt|바지)|부츠\s?삭스/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["v:옆"], w: 2, why: "다리 라인이 보이는 옆모습" },
    { t: ["a:한다리"], w: 2, why: "다리 라인" },
  ] },
  { key: "shortb", label: "짧은 기장", re: /숏\s?팬츠|반바지|쇼츠|숏츠|핫팬츠|미니|숏\s?pt|숏\s?sk/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:앉기"], w: 2.5, why: "다리 라인이 보이는 앉은 컷" },
    { t: ["a:한다리"], w: 2, why: "다리 라인" },
    { t: ["g:위에서"], w: 1.5, why: "위에서 내려 찍어 비율" },
  ] },
  { key: "longsk", label: "롱·미디 기장", re: /롱\s?스커트|롱\s?sk|맥시|미디|롱\s?치마|롱\s?원피스/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:걷기"], w: 2.5, why: "치마가 흔들리는 걷기" },
    { t: ["f:전신"], w: 2, why: "기장이 다 보이는 전신" },
  ] },
  { key: "pleat", label: "주름 디테일", re: /플리츠|맞주름|주름|핀턱|셔링|프릴|캉캉/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:걷기"], w: 2, why: "주름이 살아나는 걷기" },
    { t: ["f:하반신"], w: 1.5, why: "주름이 보이는 하반신" },
  ] },
  { key: "back", label: "뒤 디테일", re: /뒷\s?주머니|뒤\s?트임|백\s?포켓|뒷\s?밴딩|뒤\s?리본|백\s?리본|뒤\s?절개|뒷태|뒤태/i, parts: [...BOTTOM, "상의", "아우터"], groups: ["BTM", "TOP", "OUTER", "FULL"], wants: [
    { t: ["v:뒤"], w: 3, why: "뒤 디테일이 보이는 뒷모습" },
    { t: ["s:뒤디테일"], w: 3, why: "뒤 디테일" },
  ] },
  { key: "pocket", label: "주머니 디테일", re: /카고|워크\s?포켓|아웃\s?포켓|로우\s?포켓|포켓|주머니/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["f:하반신", "v:정면"], w: 2, why: "주머니가 보이는 하반신 정면" },
    { t: ["a:주머니"], w: 1.5, why: "주머니에 손" },
  ] },
  { key: "band", label: "편한 밴딩", re: /스트링|밴딩|조거|트레이닝|스웻/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["a:앉기"], w: 1.5, why: "편한 핏이 보이는 앉은 컷" },
    { t: ["f:하반신"], w: 1, why: "허리 스트링이 보이는 하반신" },
  ] },
  { key: "denim", label: "데님", re: /데님|청바지|(?<![가-힣])진(?![가-힣])|jean|워싱/i, parts: BOTTOM, groups: G_BTM, wants: [
    { t: ["f:하반신", "v:정면"], w: 1.5, why: "워싱·핏이 보이는 하반신 정면" },
    { t: ["f:하반신"], w: 1, why: "워싱이 보이는 하반신" },
  ] },
  { key: "legwear", label: "스타킹·양말", re: /스타킹|타이즈|레그\s?워머|삭스|양말/i, parts: ["기타"], groups: G_BTM, wants: [
    { t: ["a:앉기"], w: 2, why: "다리가 보이는 앉은 컷" },
    { t: ["a:한다리"], w: 2, why: "다리 라인" },
    { t: ["s:다리라인"], w: 2, why: "다리 라인" },
  ] },
  { key: "shoes", label: "신발", re: /./, parts: ["신발"], groups: G_BTM, wants: [
    { t: ["s:신발"], w: 2, why: "신발까지 보이는 컷" },
    { t: ["f:전신"], w: 1, why: "신발까지 보이는 전신" },
  ] },
  // 상의
  { key: "knit", label: "니트·털 원단", re: /니트|(?<![a-z])nt(?![a-z])|앙고라|모헤어|(?<![가-힣])울(?![가-힣])|울\s?(니트|코트|혼방|소재)|캐시미어|부클|꽈배기|골지|알파카|기모|후리스|플리스|벨벳|(?<![지점])퍼(?!프)|털/i, parts: TOPS, groups: G_TOP, wants: [
    { t: ["f:근접"], w: 3, why: "원단 결이 보이는 근접" },
    { t: ["s:원단결"], w: 3, why: "원단 결" },
    { t: ["f:상반신"], w: 1.5, why: "결이 화면 가득한 상반신" },
  ] },
  { key: "neck", label: "넥라인", re: /브이넥|v넥|딥\s?v|딥브이|유넥|u넥|보트넥|하이넥|목폴라|터틀|카울|헨리넥|스퀘어넥|오프숄더|홀터|라운드넥|카라/i, parts: TOPS, groups: G_TOP, wants: [
    { t: ["s:넥라인"], w: 3, why: "넥라인이 보이는 컷" },
    { t: ["f:근접"], w: 2.5, why: "넥라인이 보이는 가슴 위 근접" },
    { t: ["f:상반신", "v:정면"], w: 1.5, why: "넥라인이 보이는 정면 상반신" },
  ] },
  { key: "detail", label: "디테일", re: /레이스|셔링|리본|프릴|단추|버튼|드레이프|핀턱|절개|펀칭/i, parts: TOPS, groups: G_TOP, wants: [
    { t: ["f:근접"], w: 2, why: "디테일이 보이는 근접" },
    { t: ["f:상반신"], w: 1, why: "디테일이 보이는 상반신" },
  ] },
  { key: "crop", label: "짧은 기장", re: /크롭|숏(?!\s?(팬츠|pt|sk|패딩|츠))|짧은/i, parts: [...TOPS, "아우터"], groups: ["TOP", "OUTER", "FULL"], wants: [
    { t: ["s:허리선"], w: 2.5, why: "허리선이 보이는 컷" },
    { t: ["f:상반신", "v:정면"], w: 1.5, why: "짧은 기장이 보이는 정면 상반신" },
    { t: ["f:전신"], w: 1, why: "짧은 기장 비율이 보이는 전신" },
  ] },
  { key: "over", label: "넉넉한 핏", re: /오버|루즈|박시|빅\s?사이즈|넉넉/i, parts: [...TOPS, "아우터"], groups: ["TOP", "OUTER", "FULL"], wants: [
    { t: ["s:실루엣"], w: 2, why: "넉넉한 실루엣이 보이는 컷" },
    { t: ["v:사선"], w: 1.5, why: "핏이 보이는 사선" },
  ] },
  { key: "slimt", label: "붙는 핏", re: /슬림|여리|붙는|머슬/i, parts: TOPS, groups: G_TOP, wants: [
    { t: ["v:사선"], w: 2, why: "몸선이 보이는 사선" },
    { t: ["v:옆"], w: 1.5, why: "몸선이 보이는 옆모습" },
  ] },
  { key: "layer", label: "레이어드", re: /레이어드|이너|나시|캐미|슬리브리스|민소매/i, parts: TOPS, groups: G_TOP, wants: [
    { t: ["s:레이어드"], w: 2, why: "겹쳐 입은 게 보이는 컷" },
    { t: ["f:상반신"], w: 1.5, why: "레이어드가 보이는 상반신" },
  ] },
  // 아우터
  { key: "long", label: "롱 기장", re: /롱\s?코트|롱(?!\s?슬리브)|맥시|트렌치/i, parts: ["아우터"], groups: G_OUT, wants: [
    { t: ["f:전신"], w: 3, why: "기장이 다 보이는 전신" },
    { t: ["s:기장"], w: 2, why: "기장이 보이는 컷" },
    { t: ["a:걷기"], w: 2, why: "코트 자락이 보이는 걷기" },
    { t: ["v:뒤"], w: 1.5, why: "뒤 기장이 보이는 뒷모습" },
  ] },
  { key: "half", label: "짧은 아우터", re: /하프|숏\s?패딩|숏\s?자켓|숏\s?점퍼|크롭|숏(?!\s?(팬츠|pt))/i, parts: ["아우터"], groups: G_OUT, wants: [
    { t: ["f:상반신"], w: 2, why: "아우터 기장이 보이는 상반신" },
    { t: ["s:허리선"], w: 1.5, why: "허리선이 보이는 컷" },
  ] },
  { key: "puffer", label: "패딩·점퍼", re: /패딩|다운|푸퍼|점퍼|항공/i, not: /(?<![지점])퍼(?!프|후드)|무스탕|털점퍼|모피/i, parts: ["아우터"], groups: G_OUT, wants: [
    { t: ["v:사선"], w: 2.5, why: "부피가 보이는 사선" },
    { t: ["s:부피감"], w: 2.5, why: "부피감이 보이는 컷" },
    { t: ["a:소품"], w: 1, why: "커피·목도리 소품" },
  ] },
  { key: "furout", label: "털 아우터", re: /(?<![지점])퍼(?!프)|무스탕|털|양털|보아|뽀글/i, parts: ["아우터"], groups: G_OUT, wants: [
    { t: ["f:근접"], w: 2.5, why: "털 결이 보이는 근접" },
    { t: ["s:원단결"], w: 2, why: "털 결이 보이는 컷" },
  ] },
  { key: "collar", label: "카라·후드", re: /카라|후드|숄\s?카라|떡볶이|라펠/i, parts: ["아우터"], groups: G_OUT, wants: [
    { t: ["f:근접"], w: 2, why: "카라가 보이는 근접" },
    { t: ["f:상반신", "v:정면"], w: 1.5, why: "카라가 보이는 정면 상반신" },
  ] },
  { key: "material", label: "소재 질감", re: /레더|가죽|스웨이드|세무|골덴|코듀로이|누빔/i, parts: ["아우터", ...BOTTOM], groups: ["OUTER", "BTM", "FULL"], wants: [{ t: ["f:근접"], w: 1.5, why: "소재 질감이 보이는 근접" }] },
  { key: "belt", label: "허리 벨트", re: /벨트|허리\s?끈|허리\s?스트랩/i, parts: ["아우터", "기타", ...TOPS, ...BOTTOM], groups: ["TOP", "OUTER", "BTM", "FULL"], wants: [
    { t: ["s:허리선"], w: 2.5, why: "허리 벨트 라인" },
    { t: ["a:손허리"], w: 2, why: "허리선이 보이는 한 손 허리" },
  ] },
  // 소품
  { key: "warm", label: "손·목 소품", re: /장갑|워머|머플러|목도리|스카프/i, parts: ["기타"], groups: ["TOP", "OUTER", "FULL"], wants: [
    { t: ["a:소품"], w: 1.5, why: "소품이 보이는 컷" },
    { t: ["f:상반신"], w: 1, why: "소품이 보이는 상반신" },
  ] },
  { key: "bag", label: "가방", re: /./, parts: ["가방"], groups: ["FULL", "OUTER"], wants: [{ t: ["a:가방"], w: 3, why: "가방이 보이는 컷" }] },
];
// 플레어 치마 — 부츠컷 말(플레어)이 치마에 붙으면
const SKIRT = /스커트|치마|(?<![a-z])sk(?![a-z])|원피스|드레스/i;
const FLARE_SK = { key: "flaresk", label: "플레어 치마", parts: BOTTOM, groups: G_BTM, wants: [
  { t: ["a:걷기"], w: 2.5, why: "치마가 퍼지는 걷기" },
  { t: ["s:밑단"], w: 2, why: "밑단 퍼짐이 보이는 컷" },
  { t: ["f:전신"], w: 1.5, why: "플레어 실루엣이 보이는 전신" },
] };
// 두께감 '두꺼움' 상의 — 이름에 원단 말이 없어도
const THICK = { key: "thick", label: "도톰한 원단", parts: TOPS, groups: G_TOP, wants: [{ t: ["f:근접"], w: 1.5, why: "도톰한 원단이 보이는 근접" }] };

/** 상품 하나 → 특징 [{key, label, groups, wants, item}] */
export function itemTraits(x, ai = AI) {
  const part = wearPart(x);
  const text = `${x?.name || ""} ${x?.fullName || ""}`;
  const out = [];
  for (const t of TRAITS) {
    if (!t.parts.includes(part)) continue;
    const m = text.match(t.re);
    if (!m) continue;
    // 넥라인 · 디테일은 무엇인지 붙여서('카울 넥라인')
    if (t.not && t.not.test(text)) continue;
    if (t.key === "boot" && SKIRT.test(text)) {
      out.push({ ...FLARE_SK, item: x });
      continue;
    }
    const label = t.key === "neck" ? `${m[0].replace(/\s+/g, "")} 넥라인` : t.key === "detail" ? `${m[0]} 디테일` : t.label;
    out.push({ ...t, label, item: x });
  }
  if (TOPS.includes(part) && (x?.wear?.두께감 || []).includes("두꺼움") && !out.some((t) => t.key === "knit")) out.push({ ...THICK, item: x });
  // 소싱 레퍼런스 구도 — 그 옷을 따라 소싱한 사진이 어떤 구도였나(pose_ai.refs, 상품 → 레퍼런스는 pose_ai.itemRefs)
  for (const rid of ai?.itemRefs?.[x?.id] || []) {
    const r = ai?.refs?.[rid];
    if (!r || !(r.view || r.frame)) continue;
    const wants = [];
    if (r.frame && r.view) wants.push({ t: ["f:" + r.frame, "v:" + r.view], w: 2, why: r.desc || `${r.view} ${r.frame}` });
    for (const a of r.acts || []) if (a !== "서기") wants.push({ t: ["a:" + a], w: 1.5, why: r.desc || a });
    if (r.frame) wants.push({ t: ["f:" + r.frame], w: 1, why: r.desc || r.frame });
    out.push({ key: "ref:" + rid, label: "소싱 레퍼 구도", parts: [part], groups: partGroups(part), wants, item: x });
  }
  return out;
}
const partGroups = (p) =>
  ({ 하의: G_BTM, 상의: G_TOP, 이너: G_TOP, 아우터: G_OUT, "원피스·세트": ["TOP", "BTM", "FULL"], 신발: G_BTM, 기타: ["BTM", "TOP", "FULL"], 가방: ["FULL", "OUTER"] })[p] || ["FULL"];

// ---------------------------------------------------------------- 고르기
/** 카드 묶음 — 이름 앞 번호(TOP·3 · ☀OUTER·패딩2) 먼저, 없으면 맞는 자리로 */
export function groupOfCard(k) {
  const m = String(k?.code || k?.title || "").match(/^\s*☀?\s*(TOP|SELFIE|BTM|FULL|OUTER)\b/i);
  if (m) return m[1].toUpperCase();
  const f = k?.fits || [];
  if (f.some((t) => t.startsWith("아우터"))) return "OUTER";
  if (f.includes("상의")) return "TOP";
  if (f.some((t) => t === "하의" || t.startsWith("하의:"))) return "BTM";
  if (f.includes("전신")) return "FULL";
  return "";
}
const GROUP_LABEL = { TOP: "상의", SELFIE: "상의 셀카", BTM: "하의", FULL: "전신", OUTER: "아우터", "": "포즈" };
// 묶음 몫 — 상의·하의·아우터는 고루, 전신은 조금 적게(마지막 겹 한두 장이면 코디 전체가 보인다)
const SHARE = { TOP: 2.5, SELFIE: 1, BTM: 2.5, FULL: 2, OUTER: 2.5, "": 1 };
const ORDER = ["TOP", "SELFIE", "BTM", "OUTER", "FULL", ""];
const photosOf = (k) => Math.max(1, (k.sec?.photos || []).filter((p) => p?.key).length);
// 같은 구도(묶음 + 크기 + 방향 + 대표 동작)가 겹치면 깎는다
const shapeOf = (g, tags) => [g, [...tags].find((t) => t.startsWith("f:")) || "", [...tags].find((t) => t.startsWith("v:")) || "", [...tags].find((t) => t.startsWith("a:") && t !== "a:서기") || ""].join("|");

/**
 * pool(옷 종류로 거른 카드) 안에서 코디 상품을 보고 n장 고르기
 * → {ids(카드 순서), why:{카드 id: 이유 한 줄}, short:{카드 id: 짧은 이유}, photos}
 */
// slots = 상의 겹마다 꼭 한 장(lib/poses topSlots — 나시 겹엔 TOP › 나시 카드) [{label, fit(카드)}]. 없으면 TOP 도 한 장
// q = 묶음마다 장수(11/20 — 주면 n 대신 이걸로, recoQOf)
export function smartPick(pool, c, items, n = RECO_N, ai = AI, slots = null, q = null) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  const traits = its.flatMap((x) => itemTraits(x, ai));
  const order = new Map(pool.map((k, i) => [k.id, i]));
  const rows = pool.map((k) => {
    const g = groupOfCard(k);
    const { tags, desc } = cardTags(k, ai);
    let score = k.ok === true ? 0.6 : 0;
    let best = null;
    for (const t of traits) {
      if (!t.groups.includes(g)) continue;
      const hit = t.wants.filter((w) => w.t.every((x) => tags.has(x))).sort((a, b) => b.w - a.w)[0];
      if (!hit) continue;
      score += hit.w;
      if (!best || hit.w > best.w) best = { w: hit.w, label: t.label, why: hit.why };
    }
    if (k.sec?.pose?.only && its.some((x) => wearPart(x) === "가방") && (!best || best.w < 3)) best = { w: 3, label: "가방 코디", why: "가방이 보이는 컷" };
    return { k, g, tags, desc, score, best, shape: shapeOf(g, tags), photos: photosOf(k) };
  });
  rows.sort((a, b) => b.score - a.score || (b.k.ok === true) - (a.k.ok === true) || order.get(a.k.id) - order.get(b.k.id));
  const groups = ORDER.filter((g) => rows.some((r) => r.g === g));
  const shareSum = groups.reduce((s, g) => s + SHARE[g], 0) || 1;
  const fair = Object.fromEntries(groups.map((g) => [g, (n * SHARE[g]) / shareSum]));
  const picked = [];
  const why = {};
  const short = {};
  let photos = 0;
  const take = (r, base, slot = "") => {
    picked.push(r);
    photos += r.photos;
    if (r.best) {
      why[r.k.id] = `${slot ? slot + " · " : ""}${r.best.label} → ${r.best.why}`;
      short[r.k.id] = r.best.label;
    } else {
      const d = r.desc ? ` — ${r.desc}` : "";
      why[r.k.id] = slot ? `${slot} 상의 한 장${d}` : base ? (r.g === "FULL" ? `코디 전체가 보이는 전신 한 장${d}` : `${GROUP_LABEL[r.g]} 기본 한 장${d}`) : `${GROUP_LABEL[r.g]} 컷 더${d}`;
      short[r.k.id] = slot || (base ? `${GROUP_LABEL[r.g]} 기본` : GROUP_LABEL[r.g]);
    }
  };
  // ① 묶음마다 한 장 — 가장 맞는 것. 상의는 겹마다 한 장(slots — 나시 겹엔 나시 카드)
  for (const g of groups) {
    if (g === "TOP" && slots?.length) {
      let any = false;
      for (const sl of slots) {
        const r = rows.find((x) => x.g === "TOP" && !picked.includes(x) && sl.fit(x.k));
        if (r) {
          take(r, true, sl.label);
          any = true;
        }
      }
      if (any) continue;
    }
    take(rows.find((r) => r.g === g), true);
  }
  // ②' 11/20 묶음마다 q장(q 를 주면) — 묶음(상의는 겹 자리마다)마다 q장까지만, 점수 순·같은 구도는 깎아서. 모자란 묶음 몫을 다른 묶음에 넘기지 않는다
  if (q) {
    const keyOf = (r) => (r.g === "TOP" && slots?.length ? `TOP#${slots.findIndex((sl) => sl.fit(r.k))}` : r.g);
    const inKey = {};
    for (const r of picked) inKey[keyOf(r)] = (inKey[keyOf(r)] || 0) + r.photos;
    for (;;) {
      let best = null;
      let bestAdj = -Infinity;
      for (const r of rows) {
        if (picked.includes(r)) continue;
        const key = keyOf(r);
        if (key === "TOP#-1" || (inKey[key] || 0) >= q) continue;
        const adj = r.score - 2 * picked.filter((p) => p.shape === r.shape).length;
        if (adj > bestAdj) {
          bestAdj = adj;
          best = r;
        }
      }
      if (!best) break;
      inKey[keyOf(best)] = (inKey[keyOf(best)] || 0) + best.photos;
      take(best, false);
    }
    const ids = picked.map((r) => r.k.id).sort((a, b) => order.get(a) - order.get(b));
    return { ids, why, short, photos, q };
  }
  // ② 나머지 — 점수 순, 같은 구도가 겹치면 깎아서. 먼저 묶음 몫(반올림)까지만 채우고, 그래도 모자라면 몫을 넘겨서(깎아서)
  for (const capped of [true, false]) {
    while (photos < n) {
      let best = null;
      let bestAdj = -Infinity;
      for (const r of rows) {
        if (picked.includes(r)) continue;
        const inG = picked.filter((p) => p.g === r.g).length;
        if (capped && inG + 1 > Math.round(fair[r.g])) continue;
        const dup = picked.filter((p) => p.shape === r.shape).length;
        const adj = r.score - 2.2 * Math.max(0, inG + 1 - fair[r.g]) - 2 * dup;
        if (adj > bestAdj) {
          bestAdj = adj;
          best = r;
        }
      }
      if (!best) break;
      take(best, false);
    }
  }
  const ids = picked.map((r) => r.k.id).sort((a, b) => order.get(a) - order.get(b));
  return { ids, why, short, photos };
}

/** 촬영 줄의 추천 — 묶음마다 장수(recoQ, 11/20~) */
export const recoQOf = (day) => {
  const v = Number(day?.recoQ);
  return Number.isFinite(v) && v >= RECO_Q_MIN ? Math.min(RECO_Q_MAX, Math.round(v)) : RECO_Q;
};
