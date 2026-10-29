import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDashed, Upload, X, Loader2, ChevronLeft, ChevronRight, Maximize2, Pencil, Search, ExternalLink, MoreHorizontal, Trash2, Plus, Layers, ImagePlus } from "lucide-react";
import { loadKey, changeKey, upsert, remove, onSettingsChange, FIELD } from "../lib/shoot";
import { signedUrls } from "../lib/refClips";
import { clipImages, filesOf } from "../lib/pasteImages";
import { todayISO, dayLabel } from "../lib/calc";
import { newId } from "../lib/id";
import { SHOPS_KEY, STORIES_KEY, handleOf, putStory, removeStoryFiles, byDay, sameImage } from "../lib/stories";
import { Sheet, SheetHead } from "./ShootBits";
import { BigSlides } from "./ContentBits";

/**
 * 콘텐츠 › 경쟁사 스토리 (lib/stories.js 머리말).
 * 경쟁사마다 스토리 캡처를 날짜별로 모아 두고, 날짜를 누르면 그날 스토리를 한 번에 크게 본다 — 멘트·포즈 참고용.
 */

const SEL = "poclo_story_sel"; // 보던 경쟁사 (기기마다)
const LAST = "poclo_story_last_shop"; // 넣기 창에서 마지막에 고른 경쟁사 — 한 경쟁사 스토리를 이어서 캡처하니까
const PAGE = 14; // 처음에 보여 줄 날 수

const read = (k, d = "") => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 무시 */
  }
};
const shopName = (s) => (s ? s.name || (s.handle ? `@${s.handle}` : "이름 없는 경쟁사") : "경쟁사 없음");
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const shiftDay = (d, n) => {
  const t = new Date(d + "T00:00:00");
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const relOf = (d) => (d === todayISO() ? "오늘" : d === shiftDay(todayISO(), -1) ? "어제" : "");
const storyLink = (h) => `https://www.instagram.com/stories/${h}/`;

function Avatar({ name, active }) {
  const ch = String(name || "?").replace(/^[@._]+/, "").slice(0, 1).toUpperCase();
  return <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold " + (active ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-500")}>{ch}</span>;
}

// ------------------------------------------------------------------ 경쟁사 더하기 · 고치기

function ShopSheet({ shop, suggest, count, onSave, onDelete, onClose }) {
  const [name, setName] = useState(shop?.name || "");
  const [ig, setIg] = useState(shop?.handle ? `@${shop.handle}` : "");
  const h = handleOf(ig);
  const bad = ig.trim() && !h;
  const ok = (name.trim() || h) && !bad;
  const submit = (e) => {
    e.preventDefault();
    if (ok) onSave({ ...(shop || { id: newId("sh"), at: new Date().toISOString() }), name: name.trim(), handle: h });
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={shop ? "경쟁사 고치기" : "경쟁사 더하기"} onClose={onClose} />
      <form onSubmit={submit} className="space-y-3 overflow-y-auto px-4 py-4">
        <label className="block text-xs font-medium text-stone-500">
          이름
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 우베리" className={FIELD + " mt-1"} />
        </label>
        <label className="block text-xs font-medium text-stone-500">
          인스타 계정 (선택)
          <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@아이디 또는 인스타 주소" className={FIELD + " mt-1"} />
          <span className={"mt-1 block " + (bad ? "text-amber-700" : "text-stone-400")}>{bad ? "인스타 아이디 모양이 아니에요." : "적어 두면 '스토리 열기'로 그 계정 스토리를 바로 열어요."}</span>
        </label>
        {!shop && suggest.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-stone-500">계정 아카이브에 있는 계정</div>
            <div className="flex flex-wrap gap-1.5">
              {suggest.map((a) => (
                <button
                  key={a.handle}
                  type="button"
                  onClick={() => {
                    setIg(`@${a.handle}`);
                    if (!name.trim()) setName(a.name || a.handle);
                  }}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (h === a.handle ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                >
                  @{a.handle}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {shop ? (
            <button
              type="button"
              onClick={() => window.confirm(count ? `${shopName(shop)} 를 지울까요? 캡처 ${count}장도 같이 지워져요.` : `${shopName(shop)} 를 지울까요?`) && onDelete(shop)}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-700"
            >
              <Trash2 size={13} /> 이 경쟁사 지우기
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={!ok} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300">
            {shop ? "저장" : "더하기"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ 캡처 넣기 (창이 열린 채 Ctrl+V 를 계속하면 쌓인다)

function AddSheet({ start, shops, defShop, onNewShop, onSubmit, onClose }) {
  const [files, setFiles] = useState(start || []);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const [shopId, setShopId] = useState(defShop);
  const [on, setOn] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [flash, setFlash] = useState("");
  const [typing, setTyping] = useState(null); // 새 경쟁사 이름 치는 중
  const [drag, setDrag] = useState(false);
  const pick = useRef(null);
  const thumbs = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const take = async (fs) => {
    const fresh = [];
    let dup = 0;
    for (const f of fs) {
      let same = false;
      for (const g of [...filesRef.current, ...fresh]) if (await sameImage(f, g)) same = true;
      if (same) dup += 1;
      else fresh.push(f);
    }
    if (fresh.length) setFiles((p) => [...p, ...fresh]);
    setFlash(dup && !fresh.length ? "같은 사진이라 또 넣지 않았어요" : `${filesRef.current.length + fresh.length}장째 붙였어요${dup ? ` · 같은 사진 ${dup}장은 뺐어요` : ""}`);
  };
  useEffect(() => {
    const onPaste = (e) => {
      const c = clipImages(e.clipboardData);
      const inField = e.target.closest?.("input, textarea");
      if (inField ? !c.files.length : !c.files.length && !c.urls.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      filesOf(c).then((fs) => fs.length && take(fs));
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const addShop = async () => {
    const t = (typing || "").trim();
    if (!t) return setTyping(null);
    const h = handleOf(t);
    const s = await onNewShop(/^@|instagram\.com/i.test(t) && h ? { name: "", handle: h } : { name: t, handle: "" });
    if (s) setShopId(s.id);
    setTyping(null);
  };
  const y = shiftDay(todayISO(), -1);
  return (
    <Sheet onClose={onClose} wide>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (![...(e.dataTransfer?.types || [])].includes("Files") && ![...(e.dataTransfer?.types || [])].includes("text/html")) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
        onDrop={(e) => {
          const c = clipImages(e.dataTransfer);
          if (!c.files.length && !c.urls.length) return;
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
          filesOf(c).then((fs) => fs.length && take(fs));
        }}
      >
      <SheetHead title="스토리 캡처 넣기" onClose={onClose} />
      <div className="space-y-4 overflow-y-auto px-4 py-4">
        <div className={"rounded-xl border-2 border-dashed p-3 " + (drag ? "border-rose-400 bg-rose-50/60" : "border-stone-200")}>
          {files.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {thumbs.map((u, i) => (
                <div key={u} className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, k) => k !== i))}
                    aria-label="빼기"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => pick.current?.click()} className="flex aspect-[9/16] w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-stone-200 text-xs text-stone-500 hover:bg-stone-50">
                <ImagePlus size={18} /> 더
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => pick.current?.click()} className="flex w-full flex-col items-center gap-1.5 py-6 text-sm text-stone-500">
              <ImagePlus size={22} className="text-stone-400" />
              <span className="font-medium text-stone-700">캡처 사진 고르기</span>
              <span className="text-xs text-stone-400">PC는 캡처하고 Ctrl+V · 끌어다 놓기도 돼요</span>
            </button>
          )}
          <p className="mt-2 text-xs text-stone-400">
            {flash ? <span className="font-medium text-emerald-700">{flash}</span> : files.length ? `${files.length}장 모였어요 · 다음 스토리를 캡처하고 계속 Ctrl+V 하면 여기에 쌓여요` : "여러 장을 한 번에 골라도 돼요."}
          </p>
          <input
            ref={pick}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) take([...e.target.files]);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-stone-500">어느 경쟁사 스토리예요?</div>
          <div className="flex flex-wrap gap-1.5">
            {shops.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setShopId(s.id)}
                className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (shopId === s.id ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
              >
                {shopName(s)}
              </button>
            ))}
            {typing === null ? (
              <button type="button" onClick={() => setTyping("")} className="flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-500 hover:border-stone-400">
                <Plus size={12} /> 새 경쟁사
              </button>
            ) : (
              <input
                autoFocus
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addShop();
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setTyping(null);
                  }
                }}
                onBlur={addShop}
                placeholder="이름 또는 @아이디 + 엔터"
                className="w-44 rounded-full border border-rose-300 px-3 py-1.5 text-xs outline-none"
              />
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-stone-500">스토리 날짜</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              [todayISO(), "오늘"],
              [y, "어제"],
            ].map(([d, l]) => (
              <button
                key={d}
                type="button"
                onClick={() => setOn(d)}
                className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (on === d ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
              >
                {l} {md(d)}
              </button>
            ))}
            <input type="date" value={on} max={todayISO()} onChange={(e) => e.target.value && setOn(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1 text-xs outline-none focus:border-rose-600" />
          </div>
        </div>

        <label className="block text-xs font-medium text-stone-500">
          메모 (선택 · 넣는 사진 전부에)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 신상 오픈 공지 멘트 · 거울 셀카 포즈" className={FIELD + " mt-1"} />
        </label>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <span className="text-xs text-stone-400">{!shopId ? "경쟁사를 골라 주세요" : `${shopName(shops.find((s) => s.id === shopId))} · ${dayLabel(on)}`}</span>
        <button
          type="button"
          disabled={!files.length || !shopId}
          onClick={() => onSubmit({ files, shopId, on, memo: memo.trim() })}
          className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          {files.length ? `${files.length}장 넣기` : "넣기"}
        </button>
      </footer>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ 날짜 한 번에 보기

function CapNote({ item, shops, onPatch, onDelete }) {
  const [text, setText] = useState(item.memo || "");
  const [edit, setEdit] = useState(false);
  const [more, setMore] = useState(false);
  const keep = () => {
    setEdit(false);
    if (text.trim() !== (item.memo || "")) onPatch({ id: item.id, memo: text.trim() });
  };
  const dark = "rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/50";
  return (
    <div className="mt-1.5 md:w-0 md:min-w-full">
      <div className="flex items-start gap-1">
        {edit ? (
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={keep}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                keep();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setText(item.memo || "");
                setEdit(false);
              }
            }}
            placeholder="멘트·포즈 메모"
            className={dark + " min-w-0 flex-1 resize-none text-sm"}
          />
        ) : (
          <button type="button" onClick={() => setEdit(true)} className={"min-w-0 flex-1 rounded-lg px-1.5 py-1 text-left text-sm leading-snug break-words hover:bg-white/10 " + (item.memo ? "text-white/90" : "text-white/35")}>
            {item.memo || "+ 멘트·포즈 메모"}
          </button>
        )}
        <button type="button" onClick={() => setMore((m) => !m)} aria-label="옮기기·지우기" aria-expanded={more} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white">
          <MoreHorizontal size={16} />
        </button>
      </div>
      {more && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-white/5 p-1.5">
          <select value={item.shopId} onChange={(e) => onPatch({ id: item.id, shopId: e.target.value })} aria-label="경쟁사 바꾸기" className={dark + " [&>option]:text-stone-900"}>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {shopName(s)}
              </option>
            ))}
          </select>
          <input type="date" value={item.on} max={todayISO()} onChange={(e) => e.target.value && onPatch({ id: item.id, on: e.target.value })} aria-label="날짜 바꾸기" className={dark + " [color-scheme:dark]"} />
          <button type="button" onClick={() => onDelete(item)} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-rose-300">
            <Trash2 size={12} /> 지우기
          </button>
        </div>
      )}
    </div>
  );
}

function DayView({ days, on, focusId, all, shops, srcOf, want, onGo, onPatch, onDelete, onClose }) {
  const i = days.findIndex((d) => d.on === on);
  const list = useMemo(() => days[i]?.items || [], [days, i]);
  const older = days[i + 1];
  const newer = days[i - 1];
  const [big, setBig] = useState(null);
  const row = useRef(null);
  const keys = list.map((x) => x.key).filter(Boolean).join("|");
  useEffect(() => {
    if (keys) want(keys.split("|"));
  }, [keys, want]);
  useEffect(() => {
    if (i < 0) onClose();
  }, [i, onClose]);
  useEffect(() => {
    const k = (e) => {
      if (big !== null || e.target.closest?.("input, textarea, select")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && older) onGo(older.on);
      else if (e.key === "ArrowRight" && newer) onGo(newer.on);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [big, older, newer, onGo, onClose]);
  useEffect(() => {
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = keep;
    };
  }, []);
  // 날짜를 바꾸면 맨 앞부터, 사진을 눌러 열었으면 그 사진이 보이게
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
    if (focusId) document.getElementById(`sv-${focusId}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [on, focusId]);
  const per = all ? [...new Set(list.map((x) => x.shopId))].map((id) => `${shopName(shops.find((s) => s.id === id))} ${list.filter((x) => x.shopId === id).length}`) : [];
  const rel = relOf(on);
  const nav = "flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-25";
  return createPortal(
    <div
      className="backdrop-in fixed inset-0 z-[60] flex flex-col bg-stone-950 text-white"
      role="dialog"
      data-story-day=""
      aria-label={`${dayLabel(on)} 스토리`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="flex shrink-0 items-center gap-1 px-2 py-2 md:px-4">
        <button type="button" disabled={!older} onClick={() => older && onGo(older.on)} className={nav} aria-label="이전 날">
          <ChevronLeft size={18} />
          <span className="hidden sm:inline">{older ? md(older.on) : ""}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-semibold">
            {dayLabel(on)}
            {rel && <span className="ml-1.5 rounded-full bg-rose-700 px-2 py-0.5 align-middle text-[11px] font-semibold">{rel}</span>}
          </div>
          <div className="truncate text-xs text-white/50">
            {all ? per.join(" · ") : shopName(shops.find((s) => s.id === list[0]?.shopId))} · {list.length}장
            <span className="hidden md:inline"> · 사진을 누르면 확대 · ← → 다른 날 · Esc 닫기</span>
          </div>
        </div>
        <button type="button" disabled={!newer} onClick={() => newer && onGo(newer.on)} className={nav} aria-label="다음 날">
          <span className="hidden sm:inline">{newer ? md(newer.on) : ""}</span>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={onClose} aria-label="닫기" className="ml-1 rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div
        ref={row}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (window.innerWidth >= 768 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
        className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-2 gap-y-4 overflow-y-auto px-3 pb-8 sm:grid-cols-3 md:flex md:items-start md:gap-4 md:overflow-x-auto md:overflow-y-hidden md:px-5 md:pb-3 [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]"
      >
        {list.map((x, k) => {
          const s = srcOf(x, "full");
          return (
            <figure key={x.id} id={`sv-${x.id}`} className="m-0 flex min-w-0 flex-col md:shrink-0">
              {all && <figcaption className="mb-1 truncate px-0.5 text-xs font-semibold text-white/60 md:w-0 md:min-w-full">{shopName(shops.find((sh) => sh.id === x.shopId))}</figcaption>}
              <button
                type="button"
                onClick={() => setBig(k)}
                className="relative w-full overflow-hidden rounded-xl bg-white/5 md:h-[calc(100dvh-10rem)] md:w-auto"
                style={{ aspectRatio: `${x.w || 9} / ${x.h || 16}` }}
                aria-label={`${k + 1}번째 크게 보기`}
              >
                {s ? <img src={s} alt="" className="h-full w-full object-contain" /> : <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-white/40" />}
              </button>
              <CapNote key={`${x.id}-${x.memo || ""}`} item={x} shops={shops} onPatch={onPatch} onDelete={onDelete} />
            </figure>
          );
        })}
      </div>
      {big !== null && <BigSlides urls={list.map((x) => srcOf(x, "full"))} start={big} onClose={() => setBig(null)} />}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ 날짜 한 줄

function DayRow({ day, all, shops, srcOf, pending, onOpen }) {
  const rel = relOf(day.on);
  const per = all ? [...new Set(day.items.map((x) => x.shopId))].map((id) => `${shopName(shops.find((s) => s.id === id))} ${day.items.filter((x) => x.shopId === id).length}`) : [];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3">
      <button type="button" onClick={() => onOpen(day.on)} className="group mb-2 flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
        <span className="font-semibold text-stone-900">{dayLabel(day.on)}</span>
        {rel && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{rel}</span>}
        <span className="min-w-0 truncate text-xs text-stone-400">
          {day.items.length}장{per.length ? ` · ${per.join(" · ")}` : ""}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-stone-500 group-hover:bg-rose-50 group-hover:text-rose-700">
          <Maximize2 size={13} /> 한 번에 보기
        </span>
      </button>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {day.items.map((x) => {
          const src = srcOf(x, "thumb");
          const wait = pending.has(x.id);
          const line = [all ? shopName(shops.find((s) => s.id === x.shopId)) : "", x.memo].filter(Boolean).join(" · ");
          return (
            <button
              key={x.id}
              type="button"
              disabled={wait}
              onClick={() => onOpen(day.on, x.id)}
              title={x.memo || undefined}
              className="relative aspect-[9/16] w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-stone-100 md:w-28"
            >
              {src && <img src={src} alt="" loading="lazy" className={"h-full w-full object-cover " + (wait ? "opacity-50" : "")} />}
              {wait && <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-rose-700" />}
              {line && <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-5 pb-1 text-left text-[10px] leading-tight font-medium text-white">{line}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 화면

export default function StoriesPage({ online, accounts = [] }) {
  const [shops, setShops] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSelState] = useState(() => read(SEL, "all"));
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(null); // 넣기 창 — 처음 사진들
  const [shopEdit, setShopEdit] = useState(null); // {shop} — shop 이 없으면 새로
  const [view, setView] = useState(null); // {on, focusId}
  const [pending, setPending] = useState([]); // 올리는 중 [{id, shopId, on, at, url}]
  const [urls, setUrls] = useState({});
  const [previews, setPreviews] = useState({}); // 방금 넣은 캡처 → 이 기기 사진 (서명 주소를 받기 전에 바로 보이게)
  const [drag, setDrag] = useState(false);

  const setSel = (v) => {
    setSelState(v);
    write(SEL, v);
    setLimit(PAGE);
  };

  const loadShops = useCallback(async () => setShops((await loadKey(SHOPS_KEY, online)).items || []), [online]);
  const loadItems = useCallback(async () => setItems((await loadKey(STORIES_KEY, online)).items || []), [online]);
  const load = useCallback(async () => {
    try {
      await Promise.all([loadShops(), loadItems()]);
    } catch {
      setMsg("스토리 목록을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [loadShops, loadItems]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    // 같이 쓰는 사람이 넣거나 고치면 그 키만 다시 읽는다
    const off = onSettingsChange((k) => (k === SHOPS_KEY ? loadShops() : k === STORIES_KEY ? loadItems() : null)?.catch(() => {}));
    return () => {
      document.removeEventListener("visibilitychange", v);
      off();
    };
  }, [load, loadShops, loadItems]);

  const want = useCallback(
    async (keys) => {
      try {
        const m = await signedUrls(keys, online);
        if (Object.keys(m).length) setUrls((u) => ({ ...u, ...m }));
      } catch {
        /* 다음에 열 때 다시 */
      }
    },
    [online],
  );
  const srcOf = useCallback(
    (x, size) => (size === "thumb" ? x.thumbSrc || previews[x.id] || x.url || urls[x.thumb] || x.src || urls[x.key] : x.src || previews[x.id] || x.url || urls[x.key] || urls[x.thumb]),
    [urls, previews],
  );

  const save = async (fn) => {
    try {
      setItems((await changeKey(STORIES_KEY, online, fn)).items || []);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  const saveShops = async (fn) => {
    try {
      const v = await changeKey(SHOPS_KEY, online, fn);
      setShops(v.items || []);
      return v.items || [];
    } catch (e) {
      setMsg(e.message || "경쟁사를 저장하지 못했어요.");
      return null;
    }
  };
  const putShop = async (s) => {
    const next = await saveShops((v) => {
      const list = v.items || [];
      return { ...v, items: list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? { ...x, ...s } : x)) : [...list, s] };
    });
    return next ? s : null;
  };
  const newShop = async ({ name, handle }) => {
    const same = shops.find((s) => (handle && s.handle === handle) || (name && s.name === name));
    if (same) return same;
    return putShop({ id: newId("sh"), name, handle, at: new Date().toISOString() });
  };
  const delShop = async (shop) => {
    setShopEdit(null);
    const gone = items.filter((x) => x.shopId === shop.id);
    await saveShops((v) => ({ ...v, items: (v.items || []).filter((x) => x.id !== shop.id) }));
    await save((v) => ({ ...v, items: (v.items || []).filter((x) => x.shopId !== shop.id) }));
    removeStoryFiles(gone, online).catch(() => {});
    if (sel === shop.id) setSel("all");
  };

  // 넣기 — 하나씩 차례로 올리고, 올리는 동안은 흐리게 바로 보인다
  const submit = async ({ files, shopId, on, memo }) => {
    setAdding(null);
    write(LAST, shopId);
    if (sel !== "all" && sel !== shopId) setSel(shopId);
    const t0 = Date.now();
    const jobs = files.map((f, k) => ({ id: newId("p"), f, url: URL.createObjectURL(f), shopId, on, memo, at: new Date(t0 + k).toISOString() }));
    setPending((p) => [...p, ...jobs.map((j) => ({ id: j.id, url: j.url, shopId, on, memo, at: j.at }))]);
    for (let k = 0; k < jobs.length; k++) {
      const j = jobs[k];
      try {
        const put = await putStory(j.f, online);
        if (put.key) setPreviews((p) => ({ ...p, [put.id]: j.url }));
        else URL.revokeObjectURL(j.url);
        await save(upsert({ ...put, shopId, on, memo, at: j.at }));
        setPending((p) => p.filter((x) => x.id !== j.id));
      } catch (e) {
        const left = jobs.slice(k);
        left.forEach((x) => URL.revokeObjectURL(x.url));
        setPending((p) => p.filter((x) => !left.some((y) => y.id === x.id)));
        setMsg(`${e.message || "캡처를 넣지 못했어요."}${left.length > 1 ? ` 남은 ${left.length - 1}장도 안 넣었어요.` : ""}`);
        return;
      }
    }
  };
  const openAdd = (start = []) => {
    const last = read(LAST);
    const def = sel !== "all" && shops.some((s) => s.id === sel) ? sel : shops.some((s) => s.id === last) ? last : shops[0]?.id || "";
    setAdding({ start, def });
  };

  const patch = (p) => save(upsert(p));
  const delItem = async (x) => {
    if (!window.confirm("이 캡처를 지울까요?")) return;
    await save(remove(x.id));
    removeStoryFiles([x], online).catch(() => {});
  };

  // 화면 아무 데나 캡처 Ctrl+V · 끌어다 놓기 → 넣기 창
  useEffect(() => {
    const onPaste = (e) => {
      if (adding || view || shopEdit || e.target.closest?.("input, textarea, [contenteditable=true]")) return;
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      filesOf(c).then((fs) => fs.length && openAdd(fs));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const shopMap = useMemo(() => Object.fromEntries(shops.map((s) => [s.id, s])), [shops]);
  const current = sel !== "all" ? shopMap[sel] : null;
  const all = !current;
  const pendingIds = useMemo(() => new Set(pending.map((x) => x.id)), [pending]);
  const days = useMemo(() => {
    const n = q.trim().toLowerCase();
    const mine = [...items, ...pending].filter((x) => {
      if (current && x.shopId !== current.id) return false;
      return !n || `${x.memo || ""} ${shopName(shopMap[x.shopId])}`.toLowerCase().includes(n);
    });
    return byDay(mine);
  }, [items, pending, current, q, shopMap]);
  const viewDays = useMemo(() => days.map((d) => ({ ...d, items: d.items.filter((x) => !pendingIds.has(x.id)) })).filter((d) => d.items.length), [days, pendingIds]);
  const shown = days.slice(0, limit);

  const thumbKeys = shown.flatMap((d) => d.items.map((x) => x.thumb)).filter(Boolean).join("|");
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    if (thumbKeys) want(thumbKeys.split("|")); // 서명 주소를 받은 뒤에 고친다(비동기)
  }, [thumbKeys, want]);

  const countOf = (id) => items.filter((x) => x.shopId === id).length;
  const lastOf = (id) => items.reduce((m, x) => (x.shopId === id && x.on > m ? x.on : m), "");
  const suggest = accounts.filter((a) => a.handle && !shops.some((s) => s.handle === a.handle));
  const closeView = useCallback(() => setView(null), []);
  const goView = useCallback((on) => setView({ on }), []);

  return (
    <div
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        e.preventDefault(); // 창이 떠 있을 때 창 밖에 떨어뜨려도 브라우저가 사진을 열어 버리지 않게
        if (!adding && !view) setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        const c = clipImages(e.dataTransfer);
        setDrag(false);
        if (!c.files.length && !c.urls.length) return;
        e.preventDefault();
        if (!adding && !view) filesOf(c).then((fs) => fs.length && openAdd(fs));
      }}
      className={"relative " + (drag ? "rounded-2xl ring-2 ring-rose-300 ring-offset-4" : "")}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
            <CircleDashed size={20} /> 경쟁사 스토리
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">경쟁사 인스타 스토리 캡처를 날짜별로 모아 두는 곳 — 멘트·포즈 참고용. 날짜를 누르면 그날 스토리를 한 번에 크게 봐요.</p>
        </div>
        <button type="button" onClick={() => openAdd()} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">
          <Upload size={15} /> 캡처 넣기
        </button>
      </div>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>
      ) : !shops.length && !items.length ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-stone-800">먼저 지켜볼 경쟁사를 더해 주세요.</p>
          <p className="mt-1 text-sm text-stone-500">경쟁사를 더한 뒤 스토리를 캡처해서 Ctrl+V 하거나 사진을 고르면 날짜별로 쌓여요.</p>
          <button type="button" onClick={() => setShopEdit({})} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> 경쟁사 더하기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <aside className="shrink-0 rounded-2xl border border-stone-200 bg-white p-2 md:sticky md:top-4 md:w-56">
            <div className="px-2 pt-1 pb-2 text-xs font-semibold text-stone-500">경쟁사 {shops.length}</div>
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              <li className="shrink-0">
                <button type="button" onClick={() => setSel("all")} className={"flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left " + (all ? "bg-rose-50" : "hover:bg-stone-50")}>
                  <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full " + (all ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-500")}>
                    <Layers size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={"block truncate text-sm font-semibold " + (all ? "text-rose-800" : "text-stone-800")}>전체</span>
                    <span className="block text-[11px] whitespace-nowrap text-stone-400">{items.length}장</span>
                  </span>
                </button>
              </li>
              {shops.map((s) => {
                const on = current?.id === s.id;
                const last = lastOf(s.id);
                return (
                  <li key={s.id} className="shrink-0">
                    <button type="button" onClick={() => setSel(s.id)} className={"flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left " + (on ? "bg-rose-50" : "hover:bg-stone-50")}>
                      <Avatar name={shopName(s)} active={on} />
                      <span className="min-w-0 flex-1">
                        <span className={"block max-w-[9rem] truncate text-sm font-semibold md:max-w-none " + (on ? "text-rose-800" : "text-stone-800")}>{shopName(s)}</span>
                        <span className="block text-[11px] whitespace-nowrap text-stone-400">
                          {countOf(s.id)}장{last ? ` · ${md(last)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="shrink-0">
                <button type="button" onClick={() => setShopEdit({})} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm whitespace-nowrap text-stone-500 hover:bg-stone-50">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300">
                    <Plus size={14} />
                  </span>
                  경쟁사 더하기
                </button>
              </li>
            </ul>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-lg font-bold text-stone-900">{all ? "전체 경쟁사" : shopName(current)}</h3>
              {current?.handle && (
                <a
                  href={storyLink(current.handle)}
                  target="_blank"
                  rel="noreferrer"
                  title="인스타에서 이 계정 스토리 열기 — 캡처해서 여기에 붙여넣기"
                  className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-700"
                >
                  @{current.handle} 스토리 열기 <ExternalLink size={12} />
                </a>
              )}
              {current && (
                <button type="button" onClick={() => setShopEdit({ shop: current })} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  <Pencil size={12} /> 고치기
                </button>
              )}
              <label className="ml-auto flex w-full items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 sm:w-56">
                <Search size={14} className="shrink-0 text-stone-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={all ? "메모·경쟁사 찾기" : "메모 찾기"} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" />
                {q && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="지우기" className="text-stone-400">
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>
            <p className="mb-3 text-xs text-stone-400">스토리를 캡처해서 화면 아무 데나 붙여넣기(Ctrl+V)하거나 끌어다 놓으면 넣기 창이 떠요. 폰은 '캡처 넣기'로 사진을 골라요.</p>

            {shown.length ? (
              <div className="space-y-3">
                {shown.map((d) => (
                  <DayRow key={d.on} day={d} all={all} shops={shops} srcOf={srcOf} pending={pendingIds} onOpen={(on, focusId) => viewDays.some((v) => v.on === on) && setView({ on, focusId })} />
                ))}
                {days.length > limit && (
                  <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50">
                    지난 스토리 더 보기 ({days.length - limit}일 더)
                  </button>
                )}
              </div>
            ) : q ? (
              <p className="rounded-2xl border border-stone-200 bg-white py-10 text-center text-sm text-stone-400">'{q}' 가 든 메모가 없어요.</p>
            ) : (
              <button
                type="button"
                onClick={() => openAdd()}
                className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-200 bg-white py-12 text-sm text-stone-500 hover:border-rose-200"
              >
                <ImagePlus size={24} className="text-stone-300" />
                <span className="font-medium text-stone-700">{all ? "아직 넣은 스토리가 없어요." : `${shopName(current)} 스토리가 아직 없어요.`}</span>
                <span className="text-xs text-stone-400">캡처를 Ctrl+V 하거나 끌어다 놓기 · 눌러서 사진 고르기</span>
              </button>
            )}
          </div>
        </div>
      )}

      {adding && <AddSheet start={adding.start} shops={shops} defShop={adding.def} onNewShop={newShop} onSubmit={submit} onClose={() => setAdding(null)} />}
      {shopEdit && (
        <ShopSheet
          shop={shopEdit.shop}
          suggest={suggest}
          count={shopEdit.shop ? countOf(shopEdit.shop.id) : 0}
          onSave={async (s) => {
            const ok = await putShop(s);
            if (ok) {
              setShopEdit(null);
              if (!shopEdit.shop) setSel(s.id);
            }
          }}
          onDelete={delShop}
          onClose={() => setShopEdit(null)}
        />
      )}
      {view && <DayView days={viewDays} on={view.on} focusId={view.focusId} all={all} shops={shops} srcOf={srcOf} want={want} onGo={goView} onPatch={patch} onDelete={delItem} onClose={closeView} />}
    </div>
  );
}
