// 겹 영상 참고 영상 (11/18) — 세원: "코디 촬영 시작하고 마지막 다 가면 영상 나올 수 있게 만들어줘." → 고른 답 "겹마다 + 레퍼런스 재생".
//   촬영 날 폰 화면(PoseRun.ShootRun)의 겹 영상 칸을 누르면 참고 영상이 화면 가득 반복된다(LoopClip.ClipBig).
//
// 어떤 영상을 트나 (위에 있는 것부터)
//   1. 그 코디의 참고 영상(styling.clips). 장면에 겹(step)을 정해 뒀으면 그 겹에서, 안 정했으면 마지막 겹에서.
//   2. 없으면 영상 종류마다 정해 둔 기본 참고 영상 — settings shoot_video_refs {first, mid, last: [clip…], rec:{종류: true}}
//        first = 첫 겹 '이 상태로 영상' · mid = 상의 겹 '니트 입은 영상' · last = 마지막 '다 입은 영상'
//      clip 모양은 refClips 와 같다 {id, reelId, start, end, note, ver, at} — 영상 파일은 복사하지 않고 구간만.
//      rec[종류] = Claude 가 골라 둔 추천(세원이 바꾸면 풀린다).
//   3. 둘 다 없으면 글자 그대로 + '참고 영상 고르기'.
import { useCallback, useEffect, useState } from "react";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "./shoot";

export const VIDEO_REFS_KEY = "shoot_video_refs";
export const VIDEO_KINDS = [
  ["first", "첫 겹 — 이 상태로 영상", "안쪽 옷 + 하의를 입고 찍는 영상"],
  ["mid", "상의 겹 — 니트 입은 영상", "니트·가디건처럼 겹쳐 입은 뒤 찍는 영상"],
  ["last", "마지막 — 다 입은 영상", "거울에 붙었다 물러나기 · 멀리서 전신 + 근접"],
];
export const KIND_NAME = Object.fromEntries(VIDEO_KINDS.map(([k, n]) => [k, n]));

/** 겹 → 영상 종류 */
export const kindOfStep = (step) => (step?.last ? "last" : step?.kind === "first" ? "first" : "mid");

/** 이 겹에 틀 참고 영상 → {clips, from: "codi" | "default" | "", kind} */
export function stepClips(codi, step, refs) {
  const own = codi?.styling?.clips || [];
  const mine = own.filter((c) => Number(c.step) === step.n);
  const loose = step.last ? own.filter((c) => !c.step) : [];
  const kind = kindOfStep(step);
  if (mine.length || loose.length) return { clips: [...mine, ...loose], from: "codi", kind };
  const def = refs?.[kind] || [];
  return { clips: def, from: def.length ? "default" : "", kind };
}

/** 기본 참고 영상 읽기·고치기 — 둘이 같이 고쳐도 안 지워지게(changeKey), 다른 기기에서 고치면 따라온다 */
export function useVideoRefs(online) {
  const [refs, setRefs] = useState(null);
  const read = useCallback(() => {
    loadKey(VIDEO_REFS_KEY, online, {})
      .then((v) => setRefs(v || {}))
      .catch(() => setRefs((r) => r || {}));
  }, [online]);
  useEffect(() => {
    read();
    const off = onSettingsChange((k) => k === VIDEO_REFS_KEY && read());
    const stop = watchKeys([VIDEO_REFS_KEY], read, 15000);
    return () => {
      off();
      stop();
    };
  }, [read]);
  /** kind 의 목록을 바꾼다 — 사람이 고치면 추천 표시는 풀린다 */
  const change = useCallback(
    async (kind, list) => {
      const next = await changeKey(VIDEO_REFS_KEY, online, (v) => ({ ...(v || {}), [kind]: list, rec: { ...((v || {}).rec || {}), [kind]: false } }), {});
      setRefs(next);
      return next;
    },
    [online],
  );
  return { refs: refs || {}, loaded: refs != null, change };
}
