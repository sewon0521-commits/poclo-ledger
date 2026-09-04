import { useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Plus, Check } from "lucide-react";
import { searchVendors } from "../lib/match";

/**
 * 거래처 고르는 토글 + 돋보기 검색.
 *
 * 장끼마다 상호가 다르게 읽히므로, 자동으로 잡힌 게 틀렸을 때 사장님이 기존
 * 거래처를 직접 찾아 누를 수 있어야 한다. 새 이름을 그냥 쳐서 새 거래처로
 * 등록하는 길도 같이 열어둔다.
 */
export default function VendorPicker({ vendors, value, name, onPick, onNewName, hint }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  const selected = vendors.find((v) => v.id === value) || null;
  const found = useMemo(() => searchVendors(vendors, q).slice(0, 30), [vendors, q]);
  const typed = q.trim();
  const exact = vendors.some((v) => v.name === typed);

  const label = selected ? selected.name : name || "거래처 고르기";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQ("");
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={
          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left outline-none " +
          (selected ? "border-stone-300 bg-white" : "border-amber-400 bg-amber-50")
        }
      >
        <span className={"truncate " + (selected || name ? "text-stone-900" : "text-stone-400")}>
          {label}
        </span>
        <ChevronDown size={16} className="shrink-0 text-stone-400" />
      </button>

      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}

      {open && (
        <>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-stone-300 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
              <Search size={15} className="shrink-0 text-stone-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="거래처명·위치·계좌·전화 검색"
                className="w-full py-1 text-sm outline-none"
              />
            </div>

            <ul className="max-h-64 overflow-y-auto">
              {found.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(v);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-stone-900">{v.name}</div>
                      {(v.address || v.phone) && (
                        <div className="truncate text-xs text-stone-400">
                          {[v.address, v.phone].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {v.id === value && <Check size={15} className="shrink-0 text-rose-700" />}
                  </button>
                </li>
              ))}
              {found.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-stone-400">
                  찾는 거래처가 없어요
                </li>
              )}
            </ul>

            {typed && !exact && onNewName && (
              <button
                type="button"
                onClick={() => {
                  onNewName(typed);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-t border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-sm font-medium text-rose-700"
              >
                <Plus size={15} /> “{typed}” 새 거래처로 등록
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
