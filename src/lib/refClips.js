// 참고 영상 장면 (10/29) — 세원: "이주현 모델 찍어봤는데 모델에게 보낼 시트 중에서 코디는 필요 없을 것 같아. 모델은 입히는 옷만 그냥 입거든.
//   대신 사진 레퍼런스, 영상 레퍼런스가 정말 중요해. 코디별로 어떤 레퍼런스를 보고 찍을지, 어떤 영상을 보고 어떻게 찍을지 가서 ERP 보면서 했거든.
//   그래서 촬영 코디에 코디를 누르면 참고 영상을 콘텐츠 › 릴스 기획에서 직접 가져올 수 있게 만들고 내가 볼 부분을 자를 수 있게.
//   자르고 그 영상을 누르면 그 영상을 무한 반복. 모델들 그 장면 보고 따라 할 수 있게."
//
// 코디 styling.clips [{id, reelId, start, end, note, ver, at}] — 릴스 기획(settings reels)의 보관 영상(Storage reels/<reelId>)에서 고른 구간(초).
// ⛔ 영상 파일은 자르지도 복사하지도 않는다(저장소가 한도를 넘음 — 10/15). 구간만 적어 두고, 재생할 때 그 구간만 되풀이한다(LoopClip).
// end 0 = 영상 끝까지. ver = 고를 때 그 릴스의 trim.at — 사무실 PC 가 릴스 영상 앞뒤를 잘라 덮으면 바뀌고, 그러면 구간이 어긋났을 수 있다고 알린다.
// 같은 날 저녁 세원: "참고 영상은 우리 보면서 찍으려고 한 거여서 모델한테 굳이 안 보여 줘도" → 모델 시트엔 안 간다(lib/shootSheet v4). 촬영 때 우리가 ERP 에서 본다.
import { createContext } from "react";
import { photoUrls } from "./shoot";

/** ShootPage 가 내려 주는 릴스 기획 묶음 {reels, folders, save, queue} — 스타일링 창이 릴스 목록을 읽는다 */
export const ReelKitCtx = createContext(null);

export const videoKey = (reelId) => reelId;
export const thumbKey = (reelId) => `${reelId}-thumb.jpg`;
export const reelTitle = (it) => String(it?.title || it?.reference?.title || "제목 없는 릴스").trim();
export const reelSeconds = (it) => Number(it?.reference?.seconds || it?.meta?.seconds || it?.seconds || 0) || 0;
/** 사무실 PC 가 잘라 덮은 영상이면 그 시각 — 구간이 어긋났는지 볼 때 */
export const reelVer = (it) => (it?.trim?.status === "done" && it.trim.at) || "";
export const r1 = (s) => Math.round((Number(s) || 0) * 10) / 10;

/** 초 → '0:03.2' */
export function fmtT(s) {
  const t = Math.max(0, Number(s) || 0);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}
/** '0:03.2 ~ 0:06.0' (끝이 0 이면 '끝까지') */
export const rangeText = (c) => `${fmtT(c.start)} ~ ${c.end > 0 ? fmtT(c.end) : "끝"}`;
export const clipLen = (c) => (c.end > c.start ? r1(c.end - c.start) : 0);

/** 분석의 장면 시각 '0:00~0:02.5' · '0~2초' · '3.5초~5초' → [시작, 끝] (못 읽으면 null) */
export function sceneRange(at) {
  const ts = String(at || "").match(/\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?/g) || [];
  const sec = (x) => {
    const [m, s] = x.includes(":") ? x.split(":") : ["0", x];
    return Number(m) * 60 + Number(s);
  };
  if (ts.length < 2) return null;
  const a = sec(ts[0]);
  const b = sec(ts[1]);
  return b > a ? [a, b] : null;
}

// 서명 주소는 4시간 — 창을 다시 열 때마다 새로 받지 않게 3시간 반 동안 이 탭에 들고 있는다
const SIGNED = new Map();
export async function signedUrls(keys, online) {
  const now = Date.now();
  const out = {};
  const need = [];
  for (const k of new Set(keys.filter(Boolean))) {
    const c = SIGNED.get(k);
    if (c && c.exp > now) out[k] = c.url;
    else need.push(k);
  }
  for (let i = 0; i < need.length; i += 100) {
    const part = need.slice(i, i + 100);
    const m = await photoUrls(part, online);
    for (const k of part)
      if (m[k]) {
        SIGNED.set(k, { url: m[k], exp: now + 3.5 * 3600 * 1000 });
        out[k] = m[k];
      }
  }
  return out;
}
