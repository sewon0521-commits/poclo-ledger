import { useState } from "react";

/**
 * 표 안에서 숫자를 눌러 바로 고치는 칸.
 *
 * 자동으로 들어온 값이든 손으로 넣은 값이든 여기서 덮어쓸 수 있다. 눌러야 입력칸이
 * 되고, 벗어나면 저장한다. Esc를 누르면 고치기 전으로 돌아간다.
 */
export default function EditNum({ value, onSave, align = "right", placeholder = "—", tone }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const start = () => {
    setDraft(String(Math.round(value || 0)));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const n = Math.round(Number(String(draft).replace(/[^\d.-]/g, "")) || 0);
    if (n !== Math.round(value || 0)) onSave(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded border border-rose-600 bg-white px-1.5 py-0.5 text-right tabular-nums outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="눌러서 고치기"
      className={
        "w-full rounded px-1.5 py-0.5 tabular-nums hover:bg-stone-100 " +
        (align === "right" ? "text-right" : "text-left") +
        " " +
        (tone || (value ? "text-stone-700" : "text-stone-300"))
      }
    >
      {value ? value.toLocaleString("ko-KR") : placeholder}
    </button>
  );
}
