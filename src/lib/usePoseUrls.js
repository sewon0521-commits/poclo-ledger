// 포즈 사진 보관 키 → 볼 주소 (11/16, components/PoseBoard · PoseRun 이 같이 쓴다)
import { useEffect, useRef, useState } from "react";
import { signedUrls } from "./refClips";

/** 보관 키 → 볼 주소 (4시간 서명, 이 기기 저장 모드는 data URL 그대로) */
export function usePoseUrls(keys, online, d) {
  const [urls, setUrls] = useState({});
  const wantKey = [...new Set(keys)].filter((k) => k && !k.startsWith("data:") && !(k in urls)).join("|");
  useEffect(() => {
    if (!wantKey) return;
    const ks = wantKey.split("|");
    signedUrls(ks, online)
      .then((m) => setUrls((u) => ({ ...u, ...Object.fromEntries(ks.map((k) => [k, ""])), ...m })))
      .catch(() => {});
  }, [wantKey, online]);
  const fresh = useRef({}); // 방금 올린 사진 — 서명 주소 받기 전 미리 보기
  const urlOf = (k) => (!k ? "" : k.startsWith("data:") ? k : urls[k] || fresh.current[k] || d?.urls?.[k] || "");
  return { urlOf, setFresh: (k, u) => (fresh.current[k] = u) };
}

