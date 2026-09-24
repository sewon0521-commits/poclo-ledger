import { useRef, useState } from "react";
import { Copy, Check, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { workerAlive } from "../lib/reels";

// 콘텐츠 화면(릴스 기획 · 캐러셀 기획)이 같이 쓰는 조각.

export function CopyButton({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("복사해서 쓰세요", text);
        }
      }}
      className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

// ------------------------------------------------------------- 분석기 상태

export function WorkerStatus({ worker }) {
  const alive = workerAlive(worker);
  return (
    <p className={"mt-2 flex items-start gap-1.5 text-xs " + (alive ? "text-emerald-700" : "text-stone-500")}>
      <span
        className={
          "mt-1 h-2 w-2 shrink-0 rounded-full " + (alive ? "bg-emerald-500" : "bg-stone-300")
        }
      />
      {alive ? (
        <span>
          사무실 PC 분석기 켜짐{worker.busy ? " · 지금 분석 중" : ""} — 소리까지 받아써서 분석해요.
        </span>
      ) : (
        <span>
          사무실 PC 분석기가 꺼져 있어요. 맡겨 두면 켜질 때 이어서 분석해요.
          <span className="block text-stone-400">
            켜기: poclo-cafe24 폴더의 <b className="font-medium">8_릴스분석기_켜기.bat</b> (한 번 켜 두면 PC 켤 때마다 자동)
          </span>
        </span>
      )}
    </p>
  );
}


/**
 * 눌러서 고치는 제목 (세원 2026-09-23: "제목을 변경 가능하게 바꿔줘").
 * 엔터·칸 밖 누르기로 저장, Esc 로 취소.
 */
export function EditableTitle({ value, onChange, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const v = draft.trim();
          if (v && v !== value) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value || "");
            setEditing(false);
          }
        }}
        className={"w-full rounded-md border border-rose-500 px-2 py-0.5 text-base font-semibold outline-none " + className}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value || "");
        setEditing(true);
      }}
      title="눌러서 제목 고치기"
      className={"group flex min-w-0 items-center gap-1 text-left " + className}
    >
      <span className="truncate font-semibold text-stone-900">{value}</span>
      <Pencil size={12} className="shrink-0 text-stone-300 group-hover:text-stone-500" />
    </button>
  );
}

/**
 * 캐러셀 장 넘겨 보기 (9/24 세원: "캐러셀 사진도 넘길 수 있게").
 * 손가락으로 밀거나(가로 스크롤 스냅) 양옆 화살표·키보드 ←/→ 로 한 장씩. 아래 점과 'n / N'.
 * urls 에 아직 안 받은 장(null)이 있으면 회색 칸.
 */
export function SlideViewer({ urls, className = "", fit = "contain" }) {
  const box = useRef(null);
  const drag = useRef(null); // 마우스로 끌기 {x, left, moved}
  const [at, setAt] = useState(0);
  const n = urls.length;

  // 9/24 세원: "드래그하면 옆으로 가게" — 손가락은 원래 밀리고, 마우스도 끌어서 넘긴다.
  // 끄는 동안은 스냅을 끄고 손을 떼면 1/6 넘게 끌었으면 옆 장으로.
  const onDown = (e) => {
    if (e.pointerType !== "mouse" || n < 2) return;
    const el = box.current;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: 0, from: at };
    el.style.scrollSnapType = "none";
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    d.moved = e.clientX - d.x;
    box.current.scrollLeft = d.left - d.moved;
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = box.current;
    const w = el.clientWidth;
    const k = Math.abs(d.moved) > w / 6 ? d.from + (d.moved < 0 ? 1 : -1) : d.from;
    el.scrollTo({ left: Math.max(0, Math.min(n - 1, k)) * w, behavior: "smooth" });
    setTimeout(() => {
      if (el) el.style.scrollSnapType = "";
    }, 350);
  };
  const go = (i) => {
    const el = box.current;
    if (!el) return;
    const k = Math.max(0, Math.min(n - 1, i));
    el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div
      className={"group relative " + className}
      tabIndex={n > 1 ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(at + 1);
        if (e.key === "ArrowLeft") go(at - 1);
      }}
    >
      <div
        ref={box}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className={"flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " + (n > 1 ? "cursor-grab active:cursor-grabbing" : "")}
      >
        {urls.map((u, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {u ? (
              <img src={u} alt={`${i + 1}번째 장`} className={"h-full w-full " + (fit === "cover" ? "object-cover" : "object-contain")} draggable={false} />
            ) : (
              <div className="h-full w-full bg-stone-200" />
            )}
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          {at > 0 && (
            <button
              type="button"
              onClick={() => go(at - 1)}
              aria-label="이전 장"
              className="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {at < n - 1 && (
            <button
              type="button"
              onClick={() => go(at + 1)}
              aria-label="다음 장"
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums">
            {at + 1} / {n}
          </span>
          <span className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}번째 장`}
                className={"h-1.5 rounded-full transition-all " + (i === at ? "w-4 bg-white" : "w-1.5 bg-white/60")}
              />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
