import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** 인스타 릴스·게시물 주소 → 공식 임베드 주소 (아니면 "") — instagram.com/reel/ID · /reels/ID · /p/ID · /tv/ID · /계정/reel/ID */
const IG_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/i;
export const igEmbedOf = (u) => {
  const m = String(u || "").match(IG_RE);
  return m ? `https://www.instagram.com/${m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase()}/${m[2]}/embed/` : "";
};

/**
 * 인스타 공식 임베드 (10/27 세원: "레퍼런스가 인스타면 단추 대신 영상이 시트 안에서 바로") — 영상은 받지 않고 임베드만.
 * 촬영 시트 '영상 가이드'(SheetPage) · 스타일링 창 '참고 영상'(Styling) 이 같이 쓴다.
 * 인스타 틀이 그려진 뒤 필요한 높이를 postMessage {type:"MEASURE", details:{height}} 로 알려 준다 → 그 높이로(세로 영상이 잘리지 않게).
 * 그 전엔 폭으로 어림(영상 칸 4:5 + 위 계정 줄·아래 좋아요 줄 약 190px).
 * 인스타가 임베드 재생을 막은 릴스는 누르면 인스타로 넘어간다 → 쓰는 쪽에서 '인스타에서 보기'도 단다.
 */
export function IgEmbed({ src, title }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const w = ref.current?.clientWidth || 358;
    setH((v) => v || Math.round(w * 1.25 + 190));
  }, []);
  useEffect(() => {
    const on = (e) => {
      if (e.origin !== "https://www.instagram.com" || e.source !== ref.current?.contentWindow) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const n = Number(d?.type === "MEASURE" && d.details?.height);
        if (n > 100) setH(Math.ceil(n));
      } catch {
        /* 인스타가 보낸 다른 신호 */
      }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  return (
    <iframe
      ref={ref}
      src={src}
      title={title || "인스타 레퍼런스 영상"}
      loading="lazy"
      scrolling="no"
      allowFullScreen
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      style={{ height: h || undefined }}
      className="block w-full border-0 bg-white"
    />
  );
}
