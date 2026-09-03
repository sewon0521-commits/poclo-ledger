import { Trash2, Check, Pencil } from "lucide-react";
import { won, dayLabel, derive } from "../lib/calc";
import { MethodChip, Empty } from "./ui";

export default function DailyView({ days, onToggleMethod, onToggleInvoice, onEdit, onDelete, emptyAction }) {
  if (days.length === 0) {
    return (
      <Empty title="이 달 거래가 아직 없어요." hint="영수증을 올리거나 ‘직접’으로 한 건 넣어보세요.">
        {emptyAction}
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      {days.map((d) => (
        <section key={d.date}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-stone-900">{dayLabel(d.date)}</h3>
            <span className="text-sm tabular-nums text-stone-500">
              {won(d.supply)}
              <span className="text-stone-300"> · 실지출 {won(d.actualPaid)}</span>
            </span>
          </div>

          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {d.items.map((t) => {
              const { vat } = derive(t);
              const isTransfer = t.method === "transfer";
              return (
                <li key={t.id} className="flex items-center gap-2.5 px-3 py-3">
                  <MethodChip method={t.method} onClick={() => onToggleMethod(t.id)} />

                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    className="min-w-0 flex-1 text-left"
                    title="눌러서 수정"
                  >
                    <div className="flex items-center gap-1 truncate font-medium text-stone-900">
                      <span className="truncate">{t.vendor}</span>
                      <Pencil size={11} className="shrink-0 text-stone-300" />
                    </div>
                    {t.memo && <div className="truncate text-xs text-stone-400">{t.memo}</div>}
                  </button>

                  <div className="shrink-0 text-right">
                    <div className="font-medium tabular-nums">{won(t.supply)}</div>
                    <div
                      className={
                        "text-xs tabular-nums " + (isTransfer ? "text-emerald-600" : "text-amber-600")
                      }
                    >
                      {isTransfer ? "+부가세 " : "미증빙 "}
                      {won(vat)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleInvoice(t.id)}
                    title="세금계산서 수취"
                    aria-pressed={t.invoice}
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border " +
                      (t.invoice
                        ? "border-rose-700 bg-rose-700 text-white"
                        : "border-stone-300 bg-white text-transparent")
                    }
                  >
                    <Check size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    aria-label="삭제"
                    className="-mr-1 shrink-0 p-1 text-stone-300 hover:text-rose-600"
                  >
                    <Trash2 size={17} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="pt-1 text-xs leading-relaxed text-stone-400">
        칩(이체/삼촌)을 누르면 결제방식이 바뀌고 부가세도 바로 갱신돼요. 거래처를 누르면 수정,
        오른쪽 체크는 세금계산서 수취 표시예요.
      </p>
    </div>
  );
}
