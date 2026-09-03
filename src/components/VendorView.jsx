import { won, INVOICE_THRESHOLD } from "../lib/calc";
import { Badge, Empty } from "./ui";

export default function VendorView({ vendors, taxType, emptyAction }) {
  if (vendors.length === 0) {
    return (
      <Empty title="이 달 거래가 아직 없어요." hint="거래를 넣으면 거래처별로 묶어서 보여드려요.">
        {emptyAction}
      </Empty>
    );
  }

  const flagged = vendors.filter((v) => v.flag);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="px-3 py-3 font-medium">거래처</th>
              <th className="px-3 py-3 text-right font-medium">총매입</th>
              <th className="px-3 py-3 text-right font-medium">이체(증빙)</th>
              <th className="px-3 py-3 text-right font-medium">삼촌(미증빙)</th>
              <th className="px-3 py-3 text-right font-medium">전환 +부가세</th>
              <th className="px-3 py-3 text-center font-medium">계산서</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.vendor} className="border-b border-stone-100 last:border-0">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {v.flag && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" aria-label="우선순위" />
                    )}
                    <span className="font-medium text-stone-900">{v.vendor}</span>
                    {v.status === "mixed" && <Badge tone="amber">혼합</Badge>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{won(v.supply)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                  {v.transferSupply ? won(v.transferSupply) : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                  {v.samchonSupply ? won(v.samchonSupply) : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-stone-500">
                  {v.switchCost ? won(v.switchCost) : "—"}
                </td>
                <td className="px-3 py-3 text-center tabular-nums text-stone-600">
                  {v.invoiceCount}/{v.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {flagged.length > 0 && (
        <p className="mt-3 flex gap-2 text-xs leading-relaxed text-stone-500">
          <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-rose-600" />
          <span>
            {taxType === "simple"
              ? `총매입 ${won(INVOICE_THRESHOLD)} 이상인데 세금계산서가 덜 붙은 곳 — 간이 기간에는 여기부터 챙기면 돼요.`
              : "세금계산서가 덜 붙은 곳 — 일반과세로 넘어가면 전부 챙기는 게 유리해요."}
            {` (${flagged.length}곳)`}
          </span>
        </p>
      )}
    </div>
  );
}
