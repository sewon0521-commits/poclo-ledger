// 매일 아침 보고 — 코멘트·오늘 할 일만 Claude 가 쓴다 (2026-10-19, 위키 topics/보고-체계-설계.md)
//
// 숫자는 사무실 PC 의 poclo-cafe24/daily_report.py 가 계산해서 보낸다(매출 장부 · 메타 · 상품 순위 · 이벤트).
// 여기서는 그 숫자로 headline 한 줄 · comment 3~5줄 · todo 3개만 쓴다. 키는 이 함수 환경변수에만(PC 에 두지 않는다).
// 지어내지 말 것 — 주어진 숫자만. effort low, 하루 몇십 원.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf } from "./_cost.js";

const MODEL = "claude-opus-5-5";

const ReportSchema = z.object({
  headline: z.string().describe("어제 핵심 한 줄 — 매출·광고비율·가장 중요한 변화"),
  comment: z.array(z.string()).describe("3~5줄. 지난 7일 흐름, 잘 된 것/안 된 것, 이유는 숫자로"),
  todo: z.array(z.string()).describe("오늘 할 일 3개 — 예산 얼마 안에서, 어떤 상품 광고 추천·소재 교체, 이벤트 할 일. 구체적으로"),
});

const PROMPT = `너는 여성 보세 의류 쇼핑몰 '포클로'의 광고·매출 담당이다. 아래 숫자(어제 보고)를 보고 대표(세원)와 지원이 아침에 읽을 짧은 보고를 쓴다.
원칙
- 광고비는 매출의 10%가 목표다(지금은 소재 퀄리티를 올려 낮추는 중). budget.base 가 그 기준 예산이다.
- 숫자는 주어진 것만 쓴다. 없는 숫자·원인을 지어내지 않는다. 금액은 '12,000원'처럼.
- 요일은 yesterday.weekday(어제) · budget.todayWeekday(오늘)를 그대로 쓴다. 날짜로 요일을 짐작하지 말 것.
- adCounts = 광고 전체 개수(total) · 보고 만든 시각에 켜진 개수(active) · 최근 7일에 만든 개수(made7). 상품마다 adsActive/adsTotal.
- 주말(토·일)에는 일부러 광고를 끄고 그 돈을 평일에 쓴다(yesterday.weekend · budget.weekend). 주말에 광고비 0원은 정상이니 문제로 짚지 말 것. 평일인데 yesterday.meta.spend 가 0 이면 '어제 메타 광고가 꺼져 있었다' — 가장 먼저 짚는다.
- products 의 kind: '광고 구매' = 광고로 팔림, '광고 비효율' = 광고비를 쓰는데 광고 구매 0, '광고 추천' = 팔리는데 7일 광고비 0원. waste = 7일에 1만 원 넘게 썼는데 구매 0.
- competitors = 오늘 아침 경쟁몰 베스트에서 새로 들어오거나(NEW) 크게 오르거나 오래 버티는 상품. 비어 있지 않으면 comment 에 '요즘 경쟁몰에서 뜨는 것' 한 줄(옷 종류·키워드 위주)과, 그중 우리 타겟(2030 데일리, 150~160cm 스트레이트 체형)에 맞는 사입 힌트를 todo 하나로 넣는다. 상품을 지어내지 말 것.
- 한국어, '~요'체, 짧게. 대표가 바로 행동할 수 있게.`;

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
  const text = JSON.stringify(data).slice(0, 30000);
  try {
    const client = new Anthropic();
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(ReportSchema) },
      messages: [{ role: "user", content: `${PROMPT}\n\n---\n${text}` }],
    });
    const block = (r.content || []).find((b) => b.type === "text");
    let out = r.parsed_output;
    if (!out && block) {
      try {
        out = JSON.parse(block.text);
      } catch {
        out = null;
      }
    }
    if (!out) return fail(res, 422, "unreadable", "보고 글을 못 만들었어요.");
    return res.status(200).json({ ...out, _cost: costOf(r.usage) });
  } catch (err) {
    const st = err?.status;
    if (st === 401) return fail(res, 503, "bad_key", "Claude API 키가 막혔어요.");
    if (st === 402 || /credit|balance/i.test(String(err?.message))) return fail(res, 402, "no_credit", "Claude 잔액이 부족해요.");
    return fail(res, 502, "upstream", String(err?.message || "Claude 호출 실패").slice(0, 200));
  }
}
