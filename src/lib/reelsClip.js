/**
 * 인스타에서 한 번에 담기 (10/20 세원: "저장한 릴스 하나씩 클릭해서 링크 복붙하고 있는데 포클로 담기처럼 한 번에 담아서 링크 받을 수 있게.
 * 안 받아지는 릴스는 자동으로 영상 저장되게")
 *
 * 인스타 화면의 즐겨찾기 단추(public/insta-clip.js)가 고른 게시물을 로그인한 브라우저로 읽어 작은 창(#reels-clip)에 보낸다:
 *   {code, url, kind: video|carousel|photo, video(서명된 영상 주소), thumb, user, name, caption, likes, comments, views, postedAt, seconds, music, err?}
 * 여기서는 그걸 릴스 기획(영상)·캐러셀 기획(사진·캐러셀, 보관만)에 넣고 사무실 PC 분석기 일감(reels_queue)을 만든다.
 * 영상 주소는 source.cdn 으로 둔다 — 분석기가 링크로 못 받으면(나이·나라 제한, LSD token 등) 이걸로 받는다(reels_worker.run_ref).
 * 이미 담긴 릴스가 실패 상태(영상 못 받음)면 새로 만들지 않고 그 릴스에 영상 주소를 붙여 다시 맡긴다.
 *
 * 저장: 공유 장부면 settings reels / carousels / reels_queue 를 조건부 쓰기(changeKey)로 한 번에, 이 기기 저장이면 useSales 와 같은 localStorage 키.
 */
import { isRemote } from "./supabase";
import { loadKey, changeKey } from "./shoot";
import { newId } from "./id";

const LOCAL = { reels: "poclo_reels_items", carousels: "poclo_carousels", reels_queue: "poclo_reels_queue", reels_folders: "poclo_reel_folders" };

const readLocal = (key) => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL[key]) || "[]") || [];
  } catch {
    return [];
  }
};

/** 목록(items 배열) 읽기 */
export async function loadList(key, online) {
  if (!(isRemote && online)) return readLocal(key);
  const v = await loadKey(key, online, { items: [] });
  return v.items || [];
}

/** 목록 바꿔 쓰기 — change(items) → 새 items */
export async function changeList(key, online, change) {
  if (!(isRemote && online)) {
    const next = change(readLocal(key));
    localStorage.setItem(LOCAL[key], JSON.stringify(next));
    return next;
  }
  const v = await changeKey(key, online, (val) => ({ ...val, items: change(val.items || []) }), { items: [] });
  return v.items || [];
}

const CODE = /\/(?:p|reels?|tv)\/(?!audio\/)([A-Za-z0-9_-]{5,})/;
export const codeOf = (url) => (String(url || "").match(CODE) || [])[1] || "";
const itemCode = (it) => codeOf(it.meta?.url) || codeOf(it.source?.url);

/** 받은 것마다 '이미 있나' — 릴스는 reels, 사진·캐러셀은 carousels 에서 같은 게시물 코드 */
export function matchExisting(d, reels, carousels) {
  const list = d.kind === "video" || !d.kind ? reels : carousels;
  return list.find((it) => itemCode(it) === d.code) || null;
}

/** 영상을 못 받은 릴스인가 (다시 받기 대상) */
export const isFailedReel = (it) => it && !it.hasVideo && it.job?.status === "error";

const firstLine = (s) =>
  String(s || "")
    .split("\n")
    .map((x) => x.trim())
    .find(Boolean)
    ?.slice(0, 40) || "";

const metaOf = (d) => ({
  url: d.url,
  uploader: d.user || "",
  name: d.name || "",
  caption: d.caption || "",
  likes: d.likes ?? null,
  comments: d.comments ?? null,
  views: d.views ?? null,
  postedAt: d.postedAt || "",
  ...(d.seconds ? { duration: d.seconds } : {}),
  ...(d.music ? { music: { ...d.music, url: d.music.audioId ? `https://www.instagram.com/reels/audio/${d.music.audioId}/` : "" } } : {}),
});

/**
 * 담기. rows = [{d, existing}] (고른 것만), opt = {analyze, scriptFrom, folder: {folderId, folder}, online}
 * 돌려줌 {added, retried, carousels}
 */
export async function saveInstaBatch(rows, opt) {
  const now = new Date().toISOString();
  const job = (id, target) => ({
    id,
    target,
    status: "queued",
    step: "",
    at: now,
    ...(target === "ref" && opt.analyze ? (opt.scriptFrom ? { scriptFrom: opt.scriptFrom } : {}) : { analyze: false }),
  });
  const newReels = [];
  const retry = new Map(); // 실패한 릴스 id → 영상 주소
  const newCars = [];
  const jobs = [];
  for (const { d, existing } of rows) {
    if (d.kind && d.kind !== "video") {
      if (existing) continue;
      const id = newId("c");
      newCars.push({
        id,
        title: firstLine(d.caption) || `@${d.user || "인스타"}`,
        source: { type: "link", url: d.url },
        meta: metaOf(d),
        memo: "",
        folderId: null,
        folder: "",
        job: { status: "queued", at: now },
        from: "인스타 담기",
      });
      jobs.push(job(id, "carousel"));
      continue;
    }
    if (existing) {
      if (!isFailedReel(existing)) continue;
      retry.set(existing.id, d);
      jobs.push(job(existing.id, "ref"));
      continue;
    }
    const id = newId("r");
    newReels.push({
      id,
      addedAt: now,
      title: firstLine(d.caption) || `@${d.user || "인스타"}`,
      source: { type: "link", url: d.url, ...(d.video ? { cdn: d.video, cdnAt: now } : {}) },
      meta: metaOf(d),
      memo: "",
      ...(opt.folder || { folderId: null, folder: "" }),
      hasVideo: false,
      job: { status: "queued", at: now },
      filled: [],
      from: "인스타 담기",
    });
    jobs.push(job(id, "ref"));
  }
  if (newReels.length || retry.size)
    await changeList("reels", opt.online, (items) => {
      const have = new Set(items.map(itemCode));
      const fresh = newReels.filter((it) => !have.has(itemCode(it)));
      return [
        ...fresh,
        ...items.map((it) => {
          const d = retry.get(it.id);
          if (!d) return it;
          return {
            ...it,
            source: { ...(it.source || {}), type: "link", url: it.source?.url || d.url, ...(d.video ? { cdn: d.video, cdnAt: now } : {}) },
            meta: { ...metaOf(d), ...Object.fromEntries(Object.entries(it.meta || {}).filter(([, v]) => v !== null && v !== "")) },
            job: { status: "queued", at: now },
          };
        }),
      ];
    });
  if (newCars.length)
    await changeList("carousels", opt.online, (items) => {
      const have = new Set(items.map(itemCode));
      return [...newCars.filter((it) => !have.has(itemCode(it))), ...items];
    });
  if (jobs.length)
    await changeList("reels_queue", opt.online, (items) => [
      ...items.filter((j) => !jobs.some((n) => n.id === j.id && n.target === j.target)),
      ...jobs,
    ]);
  return { added: newReels.length, retried: retry.size, carousels: newCars.length };
}
