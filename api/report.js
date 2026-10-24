// 매일 아침 보고 — 종합 판단은 Claude 가 쓴다 (2026-10-19, 위키 topics/보고-체계-설계.md · 10/22 시장 종합으로 넓힘)
//
// 숫자·목록은 사무실 PC 의 poclo-cafe24/daily_report.py + market.py 가 모아서 보낸다
// (매출 장부 · 메타 광고 · 상품 순위 · 이벤트 · 날씨 · 뉴스 · 경쟁몰 신상 · 경쟁사 인스타·광고 · 우리 소재 성적 · 방향 메모).
// 10/22 세원: "광고만 이야기하지 말고 시장 트렌드·기온·뉴스·경쟁사 신상·인스타를 종합해서 무엇을 소싱하고 어떤 콘텐츠를 기획하고
//            어떻게 팔고 어떤 소재를 만들지 판단해서 보고. 광고 상황도 꼭 — 광고는 쇼만마가 하고 있으니 그걸 고려해서."
// 키는 이 함수 환경변수에만(PC 에 두지 않는다). 지어내지 말 것 — 주어진 자료만. 하루 한 번, 비용은 보고에 같이 남긴다.
// 10/22 세원: "430원 비싸 — 클로드 맥스 요금제(월 10만 원) 안에서 나가게 할 수 없어?"
//   → 사무실 PC 가 먼저 **설치된 Claude Code(맥스 구독)** 로 같은 글을 쓴다(추가 비용 0원). 그래서 GET ?spec=1 이 프롬프트·출력 모양을 내준다(한 곳에서만 고치게).
//     Claude Code 가 안 되면(로그아웃·한도) 여기 API 로 — effort low(약 250원 예상).

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf } from "./_cost.js";

const MODEL = "claude-opus-5-5";
export const config = { maxDuration: 300 };

// 10/24 세원: "매일 보고 솔직히 맨날 안 봐. 맨 위 간단 코멘트 · 기온 · 시장 흐름 빼고 다 없애 — 소싱할 것 · 기획할 콘텐츠 · 이렇게 팔아요 · 만들 광고 소재 · 광고 상황."
//   → 쓰는 칸을 셋으로 줄였다(headline · comment · market_take). 예전 보고에 남은 sourcing 등은 화면이 안 그린다.
const ReportSchema = z.object({
  headline: z.string().describe("오늘 가장 중요한 한 줄 — 기온·시장 흐름과 어제 매출을 합쳐서, 짧게"),
  comment: z.array(z.string()).describe("간단 코멘트 2~3줄 — 어제·지난 7일 매출 흐름(숫자로)과 지금 팔릴 것 한 줄. 짧게"),
  market_take: z.object({
    weather: z.string().describe("지금 기온 · 앞으로 7일 · 작년 이맘때 한 달 → 지금 팔릴 옷과 1~2주 뒤 팔릴 옷. 2~3문장"),
    trend: z.array(z.string()).describe("3~5줄. 뉴스·경쟁몰 신상·경쟁사 인스타·광고에서 읽은 흐름. 줄마다 근거(기사 제목 요지 · 몰 N곳 · 계정 이름)를 짧게"),
  }),
});

const PROMPT = `너는 여성 보세 의류 쇼핑몰 '포클로'의 MD 겸 마케팅 담당이다. 대표(세원)가 아침에 10초 안에 읽을 짧은 보고를 쓴다.
쓰는 것은 셋뿐: 맨 위 한 줄(headline) · 간단 코멘트 2~3줄(comment) · 기온과 시장 흐름(market_take).

우리
- brand = 우리 방향 메모(타겟·모델 체형). 동대문 사입 보세 의류, 신상 업로드는 매주 월·화 저녁 6시 → 1~2주 뒤 기온도 같이 본다.

자료
- yesterday · week · prevWeek = 어제·지난 7일·그 전 7일 매출(revenue)·주문(orders). 요일은 yesterday.weekday · weather.days[].weekday 를 그대로 쓴다(날짜로 짐작하지 말 것).
- weather: days(어제·오늘·앞으로 7일, 서울, wear = 기온별 옷차림), next7(평균·가장 낮은 기온·비 오는 날), lastYear(작년 같은 30일 주 단위, firstBelow0 = 작년 첫 영하).
- news: 최근 7일 패션 기사 제목. 패션과 상관없는 기사는 버린다. 제목에 없는 내용을 지어내지 않는다.
- compNew: 경쟁몰 베스트(약 40곳). top10 = 지금 10위 안 품목·디테일(몰 수), new1 = 어제 대비 새로 들어온 상품, new7 = 7일 전 대비. cats/details 의 malls = 몰 수.
- insta: 경쟁사 계정 최근 7일 게시물(kind reel/carousel/photo, 좋아요·캡션) · 경쟁몰이 최근 7일에 새로 켠 광고(형식·문구) · longRun = 21일 넘게 켜 둔 광고.

쓰는 법
- 숫자·근거는 주어진 것만. 없는 숫자·원인을 지어내지 않는다. 금액은 '12,000원'처럼, 기온은 '최저 4도'처럼.
- 광고 이야기는 쓰지 않는다(광고는 대행사가 맡고 있고, 세원이 따로 본다). 소싱·콘텐츠·판매 방법 목록도 쓰지 않는다 — 시장 흐름 안에서 무엇이 뜨는지만.
- 판매량·인기 표현(주문폭주·N위·완판 등)을 손님용 문구로 권하지 않는다.
- 한국어, '~요'체, 짧게.`;

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export default async function handler(req, res) {
  // 사무실 PC 의 Claude Code(맥스 구독)가 같은 지시·모양으로 쓰게 — 프롬프트와 JSON 모양만 내준다(키·돈 안 씀)
  if (req.method === "GET" && req.query?.spec) return res.status(200).json({ prompt: PROMPT, schema: z.toJSONSchema(ReportSchema) });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "Claude 키가 없어요.");
  const data = req.body?.data;
  if (!data || typeof data !== "object") return fail(res, 400, "bad_request", "data 가 없어요.");
  const text = JSON.stringify(data).slice(0, 70000);
  const effort = ["low", "medium", "high"].includes(req.body?.effort) ? req.body.effort : "low";
  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort, format: zodOutputFormat(ReportSchema) },
      messages: [{ role: "user", content: `${PROMPT}\n\n---\n${text}` }],
    });
    const r = await stream.finalMessage();
    const block = (r.content || []).find((b) => b.type === "text");
    let out = r.parsed_output;
    if (!out && block) {
      try {
        out = JSON.parse(block.text);
      } catch {
        out = null;
      }
    }
    if (!out) return fail(res, 422, "unreadable", r.stop_reason === "max_tokens" ? "보고가 너무 길어 잘렸어요." : "보고 글을 못 만들었어요.");
    return res.status(200).json({ ...out, _cost: costOf(r.usage) });
  } catch (err) {
    const st = err?.status;
    if (st === 401) return fail(res, 503, "bad_key", "Claude API 키가 막혔어요.");
    if (st === 402 || /credit|balance/i.test(String(err?.message))) return fail(res, 402, "no_credit", "Claude 잔액이 부족해요.");
    return fail(res, 502, "upstream", String(err?.message || "Claude 호출 실패").slice(0, 200));
  }
}
