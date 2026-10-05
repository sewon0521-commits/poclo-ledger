// 매출 쪽 화면들이 같이 쓰는 것. 매출 장부와 손익이 서로를 import 하지 않게 여기 둔다.
import { useMemo } from "react";
import { buildDays, DEFAULT_COSTS, TARGET_AD_RATE, EMPTY_DAY } from "./sales";

/** 광고비율은 낮을수록 좋다. 목표 18%. */
export const adTone = (rate) => (rate <= TARGET_AD_RATE ? "emerald" : rate <= 30 ? "amber" : "rose");

export const TONE_TEXT = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

export const inRangeRows = (rows, range) =>
  rows.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to));

/**
 * 기간 안의 하루치 손익 목록.
 *
 * 택배비를 '그 달 총액'으로 넣은 경우를 위해 **달 전체**로 먼저 계산한 뒤 기간을 자른다.
 * 기간만 잘라서 계산하면 그 달 주문 건수가 줄어들어 택배비가 잘못 나뉜다.
 */
/**
 * 비어 있는 날 채우기 (10/5 세원: "9월 24일, 28일 매출 장부 숫자가 없어. 매출이 안 나온 건 맞지만 광고비는 썼으니 있어야")
 * 새벽 자동 갱신은 주문이 있는 날만 줄을 만든다 → 주문 0건인 날은 표에 칸이 없어 광고비를 적을 데가 없었다.
 * 첫 기록부터 오늘까지 빠진 날을 0원 줄로 채운다(empty: true). 광고비를 적으면 그때 서버에 줄이 생긴다.
 */
function fillGaps(rows) {
  if (!rows.length) return rows;
  const have = new Set(rows.map((r) => r.date));
  const d = new Date(rows[0].date + "T00:00:00");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const out = [...rows];
  for (; ; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (k >= today) break; // 오늘은 아직 안 끝났다
    if (!have.has(k)) out.push({ date: k, ...EMPTY_DAY, empty: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function useDays(rows, range, conf) {
  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...conf.costs }), [conf.costs]);
  return useMemo(() => {
    // 날짜별로 손으로 적은 삼촌비를 그날 줄에 얹는다 (settings 에 따로 저장돼 있다)
    const daily = conf.samchonDaily || {};
    const withSamchon = fillGaps(rows).map((r) => (daily[r.date] ? { ...r, samchonCost: daily[r.date] } : r));
    const all = buildDays(withSamchon, costs, conf.monthly);
    return inRangeRows(all, range);
  }, [rows, range, costs, conf.monthly, conf.samchonDaily]);
}
