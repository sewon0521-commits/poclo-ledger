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
      return { id: c.id, text: c.note || (reel ? reelTitle(reel) : `룩북 영상 ${i + 1}`) };
    }),
    ...(look?.videos || []).map((v, i) => ({ id: v.id, text: v.name || `룩북 영상 ${clips.length + i + 1}` })),
  ];
}

/** 이 코디 찍을 영상 끝낸 수 / 전체 — 룩북(그날 필수) + 이 코디 것 */
export function videoTally(st, look) {
  const ids = lookItems(look).map((x) => x.id);
  const doneLook = new Set(st?.lookDone || []);
  const own = st?.videos || [];
  return { done: ids.filter((id) => doneLook.has(id)).length + own.filter((x) => x.done).length, all: ids.length + own.length };
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
