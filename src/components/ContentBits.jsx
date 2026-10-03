import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, Pencil, ChevronLeft, ChevronRight, Sparkles, Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { loadKey, changeKey, md } from "../lib/shoot";
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
/**
 * 넘겨 보기. start = 처음 보일 장, jump = {i} 가 바뀌면 그 장으로, onAt = 지금 장이 바뀔 때,
 * expandable = 사진을 누르면 전체 화면(BigSlides) — 10/3 세원: "캐러셀 사진 좀 더 크게. 너무 작아서 글씨가 안 보여"
 * onTap = 누르면(끌지 않고) 부를 것
 */
/**
 * 전체 화면 넘겨 보기 — 사진을 누르면 그 자리를 확대(2.5배), 한 번 더 누르면 원래대로. 확대한 채로 끌어서(손가락은 밀어서) 옮겨 본다.
 * 상세 창 안(움직이는 창 안에선 fixed 가 갇힌다)이 아니라 body 에 띄운다.
 */
export function BigSlides({ urls, start = 0, onClose }) {
  const [at, setAt] = useState(start);
  const [zoom, setZoom] = useState(null); // {i, fx, fy} 누른 자리(0~1)
  const pane = useRef(null);
  const pan = useRef(null);
  useEffect(() => {
    const k = (e) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(null);
      else onClose();
    };
    document.addEventListener("keydown", k);
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = keep;
    };
  }, [zoom, onClose]);
  // 확대하면 누른 자리가 화면 가운데 오게
  useLayoutEffect(() => {
    const el = pane.current;
    if (!zoom || !el) return;
    el.scrollLeft = zoom.fx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = zoom.fy * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]);
  const z = 2.5;
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-white">
        <span className="text-sm text-white/70 tabular-nums">
          {at + 1} / {urls.length}
          <span className="ml-2 hidden text-white/50 sm:inline">{zoom ? "끌어서 옮겨 보기 · 누르면 원래대로" : "사진을 누르면 확대 · ← → 넘기기 · Esc 닫기"}</span>
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom(zoom ? null : { i: at, fx: 0.5, fy: 0.35 })}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm hover:bg-white/10"
          >
            {zoom ? <ZoomOut size={17} /> : <ZoomIn size={17} />} {zoom ? "원래대로" : "확대"}
          </button>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
            <X size={22} />
          </button>
        </span>
      </div>
      {zoom ? (
        <div
          ref={pane}
          className="min-h-0 w-full flex-1 cursor-grab overflow-auto overscroll-contain active:cursor-grabbing [scrollbar-width:thin]"
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") return;
            pan.current = { x: e.clientX, y: e.clientY, l: e.currentTarget.scrollLeft, t: e.currentTarget.scrollTop, moved: false };
          }}
          onPointerMove={(e) => {
            const p = pan.current;
            if (!p) return;
            const dx = e.clientX - p.x;
            const dy = e.clientY - p.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
            e.currentTarget.scrollLeft = p.l - dx;
            e.currentTarget.scrollTop = p.t - dy;
          }}
          onPointerUp={() => {
            const p = pan.current;
            pan.current = null;
            if (p && !p.moved) setZoom(null);
          }}
          onClick={(e) => e.pointerType !== "mouse" && e.nativeEvent.pointerType !== "mouse" && setZoom(null)}
        >
          <img
            src={urls[zoom.i]}
            alt=""
            draggable={false}
            className="block max-w-none select-none"
            style={{ height: `${z * 100}%`, width: "auto", margin: "0 auto" }}
          />
        </div>
      ) : (
        <SlideViewer
          urls={urls}
          start={at}
          onAt={setAt}
          className="min-h-0 w-full flex-1"
          onTap={(e, i, img) => {
            const r = img.getBoundingClientRect();
            // 사진이 칸 안에 맞춰 그려진 실제 자리 (object-contain)
            const k = Math.min(r.width / (img.naturalWidth || 1), r.height / (img.naturalHeight || 1));
            const w = (img.naturalWidth || 1) * k;
            const h = (img.naturalHeight || 1) * k;
            const fx = Math.min(1, Math.max(0, (e.clientX - (r.left + (r.width - w) / 2)) / w));
            const fy = Math.min(1, Math.max(0, (e.clientY - (r.top + (r.height - h) / 2)) / h));
            setZoom({ i, fx, fy });
          }}
        />
      )}
    </div>,
    document.body,
  );
}

export function SlideViewer({ urls, className = "", fit = "contain", start = 0, jump, onAt, expandable, onTap }) {
  const box = useRef(null);
  const drag = useRef(null); // 마우스로 끌기 {x, left, moved}
  const dragged = useRef(false);
  const [at, setAtState] = useState(start);
  const [big, setBig] = useState(false);
  const n = urls.length;
  const setAt = (k) => {
    setAtState(k);
    onAt?.(k);
  };
  // 처음 보일 장
  useLayoutEffect(() => {
    const el = box.current;
    if (el && start > 0) el.scrollLeft = start * el.clientWidth;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 누르기 — 마우스로 끌 때 포인터를 잡아서(setPointerCapture) click 이 사진이 아니라 넘김 칸으로 온다. 그래서 칸에서 받는다
  const tap = (e) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const img = box.current?.children[at]?.querySelector("img");
    if (!img) return;
    if (onTap) onTap(e, at, img);
    else if (expandable) setBig(true);
  };

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
    if (Math.abs(d.moved) > 4) dragged.current = true;
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
  useEffect(() => {
    if (jump) go(jump.i);
  }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps
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
        onClick={tap}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className={"flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " + (n > 1 ? "cursor-grab active:cursor-grabbing" : "")}
      >
        {urls.map((u, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {u ? (
              <img
                src={u}
                alt={`${i + 1}번째 장`}
                className={"h-full w-full " + (fit === "cover" ? "object-cover" : "object-contain") + (expandable || onTap ? " cursor-zoom-in" : "")}
                draggable={false}
              />
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
      {expandable && urls.some(Boolean) && (
        <button
          type="button"
          onClick={() => setBig(true)}
          className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/75"
        >
          <Maximize2 size={12} /> 크게 보기
        </button>
      )}
      {big && <BigSlides urls={urls} start={at} onClose={() => setBig(false)} />}
    </div>
  );
}

/**
 * 요즘 트렌드 메모 (세원 10/2: "요즘 트렌드 반영을 시켜야 할 것 같은데" — 포클로 방향성·쇼만마 단톡에서 나온 얘기를 모아 둔다).
 * settings 'reel_trends' {text, at}. 릴스·캐러셀 기획을 만들 때마다 AI 에게 같이 간다(lib/reels.js · carousel.js 의 withTrends —
 * 이 칸이 읽어 둔 이 기기 사본 poclo_reel_trends 를 붙인다). 분석·보관에는 안 붙인다(돈).
 * Claude 창에서도 단톡·위키 내용이 바뀌면 이 키를 고쳐 둔다.
 */
export function TrendBox({ online }) {
  const [v, setV] = useState(null);
  const [edit, setEdit] = useState(null); // 고치는 중이면 글
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    loadKey("reel_trends", online, { text: "" })
      .then((x) => alive && setV(x))
      .catch(() => alive && setV({ text: "" }));
    return () => {
      alive = false;
    };
  }, [online]);
  if (!v) return null;
  const lines = String(v.text || "").split("\n").filter((l) => l.trim());
  const save = async () => {
    try {
      setV(await changeKey("reel_trends", online, () => ({ text: edit.trim(), at: new Date().toISOString() }), { text: "" }));
      setEdit(null);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Sparkles size={15} className="text-amber-600" /> 요즘 트렌드 메모
          <span className="text-xs font-normal text-stone-500">· 기획을 만들 때마다 AI 에게 같이 줘요{v.at ? ` · ${md(v.at.slice(0, 10))} 고침` : ""}</span>
        </span>
        {edit === null && (
          <span className="flex items-center gap-2 text-xs">
            {lines.length > 3 && (
              <button type="button" onClick={() => setOpen(!open)} className="text-stone-500 hover:text-stone-800">
                {open ? "접기" : `펼치기 (${lines.length}줄)`}
              </button>
            )}
            <button type="button" onClick={() => setEdit(v.text || "")} className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-700">
              <Pencil size={11} /> 고치기
            </button>
          </span>
        )}
      </div>
      {edit === null ? (
        lines.length ? (
          <div className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-stone-700">
            {(open ? lines : lines.slice(0, 3)).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-stone-500">요즘 잘 되는 훅·컬러·무드·피할 것을 적어 두면 대본에 반영해요. Claude 에게 말해도 여기에 넣어 둬요.</p>
        )
      ) : (
        <div className="mt-2 space-y-2">
          <textarea value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="- 무드: 어른 여자 / 캐주얼 Y2K&#10;- 훅 예시: …" className="min-h-[12rem] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none [field-sizing:content] focus:border-rose-600" />
          <div className="flex items-center justify-end gap-2 text-sm">
            {msg && <span className="mr-auto text-xs text-rose-700">{msg}</span>}
            <button type="button" onClick={() => setEdit(null)} className="rounded-lg px-3 py-1.5 text-stone-500">
              취소
            </button>
            <button type="button" onClick={save} className="rounded-lg bg-rose-700 px-4 py-1.5 font-semibold text-white">
              저장
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
