// Vercel Serverless Function — 영수증 사진에서 거래 정보를 읽는다.
//
// ANTHROPIC_API_KEY는 이 함수의 환경변수로만 존재한다. 프론트엔드는
// /api/read-receipt 만 호출하므로 키가 브라우저로 내려가지 않는다.
//
// 결제방식(이체/삼촌)은 일부러 추출하지 않는다. 영수증만으로는 알 수 없고,
// 사용자가 저장 전에 반드시 직접 고르게 되어 있다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ReceiptSchema = z.object({
  vendor: z.string().describe("거래처(상호)명. 못 읽으면 빈 문자열"),
  date: z.string().describe("YYYY-MM-DD. 못 읽으면 빈 문자열"),
  supply: z
    .number()
    .describe("공급가액(부가세 별도, 원 단위 정수). 못 읽으면 0"),
  vatSeparate: z
    .boolean()
    .describe("영수증에 부가세가 공급가액과 별도로 표기되어 있으면 true"),
  items: z.string().describe("주요 품목 요약. 없으면 빈 문자열"),
});

const PROMPT = [
  "이 영수증/거래명세서 사진에서 매입 거래 정보를 읽어줘.",
  "supply는 부가세를 뺀 공급가액(원 단위 정수)이다.",
  "부가세가 따로 적혀 있으면 vatSeparate를 true로 하고 공급가액만 supply에 넣어라.",
  "부가세 구분 없이 총액만 적혀 있으면 vatSeparate를 false로 하고 그 총액을 supply에 넣어라.",
  "날짜를 읽을 수 없으면 date를 빈 문자열로 둬라. 추측해서 채우지 마라.",
  "손글씨 명세서라 확신이 없으면 해당 항목만 비워두고 나머지를 채워라.",
].join(" ");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST만 받습니다." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // 키가 아직 설정 전이면 프론트가 수동 입력 폼으로 넘어갈 수 있게 알린다.
    return res.status(503).json({
      error: "not_configured",
      message: "영수증 자동 읽기가 아직 켜져 있지 않아요. 직접 입력해 주세요.",
    });
  }

  const { image, mediaType } = req.body || {};
  if (typeof image !== "string" || !image) {
    return res.status(400).json({ error: "bad_request", message: "이미지가 없습니다." });
  }
  if (!ALLOWED_TYPES.has(mediaType)) {
    return res.status(400).json({
      error: "bad_request",
      message: "JPG·PNG·WEBP 사진만 읽을 수 있어요.",
    });
  }
  // base64 4글자당 3바이트
  if (image.length * 0.75 > MAX_BYTES) {
    return res.status(413).json({
      error: "too_large",
      message: "사진이 너무 커요. 다시 찍거나 직접 입력해 주세요.",
    });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(ReceiptSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return res.status(422).json({
        error: "unreadable",
        message: "사진에서 내용을 못 읽었어요. 직접 입력해 주세요.",
      });
    }

    const g = response.parsed_output;
    return res.status(200).json({
      vendor: g.vendor || "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : "",
      supply: Number.isFinite(g.supply) && g.supply > 0 ? Math.round(g.supply) : 0,
      vatSeparate: !!g.vatSeparate,
      items: g.items || "",
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: "auth", message: "영수증 읽기 설정을 확인해 주세요." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "rate_limit", message: "잠시 뒤 다시 시도해 주세요." });
    }
    console.error("read-receipt failed:", err);
    return res.status(502).json({ error: "upstream", message: "사진을 읽지 못했어요. 직접 입력해 주세요." });
  }
}
