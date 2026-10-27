import { useEffect, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { SlideViewer } from "./ContentBits";
import { newId } from "../lib/id";

// 촬영 갈래(촬영 레퍼런스 · 신상 관리 · 코디)가 같이 쓰는 조각.

/**
 * 체크 목록 — 찍을 컷 · 찍을 영상 [{id, text, done}]. 적고 엔터로 더하기, 네모 눌러 끝냄, × 빼기.
 * 10/27 세원: "촬영 관리에 찍을 컷, 찍을 영상 그걸 이 촬영 코디 안에 각각" — 예전엔 촬영(날짜)에 하나, 이제 코디마다(스타일링 창 맨 위). extra = 제목 줄 오른쪽 단추 자리.
 */
export function CheckList({ title, list = [], onChange, placeholder, extra }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v) onChange([...list, { id: newId("k"), text: v, done: false }]);
    setTyped("");
  };
  const done = list.filter((x) => x.done).length;
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-stone-800">
        {title}
        <span className="flex items-center gap-2">
          {extra}
          {list.length > 0 && <span className="text-xs font-normal text-stone-400">{done}/{list.length}</span>}
        </span>
      </div>
      <ul className="space-y-1">
        {list.map((x) => (
          <li key={x.id} className="group flex items-start gap-2">
            <button
              type="button"
              onClick={() => onChange(list.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))}
              aria-pressed={x.done}
              aria-label={x.done ? "끝낸 것 풀기" : "끝냄"}
              className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 " + (x.done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white")}
            >
              {x.done && <Check size={12} strokeWidth={3} />}
            </button>
            <span className={"min-w-0 flex-1 text-sm leading-snug break-words " + (x.done ? "text-stone-400 line-through" : "text-stone-800")}>{x.text}</span>
            <button type="button" onClick={() => onChange(list.filter((y) => y.id !== x.id))} aria-label="빼기" className="p-1 text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-700 max-sm:opacity-100">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-400"
      />
    </div>
  );
}

export function Sheet({ onClose, children, wide, xwide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={"sheet relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl " + (xwide ? "sm:max-w-5xl" : wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
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
export function Chips({ list, value, onChange, multi, all, onAdd, addLabel = "+ 꼬리표", addPrompt = "새 꼬리표 이름" }) {
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
            const n = window.prompt(addPrompt);
            if (n?.trim()) onAdd(n.trim());
          }}
          className="shrink-0 rounded-full border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700"
        >
          {addLabel}
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

