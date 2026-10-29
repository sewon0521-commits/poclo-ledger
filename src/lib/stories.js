// 콘텐츠 › 경쟁사 스토리 (2026-10-30)
//
// 세원: "경쟁사들 스토리 캡쳐 넣는 란도 있었으면 좋겠어. 캐러셀 기획 밑에 하나 만들어 주고 경쟁사별로 만들 수 있게, 날짜별로 볼 수 있게.
//        날짜를 누르면 한 번에 볼 수 있게. 멘트나 포즈 같은 걸 참고할 때 쓰려구."
//
// 저장 (settings):
//   story_shops  경쟁사  {items:[{id, name, handle, at}]}          순서 = 화면 순서(더한 순서)
//   stories      캡처    {items:[{id, shopId, on, key, thumb, w, h, size, memo, at}]}
//     on = 스토리 날짜(YYYY-MM-DD, 기본 오늘) · 한 날 안에서는 넣은 순서(at)
//     key/thumb = Storage 'reels' 버킷 story/<id>.jpg · story/<id>-t.jpg
//     이 기기 저장 모드(Supabase 없음)면 key 대신 src/thumbSrc 에 줄인 사진(data URL)을 그대로 둔다
// 사진: 긴 변 1440 JPEG(스토리 글씨를 확대해 읽을 만큼, 한 장 약 100~200KB) + 목록용 작은 사진 폭 240(약 15KB).
//   목록에는 작은 사진만 받고, 큰 사진은 날짜를 눌러 열 때 그날 것만 받는다.
//   공유 저장소가 무료 한도를 넘어 있다(10/15 1.39GB) — 올리기가 막히면 그 오류를 그대로 보여 준다.

import { isRemote, supabase } from "./supabase";
import { newId } from "./id";

export const SHOPS_KEY = "story_shops";
export const STORIES_KEY = "stories";
const EDGE = 1440;
const THUMB_W = 240;

/** 인스타 주소·@아이디 → 아이디 ("" 이면 아이디 아님) */
export function handleOf(t) {
  const s = String(t || "").trim();
  const m = s.match(/instagram\.com\/(?:stories\/)?([A-Za-z0-9._]+)/i);
  const h = (m ? m[1] : s.replace(/^@/, "")).replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{2,30}$/.test(h) && !/^(p|reel|reels|stories|explore)$/i.test(h) ? h.toLowerCase() : "";
}

function loadImg(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ img: i, done: () => URL.revokeObjectURL(url) });
    i.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("사진을 열지 못했어요. 캡처 사진(jpg·png)인지 확인해 주세요."));
    };
    i.src = url;
  });
}
function toJpeg(img, w, h, q) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, "image/jpeg", q));
}
const dataUrl = (blob) =>
  new Promise((r) => {
    const f = new FileReader();
    f.onload = () => r(f.result);
    f.readAsDataURL(blob);
  });

/** 캡처 한 장 → 줄여서 보관 → 캡처 항목에 넣을 칸 {id, key, thumb, w, h, size} (이 기기 저장이면 src·thumbSrc) */
export async function putStory(file, online) {
  const { img, done } = await loadImg(file);
  try {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const s = Math.min(1, EDGE / Math.max(W, H));
    const w = Math.round(W * s);
    const h = Math.round(H * s);
    const ts = Math.min(1, THUMB_W / W);
    const [full, small] = await Promise.all([toJpeg(img, w, h, 0.82), toJpeg(img, Math.round(W * ts), Math.round(H * ts), 0.75)]);
    const id = newId("st");
    if (!(isRemote && online)) return { id, src: await dataUrl(full), thumbSrc: await dataUrl(small), w, h, size: full.size };
    const key = `story/${id}.jpg`;
    const thumb = `story/${id}-t.jpg`;
    for (const [k, b] of [
      [key, full],
      [thumb, small],
    ]) {
      const { error } = await supabase.storage.from("reels").upload(k, b, { upsert: true, contentType: "image/jpeg" });
      if (error) throw new Error(`캡처를 보관하지 못했어요 (${error.message}). 공유 저장 공간이 꽉 찼으면 Supabase 요금제를 올려야 해요.`);
    }
    return { id, key, thumb, w, h, size: full.size };
  } finally {
    done();
  }
}

/** 캡처 파일 지우기 (목록에서 빼는 건 따로) */
export async function removeStoryFiles(list, online) {
  const keys = list.flatMap((x) => [x.key, x.thumb]).filter(Boolean);
  if (!(isRemote && online) || !keys.length) return;
  for (let i = 0; i < keys.length; i += 100) await supabase.storage.from("reels").remove(keys.slice(i, i + 100));
}

/** 캡처 → 날짜마다 [{on, items}] (최근 날짜 먼저, 한 날 안에서는 넣은 순서) */
export function byDay(items) {
  const m = new Map();
  for (const x of items) {
    if (!m.has(x.on)) m.set(x.on, []);
    m.get(x.on).push(x);
  }
  return [...m.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([on, list]) => ({ on, items: list.sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))) }));
}

/** 같은 캡처를 두 번 붙였나 (크기가 같을 때만 바이트 비교) */
export async function sameImage(a, b) {
  if (a.size !== b.size || a.type !== b.type) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}
