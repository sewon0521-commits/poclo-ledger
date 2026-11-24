// 찍는 순서 (11/17) — 세원(방향성 창): 코디마다 **안쪽 옷부터 하나씩 입으면서** 찍는다.
//   방향성 제안은 '겹마다 사진 → 영상, 아우터부터 벗어 가기'였는데 세원: "퍼 자켓이나 앙고라 니트 같은 털 잘 빠지는 제품, 주름이 잘 지는 제품이면
//   벗으면서 찍는 게 오히려 안 좋을 수도 있어서 걍 입으면서 찍어야겠다." → 입으면서(안쪽 → 바깥). 모든 코디 같은 규칙.
//
// 예: 티셔츠 + 니트 + 아우터 + 팬츠
//   1. 티셔츠 + 팬츠(+ 신발): TOP → SELFIE → BTM → 이 상태 영상      (하의는 여기서 — 허리·엉덩이 라인이 보여서)
//   2. + 니트:               TOP → SELFIE → 니트 입은 영상          (상의가 바뀌었으니 상의 포즈를 한 번 더)
//   3. + 아우터(+ 가방·소품): OUTER → FULL → 다 입은 영상(거울에 붙었다 물러나기 · 멀리서 전신)
//   한 번 입은 옷은 다시 벗지 않는다. 원피스처럼 한 겹이면 사진 → 영상만(그 겹에 TOP·SELFIE·BTM·FULL).
//
// 겹 = 코디 상품의 자리(lib/shoot wearPart): 이너 → 상의 → (겹쳐 입는 상의: 니트·가디건·집업 …) / 원피스·세트 → 아우터.
//   하의·신발은 첫 겹에 같이, 가방·기타(모자·머플러 …)는 마지막 겹에.
// 포즈 묶음 = 포즈 카드의 이름 앞(TOP·1 …) — 세원이 오브나인 후보판에서 5개씩 고르면 그 이름으로 들어온다.
//   그 전(P1~P16)은 카드의 옷 자리(fits)로: 아우터 → OUTER · 상의 → TOP(셀카면 SELFIE) · 하의·앉은컷 → BTM · 전신 → FULL.
//
// 찍음 표시(촬영 줄 poseDone[코디 id]) — 첫 겹 사진은 예전처럼 보관 키 그대로, 두 번째 상의 겹부터는 `s<겹>|<키>`, 겹 영상은 `vid:<겹>`.
import { wearPart } from "./shoot";
import { shotsOf, topsInOrder, topLayerMap } from "./poses";
import { poseAi } from "./poseReco";

export const GROUPS = ["TOP", "SELFIE", "BTM", "FULL", "OUTER"];
export const GROUP_NAME = { TOP: "상의", SELFIE: "상의 셀카", BTM: "하의", FULL: "전신", OUTER: "아우터" };

const LOW_ETC = /양말|삭스|스타킹|타이즈|레그워머|벨트/;

/** 모델에게 보이는 옷 이름 — 상품 이름 대신 종류 말(상품명·거래처는 시트에 안 간다). 자리(wearPart)마다 고를 수 있는 말만 ('니트 스커트'는 스커트) */
const TOPW = [
  [/나시|캐미|민소매|슬리브리스|탱크|브라렛/, "나시"],
  [/가디건|cardigan/i, "가디건"],
  [/집업/, "집업"],
  [/후드/, "후드"],
  [/맨투맨|스웻|스웨트/, "맨투맨"],
  [/베스트|조끼/, "베스트"],
  [/니트|스웨터|폴라|앙고라|knit/i, "니트"],
  [/블라우스/, "블라우스"],
  [/(?<!티)셔츠|남방/, "셔츠"],
  [/티셔츠|티(?![가-힣])|t(?![a-z])|tee|긴팔|반팔/i, "티셔츠"],
];
const WORDS = {
  이너: [TOPW, "나시"],
  상의: [TOPW, "상의"],
  "원피스·세트": [[[/세트|set/i, "세트"], [/원피스|ops|드레스/i, "원피스"]], "원피스"],
  아우터: [
    [
      [/무스탕|레더|가죽/, "무스탕"],
      [/패딩|다운|푸퍼/, "패딩"],
      [/코트|트렌치/, "코트"],
      [/가디건/, "가디건"],
      [/베스트|조끼/, "베스트"],
      [/자켓|재킷|점퍼|블레이저|바람막이|야상|아노락|jk|jp/i, "자켓"],
    ],
    "아우터",
  ],
  하의: [[[/스커트|치마|sk(?![a-z])/i, "스커트"], [/데님|청바지|jean/i, "청바지"], [/쇼츠|반바지|숏팬츠/, "반바지"]], "팬츠"],
  신발: [[], "신발"],
  가방: [[], "가방"],
  기타: [[[/모자|캡(?![가-힣])|비니|볼캡/, "모자"], [/머플러|목도리|스카프/, "머플러"], [/양말|삭스|스타킹/, "양말"], [/벨트/, "벨트"]], "소품"],
};
export function typeWord(x) {
  const [list, fall] = WORDS[wearPart(x)] || [[], "소품"];
  // 우리 상품명 먼저 — 신마 긴 이름은 꾸밈말(숏,자켓,점퍼 …)이 많아서
  for (const t of [x?.name, x?.fullName]) for (const [re, w] of list) if (re.test(t || "")) return w;
  return fall;
}

// ---------------------------------------------------------------- 모델 시트 코디 이름 줄 (11/18 밤)
// 세원(방향성 창): "모델에게 보낼 촬영시트 헷갈려. 걍 싹다 코디1처럼 진행해줘. 만약 코디2면 티셔츠 + 카프리팬츠 + 퍼자켓 이렇게 그냥 진행"
//   → 상의 + 하의 + 아우터 순서로 옷 말만(상품명·거래처 X), 잡화(신발·가방·양말·스타킹·벨트 …)는 뺀다. 촬영 창에서 코디마다 고칠 수 있다(촬영 줄 sheetNames).
//   우리 상품명 먼저 읽고, 거기서 두루뭉술한 말(스커트·청바지 …)만 나오면 신마 이름에서 더 자세한 말(미디스커트 …)을 찾는다.
const TOP_SHEET = [
  [/나시|캐미|민소매|슬리브리스|탱크|브라렛|브라탑|뷔스티에|홀터/, "나시"],
  [/가디건|cardigan/i, "가디건"],
  [/집업/, "집업"],
  [/후드/, "후드티"],
  [/맨투맨|스웻|스웨트/, "맨투맨"],
  [/베스트|조끼/, "베스트"],
  [/목폴라|터틀넥|폴라/, "목폴라"],
  [/니트|스웨터|앙고라|knit|(?<![a-z])nt(?![a-z])/i, "니트"],
  [/블라우스|(?<![a-z])bl(?![a-z])/i, "블라우스"],
  [/(?<!티)셔츠|남방|(?<![a-z])sh(?![a-z])/i, "셔츠"],
  [/티셔츠|티(?![가-힣])|(?<![a-z])t(?![a-z])|tee|긴팔|반팔|골지/i, "티셔츠"],
];
const FITS = ["부츠컷", "와이드", "일자", "스트레이트", "벌룬", "하렘", "카고", "스키니", "조거", "트레이닝", "슬랙스"];
function bottomSheet(t) {
  if (/스커트|치마|(?<![a-z])sk(?![a-z])|skirt/i.test(t)) {
    const len = ["미니", "미디", "롱", "맥시"].find((w) => t.includes(w));
    return `${len === "맥시" ? "롱" : len || ""}스커트`;
  }
  if (/반바지|숏\s?팬츠|쇼츠|숏츠|하프\s?팬츠/.test(t)) return "반바지";
  if (/[78]부|카프리/.test(t)) return "카프리팬츠";
  const fit = FITS.find((w) => t.includes(w));
  if (fit === "조거") return "조거팬츠";
  if (fit === "트레이닝") return "트레이닝 팬츠";
  if (fit === "슬랙스") return "슬랙스";
  const shown = fit === "스트레이트" ? "일자" : fit;
  if (/데님|청바지|jean|(?<![가-힣])진(?![가-힣])/i.test(t)) return shown ? `${shown} 청바지` : "청바지";
  if (shown || /팬츠|바지|(?<![a-z])pt(?![a-z])|pants/i.test(t)) return shown ? `${shown} 팬츠` : "팬츠";
  return "";
}
function outerSheet(t) {
  const fur = /(?<![지점])퍼(?!프|후드)|털|모피|무톤|양털|뽀글|보아|\bfur\b/i.test(t);
  if (/레더|가죽/.test(t) && /자켓|재킷|(?<![a-z])jk(?![a-z])/i.test(t)) return "레더자켓";
  if (/무스탕|덤블/.test(t)) return "무스탕";
  if (/패딩|다운|푸퍼/.test(t)) return /조끼|베스트/.test(t) ? "패딩 조끼" : `${["숏", "롱", "경량"].find((w) => t.includes(w)) || ""}패딩`;
  if (/코트|트렌치|(?<![a-z])ct(?![a-z])/i.test(t)) {
    if (/트렌치/.test(t)) return "트렌치코트";
    const len = ["롱", "하프", "숏", "미디"].find((w) => t.includes(w));
    return len ? `${len}코트` : fur ? "퍼코트" : "코트";
  }
  if (/항공/.test(t)) return "항공점퍼";
  if (/바람막이|아노락/.test(t)) return "바람막이";
  if (/야상/.test(t)) return "야상";
  if (/블레이저/.test(t)) return "블레이저";
  if (/가디건/.test(t)) return "가디건";
  if (/조끼|베스트/.test(t)) return "베스트";
  if (/자켓|재킷|점퍼|(?<![a-z])(jk|jp)(?![a-z])/i.test(t)) {
    if (fur) return "퍼자켓";
    const d = ["누빔", "데님", "트위드", "코듀로이", "골덴", "울"].find((w) => t.includes(w));
    return d ? `${d === "골덴" ? "코듀로이" : d}자켓` : /점퍼|(?<![a-z])jp(?![a-z])/i.test(t) ? "점퍼" : "자켓";
  }
  return "";
}
const SHEET_PICK = {
  이너: (t) => TOP_SHEET.find(([re]) => re.test(t))?.[1] || "",
  상의: (t) => TOP_SHEET.find(([re]) => re.test(t))?.[1] || "",
  "원피스·세트": (t) => (/세트|set/i.test(t) ? "세트" : /원피스|ops|드레스/i.test(t) ? "원피스" : ""),
  하의: bottomSheet,
  아우터: outerSheet,
};
const SHEET_FALL = { 이너: "나시", 상의: "상의", "원피스·세트": "원피스", 하의: "팬츠", 아우터: "아우터" };
// 상의는 우리 상품명 말 그대로(신마 이름엔 '후드·이너' 같은 꾸밈말이 많다) — 하의·아우터만 두루뭉술하면 신마 이름을 더 본다
const VAGUE = new Set(["스커트", "팬츠", "청바지", "코트", "자켓", "점퍼", "패딩", "상의", "아우터"]);
/** 모델 시트에 쓰는 옷 말 하나 — 잡화면 "" */
// 종류 칸이 '상의'로 들어와도 잡화인 것(니트 장갑 …) — 이름 끝 말로만('벨트 세트 … 스커트' · '…벨트하프코트' 는 옷)
const GOODS = /(장갑|머플러|목도리|비니|모자|볼캡|양말|삭스|스타킹|타이즈|레그워머|벨트|가방|(?<![가-힣])백)(\s*[A-Za-z0-9#-]*)\s*$/;
export function sheetWord(x) {
  if (GOODS.test(x?.name || "")) return "";
  const p = wearPart(x);
  const pick = SHEET_PICK[p];
  if (!pick) return "";
  const a = pick(x?.name || "");
  if (a && !VAGUE.has(a)) return a;
  const b = pick(x?.fullName || "");
  if (b && (!a || !VAGUE.has(b))) return b;
  return a || b || SHEET_FALL[p];
}
/** 코디 이름 줄(자동) — 상의(안쪽부터) + 하의 + 아우터. 예: 티셔츠 + 카프리팬츠 + 퍼자켓 */
export function codiLabel(c, items) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  const lows = its.filter((x) => wearPart(x) === "하의");
  const outs = its.filter((x) => wearPart(x) === "아우터");
  const ws = [...topsInOrder(c, items), ...lows, ...outs].map(sheetWord).filter(Boolean);
  return ws.filter((w, i) => w !== ws[i - 1]).join(" + ");
}
/** 시트에 보이는 코디 이름 — 촬영 창에서 고친 말(촬영 줄 sheetNames) 먼저 */
export const sheetName = (day, c, items) => String(day?.sheetNames?.[c?.id] || "").trim() || codiLabel(c, items);

// 11/24 찍어주는 컷 · 셀카 나누기 — 세원(방향성 창): "촬영 시작을 누르면 셀카랑 찍어주는 컷이랑 분리되게 만들어줄 수 있어? 보통 우리가 먼저 찍어주고 태은씨나 주현씨한테 셀카 찍으라고 주거든."
//   → 겹마다 찍어주는 컷을 먼저 다 찍고, 그다음 그 겹 셀카(폰을 모델에게) → 그 겹 영상. 촬영 날 화면(PoseRun.ShootRun)은 위에 '찍어주는 컷 · 셀카' 칸으로 나눠 보인다.
//   11/24 밤 바뀜: 셀카는 겹마다가 아니라 코디 맨 뒤에 다 모음(runOrder 아래 — 세원 "셀카는 그냥 맨 뒤로 다 모였으면").
//   셀카인지 = 카드 찍는 방식(shot) → 없으면 묶음(SELFIE·FULL 셀카 · TOP·BTM 찍어주는) → 사무실 PC 사진 낱말(pose_ai shot) → 찍어주는 컷.
//   이 코디만 사진은 설명에 '셀카'가 있으면 셀카.
export const KIND_NAME = { photo: "찍어주는 컷", selfie: "셀카" };
export function shotKindOf(k, group, ai = null) {
  const s = k?.shot || k?.sec?.shot || "";
  if (s === "거울 셀카") return "selfie";
  if (s === "찍어주는 컷") return "photo";
  if (group === "SELFIE" || group === "FULL") return "selfie";
  if (group === "TOP" || group === "BTM") return "photo";
  const a = ai?.cards?.[k?.id]?.shot || "";
  if (/셀카/.test(a)) return "selfie";
  return /셀카/.test(`${k?.title || ""} ${k?.sec?.text || ""}`) ? "selfie" : "photo";
}

/** 포즈 카드 → 묶음(TOP·SELFIE·BTM·FULL·OUTER). 모르면 "" */
export function groupOf(k) {
  if (!k) return "";
  const m = String(k.code || k.title || "").match(/^\s*☀?\s*(TOP|SELFIE|BTM|FULL|OUTER)\b/i);
  if (m) return m[1].toUpperCase();
  const fits = k.fits || [];
  const selfie = k.shot === "거울 셀카" || /셀카/.test(`${k.title || ""} ${k.sec?.text || ""}`);
  if (fits.some((t) => t.startsWith("아우터"))) return "OUTER";
  if (fits.includes("상의")) return selfie ? "SELFIE" : "TOP";
  if (fits.some((t) => t === "하의" || t.startsWith("하의:"))) return "BTM";
  if (fits.includes("전신")) return "FULL";
  return "";
}

/**
 * 코디 → 겹 [{n, add:[상품], wear:[상품](여기까지 입은 것), groups:[묶음], kind:'first'|'top'|'outer', last}]
 */
export function wearSteps(c, items) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  const part = (x) => wearPart(x);
  const tops = topsInOrder(c, items); // 이너 → 원피스·세트 → 상의 → 겹쳐 입는 상의(lib/poses)
  const outers = its.filter((x) => part(x) === "아우터");
  // 양말·스타킹·벨트는 하의·신발과 같이 첫 겹에, 가방·모자·머플러 같은 소품은 마지막 겹에
  const low = (x) => ["하의", "신발"].includes(part(x)) || (part(x) === "기타" && LOW_ETC.test(`${x.name || ""} ${x.fullName || ""}`));
  const lower = its.filter(low);
  const extra = its.filter((x) => ["가방", "기타"].includes(part(x)) && !low(x));
  const layers = [];
  if (tops.length || lower.length) layers.push({ kind: "first", add: [...tops.slice(0, 1), ...lower] });
  for (const x of tops.slice(1)) layers.push({ kind: "top", add: [x] });
  for (const x of outers) layers.push({ kind: "outer", add: [x] });
  if (!layers.length) layers.push({ kind: "first", add: [] });
  layers[layers.length - 1].add.push(...extra);
  const hasTop = tops.length > 0;
  const lastOuter = layers.map((l) => l.kind).lastIndexOf("outer");
  let wear = [];
  return layers.map((l, i) => {
    wear = [...wear, ...l.add];
    const last = i === layers.length - 1;
    const g = [];
    if (l.kind !== "outer" && hasTop) g.push("TOP", "SELFIE");
    if (l.kind === "first") g.push("BTM");
    if (i === lastOuter) g.push("OUTER");
    if (last) g.push("FULL");
    return { n: i + 1, kind: l.kind, add: l.add, wear, groups: g, last };
  });
}

/** 겹 영상 이름 */
export function videoOf(step, steps, word = typeWord) {
  if (step.last) return steps.length > 1 ? "다 입은 영상 · 거울에 붙었다 물러나기 · 멀리서 전신" : "영상 · 거울에 붙었다 물러나기 · 멀리서 전신";
  if (step.kind === "first") return "이 상태로 영상";
  const w = step.add.map(word).filter(Boolean)[0];
  return w ? `${w} 입은 영상` : "이 상태로 영상";
}

/** 겹 이름 — 첫 겹은 입는 것 전부, 그다음은 '+ 더 입는 것' */
export const stepLabel = (step, word = typeWord) => {
  const ws = [...new Set(step.add.map(word))];
  if (!ws.length) return step.n === 1 ? "기본" : "";
  return step.n === 1 ? ws.join(" + ") : "+ " + ws.join(" + ");
};

/**
 * 촬영 날 순서 — 겹마다 찍을 사진(포즈판에서 고른 사진을 묶음으로 나눔) + 영상
 * cards = 포즈판 카드(poseDeck 모양), 돌려주는 shots 는 겹 순서 그대로 한 줄: {…shotsOf 한 장, group, step, doneKey, done}
 * 묶음을 모르는 카드 · 이 코디만 사진은 마지막 겹 끝에.
 */
export function runOrder(day, c, cards, items) {
  const steps = wearSteps(c, items);
  const base = shotsOf(day, c, cards, items).shots;
  const byId = new Map(cards.map((k) => [k.id, k]));
  const done = new Set(day?.poseDone?.[c.id] || []);
  const withGroup = base.map((x) => {
    const group = x.own ? "" : groupOf(byId.get(x.cardId));
    const kind = x.own ? (/셀카/.test(x.cap || "") ? "selfie" : "photo") : shotKindOf(byId.get(x.cardId), group, poseAi());
    return { ...x, group, kind };
  });
  const known = new Set(steps.flatMap((s) => s.groups));
  const shots = [];
  // 11/18 상의 겹마다 그 겹 상의에 맞는 TOP 카드(lib/poses topLayerMap) — 나시 겹엔 TOP › 나시, 티셔츠 겹엔 세부 없는 TOP.
  //   상의 겹 순서 = topsInOrder 순서(첫 겹 = 첫 상의). 세부 카드가 없으면 예전처럼 TOP 카드가 상의 겹마다 다 나온다
  const topSteps = steps.filter((s) => s.groups.includes("TOP"));
  const topCards = [...new Set(withGroup.filter((x) => x.group === "TOP").map((x) => x.cardId))].map((id) => byId.get(id)).filter(Boolean);
  const layerOf = topLayerMap(topCards, topsInOrder(c, items));
  const onStep = (x, s) => x.group !== "TOP" || !layerOf.has(x.cardId) || layerOf.get(x.cardId).includes(topSteps.indexOf(s));
  const seen = new Set();
  const selfies = []; // 11/24 밤 셀카는 코디 맨 뒤로(아래)
  for (const s of steps) {
    const mine = [];
    for (const g of s.groups) for (const x of withGroup) if (x.group === g && onStep(x, s)) mine.push(x);
    if (s.last) for (const x of withGroup) if (!x.group || !known.has(x.group)) mine.push(x);
    // 11/17 밤 짝(pose.pair) — '셀카 찍고 한두 걸음 뒤로 → 전신': 같은 겹에 짝 카드가 있으면 그 카드 사진 바로 뒤로
    const pairOf = (x) => byId.get(x.cardId)?.sec?.pose?.pair || "";
    const has = (id) => id && mine.some((y) => y.cardId === id && !pairOf(y));
    const lead = mine.filter((x) => !has(pairOf(x)));
    for (const x of mine) {
      const pr = pairOf(x);
      if (!has(pr)) continue;
      const at = lead.findLastIndex((y) => y.cardId === pr || pairOf(y) === pr);
      lead.splice(at + 1, 0, x);
    }
    // 11/24 찍어주는 컷 먼저 → 셀카(폰을 모델에게). 같은 쪽 안에서는 묶음 순서 · 짝 순서 그대로
    mine.splice(0, mine.length, ...lead.filter((x) => x.kind !== "selfie"), ...lead.filter((x) => x.kind === "selfie"));
    // 처음 나오는 사진은 키 그대로(예전 찍음 표시와 이어진다), 같은 사진이 다음 상의 겹에 또 나오면 겹 번호를 붙인다
    //   찍음 표시 키(doneKey)는 예전처럼 겹 순서대로 세고(이미 찍은 표시가 안 풀리게), 셀카만 따로 모은다
    for (const x of mine) {
      const doneKey = seen.has(x.key) ? `s${s.n}|${x.key}` : x.key;
      seen.add(x.key);
      const row = { ...x, step: s.n, layer: s.n, doneKey, done: doneKey === x.key ? x.done : done.has(doneKey) };
      (x.kind === "selfie" ? selfies : shots).push(row);
    }
  }
  // 11/24 밤 세원: "포즈판 촬영 시작 누르면 셀카는 그냥 맨 뒤로 다 모였으면 좋겠어" — 겹마다 셀카를 끼우지 않고 코디 맨 뒤(마지막 겹 찍어주는 컷 다음)에 한꺼번에.
  //   step = 마지막 겹(화면은 마지막 겹 '셀카' 칸에 다 모임), layer = 원래 겹(어느 옷 상태 셀카인지 ①② 표시). 마지막 겹 영상은 셀카까지 다 찍은 뒤.
  const lastN = steps[steps.length - 1]?.n || 1;
  for (const x of selfies) shots.push({ ...x, step: lastN });
  const out = steps.map((s) => ({ ...s, video: videoOf(s, steps), vidKey: `vid:${s.n}`, vidDone: done.has(`vid:${s.n}`), shots: shots.filter((x) => x.step === s.n) }));
  return { steps: out, shots };
}

/** 찍음 켜고 끄기 — 사진(doneKey) · 겹 영상(vid:n). 고른 포즈도 그대로 굳힌다(추천이 바뀌어도 찍던 목록이 안 흔들리게) */
export function flipRun(day, c, cards, items, key) {
  const { ids } = shotsOf(day, c, cards, items);
  let cur = [...(day?.poseDone?.[c.id] || [])];
  // 예전 찍음 표시 중 카드 id(카드 사진 전부 찍음)는 사진 키로 풀어 둔다 — 한 장만 풀 수 있게
  const byId = new Map(cards.map((k) => [k.id, k]));
  cur = cur.flatMap((x) => (byId.has(x) ? (byId.get(x).sec.photos || []).map((p) => p.key).filter(Boolean) : [x]));
  const set = new Set(cur);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return { posePicks: { ...(day.posePicks || {}), [c.id]: ids }, poseDone: { ...(day.poseDone || {}), [c.id]: [...set] } };
}
