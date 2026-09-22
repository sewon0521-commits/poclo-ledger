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
//   review  우리가 찍은 영상(장면+받아쓴 말) + 레퍼런스·기획 → 촬영 피드백
//
// 2026-09-22 — 사무실 PC 분석기(poclo-cafe24/reels_worker.py)가 인스타 링크를 받아
// 영상을 내려받고, 장면을 뜨고, **소리를 받아써서**(faster-whisper) 이 함수를 부른다.
// 그때는 transcriptSource 가 "whisper" 이고 meta(계정·좋아요·댓글·캡션)가 같이 온다.
//
// 결과 JSON이 길어서(장면·문장별 분석·빈칸 틀) 예전 8,000 토큰으로는 생각하다 잘려
// "다시 시도"만 뜨는 일이 있었다. 스트리밍 + 넉넉한 max_tokens 로 받고,
// 과부하(529)·한도(429)는 한 번 다시 시도한다. 실패하면 **이유를 화면에 그대로** 보낸다.
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
    hookType: z.string().describe("훅 유형 한 줄. 예: '군중심리형 : 나만 모르고 있었나?', '고민 공감형', '결과 먼저'"),
    flow: z.string().describe("전개 구조를 화살표로. 예: '훅 → 고민 → 착용컷 3벌 → 가격 → CTA'"),
    cta: z.string().describe("마지막에 시키는 행동. 없으면 '없음'"),
    whyItWorks: z.string().describe("이 릴스가 먹히는 이유 2~3줄"),
  }),
  empathy: z.string().describe("공감 포인트 — 보는 사람이 왜 손가락을 멈추는지 2~3줄"),
  hookFormula: z.object({
    line: z.string().describe("훅 문장 그대로"),
    a: z.string().describe("공식의 A 자리가 무엇인지. 예: '타겟이 이미 알고 있어야 할 행동'"),
    b: z.string().describe("공식의 B 자리. 예: '현재 타겟의 상태(아직 없음)'"),
    why: z.string().describe("이 공식이 왜 멈추게 하는지 한두 줄"),
  }),
  lines: z
    .array(
      z.object({
        role: z.string().describe("이 문장의 역할. '후킹' / '본문' / '심리' / 'CTA' 중 하나"),
        text: z.string().describe("문장 그대로"),
        why: z.string().describe("이 문장이 하는 일 2~3줄. 어떤 기술인지"),
      }),
    )
    .describe("문장별 분석"),
  template: z
    .string()
    .describe(
      "대본을 **빈칸 있는 틀**로 바꾼 것. 상품마다 달라지는 자리를 {{핵심소재}} 처럼 중괄호 두 개로 " +
      "바꾸고 나머지 말투·구조는 그대로 둔다. 줄 앞에 [0:03] 처럼 시점을 붙인다. " +
      "**조사(이/가·은/는·라·로·에)는 빈칸 안에 넣는다** — 상품에 따라 조사가 달라지기 때문이다. " +
      "예: 원문이 '바스락거리는 나일론 재질이라 여름에 입기 진짜 좋고' 면 " +
      "'[0:03] {{핵심소재}} {{체감장점}}' 이고, 핵심소재 자리의 원래 말은 '바스락거리는 나일론 재질이라' 다.",
    ),
  slots: z
    .array(
      z.object({
        key: z.string().describe("빈칸 이름. template 의 {{ }} 안과 정확히 같게. 예: '핵심소재'"),
        hint: z.string().describe("이 칸에 무엇을 넣는지 한 줄. 예: '상품의 주요 원단·소재명'"),
        original: z.string().describe("레퍼런스에서는 이 자리에 뭐라고 썼는지. 조사까지 그대로"),
      }),
    )
    .describe("빈칸 목록. 3~7개. 상품이 바뀌면 달라지는 것만 빈칸으로 만든다"),
  performance: z
    .object({
      summary: z
        .string()
        .describe("주어진 성과 숫자(좋아요·댓글·게시일·캡션)로 본 반응 해석 2~3줄. 숫자가 없으면 빈 문자열"),
      signals: z
        .array(z.string())
        .describe("반응을 만든 요인 추정 2~4개. 예: '댓글 유도형 CTA(\"코디\" 댓글 → 링크)가 댓글 수를 끌어올림'"),
    })
    .describe("성과 분석. 숫자는 주어진 것만 쓰고 지어내지 않는다"),
  note: z.string().describe("소리를 못 들어서 놓쳤을 수 있는 부분 등 솔직한 한계. 없으면 빈 문자열"),
});

const SCRIPT_PROMPT = `너는 여성 의류 쇼핑몰의 릴스 기획자다. 아래 사진들은 **레퍼런스 릴스 영상에서
시간 순서대로 떠낸 장면들**이다. 사진 앞에 붙은 시간(초)을 보고 흐름을 읽어라.

**할 일**
1. 화면에 박힌 자막을 **글자 그대로** 읽어라. 자막이 릴스 대본이다. 맞춤법을 고치지 마라.
2. 자막이 없으면 화면(옷·동작·장소·표정)만 보고 어떤 영상인지 읽어라.
3. 아래에 '받아쓴 말'이 주어졌다면 그것이 실제 음성이다. 자막과 합쳐 하나의 대본으로 정리해라.
4. 대본을 뽑은 뒤 **구조를 분석**해라 — 공감 포인트, 훅 공식(A/B), 문장별 역할, 전개, CTA.
5. 마지막으로 이 대본을 **다른 상품에도 쓸 수 있는 틀**로 바꿔라(template + slots).
   말투·리듬·구조는 그대로 두고, **상품이 바뀌면 달라지는 자리만** {{핵심소재}} 처럼 빈칸으로 판다.
   빈칸은 3~7개. 너무 잘게 쪼개면 쓰기 어렵다.
   **조사는 빈칸 안에 넣어라.** 상품에 따라 '~이라/~라/~는' 이 달라지므로 빈칸 밖에 두면
   '있어라' 처럼 말이 어긋난다. 빈칸을 뺀 나머지 글자만 이어 읽어도 문장이 어색하지 않아야 한다.

**규칙**
- 결과는 전부 **한국어**로 쓴다.
- **없는 말을 지어내지 마라.** 안 보이면 안 보인다고 note 에 적어라.
  특히 소리는 들을 수 없으니, 목소리형인데 받아쓴 말이 없으면 그렇게 적어라.
- 사진에 워터마크·아이디·UI(좋아요 수 등)가 보여도 대본에 넣지 마라.
- '자동 받아쓰기'는 기계가 들은 것이라 틀릴 수 있다. 배경음악 가사가 섞였을 수 있으니
  **말인지 노래 가사인지 가려서**, 가사는 대본에 넣지 말고 note 에 "배경음악: …"으로 적어라.
- 성과 숫자(좋아요·댓글 등)가 주어지면 performance 에 해석을 적어라. 조회수가 없으면 없다고 두고
  숫자를 추정해 만들지 마라. 캡션의 CTA(댓글 유도·저장 유도 등)도 성과 요인으로 본다.`;

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
  filled: z
    .array(
      z.object({
        key: z.string().describe("빈칸 이름. 레퍼런스 slots 의 key 와 같게"),
        value: z.string().describe("우리 상품으로 채운 말. 상품 글에 있는 사실만"),
      }),
    )
    .describe("레퍼런스 틀의 빈칸을 우리 상품으로 채운 것. slots 가 주어졌으면 전부 채운다"),
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
4. 레퍼런스에 **빈칸 틀(template/slots)** 이 있으면 그 빈칸을 우리 상품으로 **전부 채워라**(filled).
   빈칸에 넣는 말은 **상품 글에 실제로 있는 사실**이어야 한다.
   **채운 말을 틀에 그대로 끼웠을 때 문장이 자연스러워야 한다** — 조사(이라/라/는/가)까지 맞춰서 쓰고,
   빈칸 바로 뒤에 오는 글자와 겹치지 않게 해라. 레퍼런스의 original 이 어떻게 끝났는지 보고 맞춘다.

**포클로 톤**
- 20~30대 여성이 친구에게 말하듯. 과장 광고 문구("최저가", "1위") 쓰지 마라.
- 자막은 짧게 끊어 읽히게. 한 줄에 12~18자.
- 가격은 상품 글에 있는 값만 쓴다. 없으면 가격 얘기를 빼라.
- 사실이 아닌 소재·기능을 지어내지 마라. 상품 글에 있는 것만 쓴다.

결과는 전부 **한국어**로 쓴다.`;

// ------------------------------------------------------------- 3) 우리가 찍은 영상 피드백

const ReviewSchema = z.object({
  summary: z.string().describe("한 줄 총평. 예: '훅은 좋은데 2~5초가 늘어져서 이탈이 날 것 같아요'"),
  script: z.string().describe("우리 영상에서 실제로 나온 자막·말을 한글로. 줄바꿈으로"),
  good: z.array(z.string()).describe("잘한 점 2~4개"),
  fixes: z
    .array(
      z.object({
        at: z.string().describe("시점. 예: '0~2초'"),
        issue: z.string().describe("무엇이 아쉬운지"),
        suggestion: z.string().describe("어떻게 고치면 되는지 — 다시 찍을지, 편집으로 될지까지"),
      }),
    )
    .describe("고칠 점. 중요한 순서로 3~6개"),
  hook: z.string().describe("첫 1~3초 훅 평가 — 레퍼런스 훅과 비교해서"),
  vsReference: z.string().describe("레퍼런스 구조(훅→전개→CTA)를 얼마나 따라갔는지, 빠진 단계"),
  caption: z.string().describe("이 영상에 붙일 인스타 본문 제안. 해시태그 빼고"),
});

const REVIEW_PROMPT = `너는 여성 의류 쇼핑몰 **포클로**의 릴스 편집 디렉터다.
아래 사진들은 **우리가 직접 찍은 릴스 영상**에서 시간 순서대로 떠낸 장면이다.
같이 준 레퍼런스 릴스의 구조·대본, 그리고 (있으면) 우리가 미리 써 둔 기획 대본과 비교해서
**올리기 전에 고칠 점**을 짚어라.

- 보이는 것과 들린 것(받아쓴 말)만 근거로 말한다. 지어내지 마라.
- 고칠 점은 시점을 붙여서, 촬영한 사람이 바로 알아듣게 구체적으로.
- 자막 길이(한 줄 12~18자), 첫 1초에 옷이 보이는지, 훅 문장이 바로 읽히는지, CTA가 있는지 본다.
- 포클로 톤: 친구에게 말하듯, 과장 광고 문구 금지.
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Claude 한 번 부르기 — 스트리밍으로 받아 끝난 메시지의 parsed_output 을 돌려준다.
 * 과부하(529)·한도(429)·잠깐 끊김(5xx)은 한 번만 쉬었다가 다시 부른다.
 */
async function ask(client, content, schema) {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: zodOutputFormat(schema) },
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

/** 받은 결과가 쓸 만한지 — 잘렸거나 거절이면 이유를 붙여 던진다 */
function parsedOf(r, what) {
  if (r.stop_reason === "refusal") {
    const e = new Error(`${what}을(를) 거절했어요. 다른 영상으로 해보세요.`);
    e.userFacing = 422;
    throw e;
  }
  if (r.stop_reason === "max_tokens" || !r.parsed_output) {
    const e = new Error(`${what} 결과가 너무 길어 잘렸어요. 더 짧은 영상으로 다시 해보세요.`);
    e.userFacing = 422;
    throw e;
  }
  return r.parsed_output;
}

/** 장면 사진을 Claude 에 넘길 모양으로 */
function frameContent(frames) {
  const content = [];
  for (const f of frames) {
    content.push({ type: "text", text: `${f.at ?? "?"}초` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  return content;
}

/** 링크에서 가져온 성과 숫자·캡션을 글로 */
function metaText(m) {
  if (!m || typeof m !== "object") return "";
  const line = [
    m.uploader ? `계정: ${m.uploader}` : "",
    m.postedAt ? `게시일: ${m.postedAt}` : "",
    m.views != null ? `조회수: ${m.views}` : "조회수: (못 가져옴)",
    m.likes != null ? `좋아요: ${m.likes}` : "",
    m.comments != null ? `댓글: ${m.comments}` : "",
    m.duration ? `길이: ${m.duration}초` : "",
  ].filter(Boolean).join(" · ");
  // 좋아요를 숨긴 계정은 좋아요가 엉뚱하게(예: 3) 올 때가 있다 — 댓글·캡션을 더 믿게 한다
  return `성과 숫자(인스타에서 가져옴, 좋아요는 계정이 숨기면 부정확할 수 있음 — 댓글·캡션 쪽을 더 믿어라): ${line}` +
    (m.caption ? `\n캡션(본문):\n${String(m.caption).slice(0, 2000)}` : "");
}

function transcriptText(body) {
  if (!body.transcript) return "";
  const src = body.transcriptSource === "whisper"
    ? "자동 받아쓰기(기계가 들음 — 틀리거나 노래 가사가 섞였을 수 있음)"
    : "받아쓴 말(사람이 듣고 적음)";
  return `${src}:\n${String(body.transcript).slice(0, 8000)}`;
}

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
      const frames = Array.isArray(body.frames) ? body.frames.slice(0, 32) : [];
      if (!frames.length) return fail(res, 400, "bad_request", "영상에서 장면을 못 떴어요.");

      const content = frameContent(frames);
      const extra = [
        body.kind ? `영상 형태: ${body.kind}` : "",
        transcriptText(body),
        metaText(body.meta),
        body.memo ? `메모: ${String(body.memo).slice(0, 1000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      content.push({ type: "text", text: SCRIPT_PROMPT + (extra ? "\n\n---\n" + extra : "") });

      const r = await ask(client, content, ScriptSchema);
      return res.status(200).json(parsedOf(r, "대본 뽑기"));
    }

    if (body.mode === "review") {
      const frames = Array.isArray(body.frames) ? body.frames.slice(0, 32) : [];
      if (!frames.length) return fail(res, 400, "bad_request", "영상에서 장면을 못 떴어요.");
      const ref = body.reference || {};
      const plan = body.plan || {};
      const content = frameContent(frames);
      content.push({
        type: "text",
        text: [
          REVIEW_PROMPT,
          "\n--- 우리 영상에서 들린 말 ---",
          transcriptText(body) || "(말 없음 또는 못 받아씀)",
          "\n--- 레퍼런스 ---",
          `훅: ${ref.hook || ""}`,
          `구조: ${ref.structure?.flow || ""} (CTA: ${ref.structure?.cta || ""})`,
          `대본:\n${ref.script || ""}`,
          plan.script ? `\n--- 미리 써 둔 우리 기획 대본 ---\n${plan.script}` : "",
          body.memo ? `\n--- 메모 ---\n${String(body.memo).slice(0, 1000)}` : "",
        ].join("\n"),
      });
      const r = await ask(client, content, ReviewSchema);
      return res.status(200).json(parsedOf(r, "피드백"));
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
        ref.template ? `빈칸 틀:\n${ref.template}` : "",
        ref.slots?.length
          ? `빈칸 목록:\n${ref.slots.map((s) => `- ${s.key}: ${s.hint} (레퍼런스에선 "${s.original}")`).join("\n")}`
          : "",
        "\n--- 우리 상품 판매페이지 ---",
        `주소: ${url}`,
        `상품명: ${product.title}`,
        `요약설명: ${product.summary}`,
        `판매가: ${product.price}${product.listPrice ? ` (정가 ${product.listPrice})` : ""}`,
        `상세:\n${product.text}`,
        body.memo ? `\n--- 메모 ---\n${String(body.memo).slice(0, 1500)}` : "",
      ].join("\n");

      const r = await ask(client, [{ type: "text", text }], AdaptSchema);
      return res.status(200).json(parsedOf(r, "대본 만들기"));
    }

    return fail(res, 400, "bad_request", "mode 는 script · adapt · review 중 하나여야 합니다.");
  } catch (err) {
    if (err?.userFacing) return fail(res, err.userFacing, "unreadable", err.message);
    const status = err?.status;
    const msg = String(err?.message || "");
    if (status === 400 && /credit|balance/i.test(msg)) {
      return fail(res, 402, "no_credit", "API 잔액이 부족해요.");
    }
    console.error(err);
    // 뭉뚱그리면 고칠 수가 없다 — 어느 쪽 문제인지 한 줄로 알려준다
    const why =
      status === 429 ? "요청이 몰려 한도에 걸렸어요. 1분 뒤 다시 해주세요."
      : status === 529 || /overloaded/i.test(msg) ? "Claude 서버가 붐벼요. 잠시 뒤 다시 해주세요."
      : status === 413 || /too large|exceed/i.test(msg) ? "보낸 장면이 너무 커요. 더 짧은 영상으로 해보세요."
      : status === 400 ? `요청 형식 문제예요: ${msg.slice(0, 160)}`
      : `잠시 뒤 다시 시도해 주세요. (${status || "연결"} ${msg.slice(0, 120)})`;
    return fail(res, 502, "upstream", why);
  }
}
