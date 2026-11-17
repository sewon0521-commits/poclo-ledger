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
import { shotsOf } from "./poses";

export const GROUPS = ["TOP", "SELFIE", "BTM", "FULL", "OUTER"];
export const GROUP_NAME = { TOP: "상의", SELFIE: "상의 셀카", BTM: "하의", FULL: "전신", OUTER: "아우터" };

const LOW_ETC = /양말|삭스|스타킹|타이즈|레그워머|벨트/;
/** 다른 상의 위에 겹쳐 입는 상의 */
const OVER_TOP = /니트|가디건|집업|후드|맨투맨|스웻|베스트|조끼|스웨터|폴라|스웨트|앙고라|cardigan|knit/i;

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

/** 포즈 카드 → 묶음(TOP·SELFIE·BTM·FULL·OUTER). 모르면 "" */
export function groupOf(k) {
  if (!k) return "";
  const m = String(k.code || k.title || "").match(/^\s*☀?\s*(TOP|SELFIE|BTM|FULL|OUTER)\b/i);
  if (m) return m[1].toUpperCase();
  const fits = k.fits || [];
  const selfie = k.shot === "거울 셀카" || /셀카/.test(`${k.title || ""} ${k.sec?.text || ""}`);
  if (fits.some((t) => t.startsWith("아우터"))) return "OUTER";
  if (fits.includes("상의")) return selfie ? "SELFIE" : "TOP";
  if (fits.includes("하의")) return "BTM";
  if (fits.includes("전신")) return "FULL";
  return "";
}

/**
 * 코디 → 겹 [{n, add:[상품], wear:[상품](여기까지 입은 것), groups:[묶음], kind:'first'|'top'|'outer', last}]
 */
export function wearSteps(c, items) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  const part = (x) => wearPart(x);
  const tops = its
    .map((x, i) => ({ x, i, r: part(x) === "이너" ? 0 : part(x) === "원피스·세트" ? 1 : OVER_TOP.test(`${x.name || ""} ${x.fullName || ""}`) ? 3 : 2 }))
    .filter((o) => ["이너", "상의", "원피스·세트"].includes(part(o.x)))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((o) => o.x);
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
  const withGroup = base.map((x) => ({ ...x, group: x.own ? "" : groupOf(byId.get(x.cardId)) }));
  const known = new Set(steps.flatMap((s) => s.groups));
  const shots = [];
  const topSteps = steps.filter((s) => s.groups.includes("TOP"));
  for (const s of steps) {
    const mine = [];
    for (const g of s.groups) for (const x of withGroup) if (x.group === g) mine.push(x);
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
    mine.splice(0, mine.length, ...lead);
    // 첫 겹 · 묶음이 한 번만 나오는 사진은 키 그대로(예전 찍음 표시와 이어진다), 두 번째 상의 겹부터는 겹 번호를 붙인다
    const again = (x) => (x.group === "TOP" || x.group === "SELFIE") && topSteps[0] && topSteps[0].n !== s.n;
    for (const x of mine) {
      const doneKey = again(x) ? `s${s.n}|${x.key}` : x.key;
      shots.push({ ...x, step: s.n, doneKey, done: doneKey === x.key ? x.done : done.has(doneKey) });
    }
  }
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
