import { Camera, ExternalLink, Repeat, Video } from "lucide-react";
import { guideBlocks } from "../lib/modelGuide";
import { IgEmbed, igEmbedOf } from "./IgEmbed";
import LoopClip from "./LoopClip";

// 모델 기본 가이드를 그리는 부품 (10/29) — 모델 촬영 시트(SheetPage) · ERP 고치기 창 미리 보기가 같이 쓴다.
// 글은 lib/modelGuide guideBlocks 로 읽는다: '→' 로 이은 줄 = 번호 단계(사진·영상 표시), 아래에 들여 쓴 줄이 있는 줄 = 머리('아우터 X'), 점 줄 = 목록.
// 칸마다 포즈 사진(+ 설명) · 참고 영상(릴스 기획에서 자른 장면 — 누르면 그 장면만 반복 / 인스타 주소 — 시트 안 영상).

const KIND = {
  photo: { label: "사진", Icon: Camera, cls: "bg-rose-50 text-rose-800 ring-1 ring-rose-200" },
  video: { label: "영상", Icon: Video, cls: "bg-stone-800 text-white" },
};

const hostOf = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** 레퍼런스 링크 — 인스타 릴스·게시물은 시트 안 영상(공식 임베드), 그 밖 링크는 새 탭 단추. 영상 가이드 · 코디 카드(v3) · 기본 가이드가 같이 쓴다 */
export function RefLinks({ links }) {
  return links.map((l, i) => {
    const ig = igEmbedOf(l.url);
    return ig ? (
      <section key={i} className="space-y-2">
        {l.name && <h3 className="text-[15px] leading-snug font-bold text-stone-900">{l.name}</h3>}
        <div className="-mx-4 overflow-hidden border-y border-stone-200 sm:mx-0 sm:rounded-xl sm:border">
          <IgEmbed src={ig} title={l.name} />
        </div>
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 underline-offset-2 hover:text-rose-700 hover:underline">
          <ExternalLink size={12} /> 인스타에서 보기
        </a>
      </section>
    ) : (
      <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5 text-sm hover:border-rose-300">
        <ExternalLink size={15} className="shrink-0 text-rose-700" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-stone-900">{l.name || hostOf(l.url)}</span>
          {l.name && <span className="block truncate text-xs text-stone-400">{hostOf(l.url)}</span>}
        </span>
      </a>
    );
  });
}

function Flow({ steps }) {
  return (
    <ol className="mt-2.5">
      {steps.map((s, k) => {
        const K = KIND[s.kind];
        return (
          <li key={k} className="relative flex gap-3 pb-3 last:pb-0">
            {k < steps.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-px bg-stone-200" />}
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-stone-600 ring-1 ring-stone-300 tabular-nums">{k + 1}</span>
            <span className="min-w-0 pt-[3px] text-[15px] leading-snug break-words text-stone-800">
              {K && (
                <span className={"mr-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold " + K.cls}>
                  <K.Icon size={11} /> {K.label}
                </span>
              )}
              {s.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 칸 글 하나 */
export function GuideText({ text }) {
  const blocks = guideBlocks(text);
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => {
        const pad = { paddingLeft: `${Math.max(0, b.depth - (b.type === "flow" ? 1 : 0)) * 0.9}rem` };
        if (b.type === "head")
          return b.depth === 0 ? (
            <div key={i} className={i ? "pt-3" : ""}>
              <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-bold text-white">{b.text}</span>
            </div>
          ) : (
            <div key={i} style={pad} className="pt-1 text-sm font-bold text-stone-900">
              {b.text}
            </div>
          );
        if (b.type === "flow")
          return (
            <div key={i} style={pad}>
              <Flow steps={b.steps} />
            </div>
          );
        if (b.type === "item")
          return (
            <div key={i} style={pad} className="flex gap-2.5 text-[15px] leading-relaxed text-stone-800">
              <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-500" />
              <span className="min-w-0 break-words">{b.text}</span>
            </div>
          );
        return (
          <p key={i} style={pad} className="text-[15px] leading-relaxed break-words text-stone-800">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 칸들 — items [{title, text, photos:[{url, cap}], clips:[{src, poster, start, end, note}], links:[{name, url}]}]
 * 사진(포즈 예시)은 누르면 onBig(주소들, 몇 번째), 장면은 누르면 그 장면만 반복 · 크게는 onClip(장면들, 몇 번째)
 */
export function GuideSections({ items, onBig, onClip }) {
  return items.map((x, i) => {
    const photos = (x.photos || []).filter((p) => p.url);
    const clips = x.clips || [];
    const links = x.links || [];
    return (
      <section key={i} className={i ? "border-t border-stone-200 pt-4" : ""}>
        {x.title && <h2 className="mb-2 text-[17px] font-bold text-stone-900">{x.title}</h2>}
        <GuideText text={x.text} />
        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {photos.map((p, k) => (
              <figure key={k} className="min-w-0">
                <button type="button" onClick={() => onBig?.(photos.map((q) => q.url), k)} className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-stone-100">
                  <img src={p.url} alt={p.cap || "포즈 예시"} loading="lazy" className="h-full w-full object-cover" />
                </button>
                {p.cap && <figcaption className="mt-1 text-[13px] leading-snug text-stone-700">{p.cap}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        {clips.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1 text-xs font-semibold text-stone-500">
                <Repeat size={12} className="text-rose-700" /> 참고 영상
              </span>
              <span className="text-[11px] text-stone-400">누르면 그 장면만 계속 반복돼요</span>
            </div>
            <div className={clips.length === 1 ? "mx-auto max-w-[16rem]" : "grid grid-cols-2 gap-2.5"}>
              {clips.map((k, j) => (
                <figure key={j} className="min-w-0">
                  <LoopClip src={k.src} poster={k.poster} start={k.start} end={k.end} label={k.note || `참고 영상 ${j + 1}`} onBig={k.src && onClip ? () => onClip(clips, j) : undefined} className="aspect-[9/16] w-full rounded-xl" />
                  {k.note && <figcaption className="mt-1 text-[13px] leading-snug font-medium text-stone-800">{k.note}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-3 space-y-4">
            <RefLinks links={links} />
          </div>
        )}
      </section>
    );
  });
}
