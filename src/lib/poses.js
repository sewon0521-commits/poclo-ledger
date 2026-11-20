// 포즈 판 (11/16) — 세원(방향성 창): "촬영 중요한데 포즈 레퍼런스 어디서 확인하는지 알려주고 이것도 굉장히 중요해. → 각 코디마다 포즈를 정해야 하니까."
//   + "코디를 짜서 촬영 관리에 넣으면 너가 넣어 준다는 거지?" → 세원은 코디만 넣고, 포즈는 옷 종류로 먼저 골라 둔다(추천). 세원은 보고 바꾸기만.
//
// 포즈 카드 = 모델 레퍼런스(settings model_refs) 모음의 칸 하나. 칸에 pose {code, fits, why, src, ok} 가 붙은 칸만 포즈 카드다.
//   fits = 이 포즈가 맞는 옷 자리 ["전신" | "아우터" | "상의" | "하의"] — 추천에 쓴다.
//   why · src = 고른 이유 · 원본(쇼핑몰·상품·주소) — 우리만 본다. 모델 시트엔 title · text · photos 만 간다(lib/shootSheet sectionsData 가 고른 칸만 담음).
//   ok = 세원 확인: true = OK(모델 시트에 감) · false = 뺌(판에서 숨김, 데이터는 남김) · 없음 = 확인 전(판엔 보이고 시트엔 안 감).
//   모음의 poseOn = 이 포즈를 쓸 촬영일 — 촬영 창 포즈 판이 처음에 이 날짜 모음을 칸으로 깐다(촬영 줄 poseSetIds 로 바꿀 수 있음).
//
// 고른 것은 촬영 줄(settings shoot_days)에 — posePicks {코디 id: [칸 id]} · poseDone {코디 id: [칸 id]}(촬영 날 찍은 것).
//   posePicks 에 그 코디가 없으면 = 아직 안 건드림 → 추천을 보여 주고(저장은 안 함), 세원이 한 칸이라도 누르면 그때부터 그 코디는 고른 그대로.
import { wearPart } from "./shoot";
import { smartPick, recoQOf } from "./poseReco";

export const FITS = ["전신", "아우터", "상의", "하의"];

/** 포즈 카드가 든 모음인지 */
export const isPoseSet = (x) => (x?.sections || []).some((s) => s.pose);

// ---------------------------------------------------------------- 포즈 칸 (11/17)
// 세원(방향성 창): "모델 레퍼런스 칸에 넣은 건 그대로 냅두고, 촬영 관리 안에 소싱 관리처럼 '포즈' 버튼 만들어서 포즈 카테고리 모델 레퍼런스처럼 나누고
//   거기서 제대로 만들어서 포즈판에서 고를 수 있게"
// → settings shoot_poses {folders:[{id, name, parent}], items:[포즈 카드], cats?(첫 판 카테고리 — 안 씀)}. 카드 = 모델 레퍼런스 칸과 같은 모양
//   {id, title, text, photos:[{key, cap, refId}], folderId, shot(찍는 방식), pose:{code, fits, why, src, ok}, from?, createdAt} — 고치기는 같은 SectionEdit.
//   모델 레퍼런스의 P1~P16 은 같은 id · 같은 사진 파일로 복사했다(11/17) — 그래서 촬영 줄의 posePicks · poseDone 이 끊기지 않는다. 모델 레퍼런스 쪽은 그대로.
// 11/17 저녁 세원: "실내 - 아우터, 상의, 하의, 전신, 앉은컷 / 야외 - 같은 것, 그 안에 상의면 반팔, 긴팔티, 니트 … 거울셀카, 찍어주는 컷으로 나눌까?"
//   → 폴더 세 단계(릴스·촬영 레퍼런스와 같은 FolderBits: 실내/야외 › 옷 종류 › 세부) + 찍는 방식은 폴더 말고 칩(shot).
//   맨 위 '실내'(pf_in) · '야외'(pf_out) 는 id 로 알아본다(이름을 바꿔도 된다). 카드가 어느 쪽인지 = place "in" | "out"(폴더 없으면 실내).
// 포즈판: 카드는 전부에서 고를 수 있고(posePicks), 추천만 그 촬영 쪽(바깥 촬영이면 야외, 아니면 실내) 카드에서 한다(picksOf).
//   예전 poseSetIds(모델 레퍼런스 모음 고르기) · poseCats(첫 판 카테고리 칩)는 이제 안 본다.
export const POSES_KEY = "shoot_poses";
export const IN_ID = "pf_in";
export const OUT_ID = "pf_out";
export const SHOTS = ["거울 셀카", "찍어주는 컷"];
// 11/17 밤 1군 포즈(세원이 오브나인 후보판에서 고름) — 폴더 v3: 실내/야외 › TOP · SELFIE · BTM · FULL · OUTER, **세부는 OUTER 만**(코트·패딩·무스탕·퍼·자켓 — 부피·기장에 따라 포즈가 달라서).
//   상의 반팔·긴팔티·니트 같은 세부는 없앴다(같은 포즈로 다 돼서 나누면 고르기만 어려움). 예전 P1~P18 · 앉은컷은 맨 위 '예전 포즈'(pf_old) — 추천엔 안 쓰고, 이미 고른 촬영은 그대로 이어진다.
// 이름 = 묶음·번호(TOP·1 · SELFIE·2 · BTM·예비1 · OUTER·패딩1) 또는 예전 P번호. 카드 pose 에 spare(예비 — 추천 안 함) · only("가방" — 코디에 가방이 있을 때만 추천) · pair(짝 카드 id — 촬영 날 그 카드 바로 뒤).
export const OLD_ID = "pf_old";
export const GROUP_ORDER = ["TOP", "SELFIE", "BTM", "FULL", "OUTER"];
// 야외 카드는 이름 앞 ☀ (☀TOP·1)
export const CODE_RE = /^\s*(☀?\s*(?:P\d+|(?:TOP|SELFIE|BTM|FULL|OUTER)·\S+))\s*/i;
/** 이름 앞 번호 — 'TOP·1 정면 상반신' → 'TOP·1' */
export const codeOfTitle = (t) => (String(t || "").match(CODE_RE)?.[1] || "").toUpperCase();
/** 번호 뗀 이름 */
export const stripCode = (t) => String(t || "").replace(CODE_RE, "");
const KINDS = [
  ["top", "TOP"],
  ["selfie", "SELFIE"],
  ["bottom", "BTM"],
  ["full", "FULL"],
  ["outer", "OUTER"],
];
// 11/18 세원: "이러면 걍 카테고리 나눠도 될 것 같아. 바텀도 치마랑 팬츠 이렇게 나뉘니까" → BTM 도 OUTER 처럼 세부(치마 · 팬츠).
//   어느 쪽에나 맞는 포즈(앉은 컷 등)는 BTM 바로 아래 = 공통. 이름 BTM·치마1 · BTM·팬츠1, 공통은 BTM·1, 예비는 BTM·예비1.
const BTM_SUBS = [
  ["skirt", "치마"],
  ["pants", "팬츠"],
];
const OUTER_SUBS = [
  ["coat", "코트"],
  ["pad", "패딩"],
  ["mustang", "무스탕"],
  ["fur", "퍼"],
  ["jk", "자켓"],
];
/** 처음 폴더 — 실내/야외 › TOP·SELFIE·BTM·FULL·OUTER, BTM › 치마·팬츠, OUTER › 코트·패딩·무스탕·퍼·자켓 */
export function seedPoseFolders() {
  const out = [];
  for (const [pid, pname] of [
    [IN_ID, "실내"],
    [OUT_ID, "야외"],
  ]) {
    out.push({ id: pid, name: pname, parent: null });
    for (const [k, name] of KINDS) {
      const id = `${pid}_${k}`;
      out.push({ id, name, parent: pid });
      if (k === "outer") for (const [s, n] of OUTER_SUBS) out.push({ id: `${id}_${s}`, name: n, parent: id });
      if (k === "bottom") for (const [s, n] of BTM_SUBS) out.push({ id: `${id}_${s}`, name: n, parent: id });
    }
  }
  return out;
}
export const poseFoldersOf = (lib) => (lib?.folders?.length ? lib.folders : seedPoseFolders());
export const shotsOfLib = (lib) => (lib?.shots?.length ? lib.shots : SHOTS);
/** 이 폴더가 실내/야외 어느 쪽인지 */
export function placeOfFolder(id, folders) {
  let f = folders.find((x) => x.id === id);
  for (let i = 0; f && f.parent && i < 5; i++) f = folders.find((x) => x.id === f.parent);
  return f?.id === OUT_ID ? "out" : f?.id === OLD_ID ? "old" : "in";
}
export const placeOfDay = (day) => (day?.outdoor?.on ? "out" : "in");
const SUB_ORDER = ["나시", "반팔", "긴팔티", "니트", "셔츠", "치마", "팬츠", "코트", "패딩", "무스탕", "퍼", "자켓"];
/** 카드 순서 값 — TOP → SELFIE → BTM → FULL → OUTER(묶음 안은 공통 → 세부 → 번호, 야외 · 예비는 뒤) → 예전 P번호 → 번호 없는 것 */
const codeNo = (s) => {
  const raw = String(s?.pose?.code || codeOfTitle(s?.title) || "").toUpperCase();
  const out = raw.startsWith("☀");
  const c = raw.replace(/^☀\s*/, "");
  const g = GROUP_ORDER.findIndex((x) => c.startsWith(x + "·"));
  const n = Number(c.match(/(\d+)\s*$/)?.[1] || 999);
  const sub = SUB_ORDER.indexOf(c.match(/·([^\d·]+?)(?:예비)?\d+\s*$/)?.[1] || "");
  if (g >= 0) return (g + 1) * 10000 + (out ? 4000 : 0) + (/예비/.test(c) ? 2000 : 0) + (sub >= 0 ? (sub + 1) * 100 : 0) + n;
  const p = c.match(/^P(\d+)$/);
  return p ? 100000 + Number(p[1]) : 1e6;
};

// ---------------------------------------------------------------- 번호 자동 (11/17 밤 세원: "포즈 순서 변경할 수 있게, 변경하면 왼쪽 상단 이름 자동으로")
// 번호 범위 = 묶음 폴더(TOP · SELFIE · BTM · FULL) 하나, OUTER · BTM 은 세부 폴더마다(OUTER·패딩1 · BTM·치마1). 야외는 앞에 ☀. 예비는 'BTM·예비1'로 따로.
// 예전 포즈 · 미분류는 번호를 안 건드린다. 고른 값(posePicks · 짝 pair)은 카드 id 로 이어져서 이름이 바뀌어도 안 끊긴다.
const pathTo = (id, folders) => {
  const out = [];
  let f = folders.find((x) => x.id === id);
  for (let i = 0; f && i < 6; i++, f = f.parent && folders.find((x) => x.id === f.parent)) out.unshift(f);
  return out;
};
/** 이 폴더의 묶음 이름(TOP · SELFIE · BTM · FULL · OUTER) — 없으면 "" */
export const folderGroup = (folderId, folders) => pathTo(folderId, folders).map((f) => String(f.name).toUpperCase()).find((n) => GROUP_ORDER.includes(n)) || "";
/** 번호 앞부분 — 'TOP·' · '☀BTM·' · 'OUTER·패딩'. 번호를 안 매기는 폴더면 null */
export function codePrefix(folderId, folders) {
  const path = pathTo(folderId, folders);
  if (!path.length || path[0].id === OLD_ID) return null;
  const gi = path.findIndex((f) => GROUP_ORDER.includes(String(f.name).toUpperCase()));
  if (gi < 0) return null;
  const g = String(path[gi].name).toUpperCase();
  // 11/18 TOP › 나시 도 세부 번호(TOP·나시1) — 예전엔 OUTER · BTM 만 세부를 붙여서 나시 카드가 TOP·1~4 로 TOP 카드와 겹쳤다
  const sub = path[gi + 1] ? path[gi + 1].name : "";
  return `${path[0].id === OUT_ID ? "☀" : ""}${g}·${sub}`;
}
/** 묶음마다 찍는 방식 — TOP·BTM 찍어주는 컷, SELFIE·FULL 거울 셀카. OUTER 는 카드마다 고른다("") */
export const shotOfGroup = (g) => ({ SELFIE: "거울 셀카", FULL: "거울 셀카", TOP: "찍어주는 컷", BTM: "찍어주는 컷" })[g] || "";
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * 폴더들 번호 다시 매기기 — order = {폴더 id: [카드 id 순서]}(없으면 지금 순서 byCode).
 * 바뀐 이름은 다른 카드의 이름 · 설명 속 글자(예: 'SELFIE·1 짝')도 같이 바꾼다.
 */
export function renumber(items, folderIds, folders, order = {}) {
  const rename = new Map();
  const next = items.map((x) => ({ ...x }));
  for (const fid of new Set(folderIds)) {
    const pre = codePrefix(fid, folders);
    if (pre === null) continue;
    const mine = next.filter((x) => x.folderId === fid);
    const ids = order[fid] || [...mine].sort(byCode).map((x) => x.id);
    let n = 0;
    let sp = 0;
    for (const id of ids) {
      const x = mine.find((y) => y.id === id);
      if (!x?.pose) continue;
      const code = x.pose.spare ? `${pre}예비${++sp}` : `${pre}${++n}`;
      const was = x.pose.code || codeOfTitle(x.title);
      if (was === code) continue;
      if (was) rename.set(was, code);
      x.pose = { ...x.pose, code };
      x.title = `${code} ${stripCode(x.title).trim()}`.trim();
    }
  }
  if (!rename.size) return next;
  // 다른 카드 글 속 이름 — 한 번에 바꿔서 'SELFIE·1 → SELFIE·2 → …' 처럼 이어 바뀌지 않게
  const re = new RegExp(`(${[...rename.keys()].sort((a, b) => b.length - a.length).map(esc).join("|")})(?![0-9])`, "g");
  const swap = (t) => String(t || "").replace(re, (m) => rename.get(m) || m);
  return next.map((x) => {
    const head = codeOfTitle(x.title);
    const rest = stripCode(x.title);
    const title = head ? `${head} ${swap(rest).trim()}`.trim() : swap(x.title);
    const text = swap(x.text);
    return title === x.title && text === (x.text || "") ? x : { ...x, title, text };
  });
}
/** 카드 순서 — 묶음·번호 순, 번호 없는 건 뒤(만든 순) */
export const byCode = (a, b) => codeNo(a) - codeNo(b) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
/** 포즈 칸 카드 전부 — poseCards 모양({cards, hidden}) + place · folderId · shot */
export function poseDeck(lib) {
  const folders = poseFoldersOf(lib);
  const items = (lib?.items || []).filter((s) => s.pose).sort(byCode);
  // sub = 묶음 폴더 바로 아래 세부 폴더 이름(TOP › 나시 · BTM › 치마 · OUTER › 패딩) — 11/18 진짜 추천이 TOP 세부를 그 옷이 있을 때만 쓴다
  const subOf = (fid) => {
    const path = pathTo(fid, folders);
    const gi = path.findIndex((f) => GROUP_ORDER.includes(String(f.name).toUpperCase()));
    return gi >= 0 && path[gi + 1] ? path[gi + 1].name : "";
  };
  const add = (k) => ({ ...k, folderId: k.sec.folderId || "", place: placeOfFolder(k.sec.folderId, folders), shot: k.sec.shot || "", sub: subOf(k.sec.folderId) });
  const { cards, hidden } = poseCards([{ id: POSES_KEY, sections: items }]);
  return { cards: cards.map(add), hidden: hidden.map(add) };
}
/** 이 촬영 포즈판 카드 — 전부(고르기는 어디서든). 추천은 picksOf 가 촬영 쪽(실내/야외) 카드에서만 */
export const posePool = (day, lib) => poseDeck(lib);
/** 이 코디 '+ 포즈' 창을 처음 열 폴더 — 촬영 쪽 › 코디 옷 종류(아우터 > 상의 > 하의 > 전신) › 상품 이름에 든 세부(니트·반팔 …) */
//   카드가 하나도 없는 폴더는 건너뛴다(빈 '니트' 폴더부터 열리면 아무것도 못 고른다) — cards 를 주면
export function codiFolder(c, items, folders, place, cards = null) {
  const top = place === "out" ? OUT_ID : IN_ID;
  const under = (fid, id) => {
    if (!fid) return id === IN_ID; // 폴더 없는 카드는 실내로
    let x = folders.find((y) => y.id === fid);
    for (let i = 0; x && i < 6; i++, x = x.parent && folders.find((y) => y.id === x.parent)) if (x.id === id) return true;
    return false;
  };
  const has = (id) => !cards || cards.some((k) => under(k.folderId, id));
  const f = codiFits(c, items);
  const its = (c?.itemIds || []).map((id) => (items || []).find((y) => y.id === id)).filter(Boolean);
  const names = its.map((x) => `${x.name || ""} ${x.fullName || ""}`).join(" ");
  // 11/17 밤 폴더 이름이 TOP·BTM·FULL·OUTER 로 바뀜 — 예전 이름(상의·하의·전신·아우터)도 찾는다
  const NAMES = { 아우터: ["OUTER", "아우터"], 상의: ["TOP", "상의"], 하의: ["BTM", "하의"], 전신: ["FULL", "전신"] };
  const types = [...its.flatMap(outerTypes), ...its.flatMap(bottomTypes)].map((t) => t.split(":")[1]);
  const order = [f.has("아우터") && "아우터", f.has("상의") && "상의", f.has("하의") && "하의", "전신"].filter(Boolean);
  for (const kind of order) {
    const cat = folders.find((x) => x.parent === top && NAMES[kind].includes(x.name));
    if (!cat || !has(cat.id)) continue;
    const subs = folders.filter((x) => x.parent === cat.id && has(x.id));
    const sub = subs.find((x) => types.includes(x.name)) || subs.find((x) => names.includes(x.name) || (x.name === "긴팔티" && /긴팔/.test(names)));
    return (sub || cat).id;
  }
  return folders.some((x) => x.id === top) && has(top) ? top : "all";
}
/** 포즈 칸 카드 하나의 확인(OK · 확인 전 · 뺌) */
export const setLibOk = (id, ok) => (v) => ({
  ...v,
  items: (v.items || []).map((s) => {
    if (s.id !== id) return s;
    const { ok: _was, ...rest } = s.pose || {};
    return { ...s, pose: ok === undefined ? rest : { ...rest, ok } };
  }),
});

/** 이 촬영의 포즈 모음 — 고른 게 있으면 그것, 없으면 촬영일과 poseOn 이 같은 모음 */
export function poseSetsFor(day, sets) {
  const all = (sets || []).filter(isPoseSet);
  if (Array.isArray(day?.poseSetIds)) return day.poseSetIds.map((id) => all.find((x) => x.id === id)).filter(Boolean);
  return all.filter((x) => day?.on && x.poseOn === day.on);
}

/** 포즈 카드 목록 — 뺀 것(ok === false)은 hidden 으로 따로 */
export function poseCards(sets) {
  const cards = (sets || []).flatMap((x) =>
    (x.sections || [])
      .filter((s) => s.pose)
      .map((s) => ({ id: s.id, setId: x.id, code: s.pose.code || "", title: (s.title || "").trim(), fits: s.pose.fits || [], ok: s.pose.ok, sec: s })),
  );
  return { cards: cards.filter((c) => c.ok !== false), hidden: cards.filter((c) => c.ok === false) };
}

// 아우터 종류 (11/16 세원: "아우터 포즈 개빡이야. 코트, 패딩, 무스탕 등등 카테고리별로") — 종류 포즈 카드는 fits ["아우터:코트"] 처럼.
// 상품 이름으로 종류를 읽어 그 종류 카드만 추천한다. fits ["아우터"] 카드(종류 없는 것)는 아우터면 다 추천.
export const OUTER_TYPES = [
  { t: "무스탕", re: /무스탕|레더|가죽|덤블/ },
  { t: "패딩", re: /패딩|다운|푸퍼/ },
  { t: "퍼", re: /(?<!지)퍼\s?(자켓|재킷|점퍼|코트|베스트|jk)|에코퍼|페이크퍼|(^|\s)퍼(\s|$)|\bfur\b/i },
  { t: "코트", re: /코트|트렌치|(?<![a-z])ct(?![a-z])/i },
  { t: "자켓", re: /자켓|재킷|점퍼|블레이저|바람막이|야상|아노락|ma-?1|(?<![a-z])(jk|jp)(?![a-z])/i },
];
/** 아우터 종류 하나 — 우리 상품명 먼저(신마 긴 이름은 꾸밈말이 많아 여러 종류에 걸린다), 앞 순서가 먼저('퍼 자켓' = 퍼 · '무스탕 코트' = 무스탕) */
export function outerTypes(x) {
  for (const s of [x?.name, x?.fullName]) {
    const o = OUTER_TYPES.find((o) => o.re.test(s || ""));
    if (o) return ["아우터:" + o.t];
  }
  return [];
}

// 하의 종류 (11/18 BTM › 치마 · 팬츠) — 원피스·치마바지(이름에 '치마')는 치마, 숏팬츠·데님·슬랙스·트레이닝은 팬츠.
//   종류 카드는 fits ["하의:치마"] 처럼(폴더로 정해진다 — PosesTab fitsFor). fits ["하의"] 카드(공통)는 하의면 다 추천.
const SKIRT_RE = /스커트|치마|(?<![a-z])sk(?![a-z])|skirt|원피스|(?<![a-z])ops(?![a-z])|드레스/i;
const PANTS_RE = /팬츠|바지|(?<![a-z])pt(?![a-z])|슬랙스|데님|청바지|진(?![가-힣])|쇼츠|숏츠|트레이닝|조거|jean|pants/i;
/** 하의(또는 원피스·세트) 상품 하나 → ["하의:치마"] · ["하의:팬츠"] · [] (모르면) */
export function bottomTypes(x) {
  const p = wearPart(x);
  for (const t of [x?.name, x?.fullName]) {
    if (SKIRT_RE.test(t || "")) return ["하의:치마"];
    if (PANTS_RE.test(t || "")) return ["하의:팬츠"];
  }
  // 하의인데 이름으로 모르면 팬츠(우리 하의는 거래처 번호 이름 '2107' · 'JY-020' 이 거의 바지) · 원피스·세트는 모르면 공통만
  return p === "하의" ? ["하의:팬츠"] : [];
}

/** 코디가 무엇을 입는지 → 추천에 쓰는 자리. 원피스·세트는 위·아래 둘 다 */
export function codiFits(c, items) {
  const out = new Set();
  for (const id of c?.itemIds || []) {
    const x = (items || []).find((y) => y.id === id);
    if (!x) continue;
    const p = wearPart(x);
    if (p === "아우터") {
      out.add("아우터");
      for (const t of outerTypes(x)) out.add(t);
    }
    if (p === "가방") out.add("가방"); // 11/17 밤 '가방 있을 때만' 포즈(SELFIE·2)
    if (p === "상의" || p === "이너") out.add("상의");
    else if (p === "하의") {
      out.add("하의");
      for (const t of bottomTypes(x)) out.add(t);
    } else if (p === "원피스·세트") {
      out.add("상의");
      out.add("하의");
      for (const t of bottomTypes(x)) out.add(t);
    }
  }
  return out;
}

/**
 * 추천 — 세원(방향성 창) 예: "아우터는 전신·걷기, 하의 포인트는 하반신·앉은 컷"
 *   전신 포즈는 늘 · 아우터가 있으면 아우터 포즈 · 하의가 있으면 하반신·앉은 포즈 · 아우터 없이 상의만 있으면 상반신 포즈
 */
// 11/17 밤 세원: 안쪽 옷부터 입으면서 찍는다(lib/shootOrder) — 아우터를 입기 전에 상의를 먼저 찍으니 아우터가 있어도 상의 컷을 추천한다
// 11/18 진짜 추천 — 위 거르기는 그대로 두고(recommendAll), 그 안에서 코디 상품을 보고 약 10장만(lib/poseReco smartPick)
export const RECO_RULE = "코디 상품(핏·원단·넥라인·디테일·소싱 레퍼 구도)에 맞는 포즈 · 묶음마다 추천 장수만큼(겹·옷이 많으면 더) · 카드마다 고른 이유";
// TOP 세부 폴더(나시 …)는 그 옷이 코디에 있을 때만 — 폴더 이름이 상품 이름에 있거나 아래 말이 있으면
const TOP_SUB_RE = { 나시: /나시|캐미|슬리브리스|민소매|뷔스티에|홀터|브라탑/i, 니트: /니트|(?<![a-z])nt(?![a-z])/i, 반팔: /반팔|숏\s?슬리브/i, 긴팔티: /긴팔|롱\s?슬리브/i, 셔츠: /셔츠|블라우스|(?<![a-z])(sh|bl)(?![a-z])/i };
/** TOP 세부 폴더 이름(나시 …)이 이 상의에 맞나 */
export function subFits(sub, x) {
  if (!sub || !x) return false;
  const t = `${x.name || ""} ${x.fullName || ""}`;
  const re = TOP_SUB_RE[sub];
  return t.includes(sub) || !!(re && re.test(t));
}
const TOP_PARTS = ["이너", "상의", "원피스·세트"];
/** 다른 상의 위에 겹쳐 입는 상의(lib/shootOrder 겹 순서) */
export const OVER_TOP = /니트|가디건|집업|후드|맨투맨|스웻|베스트|조끼|스웨터|폴라|스웨트|앙고라|cardigan|knit/i;
/** 코디 상의를 입는 순서로 — 이너 → 원피스·세트 → 상의 → 겹쳐 입는 상의. lib/shootOrder 의 상의 겹이 이 순서(첫 겹 = 첫 상의) */
export function topsInOrder(c, items) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  return its
    .map((x, i) => ({ x, i, p: wearPart(x) }))
    .filter((o) => TOP_PARTS.includes(o.p))
    .map((o) => ({ ...o, r: o.p === "이너" ? 0 : o.p === "원피스·세트" ? 1 : OVER_TOP.test(`${o.x.name || ""} ${o.x.fullName || ""}`) ? 3 : 2 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((o) => o.x);
}
const isTopCard = (k) => groupOfCode(k) === "TOP" || (!groupOfCode(k) && (k?.fits || []).includes("상의") && !(k?.fits || []).some((t) => t.startsWith("아우터")));
/**
 * 11/18 세원: "코디4 나시+팬츠인데 사진이 다른 제품이여서 나시 + 팬츠 포즈에 코디여야 할 것 같은데" →
 *   상의 겹마다 그 겹에 새로 입은 상의에 맞는 TOP 카드 — 나시 겹 = TOP › 나시 카드, 그다음 티셔츠 겹 = 세부 없는 TOP 카드.
 * topCards = 이 코디 TOP 카드들, tops = topsInOrder → Map(카드 id → [상의 겹 번호 0…])
 *   세부 카드는 그 세부에 맞는 겹으로(맞는 겹이 없으면 세부 없는 카드처럼). 세부 없는 카드는 세부 카드가 안 간 겹으로(그런 겹이 없으면 전부 — 예전처럼).
 */
export function topLayerMap(topCards, tops) {
  const all = tops.map((_, i) => i);
  const fitsOf = (k) => (k.sub ? all.filter((i) => subFits(k.sub, tops[i])) : []);
  const special = new Set(topCards.flatMap(fitsOf));
  const plain = all.filter((i) => !special.has(i));
  const out = new Map();
  for (const k of topCards) {
    const f = fitsOf(k);
    out.set(k.id, f.length ? f : plain.length ? plain : all);
  }
  return out;
}
function topSubOk(k, c, items) {
  if (groupOfCode(k) !== "TOP" || !k.sub) return true;
  const its = (c?.itemIds || []).map((id) => (items || []).find((y) => y.id === id)).filter((x) => x && TOP_PARTS.includes(wearPart(x)));
  return its.some((x) => subFits(k.sub, x));
}
const groupOfCode = (k) => String(k?.code || "").match(/^\s*☀?\s*(TOP|SELFIE|BTM|FULL|OUTER)\b/i)?.[1]?.toUpperCase() || "";
/**
 * 진짜 추천이 상의 겹마다 한 장씩 꼭 고를 자리 — 세부 카드(나시 …)가 맞는 겹이 있을 때만.
 *   세부가 맞는 겹마다 한 자리 + 나머지 겹(세부 없는 TOP 카드) 한 자리. 그런 겹이 없으면 null(예전처럼 TOP 한 장)
 */
function topSlots(pool, c, items) {
  const tops = topsInOrder(c, items);
  if (!tops.length) return null;
  const subs = [...new Set(pool.filter((k) => isTopCard(k) && k.sub).map((k) => k.sub))];
  const layerSubs = tops.map((x) => subs.filter((s) => subFits(s, x)));
  if (!layerSubs.some((s) => s.length)) return null;
  const slots = [];
  for (const s of [...new Set(layerSubs.flat())]) slots.push({ label: `${s} 겹`, fit: (k) => isTopCard(k) && k.sub === s });
  if (layerSubs.some((s) => !s.length)) slots.push({ label: "상의 겹", fit: (k) => isTopCard(k) && (!k.sub || !tops.some((x) => subFits(k.sub, x))) });
  return slots;
}
/**
 * 11/18 세원: "헤이썸 울롱코트면 걍 롱코트 포즈/코디만 들어가야될 것 같아 / 아디롱코트도 마찬가지." →
 *   코디 아우터 종류(코트·패딩·무스탕·퍼·자켓)의 세부 폴더(OUTER › 코트 …)에 카드가 있으면 추천 아우터는 그 폴더 카드만(OUTER 바로 아래 공통 · 다른 종류 X).
 *   맞는 폴더가 비었거나 종류를 모르는 아우터면 예전처럼(공통 + 그 종류). 세원이 고른 카드는 안 건드린다(추천에만).
 *   아우터가 둘인 코디는 아직 없다(아우터 포즈는 마지막 아우터 겹 하나 — lib/shootOrder) → 종류가 전부 폴더에 있을 때만 거른다.
 */
function outerOnly(pool, c, items) {
  const its = (c?.itemIds || []).map((id) => (items || []).find((x) => x.id === id)).filter((x) => x && wearPart(x) === "아우터");
  if (!its.length || its.some((x) => !outerTypes(x).length)) return pool;
  const types = [...new Set(its.flatMap(outerTypes).map((t) => t.split(":")[1]))];
  const isOuter = (k) => groupOfCode(k) === "OUTER" || (!groupOfCode(k) && (k.fits || []).some((t) => t.startsWith("아우터")));
  if (!types.every((t) => pool.some((k) => isOuter(k) && k.sub === t))) return pool;
  return pool.filter((k) => !isOuter(k) || types.includes(k.sub));
}
/** 진짜 추천 — 옷 종류로 거른 카드(recommendAll) 안에서 코디 상품을 보고 n장 → 카드 id */
export function recommend(cards, c, items, n) {
  return recoPick(cards, c, items, n).ids;
}
/** recommend 와 같은데 고른 이유(why · short)까지. q = 묶음마다 장수(11/20, 주면 n 대신) */
export function recoPick(cards, c, items, n, q = null) {
  const pool = new Set(recommendAll(cards, c, items));
  const mine = outerOnly(
    cards.filter((k) => pool.has(k.id) && topSubOk(k, c, items)),
    c,
    items,
  );
  return smartPick(mine, c, items, n, undefined, topSlots(mine, c, items), q);
}
/** 이 촬영 쪽(실내/야외) 카드에서 진짜 추천 — 포즈판 · 큰 창이 이유를 보여 줄 때 */
export function recoOf(day, c, cards, items) {
  const want = placeOfDay(day);
  return recoPick(cards.filter((k) => !k.place || k.place === want), c, items, undefined, recoQOf(day));
}
/** 옛 추천(옷 종류로 거르기만) — 이 안에서 진짜 추천이 고른다 */
export function recommendAll(cards, c, items) {
  const f = codiFits(c, items);
  const want = new Set(["전신"]);
  if (f.has("아우터")) for (const t of f) if (t.startsWith("아우터")) want.add(t);
  if (f.has("하의")) for (const t of f) if (t.startsWith("하의")) want.add(t); // 공통(하의) + 그 코디 하의 종류(하의:치마 · 하의:팬츠)
  if (f.has("상의")) want.add("상의");
  // 11/17 밤 예비(spare)는 추천 안 함 · '가방 있을 때만'(only) 은 코디에 가방이 있을 때만
  const pose = (k) => k.sec?.pose || {};
  return cards.filter((k) => !pose(k).spare && (!pose(k).only || f.has(pose(k).only)) && k.fits.some((t) => want.has(t))).map((k) => k.id);
}

/** 이 코디에서 고른 포즈 — {ids, auto}. auto = 아직 세원이 안 건드려서 추천을 보여 주는 중 */
export function picksOf(day, c, cards, items) {
  const have = new Set(cards.map((k) => k.id));
  const mine = day?.posePicks?.[c.id];
  if (Array.isArray(mine)) return { ids: mine.filter((id) => have.has(id)), auto: false };
  // 11/17 포즈 칸 카드엔 place(실내/야외)가 있다 — 추천은 이 촬영 쪽 카드에서만(place 없는 예전 카드는 그대로)
  return { ids: recoOf(day, c, cards, items).ids, auto: true };
}
export const doneOf = (day, c) => day?.poseDone?.[c.id] || [];

/** 모델 레퍼런스 한 칸의 pose.ok 를 바꾸는 changeKey 함수 */
export const setPoseOk = (secId, ok) => (v) => ({
  ...v,
  items: (v.items || []).map((x) =>
    (x.sections || []).some((s) => s.id === secId)
      ? {
          ...x,
          sections: x.sections.map((s) => {
            if (s.id !== secId) return s;
            const { ok: _was, ...rest } = s.pose || {};
            return { ...s, pose: ok === undefined ? rest : { ...rest, ok } };
          }),
        }
      : x,
  ),
});

// ---------------------------------------------------------------- 코디마다 찍을 사진 (11/16 밤 세원: "포즈판 개어려운데 이거 보면서 촬영할 수 있는 거 맞아?" ·
//   "이 코디에 이 포즈를 고를 수 있게 — 이 코디에만 적용되는 포즈")
// 찍는 단위 = 사진 한 장. 촬영 줄(shoot_days)에:
//   posePicks {코디 id: [카드 id]}        카드째 고른 것(위 picksOf — 없으면 추천)
//   posePhotoOff {코디 id: [보관 키]}     고른 카드 안에서 이 코디엔 안 쓰는 사진(카드에서 한 장만 골라 쓸 때)
//   poseOwn {코디 id: [{id, key, cap, refId}]}  이 코디만 쓰는 포즈 사진(공용 카드엔 안 들어감)
//   poseDone {코디 id: [보관 키]}         찍은 사진(예전엔 카드 id — 카드 id 가 있으면 그 카드 사진 전부 찍은 것으로)

/** 이 코디에서 찍을 사진 — 고른 카드 순서대로 그 카드 사진(뺀 것 빼고), 그다음 이 코디만 사진 */
export function shotsOf(day, c, cards, items) {
  const { ids, auto } = picksOf(day, c, cards, items);
  const off = new Set(day?.posePhotoOff?.[c.id] || []);
  const done = new Set(day?.poseDone?.[c.id] || []);
  const shots = [];
  for (const k of cards) {
    if (!ids.includes(k.id)) continue;
    for (const p of k.sec.photos || []) {
      if (!p?.key || off.has(p.key)) continue;
      shots.push({ key: p.key, cap: p.cap || "", cardId: k.id, code: k.code, title: stripCode(k.title), text: k.sec.text || "", ok: k.ok === true, done: done.has(p.key) || done.has(k.id) });
    }
  }
  for (const p of day?.poseOwn?.[c.id] || [])
    if (p?.key) shots.push({ key: p.key, cap: p.cap || "", own: true, ownId: p.id, code: "이 코디", title: p.cap || "이 코디만", text: "", ok: true, done: done.has(p.key) });
  return { shots, auto, ids };
}

/** 사진 한 장 찍음 켜고 끄기 → 촬영 줄 patch (고른 것도 그대로 굳힌다 — 추천이 바뀌어도 찍던 목록이 안 흔들리게) */
export function flipDone(day, c, cards, items, key) {
  const { shots, ids } = shotsOf(day, c, cards, items);
  const now = new Set(shots.filter((s) => s.done).map((s) => s.key));
  if (now.has(key)) now.delete(key);
  else now.add(key);
  return {
    posePicks: { ...(day.posePicks || {}), [c.id]: ids },
    poseDone: { ...(day.poseDone || {}), [c.id]: [...now] },
  };
}

/** 고른 카드 안 사진 한 장 쓰기/안 쓰기. 카드 사진을 다 끄면 그 카드를 뺀다 */
export function flipPhoto(day, c, cards, items, k, key) {
  const { ids } = picksOf(day, c, cards, items);
  let off = new Set(day.posePhotoOff?.[c.id] || []);
  let picks = ids;
  if (!ids.includes(k.id)) {
    // 안 고른 카드의 사진을 누르면 → 그 카드를 넣고 그 사진만 켠다
    picks = cards.map((x) => x.id).filter((id) => id === k.id || ids.includes(id));
    for (const p of k.sec.photos || []) if (p.key !== key) off.add(p.key);
    off.delete(key);
  } else if (off.has(key)) off.delete(key);
  else off.add(key);
  const keys = (k.sec.photos || []).map((p) => p.key);
  if (keys.length && keys.every((x) => off.has(x))) {
    picks = picks.filter((id) => id !== k.id);
    off = new Set([...off].filter((x) => !keys.includes(x)));
  }
  return { posePicks: { ...(day.posePicks || {}), [c.id]: picks }, posePhotoOff: { ...(day.posePhotoOff || {}), [c.id]: [...off] } };
}

/** 카드째 넣기/빼기 (빼면 그 카드에서 꺼 둔 사진 표시도 지운다) */
export function flipCard(day, c, cards, items, k) {
  const { ids } = picksOf(day, c, cards, items);
  const on = ids.includes(k.id);
  const picks = cards.map((x) => x.id).filter((id) => (id === k.id ? !on : ids.includes(id)));
  const keys = new Set((k.sec.photos || []).map((p) => p.key));
  const off = (day.posePhotoOff?.[c.id] || []).filter((x) => !keys.has(x));
  return { posePicks: { ...(day.posePicks || {}), [c.id]: picks }, posePhotoOff: { ...(day.posePhotoOff || {}), [c.id]: off } };
}
