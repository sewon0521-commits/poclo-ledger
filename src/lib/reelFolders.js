// 릴스 라이브러리 폴더 — 상위 폴더 아래 하위 폴더 한 단계 (세원 2026-09-22, 레퍼런스랩 '카테고리 편집' 모양).
//
// 폴더 목록은 settings 'reels_folders' = { items: [{ id, name, parent }] } (parent 가 null 이면 상위).
// 릴스 항목은 folderId 로 가리킨다. 예전 항목은 folder(이름)만 있으므로 이름으로도 찾는다.
// '미분류'는 폴더가 아니다 — 어느 폴더에도 안 속한 것. 폴더를 지우면 안의 릴스는 미분류가 된다.

import { newId } from "./id";

const SEED = ["판매형", "정보성", "코디릴스", "관심끌기용"];

/** 폴더가 아직 한 번도 저장 안 됐으면 기본 갈래 + 예전 항목에 적힌 폴더 이름으로 만든다 */
export function seedFolders(items) {
  const names = [...SEED];
  for (const it of items || []) {
    const n = (it.folder || "").trim();
    if (n && n !== "미분류" && !names.includes(n)) names.push(n);
  }
  return names.map((name) => ({ id: newId("f"), name, parent: null }));
}

/** 이 항목이 든 폴더 id (없으면 null = 미분류) */
export function folderIdOf(item, folders) {
  if (item.folderId && folders.some((f) => f.id === item.folderId)) return item.folderId;
  // 이름을 바꾼 폴더는 예전 이름(aka)으로도 찾는다 — 예전 항목은 이름만 들고 있다
  const byName =
    item.folder &&
    folders.find((f) => !f.parent && (f.name === item.folder || (f.aka || []).includes(item.folder)));
  return byName ? byName.id : null;
}

export const childrenOf = (id, folders) => folders.filter((f) => f.parent === id);

/** 이 폴더와 그 아래 하위 폴더 id 들 */
export const withChildren = (id, folders) => [id, ...childrenOf(id, folders).map((f) => f.id)];

/** "상위 › 하위" 로 부르는 이름 */
export function pathName(id, folders) {
  const f = folders.find((x) => x.id === id);
  if (!f) return "미분류";
  const p = f.parent && folders.find((x) => x.id === f.parent);
  return p ? `${p.name} › ${f.name}` : f.name;
}

/** 폴더마다 몇 개 들었나 — 상위 폴더는 하위까지 더한다 */
export function folderCounts(items, folders) {
  const direct = new Map();
  let none = 0;
  for (const it of items) {
    const id = folderIdOf(it, folders);
    if (id) direct.set(id, (direct.get(id) || 0) + 1);
    else none += 1;
  }
  const total = new Map();
  for (const f of folders) {
    const n = withChildren(f.id, folders).reduce((s, id) => s + (direct.get(id) || 0), 0);
    total.set(f.id, f.parent ? direct.get(f.id) || 0 : n);
  }
  return { total, none };
}
