// 룩북 영상 (11/7) — 세원: "스타일링 참고 영상에 '룩북' 영상 칸을 만들어 줘. 거기 영상 넣으면 그날 촬영 모든 코디에 해당 영상을 필수로 찍어야 된다는 얘기야."
//
// settings shoot_lookbook {days: {'YYYY-MM-DD': {clips:[참고 영상 장면과 같은 모양 — lib/refClips], videos:[{id, name, url}], at}}}
//   촬영일(코디 shootDate)마다 하나 — 같은 날 촬영이 둘(모델 둘)이어도 그날 코디 전부에 든다.
//   어느 코디 스타일링 창에서 넣든 그날 코디 전부의 '찍을 영상' 맨 위에 '룩북 · 필수'로 뜬다.
//   다 찍었는지는 코디마다 styling.lookDone [룩북 영상 id] — 코디 A 에서 체크해도 코디 B 는 안 바뀐다.
//   촬영일이 없는 코디에서는 못 넣는다(어느 날인지 몰라서). 그날 룩북을 다 빼면 그 날짜 줄도 지운다.
//   쓰기는 changeKey(조건부 쓰기) — 둘이 같이 고쳐도 서로 안 지운다. 바뀌면 방송·4초 확인으로 다른 화면도 다시 읽는다.
import { useCallback, useEffect, useState } from "react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "./shoot";
import { reelTitle } from "./refClips";

export const LOOK_KEY = "shoot_lookbook";
const FALLBACK = { days: {} };
const NONE = { clips: [], videos: [] };

/** 그날 룩북 {clips, videos} (날짜가 없거나 비었으면 빈 것) */
export const lookOf = (all, day) => ({ ...NONE, ...((day && all?.days?.[day]) || {}) });

/** 룩북 영상 한 줄씩 [{id, text}] — 장면은 메모 → 릴스 제목, 인스타 주소는 이름 */
export function lookItems(look, reels = []) {
  const clips = look?.clips || [];
  return [
    ...clips.map((c, i) => {
      const reel = reels.find((r) => r.id === c.reelId);
      return { id: c.id, kind: "clip", text: c.note || (reel ? reelTitle(reel) : `룩북 영상 ${i + 1}`) };
    }),
    ...(look?.videos || []).map((v, i) => ({ id: v.id, kind: "video", text: v.name || `룩북 영상 ${clips.length + i + 1}` })),
  ];
}

/** 룩북 줄 이름 고치기 (11/7) — 장면은 메모(note, 참고 영상 칸 굵은 글과 같음), 인스타 주소는 이름(name). 그날 코디 전부에 같이 바뀐다 */
export const renameLook = (look, id, text) => ({
  ...look,
  clips: (look.clips || []).map((c) => (c.id === id ? { ...c, note: text } : c)),
  videos: (look.videos || []).map((v) => (v.id === id ? { ...v, name: text } : v)),
});

/**
 * 이 코디 찍을 영상 끝낸 수 / 전체 — 룩북(그날 필수) + 이 코디 참고 영상 장면(styling.clips) + 이 코디 글 줄(styling.videos)
 * 11/18 촬영 날 화면(PoseRun.ShootRun '찍을 영상')에서 장면도 '찍음'을 누르게 되면서 장면도 센다 — 끝냄은 styling.clipDone [장면 id].
 */
export function videoTally(st, look) {
  const ids = lookItems(look).map((x) => x.id);
  const doneLook = new Set(st?.lookDone || []);
  const clips = st?.clips || [];
  const doneClip = new Set(st?.clipDone || []);
  const own = st?.videos || [];
  return {
    done: ids.filter((id) => doneLook.has(id)).length + clips.filter((c) => doneClip.has(c.id)).length + own.filter((x) => x.done).length,
    all: ids.length + clips.length + own.length,
  };
}

/**
 * 촬영 날 '찍을 영상' 줄 (11/18) — 맨 위 룩북 · 필수(그날 공통), 그 아래 이 코디 참고 영상 장면, 이 코디 글 줄. 이름은 lookItems 와 같게(메모 → 릴스 제목).
 * [{id, kind: "look" | "clip" | "text", text, tag, clip?, url?, done}]
 */
export function shootVideoRows(st, look, reels = []) {
  const lookDone = new Set(st?.lookDone || []);
  const clipDone = new Set(st?.clipDone || []);
  const byId = new Map([...(look?.clips || []).map((c) => [c.id, { clip: c }]), ...(look?.videos || []).map((v) => [v.id, { url: v.url }])]);
  const rows = lookItems(look, reels).map((x) => ({ id: x.id, kind: "look", text: x.text, tag: "룩북 · 필수", ...byId.get(x.id), done: lookDone.has(x.id) }));
  for (const [i, c] of (st?.clips || []).entries()) {
    const reel = reels.find((r) => r.id === c.reelId);
    rows.push({ id: c.id, kind: "clip", text: c.note || (reel ? reelTitle(reel) : `참고 영상 ${i + 1}`), tag: "이 코디", clip: c, done: clipDone.has(c.id) });
  }
  for (const v of st?.videos || []) rows.push({ id: v.id, kind: "text", text: v.text || "찍을 영상", tag: "이 코디", done: !!v.done });
  return rows;
}

/** 찍음 켜고 끄기 — 스타일링 창과 같은 곳에(룩북 lookDone · 장면 clipDone · 글 줄 videos[].done). 순수 함수 */
export function flipShootVideo(st0, row) {
  const st = st0 || {};
  const tog = (list, id) => ((list || []).includes(id) ? list.filter((x) => x !== id) : [...(list || []), id]);
  if (row.kind === "look") return { ...st, lookDone: tog(st.lookDone, row.id) };
  if (row.kind === "clip") return { ...st, clipDone: tog(st.clipDone, row.id) };
  return { ...st, videos: (st.videos || []).map((v) => (v.id === row.id ? { ...v, done: !v.done } : v)) };
}

// 한 탭 안의 창들(촬영 창 · 스타일링 창)이 같은 값을 본다
let cache = null;
const subs = new Set();
const share = (v) => {
  cache = v;
  subs.forEach((f) => f(v));
};
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem("poclo_" + LOOK_KEY) || "null") || FALLBACK;
  } catch {
    return FALLBACK;
  }
};

/** {all, change(day, fn)} — fn(그날 룩북) → 새 룩북. fn 은 여러 번 불릴 수 있다(조건부 쓰기 다시 하기) — 순수하게 */
export function useLookbook(online) {
  const [all, setAll] = useState(() => cache || readLocal());
  useEffect(() => {
    subs.add(setAll);
    let alive = true;
    const pull = () =>
      loadKey(LOOK_KEY, online, FALLBACK)
        .then((v) => alive && share(v))
        .catch(() => {});
    pull();
    const off = onSettingsChange((k) => k === LOOK_KEY && pull());
    const stop = watchKeys([LOOK_KEY], (k) => k === LOOK_KEY && pull());
    return () => {
      alive = false;
      subs.delete(setAll);
      off();
      stop();
    };
  }, [online]);
  const change = useCallback(
    async (day, fn) => {
      if (!day) return;
      const at = new Date().toISOString();
      const apply = (v) => {
        const n = fn(lookOf(v, day));
        const days = { ...(v?.days || {}) };
        if (!(n.clips || []).length && !(n.videos || []).length) delete days[day];
        else days[day] = { clips: n.clips || [], videos: n.videos || [], at };
        return { ...(v || {}), days };
      };
      share(apply(cache || readLocal())); // 화면 먼저
      try {
        share(await changeKey(LOOK_KEY, online, apply, FALLBACK));
      } catch (e) {
        loadKey(LOOK_KEY, online, FALLBACK)
          .then(share)
          .catch(() => {});
        throw e;
      }
    },
    [online],
  );
  return { all, change };
}
