// 릴스 기획 — 레퍼런스 영상에서 대본을 뽑고, 그 구조에 우리 상품을 대입한다.
//
// 왜 이렇게 만들었나 (중요)
// ------------------------
// **Claude는 영상 파일도, 소리도 직접 못 읽는다.** 받을 수 있는 건 글자·이미지·PDF뿐이다.
// 그래서 브라우저가 영상에서 **장면 사진을 여러 장 떠서**(src/lib/video.js) 보낸다.
//   - 자막이 박힌 릴스  → 사진에서 자막을 그대로 읽는다. 이게 우리가 보는 레퍼런스의 대부분이다.
//   - 목소리만 있는 릴스 → 소리는 못 듣는다. 화면과 자막으로 읽어내고, 모자라면
//                         사람이 들은 말을 '받아쓴 말' 칸에 붙여넣으면 그것까지 합쳐 정리한다.
// 사람이 인스타 자동자막을 복사해 넣는 게 가장 정확하다 — 화면에 그렇게 안내한다.
//
// mode
//   script  장면 사진 + (선택) 받아쓴 말  → 한글 대본 + 구조 분석
//   adapt   그 대본/구조 + 우리 상품 URL  → 우리 상품으로 바꾼 릴스 기획
//
// ANTHROPIC_API_KEY 는 이 함수의 환경변수로만 존재한다. 프론트는 /api/reels 만 부른다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } }, maxDuration: 300 };

const MODEL = "claude-opus-5";

// ------------------------------------------------------------------ 1) 대본 뽑기

const ScriptSchema = z.object({
  title: z.string().describe("이 릴스를 한 줄로 부르는 이름. 예: '아침 출근룩 3초 훅'"),
  kind: z.string().describe("영상 형태. '자막형' / '목소리형' / '자막+목소리' / '브이로그형' 중 하나"),
  seconds: z.number().describe("대략 몇 초짜리로 보이는지. 모르면 0"),
  hook: z.string().describe("첫 1~3초에 쓰인 훅. 화면에 뜬 글자가 있으면 그대로"),
  script: z.string().describe("전체 대본을 한글로. 자막이면 자막 그대로, 말이면 말한 대로. 줄바꿈으로 나눈다"),
  scenes: z
    .array(
      z.object({
        at: z.string().describe("대략 시점. 예: '0~2초'"),
        visual: z.string().describe("화면에 무엇이 보이는지 (구도·동작·장소)"),
        text: z.string().describe("그 장면의 자막/말. 없으면 빈 문자열"),
      }),
    )
    .describe("장면 흐름. 보이는 만큼만"),
  structure: z.object({
    hookType: z.string().describe("훅 방식. 예: '질문형', '결과 먼저', '고민 공감', '숫자 제시'"),
    flow: z.string().describe("전개 구조를 화살표로. 예: '훅 → 고민 → 착용컷 3벌 → 가격 → CTA'"),
    cta: z.string().describe("마지막에 시키는 행동. 없으면 '없음'"),
    whyItWorks: z.string().describe("이 릴스가 먹히는 이유 2~3줄"),
  }),
  note: z.string().describe("소리를 못 들어서 놓쳤을 수 있는 부분 등 솔직한 한계. 없으면 빈 문자열"),
});

const SCRIPT_PROMPT = `너는 여성 의류 쇼핑몰의 릴스 기획자다. 아래 사진들은 **레퍼런스 릴스 영상에서
시간 순서대로 떠낸 장면들**이다. 사진 앞에 붙은 시간(초)을 보고 흐름을 읽어라.

**할 일**
1. 화면에 박힌 자막을 **글자 그대로** 읽어라. 자막이 릴스 대본이다. 맞춤법을 고치지 마라.
2. 자막이 없으면 화면(옷·동작·장소·표정)만 보고 어떤 영상인지 읽어라.
3. 아래에 '받아쓴 말'이 주어졌다면 그것이 실제 음성이다. 자막과 합쳐 하나의 대본으로 정리해라.
4. 대본을 뽑은 뒤 **구조를 분석**해라 — 훅 방식, 전개, CTA, 왜 먹히는지.

**규칙**
- 결과는 전부 **한국어**로 쓴다.
- **없는 말을 지어내지 마라.** 안 보이면 안 보인다고 note 에 적어라.
  특히 소리는 들을 수 없으니, 목소리형인데 받아쓴 말이 없으면 그렇게 적어라.
- 사진에 워터마크·아이디·UI(좋아요 수 등)가 보여도 대본에 넣지 마라.`;

// ------------------------------------------------------------- 2) 우리 상품으로 바꾸기

const AdaptSchema = z.object({
  product: z.object({
    name: z.string().describe("상품명"),
    price: z.string().describe("판매가. 페이지에서 읽은 그대로. 못 찾으면 빈 문자열"),
    look: z.string().describe("어떤 옷인지 2~3줄 (핏·소재·색·분위기)"),
    points: z.array(z.string()).describe("소구점 3~5개. 이 옷을 사게 만드는 이유"),
    target: z.string().describe("누구에게 팔 옷인지"),
    cautions: z.string().describe("영상에서 말하면 안 되거나 조심할 점. 없으면 빈 문자열"),
  }),
  hook: z.string().describe("우리 릴스의 첫 1~3초 훅. 레퍼런스의 훅 방식을 따르되 우리 상품으로"),
  script: z.string().describe("우리 릴스 대본 전체. 자막으로 그대로 쓸 수 있게 줄바꿈으로"),
  scenes: z
    .array(
      z.object({
        at: z.string().describe("시점. 예: '0~2초'"),
        shot: z.string().describe("무엇을 어떻게 찍을지 (구도·동작). 촬영할 사람이 그대로 따라 할 수 있게"),
        text: z.string().describe("그 장면 자막"),
      }),
    )
    .describe("촬영 순서표"),
  caption: z.string().describe("인스타 본문 글. 해시태그 빼고"),
  hashtags: z.array(z.string()).describe("해시태그 8~12개. # 포함"),
  why: z.string().describe("레퍼런스의 어떤 구조를 어떻게 우리 것으로 옮겼는지 2~3줄"),
});

const ADAPT_PROMPT = `너는 여성 의류 쇼핑몰 **포클로**의 릴스 기획자다.

아래에 (1) 잘 된 레퍼런스 릴스의 대본과 구조, (2) 우리가 팔 상품의 판매페이지에서 긁어온 글이 있다.

**할 일**
1. 상품 글을 읽고 **어떤 옷인지, 누구에게, 무엇으로 설득할지**를 먼저 정리해라.
2. 레퍼런스의 **구조(훅 방식 → 전개 → CTA)를 그대로 빌려서**, 내용만 우리 상품으로 바꾼 대본을 써라.
   베끼는 게 아니라 **틀을 가져오는 것**이다.
3. 촬영할 사람이 보고 바로 찍을 수 있게 **장면별 촬영 지시**를 붙여라.

**포클로 톤**
- 20~30대 여성이 친구에게 말하듯. 과장 광고 문구("최저가", "1위") 쓰지 마라.
- 자막은 짧게 끊어 읽히게. 한 줄에 12~18자.
- 가격은 상품 글에 있는 값만 쓴다. 없으면 가격 얘기를 빼라.
- 사실이 아닌 소재·기능을 지어내지 마라. 상품 글에 있는 것만 쓴다.

결과는 전부 **한국어**로 쓴다.`;

// ------------------------------------------------------------------ 상품 페이지 읽기

/** 판매페이지 HTML에서 사람이 읽는 글만 남긴다. 태그·스크립트·스타일은 버린다. */
function htmlToText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * 카페24 상품 페이지에서 필요한 것만 뽑는다.
 *
 * 페이지 전체를 글자로 만들면 **메뉴가 절반**이라(카테고리 목록이 서너 번 반복된다)
 * 정작 상품 얘기가 묻힌다. 그래서 세 군데만 본다:
 *   og:title / og:description  상품명과 요약설명
 *   #span_product_price_text   판매가 (정가는 span_product_price_custom)
 *   #prdDetail 이후            MD코멘트·색상·소재·사이즈·착용정보 — 우리가 등록할 때 넣은 글
 * '배송정보' 뒤는 모든 상품이 같은 안내문이라 자른다.
 */
async function readProduct(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (poclo-ledger reels planner)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`상품 페이지를 못 읽었어요 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 카페24 몰은 보통 UTF-8이지만 EUC-KR인 페이지도 있다
  const head = buf.slice(0, 2048).toString("latin1").toLowerCase();
  const enc = /charset=["']?(euc-kr|ks_c_5601-1987|cp949)/.test(head) ? "euc-kr" : "utf-8";
  const html = new TextDecoder(enc).decode(buf);

  const og = (k) =>
    (html.match(new RegExp(`<meta[^>]+property=["']og:${k}["'][^>]+content=["']([^"']*)`, "i")) ||
      [])[1] || "";
  const pick = (id) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)`, "i"));
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };

  const detailPart = (html.match(/id=["']prdDetail["']([\s\S]*)$/i) || [])[1] || html;
  let detail = htmlToText(detailPart);
  const cut = detail.search(/배송정보\s*\/?\s*결제정보|교환\s*\/?\s*반품/);
  if (cut > 200) detail = detail.slice(0, cut);

  const title = og("title").replace(/\s*-\s*포클로\s*$/, "").trim();
  return {
    title,
    summary: og("description"),
    price: pick("span_product_price_text"),
    listPrice: pick("span_product_price_custom"),
    text: detail.slice(0, 9000),
  };
}

// ------------------------------------------------------------------ 핸들러

const fail = (res, code, error, message) => res.status(code).json({ error, message });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "릴스 기획이 아직 켜져 있지 않아요.");
  if (!/^sk-ant-[\x21-\x7e]+$/.test(key)) {
    return fail(res, 503, "bad_key", "API 키 형태가 이상해요. ANTHROPIC_API_KEY를 확인해 주세요.");
  }

  const body = req.body || {};
  const client = new Anthropic();

  try {
    if (body.mode === "script") {
      const frames = Array.isArray(body.frames) ? body.frames.slice(0, 16) : [];
      if (!frames.length) return fail(res, 400, "bad_request", "영상에서 장면을 못 떴어요.");

      const content = [];
      for (const f of frames) {
        content.push({ type: "text", text: `${f.at ?? "?"}초` });
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: f.data },
        });
      }
      const extra = [
        body.kind ? `사람이 고른 영상 형태: ${body.kind}` : "",
        body.transcript ? `받아쓴 말(사람이 듣고 적음):\n${String(body.transcript).slice(0, 6000)}` : "",
        body.memo ? `메모: ${String(body.memo).slice(0, 1000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      content.push({ type: "text", text: SCRIPT_PROMPT + (extra ? "\n\n---\n" + extra : "") });

      const r = await client.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: zodOutputFormat(ScriptSchema) },
        messages: [{ role: "user", content }],
      });
      if (r.stop_reason === "refusal" || !r.parsed_output) {
        return fail(res, 422, "unreadable", "영상에서 대본을 못 뽑았어요. 장면이 너무 어둡거나 자막이 없을 수 있어요.");
      }
      return res.status(200).json(r.parsed_output);
    }

    if (body.mode === "adapt") {
      const url = String(body.url || "").trim();
      if (!/^https?:\/\//i.test(url)) {
        return fail(res, 400, "bad_request", "상품 주소(https://...)를 넣어주세요.");
      }
      let product;
      try {
        product = await readProduct(url);
      } catch (err) {
        return fail(res, 422, "product_unreadable", err.message || "상품 페이지를 못 읽었어요.");
      }
      if (product.text.length < 80) {
        return fail(res, 422, "product_empty", "상품 페이지에서 글을 거의 못 찾았어요. 상세가 이미지뿐이면 상품 설명을 메모에 적어주세요.");
      }

      const ref = body.reference || {};
      const text = [
        ADAPT_PROMPT,
        "\n--- 레퍼런스 릴스 ---",
        `제목: ${ref.title || ""}`,
        `훅: ${ref.hook || ""}`,
        `구조: ${ref.structure?.flow || ""} (훅 방식: ${ref.structure?.hookType || ""}, CTA: ${ref.structure?.cta || ""})`,
        `대본:\n${ref.script || ""}`,
        "\n--- 우리 상품 판매페이지 ---",
        `주소: ${url}`,
        `상품명: ${product.title}`,
        `요약설명: ${product.summary}`,
        `판매가: ${product.price}${product.listPrice ? ` (정가 ${product.listPrice})` : ""}`,
        `상세:\n${product.text}`,
        body.memo ? `\n--- 메모 ---\n${String(body.memo).slice(0, 1500)}` : "",
      ].join("\n");

      const r = await client.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: zodOutputFormat(AdaptSchema) },
        messages: [{ role: "user", content: [{ type: "text", text }] }],
      });
      if (r.stop_reason === "refusal" || !r.parsed_output) {
        return fail(res, 422, "unreadable", "대본을 만들지 못했어요. 상품 주소를 다시 확인해 주세요.");
      }
      return res.status(200).json(r.parsed_output);
    }

    return fail(res, 400, "bad_request", "mode 는 script 또는 adapt 여야 합니다.");
  } catch (err) {
    const status = err?.status;
    if (status === 400 && /credit|balance/i.test(err?.message || "")) {
      return fail(res, 402, "no_credit", "API 잔액이 부족해요.");
    }
    console.error(err);
    return fail(res, 502, "upstream", "잠시 뒤 다시 시도해 주세요.");
  }
}
