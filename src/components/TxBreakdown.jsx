import { useMemo, useState } from "react";
import { Check, X, ChevronRight } from "lucide-react";
import { won, derive, dayLabel, modeOf, MODES, isPrepaid } from "../lib/calc";
import { MethodChip } from "./ui";

/**
 * 금액 칸을 누르면 뜨는 "이 금액이 어느 장끼에서 나왔나" 목록.
 *
 * 세원(2026-09-21): 금액만 보고 매입 장부·거래처를 하나하나 열어 찾다 보면 놓친다.
 * 누르면 그 금액을 만든 장끼가 날짜별·거래처별로 바로 나와야 한다.
 *
 * - `rows` 는 **지금 살아 있는 거래**를 넘긴다(스냅샷 아님). 그래야 여기서 계산서 체크를 하면
 *   숫자가 바로 따라 바뀐다.
 * - `modes` 는 처음 켜 둘 결제방식. 창 안의 칩으로 켜고 끌 수 있다.
 * - `invoice` 모드면 "계산서 받음 / 아직 안 받음" 두 덩어리로 나누고 체크박스를 단다.
 */
export default function TxBreakdown({
  title,
  rows,
  modes: initialModes = MODES.map((m) => m.key),
  invoice = false,
  vendorName,
  onSetInvoice,
  onEdit,
  onClose,
  empty,
  initialBy,
}) {
  const [modes, setModes] = useState(() => new Set(initialModes));
  const [by, setBy] = useState(initialBy || (invoice ? "vendor" : "day"));

  const counts = useMemo(() => {
    const c = {};
    for (const t of rows) c[modeOf(t).key] = (c[modeOf(t).key] || 0) + 1;
    return c;
  }, [rows]);

  const list = useMemo(
    () =>
      rows
        .filter((t) => modes.has(modeOf(t).key))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [rows, modes],
  );

  const sum = useMemo(() => sumOf(list), [list]);
  const got = list.filter((t) => t.invoice);
  const notYet = list.filter((t) => !t.invoice);

  const toggleMode = (key) =>
    setModes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const groupProps = { by, vendorName, invoice, onSetInvoice, onEdit };

  return (
    <div className="flex max-h-[90vh] flex-col">
      <header className="shrink-0 border-b border-stone-200 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="tx-breakdown-title" className="font-semibold text-stone-900">
              {title}
            </h2>
            <p className="mt-1 text-xs tabular-nums text-stone-500">
              장끼 {list.length}건 · 공급가 {won(sum.supply)}
              {sum.paidVat > 0 && <span className="text-emerald-700"> · 낸 부가세 {won(sum.paidVat)}</span>}
              {sum.pendingVat > 0 && <span className="text-amber-700"> · 미납 부가세 {won(sum.pendingVat)}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {MODES.map((m) => {
            const on = modes.has(m.key);
            const paid = m.key === "transfer-vat";
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMode(m.key)}
                aria-pressed={on}
                className={
                  "rounded-full border px-2.5 py-1 text-xs font-medium " +
                  (on
                    ? paid
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-amber-500 bg-amber-500 text-white"
                    : "border-stone-300 bg-white text-stone-400")
                }
              >
                {m.label}·{m.sub} {counts[m.key] || 0}
              </button>
            );
          })}
          <span className="ml-auto flex overflow-hidden rounded-lg border border-stone-300 text-xs">
            {[
              ["day", "날짜별"],
              ["vendor", "거래처별"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBy(key)}
                className={"px-2.5 py-1 " + (by === key ? "bg-stone-800 text-white" : "bg-white text-stone-600")}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">
            {empty || "여기 해당하는 장끼가 없어요. 위 칩으로 결제방식을 바꿔 보세요."}
          </p>
        ) : invoice ? (
          <div className="space-y-6">
            <Section
              title={`계산서 받음 ${got.length}건`}
              count={got.length}
              tone="text-rose-800"
              hint="체크를 풀면 '아직 안 받음'으로 내려가요."
              emptyText="아직 계산서 받은 장끼가 없어요."
            >
              <Groups rows={got} {...groupProps} />
            </Section>
            <Section
              title={`아직 안 받음 ${notYet.length}건`}
              count={notYet.length}
              tone="text-stone-800"
              hint="계산서를 받았으면 체크하세요. 거래처 줄의 '전부 받음'은 그 거래처 장끼를 한 번에 체크해요."
              emptyText="전부 받았어요."
            >
              <Groups rows={notYet} {...groupProps} bulk />
            </Section>
          </div>
        ) : (
          <Groups rows={list} {...groupProps} />
        )}
      </div>
    </div>
  );
}

function sumOf(list) {
  let supply = 0;
  let paidVat = 0;
  let pendingVat = 0;
  for (const t of list) {
    const d = derive(t);
    supply += t.supply || 0;
    paidVat += d.paidVat;
    pendingVat += d.pendingVat;
  }
  return { supply, paidVat, pendingVat };
}

function Section({ title, count, tone, hint, emptyText, children }) {
  return (
    <section>
      <h3 className={"font-semibold " + tone}>{title}</h3>
      <p className="mb-2 text-xs text-stone-400">{hint}</p>
      {count === 0 ? <p className="rounded-xl border border-dashed border-stone-200 py-4 text-center text-sm text-stone-400">{emptyText}</p> : children}
    </section>
  );
}

/** 날짜별 또는 거래처별로 묶고, 묶음마다 소계를 단다 */
function Groups({ rows, by, vendorName, invoice, onSetInvoice, onEdit, bulk }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of rows) {
      const k = by === "day" ? t.date : t.vendorId || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    const out = [...m.entries()].map(([k, items]) => ({
      key: k,
      label: by === "day" ? dayLabel(k) : vendorName(k) || "(거래처 없음)",
      items,
      ...sumOf(items),
    }));
    // 날짜는 최신순, 거래처는 금액 큰 순
    return by === "day"
      ? out.sort((a, b) => (a.key < b.key ? 1 : -1))
      : out.sort((a, b) => b.supply - a.supply);
  }, [rows, by, vendorName]);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-sm font-semibold text-stone-900">
              {g.label} <span className="font-normal text-stone-400">{g.items.length}건</span>
            </h4>
            <span className="flex items-center gap-2 text-xs tabular-nums text-stone-500">
              {won(g.supply)}
              {g.paidVat > 0 && <span className="text-emerald-700">+부가세 {won(g.paidVat)}</span>}
              {g.pendingVat > 0 && <span className="text-amber-700">미납 {won(g.pendingVat)}</span>}
              {invoice && bulk && by === "vendor" && (
                <button
                  type="button"
                  onClick={() => onSetInvoice(g.items.map((t) => t.id), true)}
                  className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-100"
                >
                  전부 받음
                </button>
              )}
            </span>
          </div>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {g.items.map((t) => (
              <Line
                key={t.id}
                t={t}
                showVendor={by === "day"}
                vendorName={vendorName}
                invoice={invoice}
                onSetInvoice={onSetInvoice}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const itemText = (t) =>
  (t.items || [])
    .filter((i) => i.name)
    .map((i) => {
      const qty = Number(i.qty) || 0;
      const tag = isPrepaid(i, t.items) ? " (이미 냄)" : "";
      return `${i.name}${qty ? ` ${qty}장` : ""}${tag}`;
    })
    .join(", ");

function Line({ t, showVendor, vendorName, invoice, onSetInvoice, onEdit }) {
  const d = derive(t);
  const items = itemText(t);
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5">
      <MethodChip tx={t} />
      <button type="button" onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left" title="눌러서 장끼 열기">
        <div className="flex items-center gap-1 text-sm font-medium text-stone-900">
          <span className="truncate">{showVendor ? vendorName(t.vendorId) || "(거래처 없음)" : dayLabel(t.date)}</span>
          <ChevronRight size={12} className="shrink-0 text-stone-300" />
        </div>
        <div className="truncate text-xs text-stone-400">{items || t.memo || "품목 없음"}</div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-sm font-medium tabular-nums">{won(t.supply)}</div>
        <div className={"text-[11px] tabular-nums " + (d.paidVat > 0 ? "text-emerald-600" : "text-amber-600")}>
          {d.paidVat > 0 ? `+부가세 ${won(d.vat)}` : `미납 ${won(d.vat)}`}
        </div>
      </div>
      {invoice && (
        <button
          type="button"
          onClick={() => onSetInvoice([t.id], !t.invoice)}
          title={t.invoice ? "계산서 받음 — 누르면 해제" : "계산서 받았으면 체크"}
          aria-pressed={t.invoice}
          className={
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border " +
            (t.invoice ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white text-transparent")
          }
        >
          <Check size={15} />
        </button>
      )}
    </li>
  );
}
