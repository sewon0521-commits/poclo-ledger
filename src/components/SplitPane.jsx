import { useRef } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { PAGES, defaultSplitW } from "../lib/split";

/**
 * 창 나누기 (10/21 세원: "노션처럼 앱처럼 포클로 ERP 안에서 창을 나눌 수 있을까?")
 * 왼쪽(지금 화면)은 그대로 두고, 오른쪽에 다른 화면 하나를 따로 연다 — 오른쪽은 혼자 스크롤된다(노션 사이드 보기처럼).
 * 열기: 왼쪽 메뉴에서 Ctrl·Shift+클릭(또는 가운데 클릭), 메뉴 줄 오른쪽 '옆에 열기', 화면 오른쪽 위 '창 나누기'.
 * 가운데 줄을 끌어 폭을 바꾸고, ⇄ 로 좌우를 바꾸고, × 로 닫는다. 넓은 화면(1024px 이상)에서만 — 폰은 그대로 한 화면.
 * 기기마다 기억: localStorage poclo_split {page, w, on}.
 */

const MIN_W = 360;

export default function SplitPane({ page, w, onW, onPage, onSwap, onClose, mainPage, children }) {
  const drag = useRef(null);
  const max = () => Math.max(MIN_W, Math.round(window.innerWidth * 0.7));
  const width = Math.min(Math.max(w || defaultSplitW(), MIN_W), max());
  const onDown = (e) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    drag.current.last = Math.round(Math.min(Math.max(drag.current.w - (e.clientX - drag.current.x), MIN_W), max()));
    onW(drag.current.last, false);
  };
  const onUp = () => {
    if (!drag.current) return;
    const last = drag.current.last ?? drag.current.w;
    drag.current = null;
    onW(last, true); // 끌기가 끝나면 그 폭을 기억
  };
  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="창 폭 바꾸기 — 끌어서"
        title="끌어서 폭 바꾸기"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="group sticky top-0 z-30 flex h-screen w-2 shrink-0 cursor-col-resize touch-none items-center justify-center self-start bg-stone-200/70 hover:bg-rose-200"
      >
        <span className="h-10 w-0.5 rounded-full bg-stone-400 group-hover:bg-rose-500" />
      </div>
      <aside data-split style={{ width }} className="sticky top-0 h-screen shrink-0 self-start overflow-y-auto overscroll-contain bg-stone-50">
        <div className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-stone-200 bg-white/95 px-3 py-2 backdrop-blur">
          <select
            value={page}
            onChange={(e) => onPage(e.target.value)}
            aria-label="옆 창에 볼 화면"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-semibold text-stone-800 outline-none focus:border-rose-400"
          >
            {PAGES.map((s) => (
              <optgroup key={s.label} label={s.label}>
                {s.items.map((x) => (
                  <option key={x.key} value={x.key} disabled={x.key === mainPage}>
                    {x.label}
                    {x.key === mainPage ? " (왼쪽에 열려 있음)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={onSwap} title="왼쪽과 바꾸기" aria-label="왼쪽과 바꾸기" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800">
            <ArrowLeftRight size={16} />
          </button>
          <button type="button" onClick={onClose} title="옆 창 닫기" aria-label="옆 창 닫기" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-rose-700">
            <X size={17} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
