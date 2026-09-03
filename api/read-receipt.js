// 장끼(거래명세서/영수증) 사진에서 거래 정보를 읽는다.
//
// Vercel Serverless Function으로 배포되고, 로컬 `npm run dev`에서는
// vite.config.js의 devApi 플러그인이 같은 handler를 미들웨어로 물린다.
//
// ANTHROPIC_API_KEY는 서버 환경변수로만 존재한다. 프론트엔드는
// /api/read-receipt 만 호출하므로 키가 브라우저로 내려가지 않는다.
//
// 결제방식(이체/삼촌 대납)은 일부러 추출하지 않는다. 장끼만으로는 알 수 없고,
// 사용자가 저장 전에 반드시 직접 고르게 되어 있다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const blank = "못 읽으면 빈 문자열";

const ReceiptSchema = z.object({
  vendor: z.string().describe(`물건을 판 가게(판매자) 상호. ${blank}`),
  address: z.string().describe(`판매자 위치/주소. 건물·층·호수까지. ${blank}`),
  phone: z.string().describe(`판매자 전화번호. ${blank}`),
  account: z.string().describe(`계좌번호. 은행명이 있으면 같이. ${blank}`),
  bizNo: z.string().describe(`판매자 사업자등록번호. ${blank}`),
  items: z.string().describe(`상품명. 여러 개면 쉼표로 이어서. ${blank}`),
  date: z.string().describe(`거래 날짜 YYYY-MM-DD. ${blank}`),
  supply: z.number().describe("금액(원 단위 정수). 못 읽으면 0"),
  vatSeparate: z
    .boolean()
    .describe("금액이 부가세 별도(VAT별도)로 표기돼 있으면 true, 총액이면 false"),
});

const PROMPT = `사진 속 종이 장끼(거래명세서·영수증) 한 장만 읽어라.

**배경은 무시한다.** 책상, 옷, 다른 서류, 상표택, 바닥 등 종이 바깥에 있는 것은
절대 읽지 마라. 종이가 기울어져 있거나 뒤집혀 있으면 방향을 맞춰서 읽어라.

**vendor는 물건을 판 가게 이름이다.**
포클로는 물건을 산 우리 회사다. 장끼에 "거래처명: 포클로"처럼 적혀 있어도 그건
우리 쪽이므로 vendor에 넣지 마라. 영수증 맨 위 상호나 도장, 사업자등록번호 옆
상호처럼 판매자를 가리키는 이름을 vendor에 넣어라.

**금액.**
"VAT별도", "부가세 별도"라고 적혀 있으면 vatSeparate를 true로 하고 적힌 금액을
supply에 넣어라. 그런 표기가 없으면 vatSeparate를 false로 하고 합계 금액을 넣어라.

**추측 금지.**
읽히지 않는 항목은 빈 문자열(숫자는 0)로 두어라. 손글씨라 헷갈리는 글자가 있으면
그 항목만 비우고 나머지를 채워라.`;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method", message: "POST만 받습니다." });
  }

  // 키가 없거나 형태가 이상하면(플레이스홀더가 그대로 남는 등) 프론트가
  // 수동 입력 폼으로 넘어갈 수 있게, 502가 아니라 알아들을 수 있는 안내를 준다.
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    return res.status(503).json({
      error: "not_configured",
      message: "장끼 자동 읽기가 아직 켜져 있지 않아요. 직접 입력해 주세요.",
    });
  }
  if (!/^sk-ant-[\x21-\x7e]+$/.test(key)) {
    return res.status(503).json({
      error: "bad_key",
      message: "API 키 형태가 이상해요. .env의 ANTHROPIC_API_KEY를 확인해 주세요.",
    });
  }

  const { image, mediaType } = req.body || {};
  if (typeof image !== "string" || !image) {
    return res.status(400).json({ error: "bad_request", message: "사진이 없습니다." });
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
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(ReceiptSchema) },
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
      address: g.address || "",
      phone: g.phone || "",
      account: g.account || "",
      bizNo: g.bizNo || "",
      items: g.items || "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : "",
      supply: Number.isFinite(g.supply) && g.supply > 0 ? Math.round(g.supply) : 0,
      vatSeparate: !!g.vatSeparate,
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: "auth", message: "API 키가 맞지 않아요. 키를 다시 확인해 주세요." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "rate_limit", message: "잠시 뒤 다시 시도해 주세요." });
    }
    // 잔액 부족은 400으로 오는데, 원인을 모르면 고칠 수가 없으니 그대로 알려준다.
    if (/credit balance/i.test(err?.message || "")) {
      return res.status(402).json({
        error: "no_credit",
        message: "Anthropic 계정에 크레딧이 없어요. console.anthropic.com → Billing에서 충전하면 켜집니다.",
      });
    }
    console.error("read-receipt failed:", err);
    return res.status(502).json({ error: "upstream", message: "사진을 읽지 못했어요. 직접 입력해 주세요." });
  }
}
