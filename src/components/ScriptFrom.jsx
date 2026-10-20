import { useState } from "react";

/**
 * 대본을 어디서 뽑나 (10/20 세원: "목소리랑 대본이 섞여서 만들어졌어. 영상 분석을 하기 전에 대본 or 목소리를 선택할 수 있게 만들고
 * 둘중 하나만 뽑아야 될 것 같아") — 분석기 일감에 scriptFrom 으로 실려 /api/reels script 규칙이 갈린다. 기기마다 마지막 고른 것.
 */
const FROM_KEY = "poclo_script_from";
export const SCRIPT_FROM = [
  { key: "caption", label: "자막대로", tip: "화면 자막 글자 그대로 — 목소리는 안 넣어요" },
  { key: "voice", label: "목소리대로", tip: "말한 그대로 — 화면 자막은 안 넣어요" },
];
export const FROM_LABEL = { caption: "자막대로 뽑음", voice: "목소리대로 뽑음" };
export function useScriptFrom() {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(FROM_KEY) === "voice" ? "voice" : "caption";
    } catch {
      return "caption";
    }
  });
  const set = (x) => {
    setV(x);
    try {
      localStorage.setItem(FROM_KEY, x);
    } catch {
      /* 이 기기 저장이 막혀도 고른 건 이 화면에서는 그대로 */
    }
  };
  return [v, set];
}
export function ScriptFromPick({ value, onChange, className = "" }) {
  const cur = SCRIPT_FROM.find((o) => o.key === value) || SCRIPT_FROM[0];
  return (
    <div className={"flex flex-wrap items-center gap-x-2 gap-y-1 " + className}>
      <span className="text-xs font-medium text-stone-600">대본은</span>
      <div className="flex gap-0.5 rounded-lg bg-stone-100 p-0.5" role="radiogroup" aria-label="대본을 어디서 뽑을까요">
        {SCRIPT_FROM.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onChange(o.key)}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium " +
              (value === o.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-stone-400">{cur.tip}</span>
    </div>
  );
}
