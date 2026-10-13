// CS 관리 — 문의 하나를 읽고, 유형을 나누고, 답변 초안을 쓴다.
// (10/13 세원: 온라인테크트리 'CS 자동화' 영상·PDF — "포클로 일 칸에 CS 관리 칸을 만들 거야. 모델은 아스트라라고 되어 있는데 너가 더 잘하니까 맡길게")
//
// 흐름
//   카페24 게시판(상품 Q&A · 1:1 맞춤상담) → 사무실 PC(poclo-cafe24/cs_worker.py)가 10분마다 모아 이 함수를 부른다
//   카톡 채널 · 네이버 톡톡 · 인스타 DM · 전화        → 앱의 '문의 붙여넣기'(글 또는 캡처)가 이 함수를 부른다
// **보내기는 여기서 안 한다.** 사람이 읽고 '확인했어요'를 체크한 뒤 보낸다 — 카페24 는 PC 가 답글을 달고, 나머지는 복사해서 붙인다.
//
// mode
//   draft  문의(글·캡처 사진) + 답변 틀 + (있으면) 상품 페이지·주문 정보 → 유형 · 한 줄 요약 · 주의 메모 · 확인할 것 · 빈칸 · 답변 초안
//          instruct 가 있으면 '이렇게 고쳐서 다시'(예: "더 짧게", "교환 말고 반품으로 안내")
//
// 지어내지 말 것: 입고일·출고일·송장·재고·금액·환불 날짜는 받은 글에 있을 때만. 모르면 [빈칸]. 보상·환불 약속은 틀에 있는 범위만.
// ANTHROPIC_API_KEY 는 이 함수의 환경변수로만 존재한다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readProduct } from "./_product.js";
import { costOf } from "./_cost.js";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } }, maxDuration: 120 };

const MODEL = "claude-opus-5-5";
// 앱(src/lib/cs.js TYPES)과 같은 순서·이름
const TYPES = ["배송", "교환", "반품·환불", "교환·반품 배송비", "사이즈", "재입고·입고", "불량·오배송", "주문 변경·취소", "할인·쿠폰", "상품 문의", "기타"];
const CHANNEL_NAME = {
  cafe24_qna: "카페24 상품 Q&A 게시판",
  cafe24_consult: "카페24 1:1 맞춤상담 게시판",
  kakao: "카카오톡 채널 채팅",
  naver: "네이버 톡톡 채팅",
  insta: "인스타그램 DM",
  phone: "전화·문자",
  etc: "기타",
};

const DraftSchema = z.object({
  type: z.enum(TYPES).describe("문의 유형 하나. 여러 개면 가장 중요한 것"),
  summary: z.string().describe("문의를 한 줄로(30자 안쪽). 예: '9/7 비회원 주문, 번호 잘못 적어 안내 못 받음'"),
  customer: z.string().describe("고객 이름·닉네임(문의·캡처에 보이면). 모르면 빈 글자"),
  product: z.string().describe("문의한 상품명(보이면). 모르면 빈 글자"),
  orderNo: z.string().describe("주문번호(보이면, 예: 20261012-0000123). 모르면 빈 글자"),
  message: z.string().describe("고객이 보낸 말 그대로. 캡처 사진이면 고객 말풍선만 읽어 줄바꿈으로(우리 말은 빼고). 글로 받았으면 받은 글 그대로"),
  caution: z.string().describe("보내기 전 사람이 꼭 확인할 것 한두 줄(예: '단순변심으로 단정하지 말고 상품 상태 사진부터 받기'). 없으면 빈 글자"),
  check: z.array(z.string()).describe("답하기 전 확인할 것(주문 상태·송장·재고·입고일·반품 접수 여부 등). 0~4개, 짧게"),
  blanks: z
    .array(
      z.object({
        key: z.string().describe("초안 속 빈칸 표시 그대로. 예: '[입고 예정일]'"),
        hint: z.string().describe("무엇을 적는지 짧게. 예: '예: 10월 16일 출고 예정'"),
      }),
    )
    .describe("초안에 남긴 빈칸들(초안에 실제로 있는 것만)"),
  draft: z.string().describe("고객에게 보낼 답변 초안. 모르는 사실은 [빈칸]"),
});

const fail = (res, code, error, message) => res.status(code).json({ error, message });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(client, content, schema, effort) {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        output_config: { effort, format: zodOutputFormat(schema) },
        messages: [{ role: "user", content }],
      });
      return await stream.finalMessage();
    } catch (err) {
      const st = err?.status;
      const retry = st === 429 || st === 529 || (st >= 500 && st < 600) || /overloaded/i.test(err?.message || "");
      if (attempt === 0 && retry) {
        await wait(st === 429 ? 8000 : 4000);
        continue;
      }
      throw err;
    }
  }
}

/** 답변 틀 → 글 (앱의 cs_templates 를 그대로 받는다) */
function templatesText(t = {}) {
  const lines = [];
  if (t.greeting) lines.push(`인사: ${t.greeting}`);
  if (t.closing) lines.push(`맺음: ${t.closing}`);
  if (t.tone) lines.push(`말투: ${t.tone}`);
  if (t.policy) lines.push(`\n[우리 쇼핑몰 규정 — 사실은 여기 적힌 것만]\n${String(t.policy).slice(0, 4000)}`);
  for (const x of (Array.isArray(t.items) ? t.items : []).slice(0, 20)) {
    if (!x?.type) continue;
    lines.push(`\n[${x.type} 틀${x.title ? ` — ${x.title}` : ""}]`);
    if (x.rules) lines.push(`순서·지킬 것:\n${String(x.rules).slice(0, 1200)}`);
    if (x.body) lines.push(`예시 답변:\n${String(x.body).slice(0, 1500)}`);
  }
  return lines.join("\n");
}

function orderText(o) {
  if (!o || typeof o !== "object") return "";
  const rows = Array.isArray(o.orders) ? o.orders : [o];
  const out = rows.slice(0, 5).map((x) =>
    [
      x.id && `주문번호 ${x.id}`,
      x.date && `주문일 ${x.date}`,
      x.status && `상태 ${x.status}`,
      x.items && `상품 ${[].concat(x.items).slice(0, 6).join(", ")}`,
      x.invoice && `송장 ${x.invoice}`,
      x.shippedOn && `출고 ${x.shippedOn}`,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  return out.filter(Boolean).length ? `\n--- 주문 정보 (카페24에서 확인한 사실) ---\n${out.join("\n")}` : "";
}

const PROMPT = `너는 여성 의류 쇼핑몰 '포클로'(ppoclo.kr, 카페24 자사몰)의 CS 담당이다. 받은 문의 하나를 읽고, 아래 답변 틀에 맞춰 고객에게 보낼 답변 초안을 쓴다.
사람(세원·지원)이 읽고 고친 뒤 보낸다 — 너는 초안까지만.

지킬 것
1. 유형을 고르고 그 유형의 틀을 바탕으로 쓴다. 틀에 '순서'가 있으면 그 순서대로(특히 교환·반품 배송비: 공감 → 규정 → 우리가 부담하는 경우 → 사진 요청).
2. **지어내지 말 것.** 입고일·출고일·송장번호·재고·금액·환불 날짜·적립금 금액은 '주문 정보'·문의·규정에 있을 때만 쓴다.
   모르면 [입고 예정일]·[송장번호]·[교환 배송비]처럼 대괄호 빈칸으로 남기고 blanks 에 넣는다. 빈칸은 꼭 필요한 것만(3개 안쪽).
3. 보상·환불·무료 처리 약속은 규정·틀에 있는 범위만. 화난 고객이면 먼저 불편을 받아 주는 한 줄, 변명이나 단정('단순변심이시죠') 금지.
4. 사이즈 문의: 상품 페이지의 실측(사이즈 정보)과 모델 정보(모델 JIWON 157cm · 상의 55 · 하의 26~27 · 신발 240mm)로 답한다.
   고객이 키·몸무게·평소 사이즈를 말했으면 추천 사이즈를 제안하되 '체형에 따라 개인차가 있을 수 있어요'를 꼭 넣는다. 실측을 모르면 빈칸.
5. 고객 개인정보(전화번호·주소 전체)를 답변에 다시 적지 않는다.
6. 문의가 여러 가지를 물으면 하나씩 다 답한다.
7. 캡처 사진이면 고객 말풍선과 우리(포클로) 말을 구분하고, 아직 답하지 않은 고객 말에 답한다.
8. 채널에 맞게: 게시판(카페24)은 인사·맺음을 갖춘 정중한 글, 채팅(카톡·톡톡·DM)은 짧은 문단 2~5개.
9. caution 에는 사람이 놓치면 사고 날 것만(배송비 부담 주체, 이미 반품 접수됐는지, 오래된 문의 등). check 는 답하기 전 확인할 사실.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "CS 초안이 아직 켜져 있지 않아요.");
  if (!/^sk-ant-[\x21-\x7e]+$/.test(key)) return fail(res, 503, "bad_key", "API 키 형태가 이상해요. ANTHROPIC_API_KEY를 확인해 주세요.");

  const body = req.body || {};
  if (body.mode !== "draft") return fail(res, 400, "bad_request", "mode 는 draft 만 받아요.");
  const text = String(body.text || "").slice(0, 6000);
  const images = (Array.isArray(body.images) ? body.images : []).filter((s) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(s || "")).slice(0, 4);
  if (!text.trim() && !images.length) return fail(res, 400, "bad_request", "문의 글이나 캡처 사진을 넣어 주세요.");
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "low";

  // 상품 페이지(사이즈·소재·가격) — 주소가 있으면
  let productText = "";
  const purl = String(body.product?.url || "").trim();
  if (/^https?:\/\/(www\.)?ppoclo\.(kr|cafe24\.com)\//i.test(purl)) {
    try {
      const p = await readProduct(purl);
      productText = `\n--- 문의한 상품 페이지 (${purl}) ---\n상품명: ${p.title || ""}\n판매가: ${p.price || ""}\n${String(p.text || "").slice(0, 5000)}`;
    } catch {
      productText = `\n(상품 페이지 ${purl} 를 읽지 못했어요 — 상품 사실은 빈칸으로)`;
    }
  } else if (body.product?.name) productText = `\n문의한 상품: ${String(body.product.name).slice(0, 120)}`;

  const extra = [
    `채널: ${CHANNEL_NAME[body.channel] || "기타"}`,
    body.customer ? `고객: ${String(body.customer).slice(0, 60)}` : "",
    body.at ? `문의 시각: ${String(body.at).slice(0, 40)} (오늘: ${new Date().toISOString().slice(0, 10)})` : "",
    body.title ? `제목: ${String(body.title).slice(0, 200)}` : "",
    text.trim() ? `--- 고객 문의 ---\n${text}` : "--- 고객 문의는 아래 캡처 사진 ---",
    orderText(body.order),
    productText,
    body.previous ? `\n--- 앞서 만든 초안 ---\n${String(body.previous).slice(0, 3000)}` : "",
    body.instruct ? `\n--- 이렇게 고쳐서 다시 써 줘 (세원 지시 — 최우선) ---\n${String(body.instruct).slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content = [
    { type: "text", text: `${PROMPT}\n\n=== 답변 틀 ===\n${templatesText(body.templates)}\n\n=== 이번 문의 ===\n${extra}` },
    ...images.map((s) => {
      const m = s.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      return { type: "image", source: { type: "base64", media_type: m[1].replace("jpg", "jpeg"), data: m[2] } };
    }),
  ];

  try {
    const client = new Anthropic();
    const r = await ask(client, content, DraftSchema, effort);
    if (r.stop_reason === "refusal") return fail(res, 422, "refusal", "이 문의로는 초안을 만들지 못했어요. 직접 써 주세요.");
    if (!r.parsed_output) return fail(res, 422, "unreadable", "초안이 잘렸어요. 다시 만들어 주세요.");
    const out = r.parsed_output;
    // 초안에 실제로 있는 빈칸만
    const blanks = (out.blanks || []).filter((b) => b?.key && out.draft.includes(b.key));
    for (const m of out.draft.match(/\[[^\]\n]{1,24}\]/g) || []) if (!blanks.some((b) => b.key === m)) blanks.push({ key: m, hint: "" });
    return res.status(200).json({ ...out, blanks, _cost: costOf(r.usage) });
  } catch (err) {
    const status = err?.status;
    const msg = String(err?.message || "");
    if (status === 400 && /credit|balance/i.test(msg)) return fail(res, 402, "no_credit", "API 잔액이 부족해요.");
    if (status === 401 || /authentication|x-api-key/i.test(msg)) return fail(res, 503, "bad_key", "Claude API 키가 막혔어요(잘못된 키). 새 키를 Vercel 의 ANTHROPIC_API_KEY 에 넣고 다시 배포해야 해요.");
    console.error(err);
    const why =
      status === 429 ? "요청이 몰려 한도에 걸렸어요. 1분 뒤 다시 해 주세요."
      : status === 529 || /overloaded/i.test(msg) ? "Claude 서버가 붐벼요. 잠시 뒤 다시 해 주세요."
      : status === 413 || /too large|exceed/i.test(msg) ? "캡처가 너무 커요. 한두 장만 넣어 주세요."
      : status === 400 ? `요청 형식 문제예요: ${msg.slice(0, 160)}`
      : `잠시 뒤 다시 시도해 주세요. (${status || "연결"} ${msg.slice(0, 120)})`;
    return fail(res, 502, "upstream", why);
  }
}
