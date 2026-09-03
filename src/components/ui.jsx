export function Kpi({ label, value, sub, tone }) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-stone-900";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className={"mt-1 text-lg leading-tight font-bold tabular-nums " + valueTone}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-stone-400">{sub}</div>}
    </div>
  );
}

export function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition " +
        (active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")
      }
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "stone", children }) {
  const tones = {
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
    stone: "bg-stone-100 text-stone-600",
  };
  return (
    <span className={"shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium " + tones[tone]}>
      {children}
    </span>
  );
}

export function MethodChip({ method, onClick, size = "md" }) {
  const isTransfer = method === "transfer";
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1.5 text-xs";
  const cls =
    "shrink-0 rounded-full border font-medium transition " +
    pad +
    " " +
    (isTransfer
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : "border-amber-300 bg-amber-50 text-amber-700");
  const label = isTransfer ? "이체" : "삼촌";
  if (!onClick) return <span className={cls}>{label}</span>;
  return (
    <button type="button" onClick={onClick} title="눌러서 이체/삼촌 바꾸기" className={cls + " active:scale-95"}>
      {label}
    </button>
  );
}

export function Empty({ title, hint, children }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-600">{title}</p>
      {hint && <p className="mt-1.5 text-sm text-stone-400">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
