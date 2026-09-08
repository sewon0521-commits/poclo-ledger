import { AlertCircle, Plus, Clock, ChevronRight } from "lucide-react";
import { won, dayLabel, rangeLabel } from "../lib/calc";
import { Kpi, Empty } from "./ui";
import TxRow from "./TxRow";
import ReceiptDrop from "./ReceiptDrop";
import DateRange from "./DateRange";

/** 포클로 매입 장부 — 장끼 올리기 + KPI + 날짜별 거래 */
export default function LedgerPage({
  days,
  totals,
  range,
  preset,
  custom,
  onRange,
  taxType,
  onTaxType,
  busy,
  onReceipt,
  onAddBlank,
  vendorName,
  rowProps,
  pending,
  onPage,
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">포클로 매입 장부</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            장끼만 올리면 자동 입력. 이체·삼촌 대납이 섞여도 알아서 갈라줘요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
            {[
              ["simple", "간이"],
              ["general", "일반"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onTaxType(key)}
                className={
                  "px-3.5 py-2 " +
                  (taxType === key ? "bg-rose-700 text-white" : "bg-white text-stone-600")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <DateRange preset={preset} custom={custom} onChange={onRange} />
        <p className="mt-1.5 text-xs text-stone-400">{rangeLabel(range)}</p>
      </div>

      <ReceiptDrop busy={busy} onFile={onReceipt} />

      <button
        type="button"
        onClick={onAddBlank}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium text-stone-700 transition hover:bg-stone-100"
      >
        <Plus size={18} /> 장끼 없이 직접 입력
      </button>

      <section className="mb-5 space-y-3">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
            <AlertCircle size={15} /> 부가세 안 낸 매입 (삼촌 대납 + 이체·부가세X)
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-rose-900">
            {won(totals.unpaid)}
          </div>
          <div className="mt-1.5 text-sm text-rose-700">
            세금계산서로 돌리려면 추가 부가세{" "}
            <span className="font-semibold tabular-nums">{won(totals.switchCost)}</span>
          </div>
        </div>

        {pending?.totalLeft > 0 && (
          <button
            type="button"
            onClick={() => onPage("pending")}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-left transition hover:bg-amber-100"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <Clock size={15} /> 아직 안 받은 미송 {pending.totalLeft}장
              </span>
              <span className="mt-0.5 block text-xs text-amber-700">
                {pending.open.length}곳 · 값어치 {won(pending.totalAmount)} — 이미 낸 돈이에요
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-amber-500" />
          </button>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          <Kpi label="총매입" value={won(totals.supply)} sub={`실지출 ${won(totals.actualPaid)}`} />
          <Kpi label="낸 부가세" value={won(totals.paidVat)} tone="emerald" sub="이체 건" />
          <Kpi
            label="세금계산서"
            value={`${totals.invoiced}/${totals.count}`}
            sub={totals.count ? `수취율 ${Math.round(totals.invoiceRate * 100)}%` : "—"}
          />
        </div>
      </section>

      {days.length === 0 ? (
        <Empty title="이 달 거래가 아직 없어요." hint="장끼를 올리거나 직접 한 건 넣어보세요." />
      ) : (
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
                {d.items.map((tx) => (
                  <TxRow key={tx.id} tx={tx} vendorName={vendorName(tx.vendorId)} {...rowProps} />
                ))}
              </ul>
            </section>
          ))}
          <p className="pt-1 text-xs leading-relaxed text-stone-400">
            칩(이체/삼촌)을 누르면 결제방식이 바뀌고 부가세도 바로 갱신돼요. 거래처를 누르면 수정,
            오른쪽 체크는 세금계산서 수취 표시예요.
          </p>
        </div>
      )}
    </div>
  );
}
