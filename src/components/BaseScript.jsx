import { useState } from "react";
import { Pencil, GitCompareArrows } from "lucide-react";
import { CopyButton } from "./ContentBits";
import { stampOf } from "../lib/reels";

/**
 * 레퍼 대본 바탕 대본 (10/3 세원: "AI가 레퍼런스 대본을 그대로 가져와서 가공해 줬으면. 참고해서 창작하지 말고.
 * 이걸 베이스로 깔아 줘. 그래서 내가 수정할 때도 괜찮을 것 같아.")
 *
 * plan.baseLines = [{at, ref, ours}] — 레퍼런스 대본 한 줄씩과 우리 상품으로 바꾼 줄. plan.script 는 ours 를 이은 것(직접 고치면 이것만 바뀐다).
 * '레퍼와 비교'를 켜면 줄마다 바꾼 곳(분홍)과 레퍼런스 원래 줄이 보인다. 줄 앞 시각을 누르면 레퍼런스 영상이 그 장면부터(onSeek).
 * 예전 기획(baseLines 없음)은 예전처럼 대본만.
 */
export default function BaseScript({ plan, onSave, onSeek }) {
  const lines = Array.isArray(plan?.baseLines) ? plan.baseLines : [];
  const [compare, setCompare] = useState(false);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const script = plan?.script || "";
  const changed = lines.filter((l) => (l.ours ?? "") !== (l.ref ?? "")).length;

  const stamp = (at, key) =>
    at ? (
      onSeek ? (
        <button
          key={key}
          type="button"
          onClick={() => onSeek(stampOf(`[${at}]`)?.t ?? 0)}
          title="레퍼런스 영상 이 장면부터"
          className="mt-0.5 shrink-0 rounded bg-rose-50 px-1 text-[11px] font-medium text-rose-700 tabular-nums hover:bg-rose-100"
        >
          ▶ {at}
        </button>
      ) : (
        <span key={key} className="mt-0.5 shrink-0 text-[11px] text-stone-400 tabular-nums">
          {at}
        </span>
      )
    ) : (
      <span key={key} className="w-0 shrink-0" />
    );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-500">
          {lines.length ? "레퍼 대본 바탕 대본" : "AI가 새로 쓴 대본"}
          {lines.length > 0 && <span className="ml-1.5 font-normal text-stone-400">레퍼런스 {lines.length}줄 중 {changed}줄을 우리 상품으로 바꿈</span>}
        </span>
        {!edit && (
          <span className="flex items-center gap-2">
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setCompare(!compare)}
                aria-pressed={compare}
                className={"flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs " + (compare ? "bg-rose-50 font-semibold text-rose-700" : "text-stone-500 hover:text-stone-800")}
              >
                <GitCompareArrows size={12} /> 레퍼와 비교
              </button>
            )}
            {onSave && (
              <button
                type="button"
                onClick={() => {
                  setV(script);
                  setEdit(true);
                  setCompare(false);
                }}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
              >
                <Pencil size={12} /> 고치기
              </button>
            )}
            <CopyButton text={script} />
          </span>
        )}
      </div>

      {edit ? (
        <div className="space-y-1.5">
          <textarea
            value={v}
            autoFocus
            onChange={(e) => setV(e.target.value)}
            className="block min-h-[8rem] w-full rounded-xl border border-rose-400 px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none [field-sizing:content]"
          />
          <p className="text-[11px] text-stone-400">줄 앞 [0:03.5] 은 레퍼런스 시각이에요. 그대로 두고 글만 고치면 영상 보기와 맞아요.</p>
          <span className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEdit(false)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600">
              그만두기
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(v.replace(/\s+$/, ""));
                setEdit(false);
              }}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              저장
            </button>
          </span>
        </div>
      ) : compare ? (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
          {lines.map((l, i) => {
            const diff = (l.ours ?? "") !== (l.ref ?? "");
            return (
              <li key={i} className={"flex gap-2 px-3 py-1.5 " + (diff ? "border-l-[3px] border-l-rose-400 bg-rose-50/40" : "")}>
                {stamp(l.at, "t")}
                <span className="min-w-0 flex-1">
                  <span className={"block " + (diff ? "font-medium text-stone-900" : "text-stone-700")}>{l.ours}</span>
                  {diff ? (
                    <span className="block text-xs text-stone-400">
                      레퍼: <span className="line-through decoration-stone-300">{l.ref}</span>
                    </span>
                  ) : null}
                </span>
                {!diff && <span className="mt-0.5 shrink-0 text-[10px] text-stone-300">그대로</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed text-stone-800">
          {script.split("\n").map((ln, i) => {
            const st = stampOf(ln);
            if (!st) return <div key={i}>{ln || " "}</div>;
            return (
              <div key={i} className="flex items-start gap-2">
                {stamp(st.label, "t")}
                <span>{st.rest}</span>
              </div>
            );
          })}
        </div>
      )}
      {lines.length > 0 && script !== lines.map((l) => (l.at ? `[${l.at}] ` : "") + (l.ours ?? l.ref)).join("\n") && !edit && (
        <p className="mt-1 text-[11px] text-stone-400">직접 고친 대본이에요. '레퍼와 비교'는 AI가 처음 바꾼 내용을 보여 줘요.</p>
      )}
    </div>
  );
}
