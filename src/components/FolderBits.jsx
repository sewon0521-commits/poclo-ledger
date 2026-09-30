import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Pencil, Plus, ChevronRight, GripVertical, FolderInput, Check, Star, Trash2 } from "lucide-react";
import { folderIdOf, childrenOf, withChildren, folderCounts, moveFolder, canMove, pathOf, ordered, MAX_DEPTH } from "../lib/reelFolders";
import { newId } from "../lib/id";

// 폴더 부품 — 릴스 기획과 촬영 레퍼런스가 같이 쓴다 (9/30 세원: "콘텐츠처럼 내가 목록을 만들고 편집할 수 있게").
// 폴더 목록은 [{id, name, parent}], 항목은 folderId 로 가리킨다 (lib/reelFolders.js).

// ------------------------------------------------------------- 폴더 줄 · 카테고리 편집

export function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium " +
        (active ? "bg-rose-700 text-white" : "border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100")
      }
    >
      {children}
      {count != null && <span className={active ? "text-rose-200" : "text-stone-400"}>{count}</span>}
    </button>
  );
}

export function FolderBar({ items, folders, sel, onSel, onEdit, q, setQ, bestOnly, setBestOnly, bestCount, searchPlaceholder = "대본·계정·상품 검색", children }) {
  const { total, none } = useMemo(() => folderCounts(items, folders), [items, folders]);
  const tops = folders.filter((f) => !f.parent);
  // 고른 폴더까지의 길 [상위, 하위, 세부] — 상위를 고르면 하위 줄, 하위를 고르면 세부 줄이 열린다
  const path = sel === "all" || sel === "none" ? [] : pathOf(sel, folders);
  const rows = [
    ["하위", path[0]],
    ["세부", path[1]],
  ].filter(([, p]) => p && childrenOf(p.id, folders).length > 0);

  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 w-8 shrink-0 text-xs text-stone-400">폴더</span>
          <Chip active={sel === "all"} onClick={() => onSel("all")} count={items.length}>
            전체
          </Chip>
          {none > 0 && (
            <Chip active={sel === "none"} onClick={() => onSel("none")} count={none}>
              미분류
            </Chip>
          )}
          {tops.map((f) => (
            <Chip
              key={f.id}
              active={path[0]?.id === f.id}
              onClick={() => onSel(f.id)}
              count={total.get(f.id) || 0}
            >
              {f.name}
              {childrenOf(f.id, folders).length > 0 && <ChevronRight size={12} className="opacity-60" />}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
        >
          <Pencil size={12} /> 카테고리 편집
        </button>
      </div>

      {rows.map(([label, parent], lv) => (
        <div key={parent.id} className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2">
          <span className="mr-1 w-8 shrink-0 text-xs text-stone-400">{label}</span>
          <Chip active={sel === parent.id} onClick={() => onSel(parent.id)}>
            전부
          </Chip>
          {childrenOf(parent.id, folders).map((k) => (
            <Chip key={k.id} active={path[lv + 1]?.id === k.id} onClick={() => onSel(k.id)} count={total.get(k.id) || 0}>
              {k.name}
              {lv === 0 && childrenOf(k.id, folders).length > 0 && <ChevronRight size={12} className="opacity-60" />}
            </Chip>
          ))}
        </div>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-8 text-sm"
          />
        </div>
        {setBestOnly && (
        <button
          type="button"
          onClick={() => setBestOnly(!bestOnly)}
          aria-pressed={bestOnly}
          className={
            "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold " +
            (bestOnly ? "border-amber-400 bg-amber-400 text-amber-950" : "border-stone-200 bg-white text-stone-600 hover:border-amber-300")
          }
        >
          <Star size={12} className={bestOnly ? "fill-amber-950" : "fill-amber-400 text-amber-400"} /> BEST만 {bestCount}
        </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** 한 줄 이름 고치기 / 새로 만들기 칸 */
function NameInput({ initial = "", placeholder, onDone, onCancel }) {
  const [v, setV] = useState(initial);
  // 엔터로 끝내면 칸이 사라지면서 blur 가 한 번 더 올 수 있다 — 두 번 저장하지 않게
  const settled = useRef(false);
  const finish = (save) => {
    if (settled.current) return;
    settled.current = true;
    if (save && v.trim() && v.trim() !== initial) onDone(v.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 rounded-md border border-rose-500 px-2 py-1 text-sm outline-none"
    />
  );
}

const CAT_OPEN_KEY = "poclo_reel_cats_open";

export function CategoryEditor({ items, folders, onChange, onClose, openKey = CAT_OPEN_KEY, noun = "릴스", topHint = "상위 폴더 이름 — 예: 판매형 릴스 (메타광고)" }) {
  // editing: {id} 이름 고치기 | {parent} 하위 새로 | {top:true} 상위 새로
  const [editing, setEditing] = useState(null);
  const { total } = useMemo(() => folderCounts(items, folders), [items, folders]);
  const tops = folders.filter((f) => !f.parent);

  // 접고 펴기 (9/24 세원: "항상 펼쳐져 있으니까 헷갈려, 열고 닫을 수 있는 토글") — 처음엔 상위만 보이게 접혀 있다.
  // 펼친 폴더는 기기에 기억한다.
  const [openIds, setOpenIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(openKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  const keepOpen = (next) => {
    setOpenIds(next);
    try {
      localStorage.setItem(openKey, JSON.stringify([...next]));
    } catch {
      /* 기억 못 해도 이번 화면에서는 된다 */
    }
  };
  const toggle = (id) => {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    keepOpen(next);
  };
  const parents = folders.filter((f) => childrenOf(f.id, folders).length > 0);
  const allOpen = parents.length > 0 && parents.every((f) => openIds.has(f.id));

  const rename = (id, name) =>
    onChange((list) =>
      list.map((f) =>
        f.id === id ? { ...f, name, aka: [...new Set([...(f.aka || []), f.name])] } : f,
      ),
    );
  const add = (name, parent = null) =>
    onChange((list) => [...list, { id: newId("f"), name, parent }]);
  const remove = (f) => {
    const n = total.get(f.id) || 0;
    const gone = withChildren(f.id, folders);
    const msg =
      `'${f.name}' 폴더를 지울까요?` +
      (gone.length > 1 ? `\n그 아래 폴더 ${gone.length - 1}개도 같이 지워져요.` : "") +
      (n ? `\n안에 든 ${noun} ${n}개는 지워지지 않고 미분류로 가요.` : "");
    if (window.confirm(msg)) onChange((list) => list.filter((x) => !gone.includes(x.id)));
  };
  const done = () => setEditing(null);

  // 끌어서 옮기기 — drag: 끄는 폴더 id, over: {id, pos} 놓일 자리(빨간 줄로 보여준다)
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const dragged = folders.find((f) => f.id === drag);
  const posOf = (e, f) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    // 하위·세부를 상위 줄에 놓으면 그 안으로. 하위 줄 가운데에 놓으면 그 하위의 세부로.
    if (dragged?.parent && !f.parent) return "inside";
    if (dragged?.parent && y > 0.3 && y < 0.7 && canMove(folders, drag, f.id, "inside")) return "inside";
    return y < 0.5 ? "before" : "after";
  };
  const drop = () => {
    if (drag && over) onChange((list) => moveFolder(list, drag, over.id, over.pos));
    setDrag(null);
    setOver(null);
  };

  const row = (f, depth) => (
    <li
      key={f.id}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", f.id);
        setDrag(f.id);
      }}
      onDragOver={(e) => {
        if (!drag || drag === f.id) return;
        e.preventDefault();
        const pos = posOf(e, f);
        if (!canMove(folders, drag, f.id, pos)) return;
        if (over?.id !== f.id || over?.pos !== pos) setOver({ id: f.id, pos });
      }}
      onDragLeave={() => over?.id === f.id && setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        drop();
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
      className={
        "group flex cursor-grab items-center gap-2 rounded-lg border-y-2 px-3 py-2 hover:bg-stone-50 active:cursor-grabbing " +
        (depth === 1 ? "pl-8 " : depth === 2 ? "pl-14 " : "") +
        (drag === f.id ? "opacity-40 " : "") +
        (over?.id === f.id && over.pos === "before"
          ? "border-t-rose-500 border-b-transparent"
          : over?.id === f.id && over.pos === "after"
            ? "border-t-transparent border-b-rose-500"
            : over?.id === f.id && over.pos === "inside"
              ? "border-transparent bg-rose-50 ring-2 ring-rose-300"
              : "border-transparent")
      }
    >
      <GripVertical size={13} className="shrink-0 text-stone-300 group-hover:text-stone-500" />
      {depth > 0 && <span className="text-stone-300">└</span>}
      {childrenOf(f.id, folders).length > 0 ? (
        <button
          type="button"
          onClick={() => toggle(f.id)}
          aria-label={openIds.has(f.id) ? "접기" : "펼치기"}
          aria-expanded={openIds.has(f.id)}
          className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-200 hover:text-stone-700"
        >
          <ChevronRight size={15} className={"transition-transform " + (openIds.has(f.id) ? "rotate-90" : "")} />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      {editing?.id === f.id ? (
        <NameInput
          initial={f.name}
          onDone={(v) => {
            rename(f.id, v);
            done();
          }}
          onCancel={done}
        />
      ) : (
        <span
          className={
            "min-w-0 flex-1 truncate text-sm " +
            (depth === 0 ? "font-semibold text-stone-900" : depth === 1 ? "font-medium text-stone-700" : "text-stone-600")
          }
        >
          {f.name}
        </span>
      )}
      <span className="w-6 text-right text-xs text-stone-400 tabular-nums">{total.get(f.id) || 0}</span>
      <span className="flex items-center gap-0.5 text-stone-400">
        <button type="button" onClick={() => setEditing({ id: f.id })} aria-label="이름 고치기" className="rounded p-1 hover:bg-stone-200 hover:text-stone-700">
          <Pencil size={13} />
        </button>
        {depth < MAX_DEPTH && (
          <button
            type="button"
            onClick={() => {
              if (!openIds.has(f.id)) toggle(f.id);
              setEditing({ parent: f.id });
            }}
            aria-label={depth === 0 ? "하위 폴더 만들기" : "세부 폴더 만들기"}
            title={depth === 0 ? "하위 폴더 만들기" : "세부 폴더 만들기 (예: 팬츠 · 스커트 · 상의)"}
            className="rounded p-1 hover:bg-stone-200 hover:text-stone-700"
          >
            <Plus size={14} />
          </button>
        )}
        <button type="button" onClick={() => remove(f)} aria-label="지우기" className="rounded p-1 hover:bg-stone-200 hover:text-rose-600">
          <Trash2 size={13} />
        </button>
      </span>
    </li>
  );

  // 폴더 하나 + 그 아래 폴더들 + (새로 만드는 중이면) 이름 칸
  const tree = (f, depth) => (
    <div key={f.id}>
      {row(f, depth)}
      {openIds.has(f.id) && childrenOf(f.id, folders).map((c) => tree(c, depth + 1))}
      {editing?.parent === f.id && (
        <li className={"flex items-center gap-2 py-1.5 pr-3 " + (depth === 0 ? "pl-8" : "pl-14")}>
          <span className="text-stone-300">└</span>
          <NameInput
            placeholder={depth === 0 ? "하위 폴더 이름 — 예: [팬츠] 설명 영상" : "세부 폴더 이름 — 예: 팬츠 · 스커트 · 상의"}
            onDone={(v) => {
              add(v, f.id);
              done();
            }}
            onCancel={done}
          />
        </li>
      )}
    </div>
  );

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-stone-900">카테고리 편집</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            상위 › 하위 › 세부, 세 단계까지 만들어요 (+ 누르기) · 줄을 끌어서 순서를 바꾸고, 다른 폴더 줄 가운데에 놓으면 그 안으로 들어가요
          </p>
          {parents.length > 0 && (
            <button
              type="button"
              onClick={() => keepOpen(allOpen ? new Set() : new Set(parents.map((f) => f.id)))}
              className="mt-1.5 text-xs font-medium text-rose-700 hover:underline"
            >
              {allOpen ? "모두 접기" : "모두 펼치기"}
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tops.map((f) => tree(f, 0))}
        {editing?.top && (
          <li className="flex items-center gap-2 px-3 py-1.5">
            <NameInput
              placeholder={topHint}
              onDone={(v) => {
                add(v);
                done();
              }}
              onCancel={done}
            />
          </li>
        )}
      </ul>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button
          type="button"
          onClick={() => setEditing({ top: true })}
          className="w-full rounded-xl border border-dashed border-rose-300 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          + 새 상위 폴더
        </button>
      </footer>
    </div>
  );
}


/**
 * 카드 밖에서 바로 폴더 옮기기 (세원 9/22: "얘네처럼 밖에서 폴더를 지정했으면") —
 * 카드 오른쪽 아래 폴더 아이콘 → 작은 목록 → 누르면 그 폴더로.
 */
export function FolderPicker({ item, folders, onMove }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const current = folderIdOf(item, folders);
  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (id) => {
    setOpen(false);
    if (id !== current) onMove(id);
  };
  return (
    <span ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="폴더 옮기기"
        title="폴더 옮기기"
        className={
          "flex h-7 w-7 items-center justify-center rounded-md border " +
          (open ? "border-rose-300 bg-rose-50 text-rose-700" : "border-transparent text-stone-400 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-700")
        }
      >
        <FolderInput size={15} />
      </button>
      {open && (
        <span className="absolute right-0 bottom-8 z-30 block max-h-72 w-56 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 text-left shadow-lg">
          <span className="block px-3 pt-1.5 pb-1 text-[11px] font-semibold text-stone-400">어느 폴더로?</span>
          {[{ id: null, name: "미분류", depth: 0 }, ...ordered(folders)].map((f) => (
            <button
              key={f.id || "none"}
              type="button"
              onClick={() => pick(f.id)}
              className={
                "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-stone-50 " +
                (f.depth === 2 ? "pl-11 text-stone-500 " : f.depth === 1 ? "pl-7 text-stone-600 " : "font-medium text-stone-800 ") +
                (f.id === current ? "bg-rose-50 text-rose-800" : "")
              }
            >
              {f.depth > 0 && <span className="text-stone-300">└</span>}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {f.id === current && <Check size={13} className="shrink-0 text-rose-700" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

