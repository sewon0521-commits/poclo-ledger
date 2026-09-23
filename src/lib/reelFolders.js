// 릴스 라이브러리 폴더 — 상위 › 하위 › 세부, 세 단계 (세원 2026-09-22 두 단계, 9/24 "하위 카테고리의 하위까지.
// 팬츠, 스커트, 상의 이런 식으로 나누고 싶어서").
//
// 폴더 목록은 settings 'reels_folders' = { items: [{ id, name, parent }] } (parent 가 null 이면 상위).
// 형제끼리 순서 = 배열 순서. 릴스 항목은 folderId 로 가리킨다. 예전 항목은 folder(이름)만 있으므로 상위는 이름으로도 찾는다.
// '미분류'는 폴더가 아니다 — 어느 폴더에도 안 속한 것. 폴더를 지우면 안의 릴스는 미분류가 된다.

import { newId } from "./id";

const SEED = ["판매형", "정보성", "코디릴스", "관심끌기용"];
export const MAX_DEPTH = 2; // 0 상위 · 1 하위 · 2 세부

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

/** 이 폴더와 그 아래 전부(하위·세부) id 들 */
export function withChildren(id, folders) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of childrenOf(out[i], folders)) out.push(c.id);
  return out;
}

/** 위로 올라가며 [상위, 하위, 세부] 순 */
export function pathOf(id, folders) {
  const out = [];
  let f = folders.find((x) => x.id === id);
  while (f && out.length < 5) {
    out.unshift(f);
    f = f.parent && folders.find((x) => x.id === f.parent);
  }
  return out;
}

export const depthOf = (id, folders) => Math.max(0, pathOf(id, folders).length - 1);

/** 이 폴더 아래로 몇 단계 더 있나 (자식 없으면 0) */
function heightOf(id, folders) {
  const kids = childrenOf(id, folders);
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(k.id, folders))) : 0;
}

/** 나무 순서로 펼친 목록 — [{...폴더, depth}] (목록·고르기 칸에서 들여쓰기) */
export function ordered(folders) {
  const out = [];
  const walk = (parent, depth) => {
    for (const f of folders.filter((x) => (x.parent || null) === parent)) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "상위 › 하위 › 세부" 로 부르는 이름 */
export function pathName(id, folders) {
  const p = pathOf(id, folders);
  return p.length ? p.map((f) => f.name).join(" › ") : "미분류";
}

/** 이 폴더를 target 기준 pos 로 옮길 수 있나 — 세 단계를 넘거나 자기 아래로 들어가면 안 된다 */
export function canMove(list, dragId, targetId, pos) {
  const drag = list.find((f) => f.id === dragId);
  const target = list.find((f) => f.id === targetId);
  if (!drag || !target || drag.id === target.id) return false;
  if (withChildren(dragId, list).includes(targetId)) return false;
  // 상위는 상위끼리 순서만 (예전 항목이 상위 이름으로 찾으므로 하위로 넣지 않는다)
  if (!drag.parent) return !target.parent && pos !== "inside";
  const depth = pos === "inside" ? depthOf(targetId, list) + 1 : depthOf(targetId, list);
  return depth >= 1 && depth + heightOf(dragId, list) <= MAX_DEPTH;
}

/**
 * 끌어서 옮기기 (세원 9/22: "상위 폴더는 순서 변경, 하위 폴더는 다른 상위로 옮기기, 하위끼리도 순서").
 *   pos "before"/"after" → target 의 형제로 그 앞/뒤 · "inside" → target 안의 맨 끝.
 * 폴더 하나만 옮기면 그 아래 폴더들은 parent 로 따라온다.
 */
export function moveFolder(list, dragId, targetId, pos) {
  if (!canMove(list, dragId, targetId, pos)) return list;
  const drag = list.find((f) => f.id === dragId);
  const target = list.find((f) => f.id === targetId);
  const rest = list.filter((f) => f.id !== dragId);
  if (pos === "inside") return [...rest, { ...drag, parent: target.id }];
  const moved = { ...drag, parent: target.parent || null };
  const i = rest.findIndex((f) => f.id === target.id);
  const at = pos === "before" ? i : i + 1;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** 폴더마다 몇 개 들었나 — 그 아래 폴더까지 더한다 */
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
    total.set(f.id, withChildren(f.id, folders).reduce((s, id) => s + (direct.get(id) || 0), 0));
  }
  return { total, none };
}
