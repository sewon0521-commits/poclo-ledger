import { useState } from "react";
import { Pencil, GitCompareArrows } from "lucide-react";
import { CopyButton } from "./ContentBits";
import { stampOf, overlapOf, CLOSENESS } from "../lib/reels";

/**
 * 레퍼 대본 바탕 대본 (10/3 세원: "AI가 레퍼런스 대본을 그대로 가져와서 가공해 줬으면. 참고해서 창작하지 말고.
 * 이걸 베이스로 깔아 줘. 그래서 내가 수정할 때도 괜찮을 것 같아.")
 *
 * plan.baseLines = [{at, ref, ours}] — 레퍼런스 대본 한 줄씩과 그 자리의 우리 줄. plan.script 는 ours 를 이은 것(직접 고치면 이것만 바뀐다).
 * '레퍼와 비교'를 켜면 줄마다 바꾼 곳(분홍)과 레퍼런스 원래 줄이 보인다. 줄 앞 시각을 누르면 레퍼런스 영상이 그 장면부터(onSeek).
 * 머리의 '레퍼와 겹침 N%' (10/9 세원: "이 정도로 복붙하면 안 돼") — 글자 두 개씩 묶어 레퍼 줄과 겹치는 비율, 우리 줄 길이로 가중.
 * plan.closeness = 얼마나 가져오게 했는지(copy·remix·fresh, 10/9 전 기획은 없음).
 * 예전 기획(baseLines 없음)은 예전처럼 대본만.
 */
export default function BaseScript({ plan, onSave, onSeek }) {
  const lines = Array.isArray(plan?.baseLines) ? plan.baseLines : [];
  const [compare, setCompare] = useState(false);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const script = plan?.script || "";
  const ov = overlapOf(lines);
  const tone = ov.pct >= 60 ? "bg-rose-50 text-rose-700" : ov.pct >= 35 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700";
  const title = !lines.length
    ? "AI가 새로 쓴 대본"
    : plan?.closeness === "remix"
      ? "레퍼 흐름·분위기로 쓴 대본"
      : plan?.closeness === "copy"
        ? "레퍼 대본에 상품 말만 바꾼 대본"
        : "레퍼 대본 바탕 대본";

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
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-stone-500">
          {title}
          {lines.length > 0 && (
            <span
              title="우리 대본이 레퍼런스 문장과 글자로 얼마나 겹치는지 — 35% 아래면 우리 말, 60% 넘으면 거의 베낀 것"
              className={"rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums " + tone}
            >
              레퍼와 겹침 {ov.pct}%
            </span>
          )}
          {ov.same > 0 && <span className="font-normal text-stone-400">거의 그대로 {ov.same}줄 / {lines.length}줄</span>}
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
            const sim = ov.sims[i] || 0;
            const near = diff && sim >= 0.6;
            return (
              <li
                key={i}
                className={"flex gap-2 px-3 py-1.5 " + (!diff ? "" : near ? "border-l-[3px] border-l-amber-400 bg-amber-50/50" : "border-l-[3px] border-l-rose-400 bg-rose-50/40")}
              >
                {stamp(l.at, "t")}
                <span className="min-w-0 flex-1">
                  <span className={"block " + (diff ? "font-medium text-stone-900" : "text-stone-700")}>{l.ours}</span>
                  {diff ? (
                    <span className="block text-xs text-stone-400">
                      레퍼: <span className="line-through decoration-stone-300">{l.ref}</span>
                    </span>
                  ) : null}
                </span>
                {!diff ? (
                  <span className="mt-0.5 shrink-0 text-[10px] text-stone-300">그대로</span>
                ) : near ? (
                  <span className="mt-0.5 shrink-0 text-[10px] font-medium text-amber-700">거의 같음</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed text-stone-800">
          {script.split("\n").map((ln, i) => {
            const st = stampOf(ln);
            if (!st) return <div key={i}>{ln || " "}</div>;
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
        <p className="mt-1 text-[11px] text-stone-400">직접 고친 대본이에요. '레퍼와 비교'·겹침은 AI가 처음 쓴 내용 기준이에요.</p>
      )}
    </div>
  );
}

/** 레퍼런스를 얼마나 가져올지 — 회색 바탕 흰 알약 (ERP 공통 탭 모양) */
export function ClosenessPick({ value, onChange }) {
  const cur = CLOSENESS.find((c) => c.id === value) || CLOSENESS[1];
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-stone-500">레퍼런스 대본을 얼마나 가져올까요?</div>
      <div role="radiogroup" className="inline-flex flex-wrap gap-0.5 rounded-xl bg-stone-100 p-0.5">
        {CLOSENESS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            onClick={() => onChange(c.id)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-medium " +
              (value === c.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")
            }
          >
            {c.label}
            {c.id === "remix" && <span className="ml-1 text-[10px] font-normal text-rose-700">추천</span>}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-stone-500">{cur.hint}</p>
    </div>
  );
}
