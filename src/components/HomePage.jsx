import { useMemo } from "react";
import { TrendingUp, BookOpen, ArrowRight, Target } from "lucide-react";
import { won as wonKrw, monthLabel, thisMonth } from "../lib/calc";
import { buildDays, totalPnl, pct, TARGET_AD_RATE, DEFAULT_COSTS } from "../lib/sales";

/** 판 쪽과 산 쪽을 한 화면에 나란히. 자세한 건 각 장부에서 본다. */
function Card({ title, icon: Icon, onGo, goLabel, children }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
          <Icon size={15} /> {title}
        </div>
        <button
          type="button"
          onClick={onGo}
          className="flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
        >
          {goLabel} <ArrowRight size={13} />
        </button>
      </div>
      {children}
    </section>
  );
}

function Line({ label, value, sub, tone }) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-stone-900";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-2 last:border-0">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-right">
        <span className={"font-semibold tabular-nums " + cls}>{value}</span>
        {sub && <span className="ml-1.5 text-xs text-stone-400">{sub}</span>}
      </span>
    </div>
  );
}

export default function HomePage({ salesRows, salesConf, purchaseTotals, onPage }) {
  const month = thisMonth();

  // 매출·광고는 있는 날 전부로, 손익은 원가를 아는 날로만 낸다.
  // 원가를 모르는 날을 손익에 섞으면 광고비만 빠져서 적자로 보인다.
  const { sales, pnl } = useMemo(() => {
    const rows = salesRows.filter((r) => r.date.startsWith(month));
    const days = buildDays(
      rows,
      Object.fromEntries(rows.map((r) => [r.date, r.ads])),
      { ...DEFAULT_COSTS, ...salesConf.costs },
      salesConf.fixed,
    );
    return { sales: totalPnl(days), pnl: totalPnl(days.filter((d) => d.hasOrders)) };
  }, [salesRows, salesConf, month]);

  const hasSales = sales.days > 0;
  const adGap = sales.adRate - TARGET_AD_RATE;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">홈</h2>
        <p className="mt-0.5 text-sm text-stone-500">{monthLabel(month)} 현황</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title="파는 쪽"
          icon={TrendingUp}
          goLabel="매출 장부"
          onGo={() => onPage("sales")}
        >
          {hasSales ? (
            <>
              <Line label="총매출" value={wonKrw(sales.revenue)} sub={`${sales.days}일`} />
              <Line
                label="광고비"
                value={wonKrw(sales.ads)}
                sub={`${pct(sales.adRate)}%`}
                tone={sales.adRate <= TARGET_AD_RATE ? "emerald" : sales.adRate <= 30 ? "amber" : "rose"}
              />
              <Line
                label="순매출"
                value={pnl.days ? wonKrw(pnl.net) : "—"}
                sub={pnl.days ? `원가율 ${pct(pnl.cogsRate)}%` : "주문 데이터 없음"}
              />
              <Line
                label="영업이익"
                value={pnl.days ? (pnl.profit >= 0 ? "+" : "−") + wonKrw(Math.abs(pnl.profit)) : "—"}
                tone={pnl.days ? (pnl.profit >= 0 ? "emerald" : "rose") : undefined}
                sub={pnl.days ? `${pct(pnl.margin)}% · ${pnl.days}일` : "주문 데이터 없음"}
              />
              {adGap > 0 && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
                  <Target size={13} className="mt-0.5 shrink-0" />
                  <span>
                    광고비율을 목표 {TARGET_AD_RATE}%까지 내리면 광고비가{" "}
                    <b className="font-semibold">{wonKrw(sales.ads - sales.targetAds)}</b> 줄어요.
                  </span>
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-stone-400">
              이 달 매출 데이터가 아직 없어요.
            </p>
          )}
        </Card>

        <Card title="사는 쪽" icon={BookOpen} goLabel="매입 장부" onGo={() => onPage("ledger")}>
          <Line label="총매입" value={wonKrw(purchaseTotals.supply)} sub={`${purchaseTotals.count}건`} />
          <Line label="실지출" value={wonKrw(purchaseTotals.actualPaid)} />
          <Line label="낸 부가세" value={wonKrw(purchaseTotals.paidVat)} tone="emerald" />
          <Line
            label="부가세 안 낸 매입"
            value={wonKrw(purchaseTotals.unpaid)}
            tone={purchaseTotals.unpaid ? "rose" : undefined}
            sub={
              purchaseTotals.count
                ? `계산서 ${Math.round(purchaseTotals.invoiceRate * 100)}%`
                : undefined
            }
          />
        </Card>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-stone-400">
        매입 장부의 기간은 왼쪽 메뉴 › 돈 › 포클로 매입 장부에서 따로 고를 수 있어요. 여기는 이번 달만
        보여줍니다.
      </p>
    </div>
  );
}
