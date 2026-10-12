import { useRef, useState } from "react";
import { engToKor } from "../lib/hangul";

/**
 * 예금주 칸 — 한/A 단추.
 * 10/10 세원: "예금주 적을 때 처음에 한글로" → 영문 자판으로 쳐도 한글로(한).
 * 10/12 세원: "거래처 예금주에 영어가 아예 안 써지는데?" → 'A' 를 누르면 친 그대로. 영어가 든 예금주는 처음부터 A,
 * 영어를 붙여넣으면 저절로 A. '한'으로 바꾼 뒤에는 그 뒤에 친 글자만 한글로 바꾼다(앞에 있던 영어는 그대로).
 */
export default function HangulInput({ value, onChange, className, placeholder }) {
  const [ko, setKo] = useState(() => !/[A-Za-z]/.test(value || ""));
  const pasted = useRef(false);
  const keep = useRef(ko ? 0 : (value || "").length); // 앞에서부터 이만큼은 안 바꾼다
  const box = useRef(null);
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        ref={box}
        value={value || ""}
        lang={ko ? "ko" : "en"}
        onPaste={(e) => {
          pasted.current = true;
          if (/[A-Za-z]/.test(e.clipboardData?.getData("text") || "")) setKo(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          const before = value || "";
          if (!ko || pasted.current) {
            pasted.current = false;
            onChange(v);
            return;
          }
          // 바뀌지 않은 앞부분까지만 지킨다
          let same = 0;
          while (same < before.length && same < v.length && before[same] === v[same]) same++;
          const k = Math.min(keep.current, same);
          keep.current = k;
          onChange(v.slice(0, k) + engToKor(v.slice(k)));
        }}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!ko) keep.current = (value || "").length;
          setKo(!ko);
          box.current?.focus();
        }}
        title={ko ? "지금: 영문 자판으로 쳐도 한글 — 누르면 영어 그대로" : "지금: 영어 그대로 — 누르면 한글로"}
        aria-label={ko ? "영어로 쓰기" : "한글로 쓰기"}
        className={
          "shrink-0 rounded-md border px-1.5 py-1 text-[11px] font-semibold " +
          (ko ? "border-stone-200 text-stone-500 hover:border-stone-400" : "border-sky-300 bg-sky-50 text-sky-800")
        }
      >
        {ko ? "한" : "A"}
      </button>
    </span>
  );
}
