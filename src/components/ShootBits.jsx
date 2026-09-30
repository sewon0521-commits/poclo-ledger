import { useEffect, useState } from "react";
import { Camera, X } from "lucide-react";
import { SlideViewer } from "./ContentBits";

// 촬영 갈래(촬영 레퍼런스 · 신상 관리 · 코디)가 같이 쓰는 조각.

export function Sheet({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={"sheet relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl " + (wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        {children}
      </div>
    </div>
  );
}

export function SheetHead({ title, onClose, right }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
      <h3 className="min-w-0 truncate font-semibold text-stone-900">{title}</h3>
      <span className="flex items-center gap-2">
        {right}
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </span>
    </header>
  );
}

/** 꼬리표 칩 줄 — multi 면 여러 개, 아니면 하나(다시 누르면 풀림) */
export function Chips({ list, value, onChange, multi, all, onAdd }) {
  const has = (t) => (multi ? (value || []).includes(t) : value === t);
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {all && (
        <button
          type="button"
          onClick={() => onChange(multi ? [] : "")}
          className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + ((multi ? !value?.length : !value) ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}
        >
          {all}
        </button>
      )}
      {list.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(multi ? (has(t) ? value.filter((x) => x !== t) : [...(value || []), t]) : has(t) ? "" : t)}
          className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (has(t) ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
        >
          {t}
        </button>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={() => {
            const n = window.prompt("새 꼬리표 이름");
            if (n?.trim()) onAdd(n.trim());
          }}
          className="shrink-0 rounded-full border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700"
        >
          + 꼬리표
        </button>
      )}
    </div>
  );
}

export function Photo({ url, className = "", onClick }) {
  const inner = url ? (
    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-stone-300">
      <Camera size={18} />
    </span>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={"block overflow-hidden bg-stone-100 " + className}>
      {inner}
    </button>
  ) : (
    <span className={"block overflow-hidden bg-stone-100 " + className}>{inner}</span>
  );
}

/** 전체 화면 넘겨 보기 — 촬영 때 폰으로 */
export function Viewer({ slides, start = 0, onClose, footer }) {
  const [at] = useState(start);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const ordered = [...slides.slice(at), ...slides.slice(0, at)];
  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-white">
        <span className="text-sm text-white/70">{slides.length}장</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <SlideViewer urls={ordered.map((s) => s.url)} className="min-h-0 w-full flex-1" />
      {footer && <div className="shrink-0 px-4 py-3 text-sm text-white/80">{footer}</div>}
    </div>
  );
}

