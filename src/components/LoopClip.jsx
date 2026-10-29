import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Film, Maximize2, Play, Repeat, Volume2, VolumeX, X } from "lucide-react";
import { useSegmentLoop } from "../lib/useSegmentLoop";

// 참고 영상의 한 구간만 되풀이 (10/29 세원: "자르고 그 영상을 누르면 그 영상을 무한 반복해 주고. 모델들 그 장면 보고 따라 할 수 있게.")
// 파일은 그대로 두고 [start, end] 만 돈다 — 끝에 닿으면 start 로. end 0 = 영상 끝까지.
// ERP 스타일링 창 · 고르기 창, 모델 촬영 시트(SheetPage)가 같이 쓴다. 소리는 꺼진 채 시작(폰은 소리 켠 자동 재생을 막는다), 단추로 켠다.

const lenText = (start, end) => (end > start ? `${(Math.round((end - start) * 10) / 10).toFixed(1)}초` : "반복");

/**
 * 한 장면 — 누르면 그 구간만 계속 반복, 다시 누르면 멈춤.
 * src 가 없으면(지워진 영상 · 이 기기 저장 모드) 썸네일만.
 */
export default function LoopClip({ src, poster, start = 0, end = 0, className = "", fit = "cover", autoPlay = false, onBig, label }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  useSegmentLoop(ref, start, end, !!src);
  useEffect(() => {
    const v = ref.current;
    if (!autoPlay || !v) return;
    v.muted = true;
    v.currentTime = start || 0;
    v.play().catch(() => {});
  }, [autoPlay, src, start]);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      const L = end > start ? end : v.duration || 0;
      if (v.currentTime < start - 0.3 || (L && v.currentTime >= L - 0.05)) v.currentTime = start || 0;
      v.play().catch(() => {});
    } else v.pause();
  };
  return (
    <div className={"relative overflow-hidden bg-stone-900 " + className}>
      {src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={ref}
          src={`${src}#t=${start || 0}`}
          poster={poster || undefined}
          muted={muted}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={toggle}
          aria-label={label || "참고 영상"}
          className={"block h-full w-full cursor-pointer " + (fit === "contain" ? "object-contain" : "object-cover")}
        />
      ) : poster ? (
        <img src={poster} alt="" className={"block h-full w-full " + (fit === "contain" ? "object-contain" : "object-cover")} />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-stone-500">
          <Film size={20} />
          <span className="text-[11px]">영상 없음</span>
        </span>
      )}
      {src && !playing && (
        <button type="button" onClick={toggle} aria-label="반복해서 보기" className="absolute inset-0 flex items-center justify-center bg-black/15">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow-lg">
            <Play size={20} className="ml-0.5 fill-stone-900" />
          </span>
        </button>
      )}
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
        <Repeat size={11} /> {lenText(start, end)}
      </span>
      {src && playing && (
        <button
          type="button"
          onClick={() => {
            setMuted((m) => !m);
            if (ref.current) ref.current.muted = !muted;
          }}
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
          className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      )}
      {onBig && (
        <button type="button" onClick={onBig} aria-label="크게 보기" className="absolute right-1.5 bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
          <Maximize2 size={14} />
        </button>
      )}
    </div>
  );
}

/** 화면 가득 — 촬영장에서 모델에게 보여 줄 때. clips [{src, poster, start, end, note, title}] · ← → 넘기기 · Esc 닫기 */
export function ClipBig({ clips, at = 0, onClose }) {
  const [i, setI] = useState(Math.min(Math.max(0, at), clips.length - 1));
  const go = (d) => setI((x) => (x + d + clips.length) % clips.length);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((x) => (x + 1) % clips.length);
      else if (e.key === "ArrowLeft") setI((x) => (x - 1 + clips.length) % clips.length);
    };
    document.addEventListener("keydown", k);
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = keep;
    };
  }, [onClose, clips.length]);
  const c = clips[i];
  if (!c) return null;
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          {clips.length > 1 && <span className="mr-2 text-sm text-white/60 tabular-nums">{i + 1} / {clips.length}</span>}
          <span className="text-sm font-semibold">{c.note || c.title || "참고 영상"}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <LoopClip key={i} src={c.src} poster={c.poster} start={c.start} end={c.end} fit="contain" autoPlay className="h-full w-full !bg-black" />
        {clips.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="앞 장면" className="absolute top-1/2 left-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronLeft size={22} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="다음 장면" className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      <p className="shrink-0 px-3 py-2 text-center text-xs text-white/50">영상을 누르면 멈추고, 다시 누르면 그 장면만 계속 반복돼요</p>
    </div>,
    document.body,
  );
}
