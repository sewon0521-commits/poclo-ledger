import { useRef, useState } from "react";
import { Ruler, Copy, Check, Pencil, Eraser, Wand2 } from "lucide-react";
import { MEASURE_CATS, catOf, blankMeasure, sizeNames, filled, measureText, parseMeasure, WEAR, wearLines } from "../lib/measure";
import { dayKey } from "../lib/journal";
import { Sheet, SheetHead, Photo } from "./ShootBits";

/**
 * 직접 잰 실측표 (lib/measure.js 머리말) — 포장하면서 폰으로 치기 쉽게:
 * 숫자 자판(inputMode decimal) · 엔터(다음)로 다음 칸 · 큰 칸. PC 에서는 표를 통째로 붙여넣으면 칸마다 들어가고,
 * '복사'하면 상품등록 메모(정보.txt) 모양으로 나온다.
 */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const clean = (s) => String(s || "").replace(/[^\d.~\-/]/g, "");

export function MeasureBox({ x, onChange, big = false }) {
  // 복사 글에는 착용정보(계절감…)도 같이 — 상품등록 메모에 한 번에 붙이게
  const wearText = wearLines(x.wear);
  const m = x.measure || blankMeasure(x);
  const cat = catOf(m.cat);
  const sizes = m.sizes?.length ? m.sizes : ["FREE"];
  const [editSizes, setEditSizes] = useState(false);
  const [copied, setCopied] = useState("");
  const box = useRef(null);
  const update = (patch) => onChange({ ...m, ...patch, on: dayKey() });
  const setVal = (s, p, val) => update({ v: { ...m.v, [s]: { ...(m.v?.[s] || {}), [p]: clean(val) } } });
  const merge = (got) => {
    if (!got) return false;
    const nextSizes = got.sizes && got.sizes.length > 1 ? got.sizes : sizes;
    const v = { ...m.v };
    for (const [s, pv] of Object.entries(got.v)) v[s] = { ...(v[s] || {}), ...pv };
    update({ sizes: nextSizes, v });
    return true;
  };
  const f = filled({ ...m, sizes });
  const out = measureText({ ...m, sizes });
  const copyAll = [out.text, wearText].filter(Boolean).join("\n\n");
  // 엔터(폰 자판 '다음') → 다음 칸. 여러 사이즈면 한 벌(한 사이즈)씩 위에서 아래로
  const order = sizes.flatMap((s) => cat.parts.map((p) => `${s}|${p}`));
  const next = (key) => {
    const i = order.indexOf(key);
    const el = box.current?.querySelector(`[data-mk="${CSS.escape(order[i + 1] || "")}"]`);
    if (el) el.focus();
    else document.activeElement?.blur();
  };
  const cell = (s, p) => {
    const key = `${s}|${p}`;
    return (
      <input
        data-mk={key}
        value={m.v?.[s]?.[p] ?? ""}
        onChange={(e) => setVal(s, p, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            next(key);
          }
        }}
        onPaste={(e) => {
          // 표·글을 통째로 붙이면 칸마다 (숫자 하나면 그 칸에 그대로)
          const t = e.clipboardData?.getData("text/plain") || "";
          if (!/[\n\t]|[가-힣]/.test(t) && (t.match(/\d+(?:\.\d+)?/g) || []).length < 2) return;
          if (merge(parseMeasure(t, { ...m, sizes }))) e.preventDefault();
        }}
        inputMode="decimal"
        enterKeyHint={order.indexOf(key) === order.length - 1 ? "done" : "next"}
        autoComplete="off"
        aria-label={`${s === "FREE" ? "" : s + " "}${p}`}
        className={
          "w-full rounded-lg border bg-white text-center font-semibold text-stone-900 tabular-nums outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-100 " +
          (big ? "h-12 text-lg" : "h-10 text-base") +
          (m.v?.[s]?.[p] ? " border-stone-300" : " border-stone-200")
        }
      />
    );
  };

  return (
    <div ref={box} className="space-y-2.5 rounded-xl border border-stone-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
          <Ruler size={14} className="text-rose-700" /> 직접 잰 실측
          <span className={"font-normal " + (f.n === f.of && f.of ? "text-emerald-700" : "text-stone-400")}>
            {f.n}/{f.of}칸 · cm
          </span>
        </span>
        <span className="flex flex-wrap gap-1">
          {MEASURE_CATS.map((c) => (
            <button
              key={c.k}
              type="button"
              title={c.hint}
              onClick={() => update({ cat: c.k })}
              className={"rounded-full border px-2.5 py-1 text-xs font-medium " + (cat.k === c.k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}
            >
              {c.label}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
        사이즈
        {editSizes ? (
          <input
            autoFocus
            defaultValue={sizes.join(", ")}
            onBlur={(e) => {
              update({ sizes: sizeNames(e.target.value) });
              setEditSizes(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="FREE 또는 S, M, L"
            className="rounded-md border border-rose-400 px-2 py-0.5 text-xs text-stone-800 outline-none"
          />
        ) : (
          <>
            {sizes.map((s) => (
              <span key={s} className="rounded-md bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-700">
                {s}
              </span>
            ))}
            <button type="button" onClick={() => setEditSizes(true)} className="flex items-center gap-0.5 text-stone-400 hover:text-stone-700">
              <Pencil size={11} /> 고치기
            </button>
          </>
        )}
        <span className="ml-auto hidden text-[11px] text-stone-400 sm:inline">표·글을 칸에 붙여넣으면 한 번에 들어가요</span>
      </div>

      {sizes.length === 1 ? (
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
          {cat.parts.map((p) => (
            <label key={p} className="block text-center">
              <span className="mb-0.5 block text-xs font-medium text-stone-500">{p}</span>
              {cell(sizes[0], p)}
            </label>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-500">
                <th className="w-14 pb-1 text-left font-medium" />
                {sizes.map((s) => (
                  <th key={s} className="pb-1 font-semibold text-stone-700">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cat.parts.map((p) => (
                <tr key={p}>
                  <td className="pr-2 text-xs font-medium whitespace-nowrap text-stone-500">{p}</td>
                  {sizes.map((s) => (
                    <td key={s} className="min-w-16 p-0.5">
                      {cell(s, p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!copyAll}
          onClick={async () => setCopied((await copyText(copyAll)) ? "복사했어요 — 상품등록 메모(정보.txt)에 붙여넣으면 사이즈·착용정보가 다 들어가요" : "복사가 막혔어요")}
          className="flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} 복사 (상품등록 메모 모양)
        </button>
        {x.sizeText && (
          <button
            type="button"
            onClick={() => merge(parseMeasure(x.sizeText, { ...m, sizes })) || setCopied("거래처 실측에서 이 표에 맞는 숫자를 못 찾았어요")}
            className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600 hover:border-rose-300"
          >
            <Wand2 size={13} /> 거래처 실측으로 채우기
          </button>
        )}
        {f.n > 0 && (
          <button type="button" onClick={() => window.confirm("잰 숫자를 다 지울까요?") && update({ v: {} })} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-rose-700">
            <Eraser size={13} /> 지우기
          </button>
        )}
      </div>
      {copied && <p className="text-[11px] text-emerald-700">{copied}</p>}
      {out.missing.length > 0 && <p className="text-[11px] text-amber-700">{out.missing.join(" · ")}은(는) 비어 있는 사이즈가 있어서 복사에서 뺐어요.</p>}
      {copyAll && (
        <details>
          <summary className="cursor-pointer text-[11px] text-stone-400">복사되는 글 보기</summary>
          <pre className="mt-1 rounded-lg bg-stone-50 p-2 font-sans text-xs whitespace-pre-wrap text-stone-700">{copyAll}</pre>
        </details>
      )}
    </div>
  );
}

/** 착용정보 — 누르기만 (폰에서 한 손으로). 같은 칩을 다시 누르면 빠진다. 계절감은 여러 개 */
export function WearBox({ wear = {}, onChange, wearFrom = "" }) {
  const list = (k) => (Array.isArray(wear[k]) ? wear[k] : wear[k] ? [wear[k]] : []);
  const pick = (k, v) => {
    const cur = list(k);
    onChange({ ...wear, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  return (
    <div className="space-y-2 rounded-xl border border-stone-200 p-3">
      <div className="text-xs font-semibold text-stone-700">
        착용정보 <span className="font-normal text-stone-400">여러 개 골라도 돼요 · 상품등록 때 그대로 가져가요</span>
        {wearFrom && <span className="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{wearFrom}에서 가져옴</span>}
      </div>
      {WEAR.map(([k, opts]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs font-medium text-stone-500">{k}</span>
          <div className="flex flex-wrap gap-1.5">
            {opts.map((v) => {
              const on = list(k).includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => pick(k, v)}
                  aria-pressed={on}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 카드에서 바로 — 포장하면서 폰으로 재기 */
export function MeasureSheet({ item, url, onSave, onClose }) {
  const [x, setX] = useState(item);
  const [saving, setSaving] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={`실측 재기 · ${item.name || "상품"}`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <Photo url={url} className="h-16 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 text-sm">
            <div className="truncate font-semibold text-stone-900">{item.name}</div>
            <div className="truncate text-xs text-stone-500">{[item.vendor, item.colors, item.sizes].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <MeasureBox x={x} big onChange={(measure) => setX((p) => ({ ...p, measure }))} />
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(x.measure || null);
            setSaving(false);
          }}
          className="w-full rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}
