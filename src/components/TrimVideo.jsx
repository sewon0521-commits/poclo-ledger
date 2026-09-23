import { useEffect, useRef, useState } from "react";
import { Scissors, Loader2, Play, Undo2, Info } from "lucide-react";

/**
 * 영상 + 앞뒤 자르기 (9/23 세원: "영상 녹화를 직접 하다 보면 앞이나 뒤에 쓸데없는 장면이 1~2초 낄 수 있어서 지우고 싶어").
 *
 * - '앞뒤 자르기' → 막대의 양 끝 손잡이를 끌거나 ±0.1초 단추로 고른다. 끄는 동안 그 장면이 보인다.
 * - '이대로 자르기' → trim {start, end, status:"queued"} 를 저장하고 사무실 PC 분석기(target trim)에 맡긴다.
 *   PC 가 실제 파일을 잘라 덮기 전에도 이 화면에서는 고른 구간만 재생한다.
 * - 처음 자를 때 원본을 따로 남겨 두므로 '원래대로' 로 되돌릴 수 있다.
 */

const fmt = (s) => `${Math.max(0, s).toFixed(1)}초`;
const MIN_LEN = 0.5;

export default function TrimVideo({ src, trim, hasOrig, step, className, onTrim, onRestore }) {
  const ref = useRef(null);
  const bar = useRef(null);
  const [dur, setDur] = useState(0);
  const [edit, setEdit] = useState(false);
  const [range, setRange] = useState([0, 0]);
  const [busy, setBusy] = useState(false);

  const pending = trim && (trim.status === "queued" || trim.status === "working");
  // 아직 PC 가 안 잘랐으면 고른 구간만 보여 준다
  const soft = pending ? [trim.start || 0, trim.end || 0] : edit ? range : null;
  const s0 = soft?.[0];
  const s1 = soft?.[1];

  // 새로 잘린 파일은 주소가 같아서 브라우저가 예전 것을 보여 줄 수 있다 — 자른 시각을 붙인다
  const url = src && trim?.at && trim.status === "done" ? `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(trim.at)}` : src;

  useEffect(() => {
    const v = ref.current;
    if (!v || s0 === undefined) return;
    const stop = () => {
      if (s1 > 0 && v.currentTime >= s1) {
        v.pause();
        v.currentTime = s0;
      } else if (v.currentTime < s0 - 0.05) v.currentTime = s0;
    };
    v.addEventListener("timeupdate", stop);
    return () => v.removeEventListener("timeupdate", stop);
  }, [s0, s1]);

  const seek = (t) => {
    if (ref.current) ref.current.currentTime = t;
  };

  const set = (i, t) => {
    setRange((r) => {
      const n = [...r];
      n[i] = i === 0 ? Math.max(0, Math.min(t, r[1] - MIN_LEN)) : Math.min(dur, Math.max(t, r[0] + MIN_LEN));
      seek(n[i]);
      return n;
    });
  };

  const drag = (i) => (e) => {
    e.preventDefault();
    const box = bar.current.getBoundingClientRect();
    const move = (ev) => set(i, ((ev.clientX - box.left) / box.width) * dur);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    ref.current?.pause();
  };

  const pct = (t) => (dur ? `${(t / dur) * 100}%` : "0%");

  return (
    <div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={url}
        controls={!edit}
        playsInline
        className={className}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration || 0;
          setDur(d);
          if (s0) e.currentTarget.currentTime = s0;
        }}
      />

      {edit ? (
        <div className="mt-2 space-y-2 rounded-lg bg-stone-800 p-2.5 text-[11px] text-stone-300">
          <p>노란 손잡이를 끌어 남길 부분을 골라요. 어두운 곳이 잘려요.</p>
          <div ref={bar} className="relative h-9 touch-none rounded-md bg-stone-600">
            <span className="absolute inset-y-0 left-0 rounded-l-md bg-black/60" style={{ width: pct(range[0]) }} />
            <span className="absolute inset-y-0 right-0 rounded-r-md bg-black/60" style={{ left: pct(range[1]) }} />
            <span className="absolute inset-y-0 border-y-2 border-amber-400" style={{ left: pct(range[0]), right: `calc(100% - ${pct(range[1])})` }} />
            {[0, 1].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? "시작 손잡이" : "끝 손잡이"}
                onPointerDown={drag(i)}
                className="absolute inset-y-0 w-4 -translate-x-1/2 cursor-ew-resize rounded bg-amber-400 active:scale-100"
                style={{ left: pct(range[i]) }}
              >
                <span className="mx-auto block h-4 w-0.5 rounded bg-amber-900/60" />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-1 rounded-md bg-stone-900/60 px-1.5 py-1">
                <span className="whitespace-nowrap">{i === 0 ? `앞 ${fmt(range[0])}` : `뒤 ${fmt(dur - range[1])}`}</span>
                <span className="flex gap-0.5">
                  {[-0.1, 0.1].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set(i, range[i] + d)}
                      className="h-6 w-6 rounded bg-stone-700 font-semibold text-white hover:bg-stone-600"
                    >
                      {d < 0 ? "−" : "+"}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span>남는 길이 {fmt(range[1] - range[0])}</span>
            <button
              type="button"
              onClick={() => {
                seek(range[0]);
                ref.current?.play();
              }}
              className="flex items-center gap-1 rounded-md bg-stone-700 px-2 py-1 font-medium text-white hover:bg-stone-600"
            >
              <Play size={11} /> 잘린 대로 보기
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setEdit(false)}
              className="flex-1 rounded-md border border-stone-600 py-1.5 font-medium text-stone-300 hover:bg-stone-700"
            >
              그만두기
            </button>
            <button
              type="button"
              disabled={busy || (range[0] < 0.05 && dur - range[1] < 0.05)}
              onClick={async () => {
                setBusy(true);
                try {
                  await onTrim(Math.round(range[0] * 10) / 10, Math.round(range[1] * 10) / 10);
                  setEdit(false);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex flex-[2] items-center justify-center gap-1 rounded-md bg-amber-400 py-1.5 font-semibold text-amber-950 disabled:opacity-40"
            >
              <Scissors size={12} /> 이대로 자르기
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
          {pending ? (
            <span className="flex items-center gap-1 text-amber-300">
              <Loader2 size={11} className="animate-spin" /> {step || (trim.restore ? "원래 영상으로 되돌릴 차례를 기다려요" : "사무실 PC가 자를 차례를 기다려요")}
              {!trim.restore && " · 지금은 고른 구간만 재생해요"}
            </span>
          ) : (
            <>
              <button
                type="button"
                disabled={!dur}
                onClick={() => {
                  setRange([0, dur]);
                  setEdit(true);
                }}
                className="flex items-center gap-1 rounded-md bg-stone-800 px-2 py-1 font-medium text-stone-200 hover:bg-stone-700 disabled:opacity-40"
              >
                <Scissors size={11} /> 앞뒤 자르기
              </button>
              {trim?.status === "done" && trim.cut && (
                <span>
                  앞 {fmt(trim.cut.front)} · 뒤 {fmt(trim.cut.back)} 잘랐어요
                </span>
              )}
              {trim?.status === "done" && trim.restored && <span>원래 영상으로 되돌렸어요</span>}
              {hasOrig && (
                <button
                  type="button"
                  onClick={() => window.confirm("자르기 전 원래 영상으로 되돌릴까요?") && onRestore()}
                  className="flex items-center gap-1 text-stone-400 underline-offset-2 hover:text-stone-200 hover:underline"
                >
                  <Undo2 size={11} /> 원래대로
                </button>
              )}
              {trim?.status === "error" && (
                <span className="flex items-center gap-1 text-rose-300">
                  <Info size={11} /> {trim.message || "자르지 못했어요"}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
