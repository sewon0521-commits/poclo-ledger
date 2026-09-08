// 매출 쪽 화면들이 같이 쓰는 것. 매출 장부와 손익이 서로를 import 하지 않게 여기 둔다.
import { useMemo } from "react";
import { buildDays, DEFAULT_COSTS, TARGET_AD_RATE } from "./sales";

/** 광고비율은 낮을수록 좋다. 목표 18%. */
export const adTone = (rate) => (rate <= TARGET_AD_RATE ? "emerald" : rate <= 30 ? "amber" : "rose");

export const TONE_TEXT = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

export const inRangeRows = (rows, range) =>
  rows.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));

/** 기간 안의 하루치 손익 목록 */
export function useDays(rows, range, conf) {
  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...conf.costs }), [conf.costs]);
  return useMemo(() => {
    const rowsIn = inRangeRows(rows, range);
    return buildDays(
      rowsIn,
      Object.fromEntries(rowsIn.map((r) => [r.date, r.ads])),
      costs,
      conf.fixed,
    );
  }, [rows, range, costs, conf.fixed]);
}
