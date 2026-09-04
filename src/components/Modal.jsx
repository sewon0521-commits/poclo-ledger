import { useEffect } from "react";

/**
 * 화면 가운데 떠오르는 창.
 *
 * 뒷배경을 눌러도 닫히지 않는다 — 입력하던 내용을 실수로 날리지 않게 하려는 것이다.
 * 닫으려면 X, 취소, Esc 중 하나를 쓴다.
 */
export default function Modal({ open, onClose, children, labelledBy }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // 창이 떠 있는 동안 뒤쪽이 같이 스크롤되지 않게
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-stone-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
