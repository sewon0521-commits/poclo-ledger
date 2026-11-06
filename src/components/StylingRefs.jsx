import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { FIELD } from "../lib/shoot";
import { newId } from "../lib/id";
import { CLOTH_NONE } from "../lib/modelRefs";
import { REF_CUT_SUGGEST, refCutsOf, looseRefIds, withRefCuts } from "../lib/styling";
import { ClothBar } from "./BaseGuide";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 스타일링 창 '참고 사진' — 카테고리 탭 → 컷 → 사진 (11/6 세원: "우리 스타일링 → 참고 사진도 모델 레퍼런스처럼 카테고리 나누자").
 * 모델 레퍼런스(ModelRefsPage)와 같은 모양: 탭 옆 '+ 카테고리', 탭 안에 '컷 이름 + 엔터 / 컷 만들기' · 추천, 컷마다 순서 · 카테고리 옮기기 · 지우기.
 * 사진은 촬영 레퍼런스 사진(id) — 레퍼런스에서 고르기 · 사진 고르기 · Ctrl+V · 끌어다 놓기(마우스를 올린 컷으로). 데이터 모양은 lib/styling 머리말.
 * 예전에 넣은 사진(컷에 안 든 것)은 '공통' 탭에 그대로 — 탭은 그런 사진이나 카테고리 없는 컷이 있을 때만 보인다.
 */

const catOf = (c, cats) => (cats.includes(c.cloth) ? c.cloth : "");
const catLabel = (c) => c || CLOTH_NONE;

/** 사진 칸 — 사진들 · 올리는 중 · '레퍼런스에서' · '사진 고르기' */
function Tiles({ refs, urls, pending, onBig, onRemove, onPick, onFiles }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
      {refs.map((r, i) => (
        <span key={r.id} className="group relative">
          <button type="button" onClick={() => onBig(i)} className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100">
            {urls[r.photo] && <img src={urls[r.photo]} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </button>
          <button
            type="button"
            onClick={() => onRemove(r.id)}
            aria-label="사진 빼기"
            className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
          >
            <X size={13} />
          </button>
        </span>
      ))}
      {pending.map((u) => (
        <span key={u} className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
          <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
          <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-white" />
        </span>
      ))}
      <button type="button" onClick={onPick} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
        <ImagePlus size={16} /> 레퍼런스에서
      </button>
      <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
        <ImagePlus size={16} /> 사진 고르기
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
      </label>
    </div>
  );
}

/**
 * st = 스타일링, onChange(다음 스타일링). pending = [{u, where}] 올리는 중인 사진(where = 컷 id · "" 공통 · "new:카테고리").
 * onPick(where) 레퍼런스에서 고르기 · onFiles(files, where) · onHot(where) Ctrl+V·끌어다 놓기가 갈 곳 · onBig(urls, k).
 */
export function RefCutsBox({ st, onChange, d, cats, tab, onTab, pending, onPick, onFiles, onHot, onBig, onEditCats }) {
  const [cutName, setCutName] = useState("");
  const [msg, setMsg] = useState("");
  const cuts = refCutsOf(st);
  const loose = looseRefIds(st);
  const tabs = loose.length || cuts.some((c) => !catOf(c, cats)) ? [...cats, ""] : cats;
  // 처음 탭 = 컷이 있는 첫 카테고리 → 예전 사진만 있으면 공통
  const def = cats.find((c) => cuts.some((x) => catOf(x, cats) === c)) ?? (tabs.includes("") ? "" : cats[0]);
  const cur = tab !== null && tabs.includes(tab) ? tab : def;
  const shown = cuts.filter((c) => catOf(c, cats) === cur);
  const refsOf = (ids) => (ids || []).map((id) => d.refs.find((r) => r.id === id)).filter(Boolean);
  const countOf = (c) => new Set([...(c === "" ? loose : []), ...cuts.filter((x) => catOf(x, cats) === c).flatMap((x) => x.refIds || [])].filter((id) => d.refs.some((r) => r.id === id))).size;
  const putCuts = (next) => onChange(withRefCuts(st, next, loose));
  const setCut = (id, patch) => putCuts(cuts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  // 순서는 이 카테고리 안에서만
  const move = (i, dir) => {
    const a = shown[i];
    const b = shown[i + dir];
    putCuts(cuts.map((c) => (c.id === a.id ? b : c.id === b.id ? a : c)));
  };
  const addCut = (raw) => {
    const title = raw.trim();
    if (!title) return;
    if (shown.some((c) => (c.title || "").trim() === title)) return setMsg(`${catLabel(cur)}에 이미 '${title}'이 있어요.`);
    setMsg("");
    putCuts([...cuts, { id: newId("sc"), ...(cur ? { cloth: cur } : {}), title, refIds: [] }]);
    setCutName("");
  };
  const removeCut = (c) => {
    const n = refsOf(c.refIds).length;
    if (n && !window.confirm(`'${c.title || "이 컷"}'을 지울까요? 이 코디에서 사진 ${n}장이 빠져요. 촬영 레퍼런스의 사진은 그대로예요.`)) return;
    putCuts(cuts.filter((x) => x.id !== c.id));
  };
  // 붙여넣기 · 끌어다 놓기가 갈 곳 — 컷 위가 아니면 그 탭 첫 컷, 컷이 없으면 그 탭에 새 컷(공통이면 그냥 공통)
  const tabHot = shown[0]?.id ?? (cur ? `new:${cur}` : "");
  const pendingOf = (where) => pending.filter((p) => p.where === where).map((p) => p.u);
  // 컷 위면 그 컷으로 — 끌어다 놓기는 막지 않게(창 바닥이 dragover 를 받아 줘야 놓인다)
  const hotTo = (where) => (e) => {
    e.stopPropagation();
    if (e.type === "dragover") e.preventDefault();
    onHot(where);
  };
  return (
    <div className="space-y-2.5" onMouseEnter={() => onHot(tabHot)} onPointerDown={() => onHot(tabHot)} onDragOver={() => onHot(tabHot)}>
      <div className="flex items-stretch gap-2">
        <ClothBar tabs={tabs.map((c) => ({ key: c, label: catLabel(c), count: countOf(c) }))} cur={cur} onPick={(c) => (onTab(c), setMsg(""))} className="min-w-0 flex-1" />
        <button type="button" onClick={onEditCats} className="flex shrink-0 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-600 hover:border-rose-300 hover:text-rose-800">
          <Plus size={14} /> 카테고리
        </button>
      </div>
      {cur === "" && loose.length > 0 && (
        <div
          className="space-y-2 rounded-xl border border-stone-200 bg-white p-2.5"
          onMouseEnter={hotTo("")}
          onPointerDown={hotTo("")}
          onDragOver={hotTo("")}
        >
          <div className="text-xs font-semibold text-stone-500">컷에 안 넣은 사진 · 예전에 넣은 것</div>
          <Tiles
            refs={refsOf(loose)}
            urls={d.urls}
            pending={pendingOf("")}
            onBig={(k) => onBig(refsOf(loose).map((r) => d.urls[r.photo] || ""), k)}
            onRemove={(id) => onChange(withRefCuts(st, cuts, loose.filter((x) => x !== id)))}
            onPick={() => onPick("")}
            onFiles={(fs) => onFiles(fs, "")}
          />
        </div>
      )}
      {shown.length === 0 && cur !== "" && (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-5 text-center text-sm text-stone-500">
          {pendingOf(`new:${cur}`).length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> 사진을 넣는 중이에요
            </span>
          ) : (
            <>
              {catLabel(cur)}에 아직 컷이 없어요. 아래에서 만들어 주세요.
              <span className="mt-0.5 block text-[11px] text-stone-400">그냥 Ctrl+V · 끌어다 놓기 하면 '참고 사진' 컷을 만들어 넣어요.</span>
            </>
          )}
        </div>
      )}
      {shown.map((c, i) => {
        const refs = refsOf(c.refIds);
        const hot = hotTo(c.id);
        return (
          <div key={c.id} className="space-y-2 rounded-xl border border-stone-200 bg-white p-2.5" onMouseEnter={hot} onPointerDown={hot} onDragOver={hot}>
            <div className="flex items-center gap-1.5">
              <input value={c.title || ""} onChange={(e) => setCut(c.id, { title: e.target.value })} placeholder="컷 이름 (예: 앉아서 찍는 컷)" aria-label="컷 이름" className={FIELD + " min-w-0 flex-1 py-1.5 font-semibold"} />
              <span className="shrink-0 text-xs text-stone-400 tabular-nums">{refs.length}장</span>
              <select
                value={catOf(c, cats)}
                onChange={(e) => (setCut(c.id, { cloth: e.target.value || undefined }), onTab(e.target.value))}
                aria-label={`${c.title || "이 컷"} 카테고리 옮기기`}
                title="다른 카테고리로 옮기기"
                className="shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-2 text-xs text-stone-600 outline-none focus:border-rose-600"
              >
                {cats.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
                {!catOf(c, cats) && <option value="">{CLOTH_NONE}</option>}
              </select>
              <span className="flex shrink-0">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                  <ChevronUp size={15} />
                </button>
                <button type="button" disabled={i === shown.length - 1} onClick={() => move(i, 1)} aria-label="아래로" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                  <ChevronDown size={15} />
                </button>
              </span>
              <button type="button" onClick={() => removeCut(c)} aria-label={`${c.title || "이 컷"} 지우기`} className="shrink-0 rounded p-1 text-stone-300 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={14} />
              </button>
            </div>
            <Tiles
              refs={refs}
              urls={d.urls}
              pending={pendingOf(c.id)}
              onBig={(k) => onBig(refs.map((r) => d.urls[r.photo] || ""), k)}
              onRemove={(id) => setCut(c.id, { refIds: (c.refIds || []).filter((x) => x !== id) })}
              onPick={() => onPick(c.id)}
              onFiles={(fs) => onFiles(fs, c.id)}
            />
          </div>
        );
      })}
      <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
        <div className="flex gap-1.5">
          {/* 한글은 엔터 keydown 이 조합 끝내기로 먹혀서 keyup 에서 넣는다 */}
          <input value={cutName} onChange={(e) => setCutName(e.target.value)} onKeyUp={(e) => e.key === "Enter" && addCut(cutName)} placeholder={`${catLabel(cur)} 안에 만들 컷 이름`} aria-label="만들 컷 이름" className={FIELD + " min-w-0 flex-1"} />
          <button type="button" disabled={!cutName.trim()} onClick={() => addCut(cutName)} className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-700 px-3 text-sm font-semibold text-white disabled:bg-stone-300">
            <Plus size={14} /> 컷 만들기
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REF_CUT_SUGGEST.filter((t) => !shown.some((c) => (c.title || "").trim() === t)).map((t) => (
            <button key={t} type="button" onClick={() => addCut(t)} className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-rose-300 hover:text-rose-800">
              <Plus size={12} /> {t}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="text-xs text-rose-700">{msg}</p>}
    </div>
  );
}

/**
 * 참고 사진 카테고리 편집 — 모델 레퍼런스 카테고리 편집(ModelRefsPage ClothEditor)과 같은 모양: 더하기 · 이름 고치기 · 순서 · 지우기.
 * 목록은 스타일링 것(styling_opts.cloths) — 모든 코디에 같이. 이름을 바꾸거나 지우면 모든 코디의 컷도 같이 바뀐다(onRename · onDrop 이 처리).
 * counts = {카테고리: 컷 수(모든 코디)}
 */
export function RefCatEditor({ cats, counts, onAdd, onRename, onMove, onDrop, onClose }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const bad = (n) => (n === CLOTH_NONE ? `'${CLOTH_NONE}'은 쓸 수 없는 이름이에요.` : cats.includes(n) ? `'${n}' 카테고리는 이미 있어요.` : "");
  const add = () => {
    const n = draft.trim();
    if (!n) return;
    const why = bad(n);
    setErr(why);
    if (why) return;
    setDraft("");
    onAdd(n);
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="참고 사진 카테고리 편집" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="flex gap-2">
          {/* 한글은 엔터 keydown 이 조합 끝내기로 먹혀서 keyup 에서 넣는다 */}
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyUp={(e) => e.key === "Enter" && add()} placeholder="새 카테고리 이름 (예: 원피스)" aria-label="새 카테고리 이름" className={FIELD + " min-w-0"} />
          <button type="button" onClick={add} disabled={!draft.trim()} className="shrink-0 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:bg-stone-300">
            더하기
          </button>
        </div>
        {err && <p className="text-xs text-rose-700">{err}</p>}
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {cats.map((c, i) => {
            const n = counts[c] || 0;
            return (
              <li key={c} className="flex items-center gap-2 px-2.5 py-2">
                <input
                  defaultValue={c}
                  aria-label={`${c} 이름`}
                  onKeyUp={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  onBlur={(e) => {
                    const to = e.currentTarget.value.trim();
                    if (!to || to === c) return void (e.currentTarget.value = c);
                    const why = bad(to);
                    setErr(why);
                    if (why) return void (e.currentTarget.value = c);
                    onRename(c, to);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-stone-800 hover:border-stone-200 focus:border-stone-300 focus:outline-none"
                />
                <span className="shrink-0 text-xs text-stone-400 tabular-nums">{n}컷</span>
                <span className="flex shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => onMove(c, -1)} aria-label={`${c} 위로`} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" disabled={i === cats.length - 1} onClick={() => onMove(c, 1)} aria-label={`${c} 아래로`} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                    <ChevronDown size={15} />
                  </button>
                </span>
                <button
                  type="button"
                  disabled={cats.length === 1}
                  onClick={() => (!n || window.confirm(`'${c}' 카테고리를 지울까요? 안의 컷 ${n}개는 '${CLOTH_NONE}'으로 가요. 사진은 그대로예요.`)) && onDrop(c)}
                  aria-label={`${c} 지우기`}
                  className="shrink-0 rounded p-1 text-stone-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-stone-500">모든 코디의 스타일링 참고 사진에 같이 적용돼요. 모델 레퍼런스 카테고리와는 따로예요.</p>
      </div>
    </Sheet>
  );
}
