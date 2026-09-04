import { rangeOf } from "../lib/calc";

const PRESETS = [
  ["today", "오늘"],
  ["month", "이번달"],
  ["lastMonth", "저번달"],
  ["custom", "직접 지정"],
];

/** 오늘 / 이번달 / 저번달 / 임의 기간 */
export default function DateRange({ preset, custom, onChange, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";

  const set = (p) => onChange({ preset: p, custom: p === "custom" ? custom : rangeOf(p) });

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => set(key)}
            className={
              "rounded-lg border font-medium transition " +
              pad +
              " " +
              (preset === key
                ? "border-rose-700 bg-rose-700 text-white"
                : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={custom?.from || ""}
            onChange={(e) => onChange({ preset: "custom", custom: { ...custom, from: e.target.value } })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
          <span className="text-stone-400">~</span>
          <input
            type="date"
            value={custom?.to || ""}
            onChange={(e) => onChange({ preset: "custom", custom: { ...custom, to: e.target.value } })}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
        </div>
      )}
    </div>
  );
}
