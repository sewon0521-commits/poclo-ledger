// 한 번 부를 때 든 돈 (세원 9/23: "API 잔액을 최대한 줄이게") — 결과에 _cost 로 같이 돌려준다.
// Opus 5.5(10/2부터): 입력 100만 토큰당 $4, 출력 $20 (Opus 5 는 $5·$25). 원화는 대략(1달러 ≈ 1,400원).
const USD_KRW = 1400;
export function costOf(u = {}) {
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.05; // 캐시 읽기 $0.20 = 입력의 1/20
  const output = u.output_tokens || 0;
  const usd = (input * 4 + output * 20) / 1e6;
  return { input: Math.round(input), output, usd: Math.round(usd * 10000) / 10000, won: Math.round(usd * USD_KRW) };
}
