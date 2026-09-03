import { won, dayLabel } from "../lib/calc";
import { Empty } from "./ui";
import TxRow from "./TxRow";

export default function DailyView({ days, emptyAction, ...rowProps }) {
  if (days.length === 0) {
    return (
      <Empty title="이 달 거래가 아직 없어요." hint="장끼를 올리거나 ‘직접’으로 한 건 넣어보세요.">
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
            {d.items.map((t) => (
              <TxRow key={t.id} tx={t} {...rowProps} />
            ))}
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
