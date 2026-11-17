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

export const FITS = ["전신", "아우터", "상의", "하의"];

/** 포즈 카드가 든 모음인지 */
export const isPoseSet = (x) => (x?.sections || []).some((s) => s.pose);

// ---------------------------------------------------------------- 포즈 칸 (11/17)
// 세원(방향성 창): "모델 레퍼런스 칸에 넣은 건 그대로 냅두고, 촬영 관리 안에 소싱 관리처럼 '포즈' 버튼 만들어서 포즈 카테고리 모델 레퍼런스처럼 나누고
//   거기서 제대로 만들어서 포즈판에서 고를 수 있게"
// → settings shoot_poses {cats:[카테고리 이름 — 순서 = 탭 순서], items:[포즈 카드]}. 카드 = 모델 레퍼런스 칸과 같은 모양
//   {id, title, text, photos:[{key, cap, refId}], cloth(카테고리), pose:{code, fits, why, src, ok}, from?, createdAt} — 고치기는 같은 SectionEdit.
//   모델 레퍼런스의 P1~P16 은 같은 id · 같은 사진 파일로 복사했다(11/17) — 그래서 촬영 줄의 posePicks · poseDone 이 끊기지 않는다. 모델 레퍼런스 쪽은 그대로.
// 포즈판에 깔리는 카드(촬영마다) = 촬영 줄 poseCats(고른 카테고리) — 없으면 바깥 촬영이면 '바깥', 스튜디오면 '바깥' 뺀 전부(카테고리 없는 카드 포함).
//   예전 poseSetIds(모델 레퍼런스 모음 고르기)는 이제 안 본다.
export const POSES_KEY = "shoot_poses";
export const OUTDOOR_CAT = "바깥";
export const POSE_CATS = ["전신", "아우터", "상의", "하의", "앉은컷", OUTDOOR_CAT];
export const poseCatsOf = (lib) => (lib?.cats?.length ? lib.cats : POSE_CATS);
const codeNo = (s) => Number(String(s?.pose?.code || s?.title || "").match(/^P(\d+)/i)?.[1] || 1e6);
/** 카드 순서 — P 번호 순, 번호 없는 건 뒤(만든 순) */
export const byCode = (a, b) => codeNo(a) - codeNo(b) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
/** 이 촬영 포즈판의 카테고리 — 고른 게 있으면 그것, 없으면 바깥/스튜디오로 */
export function poolCats(day, lib) {
  const cats = poseCatsOf(lib);
  if (Array.isArray(day?.poseCats)) return day.poseCats.filter((c) => cats.includes(c) || c === "");
  return day?.outdoor?.on ? [OUTDOOR_CAT] : ["", ...cats.filter((c) => c !== OUTDOOR_CAT)];
}
/** 이 촬영 포즈판 카드 — poseCards 와 같은 모양({cards, hidden}) */
export function posePool(day, lib) {
  const want = new Set(poolCats(day, lib));
  const cats = poseCatsOf(lib);
  const items = (lib?.items || []).filter((s) => s.pose && want.has(cats.includes(s.cloth) ? s.cloth : "")).sort(byCode);
  return poseCards([{ id: POSES_KEY, sections: items }]);
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
    if (p === "상의" || p === "이너") out.add("상의");
    else if (p === "하의") out.add("하의");
    else if (p === "원피스·세트") {
      out.add("상의");
      out.add("하의");
    }
  }
  return out;
}

/**
 * 추천 — 세원(방향성 창) 예: "아우터는 전신·걷기, 하의 포인트는 하반신·앉은 컷"
 *   전신 포즈는 늘 · 아우터가 있으면 아우터 포즈 · 하의가 있으면 하반신·앉은 포즈 · 아우터 없이 상의만 있으면 상반신 포즈
 */
export const RECO_RULE = "전신은 늘 · 아우터 있으면 그 종류(코트·패딩·무스탕·자켓·퍼) 컷 · 하의 있으면 하반신·앉은 컷 · 아우터 없이 상의면 상반신 컷";
export function recommend(cards, c, items) {
  const f = codiFits(c, items);
  const want = new Set(["전신"]);
  if (f.has("아우터")) for (const t of f) if (t.startsWith("아우터")) want.add(t);
  if (f.has("하의")) want.add("하의");
  if (f.has("상의") && !f.has("아우터")) want.add("상의");
  return cards.filter((k) => k.fits.some((t) => want.has(t))).map((k) => k.id);
}

/** 이 코디에서 고른 포즈 — {ids, auto}. auto = 아직 세원이 안 건드려서 추천을 보여 주는 중 */
export function picksOf(day, c, cards, items) {
  const have = new Set(cards.map((k) => k.id));
  const mine = day?.posePicks?.[c.id];
  if (Array.isArray(mine)) return { ids: mine.filter((id) => have.has(id)), auto: false };
  return { ids: recommend(cards, c, items), auto: true };
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
      shots.push({ key: p.key, cap: p.cap || "", cardId: k.id, code: k.code, title: k.title.replace(/^P\d+\s*/, ""), text: k.sec.text || "", ok: k.ok === true, done: done.has(p.key) || done.has(k.id) });
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
