// 매일 아침 보고 — 종합 판단은 Claude 가 쓴다 (2026-10-19, 위키 topics/보고-체계-설계.md · 10/22 시장 종합으로 넓힘)
//
// 숫자·목록은 사무실 PC 의 poclo-cafe24/daily_report.py + market.py 가 모아서 보낸다
// (매출 장부 · 메타 광고 · 상품 순위 · 이벤트 · 날씨 · 뉴스 · 경쟁몰 신상 · 경쟁사 인스타·광고 · 우리 소재 성적 · 방향 메모).
// 10/22 세원: "광고만 이야기하지 말고 시장 트렌드·기온·뉴스·경쟁사 신상·인스타를 종합해서 무엇을 소싱하고 어떤 콘텐츠를 기획하고
//            어떻게 팔고 어떤 소재를 만들지 판단해서 보고. 광고 상황도 꼭 — 광고는 쇼만마가 하고 있으니 그걸 고려해서."
// 키는 이 함수 환경변수에만(PC 에 두지 않는다). 지어내지 말 것 — 주어진 자료만. 하루 한 번, 비용은 보고에 같이 남긴다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf } from "./_cost.js";

const MODEL = "claude-opus-5-5";
export const config = { maxDuration: 300 };

const ReportSchema = z.object({
  headline: z.string().describe("오늘 가장 중요한 판단 한 줄 — 시장(기온·트렌드)과 매출·광고를 합쳐서"),
  market_take: z.object({
    weather: z.string().describe("지금 기온 · 앞으로 7일 · 작년 이맘때 한 달 → 지금 팔릴 옷과 1~2주 뒤 팔릴 옷. 2~3문장"),
    trend: z.array(z.string()).describe("3~5줄. 뉴스·경쟁몰 신상·경쟁사 인스타·광고에서 읽은 흐름. 줄마다 근거(기사 제목 요지 · 몰 N곳 · 계정 이름)를 짧게"),
  }),
  sourcing: z
    .array(z.object({ item: z.string().describe("품목 + 디테일 + 색·가격대 (예: 울 브이넥 니트 — 아이보리·브라운, 2만 원대)"), why: z.string().describe("근거 — 경쟁몰 몇 곳·기사·기온"), fit: z.string().describe("우리 타겟(157cm 스트레이트 체형·하체 커버)에 맞추는 포인트") }))
    .describe("이번 주 소싱(사입)할 것 3~4개. 동대문에서 살 수 있는 것만(MADE·자체제작 상품은 따라 사입 불가)"),
  content: z
    .array(z.object({ title: z.string().describe("릴스·캐러셀 주제"), hook: z.string().describe("첫 1~3초 훅 문장 예시"), why: z.string().describe("근거 — 경쟁사 인스타·광고에서 많이 보인 형식, 우리 강점") }))
    .describe("기획할 콘텐츠 2~3개"),
  selling: z.array(z.string()).describe("어떻게 팔지 2~4줄 — 진열·기획전·쿠폰·묶음(1+1·코디 세트)·신상 업로드(월·화 저녁 6시)·오늘출발·이벤트 캘린더"),
  creatives_plan: z
    .array(z.object({ idea: z.string().describe("만들 광고 소재 (형식 + 장면)"), product: z.string().describe("어떤 상품 — 우리 상품 이름"), why: z.string().describe("근거 — 우리 소재 성적·경쟁사 광고 형식·잘 팔리는 상품") }))
    .describe("만들어 쇼만마에 보낼 광고 소재 2~3개"),
  ads: z.object({
    status: z.string().describe("광고 상황 2~3문장 — 어제·7일 광고비·광고비율(목표 10%)·ROAS·켜진 광고 수·끌 것/에이스 소재. 숫자로"),
    shomanma: z.array(z.string()).describe("쇼만마에 요청·확인할 것 2~4개 — 끌 소재·키울 소재·예산·새 소재 전달. '~요청해요' 꼴"),
  }),
  comment: z.array(z.string()).describe("매출 흐름 2~4줄 — 어제·지난 7일, 잘 된 것/안 된 것, 이유는 숫자로"),
  todo: z.array(z.string()).describe("오늘 할 일 3~5개 — 누가(세원·지원) 무엇을 어디서. 소싱·콘텐츠·쇼만마 전달·이벤트 섞어서, 구체적으로"),
});

const PROMPT = `너는 여성 보세 의류 쇼핑몰 '포클로'의 MD 겸 마케팅 담당이다. 아래 자료를 종합해서 대표(세원)와 지원이 아침에 읽고 바로 움직일 보고를 쓴다.
광고 숫자만 늘어놓지 말고, 시장(기온·트렌드)을 먼저 읽고 → 무엇을 사입하고 → 어떤 콘텐츠를 만들고 → 어떻게 팔고 → 어떤 광고 소재를 만들지 판단한다.

우리
- brand = 우리 방향·요즘 트렌드 메모(세원·쇼만마 단톡 정리). 타겟·모델 체형·말투는 여기를 따른다.
- 동대문 사입(신마) 보세 의류. 경쟁몰의 MADE·자체제작 상품은 똑같이 살 수 없으니 품목·디테일·색·가격대만 참고한다.
- 신상 업로드는 매주 월·화 저녁 6시. 오늘 사입하면 보통 다음 주 업로드 → 1~2주 뒤 기온에 맞춰 판단한다.

광고 — 지금은 대행사 '쇼만마'가 메타 광고를 등록·운영하고, 포클로는 소재(사진·영상)를 만들어 메일로 보낸다(당분간 계속).
- 그래서 '광고를 꺼라/켜라'가 아니라 '쇼만마에 ○○ 소재 끄기 요청 / ○○ 예산 확인 / 새 소재 ○○ 전달'처럼 쓴다.
- 광고비는 매출의 10%가 목표(budget.base 가 그 기준 예산). 주말(토·일)은 일부러 광고를 쉬니 주말 광고비 0원은 문제 아님.
  평일인데 yesterday.meta.spend 가 0 이면 '어제 광고가 꺼져 있었다' — 쇼만마에 확인 요청을 가장 먼저.
- creatives = 우리 광고 소재 성적(1시간마다): 끌 것(켜져 있는데 돈만 씀) · 에이스(후보) · 이번 주 새 소재 수(주 목표 weeklyGoal).
- products kind: '광고 구매' = 광고로 팔림, '광고 비효율' = 광고비 쓰는데 구매 0, '광고 추천' = 팔리는데 광고 없음. waste = 7일 1만 원↑ 쓰고 구매 0.

시장 자료
- weather: days(어제·오늘·앞으로 7일, 서울, wear = 기온별 옷차림), next7(평균·가장 낮은 기온·비 오는 날), lastYear(작년 같은 30일 주 단위, firstBelow0 = 작년 첫 영하).
- news: 최근 7일 패션 기사 제목. 패션과 상관없는 기사는 버린다. 제목에 없는 내용을 지어내지 않는다.
- compNew: 경쟁몰 베스트(약 40곳). top10 = 지금 10위 안 품목·디테일(몰 수), new1 = 어제 대비 새로 들어온 상품, new7 = 7일 전 대비. cats/details 의 malls = 몰 수.
- insta: 경쟁사 계정 최근 7일 게시물(kind reel/carousel/photo, 좋아요·캡션) · 경쟁몰이 최근 7일에 새로 켠 광고(형식·문구) · longRun = 21일 넘게 켜 둔 광고(잘 되는 광고).

쓰는 법
- 숫자·근거는 주어진 것만. 없는 숫자·원인·상품을 지어내지 않는다. 금액은 '12,000원'처럼, 기온은 '최저 4도'처럼.
- 요일은 yesterday.weekday(어제) · budget.todayWeekday(오늘)를 그대로 쓴다.
- 소싱은 '여러 몰에서 동시에 뜨는 품목·디테일' + '기온 시기' + '우리 체형 타겟'이 겹치는 것을 우선. 우리 상품과 겹치면 '이미 있는 ○○를 밀자'도 괜찮다.
- 콘텐츠는 경쟁사에서 많이 보인 형식(캐러셀·릴스·POV 등)과 우리 강점('우리 같은 사람' 체형 스토리)을 섞는다. 훅 문장은 실제로 쓸 수 있게.
- 손님에게 보일 문구(배너·상세·광고)에 판매량·인기 표현(주문폭주·N위·완판·누적 N장·베스트셀러)을 권하지 않는다 — 세원 규칙: 세원이 실제 실적이라고 한 상품만. 대신 기온·소재·핏·체형으로 말한다.
- 한국어, '~요'체, 짧고 구체적으로. 대표가 바로 행동할 수 있게.`;

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "Claude 키가 없어요.");
  const data = req.body?.data;
  if (!data || typeof data !== "object") return fail(res, 400, "bad_request", "data 가 없어요.");
  const text = JSON.stringify(data).slice(0, 70000);
  try {
    const client = new Anthropic();
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) },
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
