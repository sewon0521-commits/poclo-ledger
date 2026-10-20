import { useEffect, useRef, useState } from "react";
import { X, MousePointerClick } from "lucide-react";

/**
 * 인스타에서 한 번에 담기 — 즐겨찾기 단추 안내 (10/20). 단추 코드는 public/insta-clip.js 통째로.
 * 인스타는 바깥 스크립트를 막아서(CSP) 신마 단추처럼 '불러오기'를 못 한다 → 코드가 바뀌면 단추를 다시 끌어다 놓아야 한다.
 */
export default function InstaClipGuide({ onClose }) {
  const link = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/insta-clip.js?t=" + Date.now(), { cache: "no-store" })
      .then((r) => r.text())
      .then((core) => {
        if (!alive) return;
        const body = core
          .split("\n")
          .filter((l) => !l.trim().startsWith("//"))
          .join("\n");
        const code = `(function(){window.__pocloO='${window.location.origin}';${body}})();`;
        // React 는 javascript: 주소를 막는다 — 그린 뒤에 직접 넣는다
        link.current?.setAttribute("href", "javascript:" + encodeURIComponent(code));
        setReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-end justify-center bg-stone-900/45 sm:items-center sm:p-4" onClick={onClose}>
      <div className="sheet flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="font-semibold text-stone-900">인스타에서 한 번에 담기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed text-stone-700">
          <p>
            인스타 <b>저장됨</b>(또는 어느 계정 목록)에서 단추를 누르면 게시물마다 체크 동그라미가 떠요. 담을 릴스를 골라 <b>'N개 담기'</b>를 누르면 작은 창에 링크·계정·글·좋아요·댓글이 한꺼번에 들어와요.
          </p>
          <ol className="space-y-3">
            <li className="rounded-xl border border-stone-200 p-3">
              <b className="text-stone-900">① 아래 단추를 즐겨찾기 막대로 끌어다 놓기</b>
              <p className="mt-1 text-xs text-stone-500">막대가 안 보이면 크롬에서 Ctrl + Shift + B. 신마용 '포클로에 담기'와는 다른 단추예요.</p>
              <a
                ref={link}
                onClick={(e) => e.preventDefault()}
                className={"mt-2 inline-flex cursor-grab items-center gap-1.5 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow active:cursor-grabbing " + (ready ? "" : "opacity-50")}
              >
                <MousePointerClick size={15} /> 인스타 → 포클로
              </a>
            </li>
            <li className="rounded-xl border border-stone-200 p-3">
              <b className="text-stone-900">② 인스타 저장됨에서 그 즐겨찾기 누르기</b>
              <p className="mt-1 text-xs text-stone-500">
                게시물을 눌러 고르고(다시 누르면 빠져요) 'N개 담기'. '보이는 것 전부'는 지금 화면에 보이는 걸 다 골라요 — 아래로 내리면 더 고를 수 있어요. 인스타가 막지 않게 하나에 1초쯤씩 천천히 읽어요.
              </p>
            </li>
            <li className="rounded-xl border border-stone-200 p-3">
              <b className="text-stone-900">③ 작은 창에서 담는 방식 고르고 담기</b>
              <p className="mt-1 text-xs text-stone-500">
                보관만(무료) / 분석까지, 릴스 폴더를 고르고 'N개 담기'. 이미 있는 릴스는 빼 두고, 사진·캐러셀은 캐러셀 기획에 보관만으로 들어가요.
              </p>
            </li>
          </ol>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-950">
            <b>못 받는 릴스도 받아져요</b> — 세원님 브라우저가 보고 있는 영상 주소를 같이 넘겨서, 사무실 PC 가 링크로 못 받으면(나이·나라 제한 등) 그 주소로 받아요. 예전에 '못 받음'이 된 릴스는 인스타에서 그 게시물을 연 채로 단추를 누르면 다시 받아요.
            <br />
            영상 주소는 며칠 지나면 만료돼요 — 담은 뒤 사무실 PC 가 꺼져 있으면 켜졌을 때 바로 받아요.
          </div>
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">컴퓨터 크롬에서만 돼요. 단추를 바꿨다고 알려 드리면 예전 단추를 지우고 다시 끌어다 놓아 주세요.</p>
        </div>
      </div>
    </div>
  );
}
