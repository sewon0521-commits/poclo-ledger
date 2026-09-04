import { won, VAT_RATE } from "./calc";

/** 거래처에 보낼 계산서 요청 문구. 그대로 카톡에 붙여넣을 수 있게 만든다. */
export function requestMessage(vendor, range, amount, count) {
  const period =
    range.from === range.to ? range.from : `${range.from || "처음"} ~ ${range.to || "오늘"}`;
  return [
    "안녕하세요, 포클로입니다.",
    "",
    `${period} 기간 거래 건 세금계산서 발행 부탁드립니다.`,
    `· 거래처: ${vendor.name}`,
    `· 건수: ${count}건`,
    `· 공급가액: ${won(amount)}`,
    `· 부가세: ${won(amount * VAT_RATE)}`,
    `· 합계: ${won(amount + amount * VAT_RATE)}`,
    "",
    "발행 후 회신 주시면 감사하겠습니다.",
  ].join("\n");
}
