// 캐러셀 기획 — 잘 된 캐러셀(여러 장짜리 인스타 게시물)을 분석하고, 우리 상품으로 캐러셀을 기획한다.
// (2026-09-22 세원: "가장 잘 팔리는 상품, 뜰 것 같은 상품을 분석해서 캐러셀 콘텐츠를 만들 수 있게.
//  우리 캐러셀 레퍼런스·릴스 레퍼런스를 보면서 학습 후 진행")
//
// mode
//   analyze  캐러셀 장면(사진 여러 장, base64) + 성과 숫자 → 장별 역할·표지 훅·구조·디자인·빈칸 틀
//   plan     상품(1~6개) 주소 + 판매 숫자(왜 이 상품인지) + 레퍼런스 요약들 → 장별 캐러셀 기획
//            여러 개면 **묶음 캐러셀**(세원 9/22: "잘 나가는 상품 몇 개를 묶어서 만드는 캐러셀도")
//            상품 상세 사진을 URL 로 같이 보여줘서 "몇 번 사진을 몇 번째 장에" 까지 고르게 한다.
//
// ANTHROPIC_API_KEY 는 이 함수의 환경변수로만 존재한다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readProduct } from "./_product.js";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } }, maxDuration: 300 };

const MODEL = "claude-opus-5";
import { costOf } from "./_cost.js";

// ------------------------------------------------------------------ 1) 레퍼런스 분석

const RefSchema = z.object({
  title: z.string().describe("이 캐러셀을 한 줄로 부르는 이름. 예: '가을 꾸안꾸 코디 5 모음'"),
  format: z.string().describe("형식. 예: '코디 모음' / '정보형(체형·컬러)' / '비포애프터' / '한 상품 집중' / '후기형'"),
  cover: z.object({
    text: z.string().describe("표지(1장)에 적힌 글 그대로"),
    visual: z.string().describe("표지 사진·구도"),
    why: z.string().describe("표지가 왜 넘기게 만드는지 1~2줄"),
  }),
  slides: z
    .array(
      z.object({
        n: z.number().describe("몇 번째 장"),
        role: z.string().describe("이 장의 역할. '표지 훅' / '문제 제기' / '코디 제안' / '디테일' / '가격·정보' / '저장 유도' / 'CTA' 등"),
        text: z.string().describe("장에 적힌 글 그대로. 없으면 빈 문자열"),
        visual: z.string().describe("사진·레이아웃"),
      }),
    )
    .describe("장별"),
  structure: z.object({
    flow: z.string().describe("전개를 화살표로. 예: '표지 훅 → 룩1~5 → 정리 → 저장 유도'"),
    cta: z.string().describe("마지막에 시키는 행동. 없으면 '없음'"),
    whyItWorks: z.string().describe("이 캐러셀이 먹히는 이유 2~3줄"),
  }),
  design: z.object({
    layout: z.string().describe("장 구성·여백·사진 배치"),
    typography: z.string().describe("글씨 크기·굵기·위치·강조 방식"),
    color: z.string().describe("색 톤"),
    photoStyle: z.string().describe("사진 스타일 (모델컷/거울셀카/누끼/디테일 등)"),
  }),
  performance: z.object({
    summary: z.string().describe("주어진 좋아요·댓글·게시일·캡션으로 본 반응 해석 2~3줄. 숫자가 없으면 빈 문자열"),
    signals: z.array(z.string()).describe("반응을 만든 요인 2~4개"),
  }),
  template: z
    .string()
    .describe(
      "다른 상품에도 쓸 수 있게 장별 글을 빈칸 틀로. 줄 앞에 [1] [2] 처럼 장 번호. 상품마다 달라지는 자리는 {{핵심특징}} 처럼. 조사는 빈칸 안에.",
    ),
  slots: z
    .array(z.object({ key: z.string(), hint: z.string(), original: z.string() }))
    .describe("빈칸 3~7개"),
  note: z.string().describe("못 읽은 부분 등 한계. 없으면 빈 문자열"),
});

const REF_PROMPT = `너는 여성 의류 쇼핑몰의 인스타그램 콘텐츠 기획자다. 아래 사진들은 **잘 된 인스타 캐러셀 게시물의
장들을 순서대로** 떠낸 것이다(사진 앞의 번호가 장 순서).

1. 장마다 적힌 글을 **글자 그대로** 읽고(맞춤법 고치지 마라), 사진·레이아웃을 적어라.
2. 표지가 왜 넘기게 만드는지, 전개·CTA 구조, 디자인(레이아웃·글씨·색·사진 스타일)을 분석해라.
3. 성과 숫자와 캡션이 주어지면 performance 에 반응 해석을 적어라. 좋아요는 계정이 숨기면 부정확할 수 있다.
   숫자를 지어내지 마라.
4. 다른 상품에도 쓸 수 있게 장별 글을 **빈칸 틀**로 바꿔라(template/slots).
결과는 전부 **한국어**. 없는 말은 지어내지 말고 안 보이면 note 에 적어라.`;

// ------------------------------------------------------------------ 2) 우리 상품 캐러셀 기획

const PlanSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string(),
        price: z.string().describe("페이지 판매가 그대로. 없으면 빈 문자열"),
        points: z.array(z.string()).describe("소구점 2~4개 — 상품 글에 있는 사실로"),
      }),
    )
    .describe("주어진 상품 순서 그대로"),
  target: z.string().describe("누구에게"),
  angle: z.string().describe("이 상품(들)을 지금 어떤 각도로 밀지 — 판매 숫자(잘 팔림/뜨는 중)와 계절을 근거로 2~3줄. 묶음이면 무엇으로 엮었는지"),
  hooks: z
    .array(z.object({ text: z.string().describe("표지 문구"), type: z.string().describe("훅 방식") }))
    .describe("표지 문구 후보 3개"),
  slides: z
    .array(
      z.object({
        n: z.number(),
        role: z.string().describe("이 장의 역할"),
        product: z.number().describe("이 장에 나오는 상품 번호(상품 1, 상품 2 …). 여러 상품이 같이 나오거나 상품이 없는 장이면 0"),
        photo: z.number().describe("그 상품의 사진 번호('상품 K · 사진 N' 의 N). 새로 찍어야 하거나 product 가 0 이면 0"),
        shot: z.string().describe("사진 설명 — 기존 사진이면 어떤 컷인지, 0이면 무엇을 새로 찍을지"),
        text: z.string().describe("장 위에 올릴 글 (짧게, 줄바꿈 가능)"),
        design: z.string().describe("글 위치·크기·강조 등 디자인 지시 한 줄"),
      }),
    )
    .describe("장별 기획 — 보통 6~10장"),
  caption: z.string().describe("인스타 본문. 해시태그 빼고"),
  hashtags: z.array(z.string()).describe("해시태그 8~12개. # 포함"),
  cta: z.string().describe("마지막에 시킬 행동 (저장·댓글·프로필 링크 등)"),
  learnedFrom: z
    .array(z.object({ ref: z.string().describe("참고한 레퍼런스 이름"), borrowed: z.string().describe("무엇을 빌렸는지") }))
    .describe("어느 레퍼런스에서 무엇을 가져왔는지"),
  todo: z.array(z.string()).describe("촬영·편집 할 일 체크리스트 3~6개"),
});

const PLAN_PROMPT = `너는 여성 의류 쇼핑몰 **포클로**의 인스타그램 캐러셀 기획자다.

아래에 (1) 밀어야 할 우리 상품(1개 또는 여러 개)의 판매페이지 글과 **판매 숫자**(잘 팔리는 이유 / 뜨고 있는 이유),
(2) 우리가 모아 둔 **캐러셀 레퍼런스와 릴스 레퍼런스의 분석 요약**(표지 훅·구조·성과),
(3) 상품 상세 사진들('상품 K · 사진 N')이 있다.

**상품이 여러 개면 묶음 캐러셀이다.** 따로 소개하는 나열이 아니라 **하나의 주제로 엮어라** —
예: "요즘 제일 많이 나간 가을 니트 3", "이 스커트 하나로 3가지 코디", "출근룩 위아래 세트".
상품끼리 같이 입을 수 있으면 코디로 묶고(그 장은 product 0 + shot 에 조합), 표지에서 개수를 약속하면 끝까지 지켜라.
상품마다 적어도 한 장은 그 상품 사진으로 채운다.

**할 일**
1. 레퍼런스들에서 **잘 된 패턴**(표지 훅 방식, 장 구성, 저장·댓글 유도)을 뽑고, 이 상품에 맞는 것을 골라라.
   베끼지 말고 **틀을 빌려라**. learnedFrom 에 어디서 무엇을 가져왔는지 적어라.
2. 판매 숫자를 근거로 각도(angle)를 정해라 — 잘 팔리는 상품이면 "이미 검증된" 쪽, 뜨는 신상이면 "지금 먼저" 쪽.
3. 장별로 **어느 상품의 몇 번 사진을 쓸지** 골라라(product, photo). 맞는 사진이 없으면 photo 0 으로 두고 무엇을 새로 찍을지 적어라.
4. 표지 문구 후보 3개, 본문, 해시태그, 촬영·편집 할 일까지.

**포클로 톤**
- 20~30대 여성이 친구에게 말하듯. 과장 광고 문구("최저가", "1위") 금지.
- 장 위 글은 짧게. 한 줄 12~16자, 한 장에 2~3줄.
- 가격은 상품 글에 있는 값만. 없는 소재·기능을 지어내지 마라.
결과는 전부 **한국어**.`;

// ------------------------------------------------------------------ 호출 도우미

const fail = (res, code, error, message) => res.status(code).json({ error, message });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(client, content, schema, effort) {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort, format: zodOutputFormat(schema) },
        messages: [{ role: "user", content }],
      });
      const r = await stream.finalMessage();
      if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens" || !r.parsed_output) {
        const e = new Error(r.stop_reason === "refusal" ? "분석을 거절했어요." : "결과가 너무 길어 잘렸어요. 다시 해 주세요.");
        e.userFacing = 422;
        throw e;
      }
      return { ...r.parsed_output, _cost: costOf(r.usage) };
    } catch (err) {
      const st = err?.status;
      if (attempt === 0 && (st === 429 || st === 529 || (st >= 500 && st < 600))) {
        await wait(st === 429 ? 8000 : 4000);
        continue;
      }
      throw err;
    }
  }
}

function metaText(m) {
  if (!m || typeof m !== "object") return "";
  const line = [
    m.uploader ? `계정: ${m.uploader}` : "",
    m.postedAt ? `게시일: ${m.postedAt}` : "",
    m.likes != null ? `좋아요: ${m.likes}` : "",
    m.comments != null ? `댓글: ${m.comments}` : "",
  ].filter(Boolean).join(" · ");
  return (line ? `성과 숫자: ${line}` : "") + (m.caption ? `\n캡션:\n${String(m.caption).slice(0, 2000)}` : "");
}

/** 레퍼런스 한 개를 짧게 — 기획 프롬프트가 너무 길어지지 않게 */
function refLine(r) {
  const perf = r.performance?.summary ? ` / 성과: ${r.performance.summary}` : "";
  if (r.kind === "carousel") {
    return `[캐러셀] ${r.title} (${r.format || ""})\n  표지: ${r.cover || ""}\n  구조: ${r.flow || ""}\n  먹히는 이유: ${r.why || ""}${perf}` +
      (r.template ? `\n  틀:\n${String(r.template).split("\n").map((l) => "    " + l).join("\n")}` : "");
  }
  return `[릴스] ${r.title}\n  훅: ${r.hook || ""} (${r.hookType || ""})\n  구조: ${r.flow || ""}\n  먹히는 이유: ${r.why || ""}${perf}`;
}

// ------------------------------------------------------------------ 핸들러

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "캐러셀 기획이 아직 켜져 있지 않아요.");

  const body = req.body || {};
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "medium";
  const client = new Anthropic();

  try {
    if (body.mode === "analyze") {
      const slides = Array.isArray(body.slides) ? body.slides.slice(0, 20) : [];
      if (!slides.length) return fail(res, 400, "bad_request", "캐러셀 사진이 없어요.");
      const content = [];
      slides.forEach((s, i) => {
        content.push({ type: "text", text: `${i + 1}장` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.data } });
      });
      const extra = [metaText(body.meta), body.memo ? `메모: ${String(body.memo).slice(0, 800)}` : ""]
        .filter(Boolean)
        .join("\n\n");
      content.push({ type: "text", text: REF_PROMPT + (extra ? "\n\n---\n" + extra : "") });
      return res.status(200).json(await ask(client, content, RefSchema, effort));
    }

    if (body.mode === "plan") {
      // products: [{url, stats}] — 예전처럼 url/stats 하나만 와도 받는다
      const list = (Array.isArray(body.products) && body.products.length
        ? body.products
        : [{ url: body.url, stats: body.stats }]
      ).slice(0, 6);
      if (!list.every((x) => /^https?:\/\//i.test(String(x?.url || "").trim()))) {
        return fail(res, 400, "bad_request", "상품 주소(https://...)를 넣어주세요.");
      }
      let read;
      try {
        read = await Promise.all(list.map((x) => readProduct(String(x.url).trim())));
      } catch (err) {
        return fail(res, 422, "product_unreadable", err.message || "상품 페이지를 못 읽었어요.");
      }
      // 사진은 모두 합쳐 14장 안에서 나눈다 (상품이 많으면 상품당 적게)
      const per = Math.max(3, Math.floor(14 / list.length));
      const photos = read.map((p) => p.images.slice(0, per));
      const refs = Array.isArray(body.refs) ? body.refs.slice(0, 12) : [];
      const many = list.length > 1;
      const productText = read
        .map((p, i) => {
          const st = list[i].stats || {};
          return [
            `\n--- 상품 ${i + 1} ---`,
            `주소: ${list[i].url}`,
            `상품명: ${p.title}`,
            `요약설명: ${p.summary}`,
            `판매가: ${p.price}${p.listPrice ? ` (정가 ${p.listPrice})` : ""}`,
            st.reason
              ? `판매 숫자: ${st.reason}${st.q7 != null ? ` (최근 7일 ${st.q7}장, 그 전 7일 ${st.p7}장, 30일 ${st.q30}장)` : ""}`
              : "판매 숫자: (없음 — 직접 고른 상품)",
            st.group ? `분류: ${st.group === "best" ? "잘 팔리는 상품" : "뜰 것 같은 상품"}` : "",
            // 여러 개면 상세를 줄여 프롬프트가 너무 길어지지 않게
            `상세:\n${p.text.slice(0, many ? 2500 : 9000)}`,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      const text = [
        PLAN_PROMPT,
        many ? `\n이번엔 **상품 ${list.length}개 묶음 캐러셀**이다.` : "",
        productText,
        "\n--- 레퍼런스 (우리가 모아 둔 것) ---",
        refs.length ? refs.map(refLine).join("\n\n") : "(아직 없음 — 일반적인 좋은 캐러셀 패턴으로)",
        body.memo ? `\n--- 메모 ---\n${String(body.memo).slice(0, 1500)}` : "",
        "\n상품 사진은 아래에 '상품 K · 사진 N' 으로 붙어 있다.",
      ].join("\n");

      const withImages = (use) => {
        const content = [{ type: "text", text }];
        if (use) {
          photos.forEach((imgs, k) =>
            imgs.forEach((u, i) => {
              content.push({ type: "text", text: `상품 ${k + 1} · 사진 ${i + 1}` });
              content.push({ type: "image", source: { type: "url", url: u } });
            }),
          );
        }
        return content;
      };
      let plan;
      try {
        plan = await ask(client, withImages(true), PlanSchema, effort);
      } catch (err) {
        // 사진 주소를 Claude 가 못 받아오는 경우가 있다 → 사진 없이 한 번 더
        if (err?.status === 400 && /image|url|fetch/i.test(String(err?.message))) {
          plan = await ask(client, withImages(false), PlanSchema, effort);
        } else throw err;
      }
      return res.status(200).json({
        ...plan,
        productImages: photos,
        productTitles: read.map((p) => p.title),
        productUrls: list.map((x) => String(x.url).trim()),
        // 예전 화면이 읽던 칸 (상품 하나일 때)
        images: photos[0],
        productTitle: read[0].title,
      });
    }

    return fail(res, 400, "bad_request", "mode 는 analyze 또는 plan 이어야 합니다.");
  } catch (err) {
    if (err?.userFacing) return fail(res, err.userFacing, "unreadable", err.message);
    const status = err?.status;
    const msg = String(err?.message || "");
    if (status === 400 && /credit|balance/i.test(msg)) return fail(res, 402, "no_credit", "API 잔액이 부족해요.");
    console.error(err);
    const why =
      status === 429 ? "요청이 몰려 한도에 걸렸어요. 1분 뒤 다시 해주세요."
      : status === 529 || /overloaded/i.test(msg) ? "Claude 서버가 붐벼요. 잠시 뒤 다시 해주세요."
      : `잠시 뒤 다시 시도해 주세요. (${status || "연결"} ${msg.slice(0, 140)})`;
    return fail(res, 502, "upstream", why);
  }
}
