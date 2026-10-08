import { useContext, useMemo } from "react";
import { Check, Link2 } from "lucide-react";
import { won, pct, DEFAULT_COSTS } from "../lib/sales";
import { useDays } from "../lib/view";
import { DEFAULT_PRICING, actualRates, basePrice, candidates, priceResult, pairResult } from "../lib/pricing";
import { PricingCtx, pricingRowOf, pairPriceOf, digits, toNum } from "../lib/priceKit";

// 신상 관리 상품 창 안의 판매가 칸 (10/8) — 규칙·저장은 lib/priceKit.js 머리말
const ALL = { from: "", to: "" };
const NO_ROWS = [];
const NO_CONF = {};
const tone = (m, t) => (m >= t ? "text-emerald-700" : m >= t / 2 ? "text-amber-700" : "text-rose-700");

/** 이 기기에서 판매가를 정하는 칸 — 도매가 · 판매가 · 1+1 · 후보(이익률) · 한 벌 손익 */
export default function PriceBox({ x, set, field }) {
  const kit = useContext(PricingCtx);
  const days = useDays(kit?.rows || NO_ROWS, ALL, kit?.conf || NO_CONF);
  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...kit?.conf?.costs }), [kit?.conf?.costs]);
  const rates = useMemo(() => actualRates(days, costs), [days, costs]);
  const settings = useMemo(() => ({ ...DEFAULT_PRICING, ...kit?.conf?.pricing }), [kit?.conf?.pricing]);
  const supply = toNum(x.price);
  const sell = toNum(x.sellPrice);
  const rows = useMemo(() => (supply ? candidates(supply).map((p) => priceResult(supply, p, rates, settings)) : []), [supply, rates, settings]);
  const firstOk = rows.find((r) => r.meets)?.price;
  const r = supply && sell ? priceResult(supply, sell, rates, settings) : null;
  const p1 = pairPriceOf(x);
  const pr = supply && sell && p1 ? pairResult(supply, p1, rates, settings) : null;
  const row = pricingRowOf(x, kit?.items);
  const num = (v) => (toNum(v) ? won(toNum(v)) : "");
  const big = field + " text-right font-semibold tabular-nums";

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">도매가</span>
          <input value={num(x.price)} onChange={(e) => set({ price: digits(e.target.value) })} inputMode="numeric" placeholder="14,000" className={big} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">
            판매가 <span className="font-normal text-stone-400">· 아래 후보를 눌러도 돼요</span>
          </span>
          <input value={num(x.sellPrice)} onChange={(e) => set({ sellPrice: digits(e.target.value) })} inputMode="numeric" placeholder={supply ? won(basePrice(supply)) : "0"} className={big} />
        </label>
      </div>

      {rows.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {rows.map((c) => (
            <button
              key={c.price}
              type="button"
              onClick={() => set({ sellPrice: String(c.price) })}
              title={`정상가 ${won(c.retail)} · 남는 돈 ${won(c.profit)}원 · 원가율 ${pct(c.costRate, 0)}%`}
              className={
                "flex shrink-0 flex-col items-center rounded-lg border px-2.5 py-1 tabular-nums " +
                (c.price === sell ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white hover:border-stone-400")
              }
            >
              <span className="text-sm font-semibold">{won(c.price)}</span>
              <span className={"text-[11px] font-medium " + (c.price === sell ? "text-rose-100" : tone(c.margin, settings.targetMargin))}>
                {pct(c.margin, 0)}%{c.price === firstOk ? " · 목표" : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {r && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600 tabular-nums">
          <span>
            정상가 <b className="text-stone-800">{won(r.retail)}</b>
          </span>
          <span>
            한 벌 남는 돈 <b className={tone(r.margin, settings.targetMargin)}>{won(r.profit)}원</b>
          </span>
          <span className={"font-semibold " + tone(r.margin, settings.targetMargin)}>이익률 {pct(r.margin)}%</span>
          <span className="text-stone-400">원가율 {pct(r.costRate, 0)}%</span>
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          aria-pressed={!!x.pair}
          onClick={() => set({ pair: !x.pair })}
          className={"flex h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium " + (x.pair ? "border-rose-700 bg-rose-50 text-rose-800" : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50")}
        >
          <span className={"flex h-4 w-4 items-center justify-center rounded border " + (x.pair ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300")}>{x.pair && <Check size={11} />}</span>
          1+1 로도 팔아요
        </button>
        {x.pair && (
          <label className="block min-w-[10rem] flex-1 space-y-1">
            <span className="text-xs font-semibold text-stone-500">
              1+1 판매가 (2장) <span className="font-normal text-stone-400">· 비우면 도매가×4 끝자리 800</span>
            </span>
            <input value={num(x.price1p1)} onChange={(e) => set({ price1p1: digits(e.target.value) })} inputMode="numeric" placeholder={supply ? won(basePrice(supply * 2)) : "0"} className={big} />
          </label>
        )}
      </div>
      {pr && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-xs text-stone-600 tabular-nums">
          <span className="font-semibold text-rose-800">1+1 {won(pr.price)}</span>
          <span>한 장에 {won(pr.price / 2)}</span>
          <span>
            남는 돈 <b className={tone(pr.margin, settings.targetMargin)}>{won(pr.profit)}원</b>
          </span>
          <span className={"font-semibold " + tone(pr.margin, settings.targetMargin)}>이익률 {pct(pr.margin)}%</span>
        </p>
      )}

      {kit && (
        <p className="flex items-start gap-1 text-[11px] leading-relaxed text-stone-400">
          <Link2 size={12} className="mt-0.5 shrink-0" />
          <span>
            {row
              ? `돈 › 판매가 목록에 있어요 (${row.name}${row.price ? ` · ${won(row.price)}` : ""}) — 저장하면 거기도 같이 바뀌어요.`
              : sell
                ? "저장하면 돈 › 판매가 목록에도 담겨요."
                : "판매가를 정하고 저장하면 돈 › 판매가 목록에도 담겨요."}{" "}
            계산은 판매가 계산기와 같아요(최근 {rates.days || 0}일 실제 평균 · 광고비 {settings.adBasis === "actual" ? "최근 실제" : "목표 18%"} · 목표 이익률 {settings.targetMargin}%).
          </span>
        </p>
      )}
    </div>
  );
}
