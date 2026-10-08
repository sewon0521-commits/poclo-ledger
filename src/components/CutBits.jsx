import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, GripVertical, CornerDownRight, X } from "lucide-react";
import { Sheet, SheetHead } from "./ShootBits";
import { CUT_SEP, subsOf, hasCut } from "../lib/shoot";

/**
 * 컷 종류 — 세원이 고친다 (10/7 세원: "컷 전체, 전신 정면 여기도 내가 편집할 수 있게. 거울셀카에도 정면, 측면 등등 있어서").
 * 컷 목록 shoot_tags.cuts ['전신 정면', '거울 셀카', …] + 세부 컷 shoot_tags.cutSubs {'거울 셀카': ['정면', '측면']}.
 * 사진에는 '거울 셀카' 또는 '거울 셀카 › 정면' 으로 붙는다 — '거울 셀카'로 거르면 세부 컷까지 다 나온다(hasCut).
 */

const chip = (on) =>
  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300");
const allChip = (on) => "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600");

/** 거르기 줄 — 컷 전체 · 컷들 · 편집, 세부 컷이 있는 컷을 고르면 아래 줄에 세부 컷 */
export function CutFilter({ tags, value, onChange, onEdit, counts }) {
  const tops = tags?.cuts || [];
  const top = value ? value.split(CUT_SEP)[0] : "";
  const subs = subsOf(tags, top);
  const n = (c) => (counts ? counts(c) : null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        <button type="button" onClick={() => onChange("")} className={allChip(!value)}>
          컷 전체
        </button>
        {tops.map((c) => (
          <button key={c} type="button" onClick={() => onChange(top === c ? "" : c)} className={chip(top === c)}>
            {c}
            {subsOf(tags, c).length > 0 && <span className="ml-0.5 opacity-60">›</span>}
            {n(c) != null && <span className={"ml-1 " + (top === c ? "text-rose-200" : "text-stone-400")}>{n(c)}</span>}
          </button>
        ))}
        {onEdit && (
          <button type="button" onClick={onEdit} className="flex shrink-0 items-center gap-1 px-1.5 text-xs text-stone-500 hover:text-stone-800">
            <Pencil size={12} /> 컷 편집
          </button>
        )}
      </div>
      {subs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pl-3 [scrollbar-width:none]">
          <CornerDownRight size={13} className="shrink-0 text-stone-300" />
          <button type="button" onClick={() => onChange(top)} className={allChip(value === top)}>
            {top} 전부
          </button>
          {subs.map((s) => {
            const k = `${top}${CUT_SEP}${s}`;
            return (
              <button key={s} type="button" onClick={() => onChange(value === k ? top : k)} className={chip(value === k)}>
                {s}
                {n(k) != null && <span className={"ml-1 " + (value === k ? "text-rose-200" : "text-stone-400")}>{n(k)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 사진에 컷 달기 (여러 개) — 세부 컷이 있는 컷을 고르면 세부 컷 칩이 열린다 */
export function CutPicker({ tags, value = [], onChange, onAdd }) {
  const tops = tags?.cuts || [];
  const on = (c) => value.some((v) => v === c || v.startsWith(c + CUT_SEP));
  const toggleTop = (c) => (on(c) ? onChange(value.filter((v) => !(v === c || v.startsWith(c + CUT_SEP)))) : onChange([...value, c]));
  const toggleSub = (c, s) => {
    const k = `${c}${CUT_SEP}${s}`;
    let next = value.includes(k) ? value.filter((v) => v !== k) : [...value.filter((v) => v !== c), k];
    // 세부 컷을 다 빼면 그 컷만 남긴다
    if (!next.some((v) => v === c || v.startsWith(c + CUT_SEP))) next = [...next, c];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {tops.map((c) => (
          <button key={c} type="button" onClick={() => toggleTop(c)} className={chip(on(c))}>
            {c}
            {subsOf(tags, c).length > 0 && <span className="ml-0.5 opacity-60">›</span>}
          </button>
        ))}
        {onAdd && (
          <button
            type="button"
            onClick={() => {
              const t = window.prompt("새 컷 이름 — 예: 뒤돌아보기");
              if (t?.trim()) onAdd(t.trim());
            }}
            className="shrink-0 rounded-full border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700"
          >
            + 컷
          </button>
        )}
      </div>
      {tops
        .filter((c) => on(c) && subsOf(tags, c).length)
        .map((c) => (
          <div key={c} className="flex flex-wrap items-center gap-1.5 pl-2">
            <span className="flex items-center gap-1 text-[11px] text-stone-400">
              <CornerDownRight size={12} /> {c}
            </span>
            {subsOf(tags, c).map((s) => (
              <button key={s} type="button" onClick={() => toggleSub(c, s)} className={chip(value.includes(`${c}${CUT_SEP}${s}`))}>
                {s}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

/**
 * 끌어서 순서 바꾸기 (10/8 세원: "컷 종류 편집 드래그로 순서 옮길 수 있게") — 손잡이(⋮⋮)를 눌러 위아래로.
 * HTML 드래그는 폰에서 안 돼서 포인터로 직접 — 끄는 줄은 손가락을 따라오고, 나머지 줄은 비켜 준다.
 * onMove(from, to) 는 놓았을 때 한 번. 줄 높이가 달라도(세부 컷이 든 줄) 된다.
 */
function useSort(onMove, disabled) {
  const [drag, setDrag] = useState(null); // {from, to, dy, h}
  const rows = useRef([]);
  const start = (e, i) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const rects = rows.current.map((r) => (r?.isConnected ? r.getBoundingClientRect() : null));
    const me = rects[i];
    if (!me) return;
    const y0 = e.clientY;
    let to = i;
    setDrag({ from: i, to: i, dy: 0, h: me.height });
    const move = (ev) => {
      const dy = ev.clientY - y0;
      // 손잡이(손가락) 높이로 자리를 정한다 — 세부 컷이 든 큰 줄도 손가락이 간 곳에 놓이게
      to = rects.reduce((n, r, j) => (j !== i && r && r.top + r.height / 2 < ev.clientY ? n + 1 : n), 0);
      setDrag({ from: i, to, dy, h: me.height });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      if (to !== i) onMove(i, to);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  /** j 번째 줄의 모양 — 끄는 줄은 따라오고, 그 사이 줄은 한 칸 비켜난다 */
  const styleOf = (j) => {
    if (!drag) return undefined;
    if (j === drag.from) return { transform: `translateY(${drag.dy}px)`, position: "relative", zIndex: 10 };
    const { from, to, h } = drag;
    const shift = from < to && j > from && j <= to ? -h : to < from && j >= to && j < from ? h : 0;
    return { transform: `translateY(${shift}px)`, transition: "transform 150ms ease-out" };
  };
  const ref = (j) => (el) => {
    rows.current[j] = el;
  };
  return { start, styleOf, ref, dragging: drag?.from ?? -1 };
}

const reorder = (list, from, to) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

function Grip({ onPointerDown, disabled, small }) {
  return (
    <span
      role="button"
      aria-label="끌어서 순서 바꾸기"
      title="끌어서 순서 바꾸기"
      onPointerDown={onPointerDown}
      className={
        "flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-stone-300 hover:bg-stone-100 hover:text-stone-600 active:cursor-grabbing " +
        (small ? "h-7 w-6" : "h-8 w-7") +
        (disabled ? " pointer-events-none opacity-30" : "")
      }
    >
      <GripVertical size={small ? 14 : 16} />
    </span>
  );
}

/** 세부 컷 줄들 — 한 컷 안에서만 끌어 옮긴다 */
function SubRows({ c, subs, refs, busy, icon, onMove, onRename, onRemove }) {
  const s = useSort(onMove, busy);
  return subs.map((x, j) => (
    <div key={x} ref={s.ref(j)} style={s.styleOf(j)} className={"flex items-center gap-1 bg-white pl-4 " + (s.dragging === j ? "rounded-lg shadow-md ring-1 ring-stone-200" : "")}>
      <Grip small disabled={busy} onPointerDown={(e) => s.start(e, j)} />
      <CornerDownRight size={13} className="shrink-0 text-stone-300" />
      <span className="min-w-0 flex-1 truncate px-1 text-sm text-stone-700">
        {x} <span className="text-xs text-stone-400">{refs.filter((r) => (r.cuts || []).includes(`${c}${CUT_SEP}${x}`)).length}장</span>
      </span>
      <button type="button" disabled={busy} onClick={() => onRename(x)} aria-label="이름 바꾸기" className={icon}>
        <Pencil size={13} />
      </button>
      <button type="button" disabled={busy} onClick={() => onRemove(x)} aria-label="지우기" className={icon + " hover:text-rose-700"}>
        <X size={14} />
      </button>
    </div>
  ));
}

/** 컷 편집 창 — 이름 바꾸기 · 세부 컷 · 순서(끌기) · 지우기. 사진에 붙은 이름도 같이 바꾼다 */
export function CutEditor({ tags, refs, onSaveTags, onSaveRefs, onClose }) {
  const [busy, setBusy] = useState(false);
  // 놓자마자 새 순서로 보이게 — 서버 저장이 끝나 tags 가 바뀌면 그걸 따른다
  const [local, setLocal] = useState(null); // {cuts?, cutSubs?}
  const sig = JSON.stringify([tags?.cuts, tags?.cutSubs]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setLocal(null);
  }, [sig]);
  const tops = local?.cuts || tags?.cuts || [];
  const subsHere = (c) => local?.cutSubs?.[c] || subsOf(tags, c);
  const used = (name) => refs.filter((r) => hasCut(r, name)).length;
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  // 사진의 컷 이름 바꾸기 (from → to, to 가 null 이면 빼기 / keepTop 이면 세부만 빼고 컷은 남김)
  const mapRefs = (fn) => onSaveRefs((v) => ({ ...v, items: (v.items || []).map((r) => (r.cuts?.length ? { ...r, cuts: [...new Set(r.cuts.map(fn).filter(Boolean))] } : r)) }));
  const saveTags = (fn) => onSaveTags((v) => fn({ ...v, cuts: v.cuts || tops, cutSubs: v.cutSubs || tags.cutSubs || {} }));

  const renameTop = (old) => {
    const t = window.prompt(`'${old}' 새 이름`, old)?.trim();
    if (!t || t === old || tops.includes(t)) return;
    run(async () => {
      await saveTags((v) => {
        const subs = { ...v.cutSubs };
        if (subs[old]) {
          subs[t] = subs[old];
          delete subs[old];
        }
        return { ...v, cuts: v.cuts.map((c) => (c === old ? t : c)), cutSubs: subs };
      });
      await mapRefs((c) => (c === old ? t : c.startsWith(old + CUT_SEP) ? t + c.slice(old.length) : c));
    });
  };
  const removeTop = (c) => {
    const n = used(c);
    if (!window.confirm(`'${c}' 컷을 지울까요?${n ? ` 이 컷이 붙은 사진 ${n}장에서 빠져요(사진은 안 지워져요).` : ""}`)) return;
    run(async () => {
      await saveTags((v) => {
        const subs = { ...v.cutSubs };
        delete subs[c];
        return { ...v, cuts: v.cuts.filter((x) => x !== c), cutSubs: subs };
      });
      if (n) await mapRefs((x) => (x === c || x.startsWith(c + CUT_SEP) ? null : x));
    });
  };
  // 끌어서 놓은 순서로 — 저장할 땐 이름으로 다시 맞춘다(그 사이 서버에서 바뀌었어도 안 꼬이게)
  const moveTop = (from, to) => {
    const order = reorder(tops, from, to);
    setLocal((l) => ({ ...l, cuts: order }));
    run(() =>
      saveTags((v) => {
        const rest = v.cuts.filter((c) => !order.includes(c));
        return { ...v, cuts: [...order.filter((c) => v.cuts.includes(c)), ...rest] };
      }),
    );
  };
  const tsort = useSort(moveTop, busy);
  const addTop = () => {
    const t = window.prompt("새 컷 이름 — 예: 뒤돌아보기")?.trim();
    if (!t || tops.includes(t)) return;
    run(() => saveTags((v) => ({ ...v, cuts: [...v.cuts, t] })));
  };
  const addSub = (c) => {
    const t = window.prompt(`'${c}' 안의 세부 컷 — 예: 정면`)?.trim();
    if (!t || subsOf(tags, c).includes(t)) return;
    run(() => saveTags((v) => ({ ...v, cutSubs: { ...v.cutSubs, [c]: [...(v.cutSubs[c] || []), t] } })));
  };
  const renameSub = (c, old) => {
    const t = window.prompt(`'${c} › ${old}' 새 이름`, old)?.trim();
    if (!t || t === old || subsOf(tags, c).includes(t)) return;
    run(async () => {
      await saveTags((v) => ({ ...v, cutSubs: { ...v.cutSubs, [c]: (v.cutSubs[c] || []).map((s) => (s === old ? t : s)) } }));
      await mapRefs((x) => (x === `${c}${CUT_SEP}${old}` ? `${c}${CUT_SEP}${t}` : x));
    });
  };
  const removeSub = (c, s) => {
    const k = `${c}${CUT_SEP}${s}`;
    const n = refs.filter((r) => (r.cuts || []).includes(k)).length;
    if (!window.confirm(`'${c} › ${s}'를 지울까요?${n ? ` 사진 ${n}장은 '${c}'로만 남아요.` : ""}`)) return;
    run(async () => {
      await saveTags((v) => ({ ...v, cutSubs: { ...v.cutSubs, [c]: (v.cutSubs[c] || []).filter((x) => x !== s) } }));
      if (n) await mapRefs((x) => (x === k ? c : x));
    });
  };
  const moveSub = (c, from, to) => {
    const order = reorder(subsHere(c), from, to);
    setLocal((l) => ({ ...l, cutSubs: { ...(l?.cutSubs || {}), [c]: order } }));
    run(() =>
      saveTags((v) => {
        const cur = v.cutSubs[c] || [];
        return { ...v, cutSubs: { ...v.cutSubs, [c]: [...order.filter((x) => cur.includes(x)), ...cur.filter((x) => !order.includes(x))] } };
      }),
    );
  };

  const icon = "flex h-8 w-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30";
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="컷 종류 편집" onClose={onClose} right={busy ? <span className="text-xs text-stone-400">저장 중…</span> : null} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-xs text-stone-500">왼쪽 ⋮⋮ 를 눌러 끌면 순서가 바뀌어요. 이름을 바꾸면 그 컷이 붙은 사진도 같이 바뀌어요. '거울 셀카' 안에 '정면·측면'처럼 세부 컷을 둘 수 있어요.</p>
        <ul className="divide-y divide-stone-100">
          {tops.map((c, i) => (
            <li key={c} ref={tsort.ref(i)} style={tsort.styleOf(i)} className={"bg-white py-1.5 " + (tsort.dragging === i ? "rounded-xl shadow-lg ring-1 ring-stone-200" : "")}>
              <div className="flex items-center gap-1">
                <Grip disabled={busy} onPointerDown={(e) => tsort.start(e, i)} />
                <span className="min-w-0 flex-1 truncate px-1 font-medium text-stone-900">
                  {c} <span className="text-xs font-normal text-stone-400">{used(c)}장</span>
                </span>
                <button type="button" disabled={busy} onClick={() => renameTop(c)} aria-label="이름 바꾸기" className={icon}>
                  <Pencil size={14} />
                </button>
                <button type="button" disabled={busy} onClick={() => addSub(c)} title="세부 컷 더하기" className="flex h-8 items-center gap-0.5 rounded-md px-1.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30">
                  <Plus size={13} /> 세부
                </button>
                <button type="button" disabled={busy} onClick={() => removeTop(c)} aria-label="지우기" className={icon + " hover:text-rose-700"}>
                  <Trash2 size={14} />
                </button>
              </div>
              <SubRows
                c={c}
                subs={subsHere(c)}
                refs={refs}
                busy={busy}
                icon={icon}
                onMove={(from, to) => moveSub(c, from, to)}
                onRename={(x) => renameSub(c, x)}
                onRemove={(x) => removeSub(c, x)}
              />
            </li>
          ))}
        </ul>
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button type="button" disabled={busy} onClick={addTop} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-semibold text-stone-600 hover:border-rose-300 hover:text-rose-800">
          <Plus size={15} /> 컷 추가
        </button>
      </footer>
    </Sheet>
  );
}

