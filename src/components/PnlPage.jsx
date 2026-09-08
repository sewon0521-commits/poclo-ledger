import { useMemo } from "react";
import { Info, AlertCircle } from "lucide-react";
import { rangeLabel, dayLabel } from "../lib/calc";
import { won, pct, totalPnl, TARGET_AD_RATE } from "../lib/sales";
import { useDays } from "../lib/view";
import { Kpi, Empty } from "./ui";
import DateRange from "./DateRange";

const HEAD = [
  "일자",
  "총매출",
  "환불",
  "순매출",
  "매출원가",
  "택배·부자재·수수료",
  "광고비",
  "삼촌·고정비",
  "영업이익",
];

/** 위에서 아래로 한 번 흘려 보여준다 — 어디서 돈이 빠지는지가 보이게 */
function Waterfall({ t }) {
  const lines = [
    ["총매출", t.revenue, "plus", "카페24 결제합계"],
    ["환불", -t.refund, "minus", `${pct(t.refundRate)}%`],
    ["순매출", t.net, "sum", "여기서부터 비용을 뺀다"],
    ["매출원가", -t.cogs, "minus", `상품매출 대비 ${pct(t.cogsRate)}%`],
    ["택배비", -t.shipping, "minus", `${won(t.orders)}건`],
    ["부자재", -t.material, "minus", `${won(t.qty)}개`],
    ["결제 수수료", -t.fee, "minus", "네이버페이 + PG"],
    ["광고비", -t.ads, "minus", `총매출의 ${pct(t.adRate)}%`],
    ["삼촌비", -t.samchonDay, "minus", ""],
    ["고정비", -t.fixedDay, "minus", "관리비 + 앱"],
  ];

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-3 text-sm font-semibold text-stone-700">돈이 어디서 빠지나</div>
      <div className="space-y-0">
        {lines.map(([label, value, kind, note]) => (
          <div
            key={label}
            className={
              "flex items-baseline justify-between gap-3 py-2 " +
              (kind === "sum"
                ? "border-y border-stone-200 bg-stone-50/60 font-semibold"
                : "border-b border-stone-100")
            }
          >
            <span className={kind === "sum" ? "text-sm text-stone-900" : "text-sm text-stone-600"}>
              {label}
              {note && <span className="ml-1.5 text-xs font-normal text-stone-400">{note}</span>}
            </span>
            <span
              className={
                "shrink-0 font-semibold tabular-nums " +
                (kind === "minus" ? "text-stone-400" : "text-stone-900")
              }
            >
              {kind === "sum" ? "" : value < 0 ? "−" : "+"}
              {won(Math.abs(value))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-stone-900">영업이익</span>
        <span
          className={
            "text-2xl font-bold tabular-nums " +
            (t.profit >= 0 ? "text-emerald-700" : "text-rose-700")
          }
        >
          {t.profit >= 0 ? "+" : "−"}
          {won(Math.abs(t.profit))}
        </span>
      </div>
    </div>
  );
}

export default function PnlPage({ rows, conf, range, preset, custom, onRange, onPage }) {
  const days = useDays(rows, range, conf);
  // 원가를 아는 날만 손익을 낸다. 매출만 있고 주문 데이터가 없는 날을 섞으면 이익이 부풀려진다.
  const withOrders = useMemo(() => days.filter((d) => d.hasOrders), [days]);
  const total = useMemo(() => totalPnl(withOrders), [withOrders]);
  const skipped = days.filter((d) => d.revenue > 0).length - withOrders.length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">손익</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          총매출에서 환불을 뺀 <b className="font-semibold text-stone-700">순매출</b>로 실제 남은
          돈을 봐요.
        </p>
      </div>

      <div className="mb-4">
        <DateRange preset={preset} custom={custom} onChange={onRange} />
        <p className="mt-1.5 text-xs text-stone-400">
          {rangeLabel(range)} · 원가까지 아는 날 {total.days}일
        </p>
      </div>

      {withOrders.length === 0 ? (
        <Empty
          title="이 기간엔 원가를 아는 날이 없어요."
          hint="매출 장부 › 데이터 넣기에서 orders_일별.csv 를 넣으면 여기 손익이 나옵니다."
        >
          <button
            type="button"
            onClick={() => onPage("sales")}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white"
          >
            매출 장부로 가기
          </button>
        </Empty>
      ) : (
        <>
          {skipped > 0 && (
            <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                이 기간 {skipped}일은 매출은 있는데 <b className="font-semibold">원가를 몰라서</b>{" "}
                손익에서 뺐어요. 주문 데이터는 2026-08-01부터 있습니다.
              </span>
            </p>
          )}

          <section className="mb-5 space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Kpi label="총매출" value={won(total.revenue)} sub={`${total.days}일`} />
              <Kpi
                label="순매출"
                value={won(total.net)}
                sub={`환불 −${won(total.refund)} (${pct(total.refundRate)}%)`}
              />
              <Kpi
                label="영업이익"
                value={(total.profit >= 0 ? "+" : "−") + won(Math.abs(total.profit))}
                tone={total.profit >= 0 ? "emerald" : "rose"}
                sub={`순매출의 ${pct(total.margin)}%`}
              />
              <Kpi
                label="손익분기 일매출"
                value={won(total.breakeven)}
                sub={`공헌이익률 ${pct(total.contribRate)}%`}
              />
            </div>

            <Waterfall t={total} />

            {total.adRate > TARGET_AD_RATE && total.ads > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="text-sm font-semibold text-stone-700">
                  광고비율을 목표 {TARGET_AD_RATE}%까지 내리면
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                  {total.targetProfit >= 0 ? "+" : "−"}
                  {won(Math.abs(total.targetProfit))}
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  지금 {won(total.ads)} → {won(total.targetAds)}. 매출이 그대로라는 가정이에요.
                </p>
              </div>
            )}
          </section>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-400">
                  {HEAD.map((h, i) => (
                    <th
                      key={h}
                      className={"px-3 py-2.5 font-medium " + (i === 0 ? "text-left" : "text-right")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {withOrders.map((d) => (
                  <tr key={d.date} className="hover:bg-stone-50">
                    <td className="px-3 py-2 text-left whitespace-nowrap text-stone-600">
                      {dayLabel(d.date)}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">{won(d.revenue)}</td>
                    <td className="px-3 py-2 text-right text-stone-400">
                      {d.refund ? "−" + won(d.refund) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-stone-900">
                      {won(d.net)}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">
                      {won(d.cogs)}
                      <span className="ml-1 text-[11px] text-stone-300">
                        {pct(d.cogsRate, 0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">{won(d.variable)}</td>
                    <td className="px-3 py-2 text-right text-stone-500">
                      {d.ads ? won(d.ads) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-400">
                      {won(d.samchonDay + d.fixedDay)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right font-semibold " +
                        (d.profit >= 0 ? "text-emerald-700" : "text-rose-700")
                      }
                    >
                      {d.profit >= 0 ? "+" : "−"}
                      {won(Math.abs(d.profit))}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* 맨 아래 합계 — 표를 눈으로 더하지 않아도 되게. 위 KPI와 같은 값이다. */}
              <tfoot>
                <tr className="border-t-2 border-stone-300 bg-stone-50 font-semibold">
                  <td className="px-3 py-2.5 text-left whitespace-nowrap text-stone-900">
                    합계 <span className="text-xs font-normal text-stone-400">{total.days}일</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-900">{won(total.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">
                    {total.refund ? "−" + won(total.refund) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-900">{won(total.net)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">
                    {won(total.cogs)}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">
                      {pct(total.cogsRate, 0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{won(total.variable)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">
                    {won(total.ads)}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">
                      {pct(total.adRate, 0)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-700">
                    {won(total.samchonDay + total.fixedDay)}
                  </td>
                  <td
                    className={
                      "px-3 py-2.5 text-right " +
                      (total.profit >= 0 ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {total.profit >= 0 ? "+" : "−"}
                    {won(Math.abs(total.profit))}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">
                      {pct(total.margin, 0)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
            <p className="flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                <b className="font-semibold">매출원가는 어떻게 나오나</b> — 단가표에서 가져오는 게
                아니라, <b className="font-semibold">주문 하나하나에 붙어 온 공급가</b>를
                수량만큼 더한 값이에요. 그날 무엇이 팔렸는지에 따라 저절로 달라지므로 평균
                원가율을 쓰지 않습니다. 코디 세트는 카페24가 공급가를 0으로 주기 때문에 구성품
                공급가를 합쳐서 채웁니다. 원가율은 배송비를 뺀{" "}
                <b className="font-semibold">상품매출</b>에 대고 잽니다.
              </span>
            </p>
            <p className="mt-2 flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                택배비·삼촌비·고정비는 매출 장부 › 데이터 넣기 › 비용 가정값에서{" "}
                <b className="font-semibold">달마다 따로</b> 넣을 수 있어요.
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
