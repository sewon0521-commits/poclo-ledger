import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 카드 목록을 한 번에 다 그리지 않기 (10/26 세원: "ERP 에 정보가 쌓이니까 렉 걸리는 거 해결할 수 있는 방법은?")
 * 폰 속도로 재 보니 신상 관리 탭 하나(카드 100여 개)를 다 그리느라 1.3~1.6초 멈췄다 → 처음 page 개만 그리고,
 * 목록 끝이 화면에 가까워지면 저절로 page 개씩 더. 보는 목록이 바뀌면(sig) 다시 처음부터.
 */
export function useLimit(page, sig) {
  const [limit, setLimit] = useState(page);
  const [was, setWas] = useState(sig);
  if (was !== sig) {
    setWas(sig);
    setLimit(page);
  }
  const more = useCallback(() => setLimit((n) => n + page), [page]);
  return [limit, more];
}

/** 목록 끝 — 화면에 가까워지면 저절로 더 그리고, 눌러도 더 */
export default function MoreCards({ left, onMore }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && onMore(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onMore, left]);
  return (
    <div ref={ref} className="col-span-full flex justify-center pt-1">
      <button type="button" onClick={onMore} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:border-rose-300 hover:text-rose-800">
        더 보기 · {left}개 남음
      </button>
    </div>
  );
}
