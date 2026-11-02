// 모델 레퍼런스 모음 (11/1) — 세원: "우리 모델들한테 보낼 사진 레퍼런스랑 영상 레퍼런스 같은 거 모아서 보내 주고 싶은데, 모델 기본 가이드 외에 만들 수 있는 걸."
// 기본 가이드(lib/modelGuide)는 모든 촬영 시트에 같이 가는 한 벌, 이건 주제·모델마다 여러 벌 만들어 따로 링크로 보낸다.
//
// settings model_refs {items:[{id, title, note, models:[이름], sections:[칸], sheetToken, sheetAt, sheetSig, sheetClosed, createdAt}], cloths:[카테고리 이름 — 순서 = 탭 순서]}
//   칸 = 기본 가이드 칸과 같은 모양 {id, title, text, photos:[{key, cap, refId}], clips, links} + cloth(의류) — 고치기 SectionEdit · 그리기 GuideSections 를 같이 쓴다.
//   refId = 촬영 레퍼런스에서 고른 사진. 보관 파일을 그대로 가리킨다(저장소 한도 초과라 새로 안 올린다).
//   cloth (11/2 세원: "일단 의류 카테고리만 크게 나누자. 아우터, 상의, 하의. 그 안에서 내가 거울셀카, 앉아서 찍는 컷 등등 만들게") — 없으면 공통.
//   sheetSig = 보낸 때의 내용 표시 — 지금 내용과 다르면 '내용 새로 보내기'를 알린다.
// 보내기는 촬영 시트 표(shoot_sheets)를 같이 쓴다 — SQL 필요 없음. 스냅숏은 lib/shootSheet buildRefSheet, 모델 화면은 SheetPage kind "refs".
import { newId } from "./id";
import { videoKey, thumbKey } from "./refClips";
import { filledItems } from "./modelGuide";

export const REFS_KEY = "model_refs";

/** 처음 카테고리 — 고치기 · 모델 화면 탭이 이 순서. 세원이 '카테고리 편집'에서 늘리면 model_refs.cloths 에 저장된다. 이 안의 컷은 세원이 직접 만든다 */
export const CLOTHS = ["아우터", "상의", "하의"];
export const CLOTH_NONE = "공통";
export const clothsOf = (v) => (v?.cloths?.length ? v.cloths : CLOTHS);
export const clothKey = (s, cloths = CLOTHS) => (cloths.includes(s.cloth) ? s.cloth : "");

// 세원이 칸 이름으로 나눠 쓰던 것('아우터 - 거울셀카')을 읽을 때 제자리로 옮긴다. 저장은 고칠 때 저절로
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function withCloth(s, cloths = CLOTHS) {
  if (s.cloth) return s;
  // 긴 이름 먼저 — '상의세트'가 '상의'로 읽히지 않게
  const names = [...cloths].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const m = (s.title || "").match(new RegExp(`^\\s*(${names})\\s*[-–—·:/]\\s*(.+)$`));
  return m ? { ...s, cloth: m[1], title: m[2].trim() } : s;
}
export const withClothSet = (x, cloths = CLOTHS) => ({ ...x, sections: (x.sections || []).map((s) => withCloth(s, cloths)) });

/**
 * 칸들 → 카테고리별 묶음 (칸 있는 것만, 공통은 맨 뒤). order 순서, 그 밖은 나온 순서.
 * 모델 화면은 목록을 못 읽으니 스냅숏 순서 그대로다. 예전 링크는 cloth 가 없어 묶음 하나, 탭 없이 그대로 보인다.
 */
export function clothGroups(items, order = []) {
  const names = [...new Set([...order, ...items.map((x) => x.cloth).filter(Boolean)])];
  const groups = names.map((cloth) => ({ cloth, items: items.filter((x) => x.cloth === cloth) })).filter((g) => g.items.length);
  const rest = items.filter((x) => !x.cloth);
  return rest.length ? [...groups, { cloth: "", items: rest }] : groups;
}
export const clothLabel = (cloth) => cloth || CLOTH_NONE;

/** 목록 카드 한 줄 — '아우터 2컷 · 상의 1컷' */
export const clothSummary = (x, cloths = CLOTHS) =>
  clothGroups(
    (x.sections || []).map((s) => withCloth(s, cloths)),
    cloths,
  )
    .filter((g) => g.cloth)
    .map((g) => `${g.cloth} ${g.items.length}컷`)
    .join(" · ");

// 카테고리 고치기 — changeKey 에 넘긴다(서버 최신 위에서 돈다). 이름을 바꾸거나 지우면 모든 모음의 컷을 같이 고친다
const mapSections = (v, fn) => ({
  ...v,
  // 옛 칸 이름('아우터 - 거울셀카')도 먼저 제자리로 — 안 그러면 이름을 바꾼 뒤 못 읽는다
  items: (v.items || []).map((x) => ({ ...x, sections: (x.sections || []).map((s) => fn(withCloth(s, clothsOf(v)))) })),
});
export const addCloth = (name) => (v) => ({ ...v, cloths: [...clothsOf(v), name] });
export const renameCloth = (from, to) => (v) => ({ ...mapSections(v, (s) => (s.cloth === from ? { ...s, cloth: to } : s)), cloths: clothsOf(v).map((c) => (c === from ? to : c)) });
/** 지우면 안의 컷은 공통으로 — 사진·영상은 그대로 */
export const dropCloth = (name) => (v) => ({
  ...mapSections(v, (s) => {
    if (s.cloth !== name) return s;
    const { cloth: _gone, ...rest } = s;
    return rest;
  }),
  cloths: clothsOf(v).filter((c) => c !== name),
});
export const moveCloth = (name, dir) => (v) => {
  const list = [...clothsOf(v)];
  const i = list.indexOf(name);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return v;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...v, cloths: list };
};
/** 컷이 몇 개인지 — 모든 모음을 통틀어 */
export const clothCount = (items, name, cloths = CLOTHS) => (items || []).flatMap((x) => x.sections || []).filter((s) => withCloth(s, cloths).cloth === name).length;

/** 컷 이름 추천 — 내용은 세원이 채운다. 옷 종류는 탭이 나누므로 이름엔 안 넣는다 */
export const REF_SUGGEST = [
  { title: "거울셀카", hint: "예: 휴대폰을 든 반대 팔은 허리 뒤로" },
  { title: "앉아서 찍는 컷", hint: "예: 한쪽 무릎을 세워 밑단이 보이게" },
  { title: "전신 포즈", hint: "예: 한쪽 다리에 무게 · 시선은 옆으로" },
  { title: "실루엣 영상", hint: "예: 천천히 한 바퀴 · 동서남북 2초씩" },
];

const blankSection = (title = "") => ({ id: newId("mg"), title, text: "", photos: [] });
export const newSection = (title, cloth) => ({ ...blankSection(title || ""), ...(cloth ? { cloth } : {}) });

/** 새 모음 — 칸 없이 시작한다. 의류 탭 안에서 세원이 컷을 만든다 */
export const blankSet = () => ({
  id: newId("mr"),
  title: "",
  note: "",
  models: [],
  sections: [],
  createdAt: new Date().toISOString(),
});

/** 모음 → 모델이 보는 칸 (담은 게 있는 컷만) — urlOf(보관 키) 로 사진·영상 주소. 고치기 미리 보기 · 촬영 관리가 같이 쓴다 */
export const refItems = (x, cloths, urlOf) =>
  filledItems((x.sections || []).map((s) => withCloth(s, cloths))).map((s) => ({
    cloth: clothKey(s, cloths),
    title: (s.title || "").trim(),
    text: s.text || "",
    photos: (s.photos || []).map((p) => ({ url: urlOf(p.key), cap: p.cap })),
    clips: (s.clips || []).map((c) => ({ src: urlOf(videoKey(c.reelId)), poster: urlOf(thumbKey(c.reelId)), start: c.start, end: c.end, note: c.note })),
    links: s.links || [],
  }));
/** 서명 주소를 받아야 할 보관 키 (사진 · 장면 영상 · 장면 썸네일) */
export const refFileKeys = (x) => (x.sections || []).flatMap((s) => [...(s.photos || []).map((p) => p.key), ...(s.clips || []).flatMap((c) => [videoKey(c.reelId), thumbKey(c.reelId)])]);

export const countsOf = (x) => {
  const secs = x.sections || [];
  return {
    photos: secs.reduce((n, s) => n + (s.photos || []).length, 0),
    videos: secs.reduce((n, s) => n + (s.clips || []).length + (s.links || []).length, 0),
  };
};

/** 모델에게 가는 칸만 글자로 — 보낸 내용과 같은지 볼 때 */
export const refSig = (x) =>
  JSON.stringify([
    (x.title || "").trim(),
    (x.note || "").trim(),
    x.models || [],
    (x.sections || []).map((s) => [
      (s.title || "").trim(),
      s.text || "",
      (s.photos || []).map((p) => [p.key.slice(0, 200), (p.cap || "").trim()]),
      (s.clips || []).map((c) => [c.reelId, c.start, c.end, (c.note || "").trim()]),
      (s.links || []).map((l) => [(l.name || "").trim(), l.url]),
      // 의류가 없는 칸은 예전과 같은 글자 — 이미 보낸 링크에 '새로 보내기' 알림이 잘못 뜨지 않게
      ...(s.cloth ? [s.cloth] : []),
    ]),
  ]);
