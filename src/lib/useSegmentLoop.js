// 영상의 한 구간 [start, end] 만 되풀이 (10/29 — 참고 영상 장면, components/LoopClip.jsx · RefClips.jsx).
// 재생 중엔 매 화면마다 끝을 넘었는지 본다 — timeupdate(초에 4번)로는 0.25초씩 넘어가서. end 0 = 영상 끝까지.
import { useEffect } from "react";

export function useSegmentLoop(ref, start, end, on = true) {
  useEffect(() => {
    const v = ref.current;
    if (!v || !on) return;
    const s = Math.max(0, start || 0);
    let raf = 0;
    const lim = () => (end > s + 0.05 ? end : v.duration || 0);
    const tick = () => {
      const L = lim();
      if (L && v.currentTime >= L - 0.03) v.currentTime = s;
      else if (v.currentTime < s - 0.3) v.currentTime = s;
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);
    const ended = () => {
      v.currentTime = s;
      v.play().catch(() => {});
    };
    v.addEventListener("play", play);
    v.addEventListener("pause", stop);
    v.addEventListener("ended", ended);
    if (!v.paused) play();
    return () => {
      stop();
      v.removeEventListener("play", play);
      v.removeEventListener("pause", stop);
      v.removeEventListener("ended", ended);
    };
  }, [ref, start, end, on]);
}
