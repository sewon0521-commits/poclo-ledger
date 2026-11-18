import { Film } from "lucide-react";
import { VIDEO_KINDS, useVideoRefs } from "../lib/shootVideoRefs";
import { RefClipsBox } from "./RefClips";

/**
 * 겹 영상 기본 참고 영상 (11/18) — 촬영 날 화면(PoseRun.ShootRun)의 겹 영상 칸을 누르면 화면 가득 반복되는 영상.
 * 코디에 참고 영상이 없을 때 이 영상이 나온다(모든 촬영 같이). 릴스 기획 라이브러리에서 고르고 볼 부분만 자른다(구간만 저장).
 */
export default function VideoRefsBox({ online }) {
  const { refs, loaded, change } = useVideoRefs(online);
  return (
    <details className="group rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-stone-800 select-none">
        <Film size={14} className="text-rose-700" /> 겹 영상 참고 영상
        <span className="text-xs font-normal text-stone-400">
          모든 촬영 같이 · 코디에 참고 영상이 없으면 이게 나와요 ·{" "}
          {VIDEO_KINDS.map(([k]) => (refs[k] || []).length).reduce((a, b) => a + b, 0)}개
        </span>
      </summary>
      {!loaded ? (
        <p className="mt-2 text-xs text-stone-400">불러오는 중…</p>
      ) : (
        <div className="mt-3 space-y-4">
          {VIDEO_KINDS.map(([k, name, hint]) => (
            <div key={k}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-stone-800">{name}</span>
                <span className="text-[11px] text-stone-400">{hint}</span>
                {refs.rec?.[k] && (refs[k] || []).length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">추천 — 바꾸기</span>
                )}
              </div>
              <RefClipsBox list={refs[k] || []} onChange={(list) => change(k, list).catch(() => {})} online={online} />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
