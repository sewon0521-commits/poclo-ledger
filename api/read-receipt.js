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
  bizNo: z.string().describe(`판매자 사업자등록번호(3-2-5자리). ${blank}`),
  accounts: z
    .array(
      z.object({
        bank: z.string().describe(`은행명. ${blank}`),
        number: z.string().describe("계좌번호"),
        holder: z.string().describe(`예금주. ${blank}`),
      }),
    )
    .describe("장끼에 적힌 계좌 전부. 사업자계좌와 일반계좌가 따로 있으면 각각 한 줄씩. 없으면 빈 배열"),
  items: z
    .array(
      z.object({
        name: z.string().describe("품목명"),
        unitPrice: z.number().describe("단가. 없으면 0"),
        qty: z.number().describe("수량. 없으면 1"),
        amount: z.number().describe("그 줄의 금액. 없으면 0"),
      }),
    )
    .describe("품목 줄 전부. 여러 줄이면 각각. 없으면 빈 배열"),
  date: z.string().describe(`거래 날짜 YYYY-MM-DD. ${blank}`),
  supply: z.number().describe("당일합계(그 날 총 거래금액, 원 단위 정수). 못 읽으면 0"),
  vatSeparate: z
    .boolean()
    .describe("금액이 부가세 별도(VAT별도)로 표기돼 있으면 true, 총액이면 false"),
});

const PROMPT = `사진 속 종이 장끼(거래명세서·영수증) 한 장만 읽어라.

**배경은 무시한다.** 책상, 옷, 다른 서류, 상표택, 바닥 등 종이 바깥에 있는 것은
절대 읽지 마라. 종이는 90도 눕거나 뒤집혀 찍히는 경우가 많다. 방향을 맞춰서 읽어라.

**vendor = 물건을 판 가게 상호. 반드시 찾아라.**
포클로는 물건을 산 우리 회사다. "거래처명: 포클로"처럼 적혀 있어도 그건 사는 쪽이니
vendor에 넣지 마라. 하지만 그렇다고 비워두지도 마라 — 장끼에는 판 가게 이름이 거의
항상 있다. 이런 곳을 살펴라:
- 영수증 위쪽이나 가운데에 큼직하게 적힌 상호 (영문·한글 병기가 흔하다)
- 카카오톡/인스타 아이디, 전화번호, 주소 바로 옆이나 위에 적힌 이름
- 도장, 로고, "상호:" 라벨
포클로가 아닌 상호가 보이면 그것이 vendor다. 정말 아무 상호도 없을 때만 비워라.

**date = 거래 날짜.**
날짜와 시각이 같이 적혀 있으면 날짜만 YYYY-MM-DD로 취해라
(예: "2026-09-01 21:49:56" → "2026-09-01").
재발행 날짜가 따로 괄호로 붙어 있으면 원래 거래 날짜를 쓴다.
연도가 없으면 나머지만으로 추측하지 말고 비워라.

**accounts / bizNo 구분.**
계좌번호는 은행명과 예금주가 붙어 있고 자릿수가 자유롭다("신한 110-513-300830 김가영").
사업자등록번호는 반드시 3-2-5 자리다("123-45-67890"). 형태로 판단하고, 헷갈리면
계좌 쪽에 넣어라.
계좌가 여러 개 적혀 있으면(사업자계좌 / 일반계좌) **하나도 빠뜨리지 말고 각각 한 줄씩**
넣어라. 어느 계좌로 보냈는지는 사장님이 나중에 고르므로 판단하지 마라.

**items — 품목 줄.**
품목이 여러 줄이면 각각 한 줄씩 넣어라. 한 줄에 품목명·단가·수량·금액이 있으면
그대로 채우고, 없는 값은 0으로 둬라(수량이 안 적혀 있으면 1).

**금액.**
supply는 그 날 총 거래금액(당일합계·Total)이다. 품목 줄의 합과 다를 수 있는데
(에누리 등) 그럴 때는 적힌 합계를 그대로 따른다.
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
      output_config: { effort: "high", format: zodOutputFormat(ReceiptSchema) },
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
    const num = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

    return res.status(200).json({
      vendor: g.vendor || "",
      address: g.address || "",
      phone: g.phone || "",
      bizNo: g.bizNo || "",
      accounts: (g.accounts || [])
        .filter((a) => a && a.number)
        .map((a) => ({ bank: a.bank || "", number: a.number, holder: a.holder || "" })),
      items: (g.items || [])
        .filter((i) => i && (i.name || i.amount))
        .map((i) => ({
          name: i.name || "",
          unitPrice: num(i.unitPrice),
          qty: num(i.qty) || 1,
          amount: num(i.amount) || num(i.unitPrice) * (num(i.qty) || 1),
        })),
      date: /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : "",
      supply: num(g.supply),
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
