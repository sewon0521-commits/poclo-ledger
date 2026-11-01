// 모델 레퍼런스 모음 (11/1) — 세원: "우리 모델들한테 보낼 사진 레퍼런스랑 영상 레퍼런스 같은 거 모아서 보내 주고 싶은데, 모델 기본 가이드 외에 만들 수 있는 걸."
// 기본 가이드(lib/modelGuide)는 모든 촬영 시트에 같이 가는 한 벌, 이건 주제·모델마다 여러 벌 만들어 따로 링크로 보낸다.
//
// settings model_refs {items:[{id, title, note, models:[이름], sections:[칸], sheetToken, sheetAt, sheetSig, sheetClosed, createdAt}]}
//   칸 = 기본 가이드 칸과 같은 모양 {id, title, text, photos:[{key, cap, refId}], clips, links} — 고치기 SectionEdit · 그리기 GuideSections 를 같이 쓴다.
//   refId = 촬영 레퍼런스에서 고른 사진. 보관 파일을 그대로 가리킨다(저장소 한도 초과라 새로 안 올린다).
//   sheetSig = 보낸 때의 내용 표시 — 지금 내용과 다르면 '내용 새로 보내기'를 알린다.
// 보내기는 촬영 시트 표(shoot_sheets)를 같이 쓴다 — SQL 필요 없음. 스냅숏은 lib/shootSheet buildRefSheet, 모델 화면은 SheetPage kind "refs".
import { newId } from "./id";

export const REFS_KEY = "model_refs";

/** 더할 칸 — 기본 동선에 나오는 컷 갈래(이름만, 내용은 세원이 채운다) */
export const REF_SUGGEST = [
  { title: "전신 포즈", hint: "예: 한쪽 다리에 무게 · 시선은 옆으로" },
  { title: "상의 포즈", hint: "예: 손은 옷자락을 가볍게" },
  { title: "하의 포즈", hint: "예: 뒷모습 · 옆모습 실루엣이 보이게" },
  { title: "거울셀카", hint: "예: 휴대폰을 든 반대 팔은 허리 뒤로" },
  { title: "실루엣 영상", hint: "예: 천천히 한 바퀴 · 동서남북 2초씩" },
];

const blankSection = (title = "") => ({ id: newId("mg"), title, text: "", photos: [] });
export const newSection = (s) => blankSection(s?.title || "");

/** 새 모음 — 처음 칸은 세원이 말한 두 갈래 */
export const blankSet = () => ({
  id: newId("mr"),
  title: "",
  note: "",
  models: [],
  sections: [blankSection("사진 레퍼런스"), blankSection("영상 레퍼런스")],
  createdAt: new Date().toISOString(),
});

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
    ]),
  ]);
