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
//   product 우리 상품(주소) + 레퍼런스 후보들 → 가장 맞는 레퍼런스를 골라 그 구조로 우리 릴스 기획 (9/22 세원:
//           "우리 상품을 내가 말해주거나 링크를 삽입하거나 클릭하면 그 상품에 맞는 릴스로 기획")
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
import { readProduct } from "./_product.js";
import { costOf } from "./_cost.js";

export const config = { api: { bodyParser: { sizeLimit: "12mb" } }, maxDuration: 300 };

// 10/2 Opus 5 → 5.5 (세원 요청): 입력 $4 · 출력 $20 / 100만 토큰 — 5보다 20% 싸다. effort 는 늘 직접 넣는다(5.5 기본값이 medium 이라).
const MODEL = "claude-opus-5-5";
/**
 * 우리 촬영 환경 (세원 10/2: "특별한 말을 하지 않는 이상 기획 릴스나 룩북 릴스를 찍는 곳은 사무실 스튜디오야. 바닥은 밝은 우드톤
 * 우드 장판, 벽은 흰색 벽. 보통 영상은 전부 셀카로 찍고 있어. 근데 내가 찍어주는 영상들도 있어서 크게 제약은 안 되겠다.")
 * 기획(product·adapt·revise)마다 같이 준다. 메모에 다른 장소·방식이 있으면 메모가 먼저.
 */
const STUDIO_TEXT = `
--- 우리 촬영 환경 (세원이 따로 말하지 않으면 늘 이 조건) ---
- 장소: 사무실 스튜디오. 바닥은 밝은 우드톤 장판, 벽은 흰 벽. 소품이 적고 깔끔하다.
- 촬영: 대부분 셀카로 찍는다(폰을 손에 들거나 세워 두고 모델이 혼자). 세원이 찍어 줄 때도 있어 다른 사람이 찍는 컷도 되지만, 셀카로 되는 컷을 먼저 짜라.
- 그래서 장면(shot)은 이 스튜디오에서 바로 찍을 수 있게 — 흰 벽 앞 전신·상반신, 우드 바닥이 보이게 걸어오는 컷, 폰 거치 셀카, 손에 든 셀카 등. 옷 색이 흰 벽·밝은 우드와 붙어 보이면 각도·거리로 대비를 살리라고 한 줄.
- 야외·카페 등 다른 장소가 꼭 필요한 기획이면 그렇게 적고 왜 필요한지 한 줄. 메모(세원 지시)에 장소·촬영 방식이 있으면 메모를 따른다.`;

/** 요즘 트렌드 메모 (세원 10/2) — 앱의 '요즘 트렌드' 칸에 적은 것. 기획할 때마다 같이 준다 */
const trendText = (body) =>
  body.trends ? `\n--- 요즘 트렌드·우리 방향 (세원·쇼만마 단톡에서 모은 메모 — 이 상품·구조에 맞는 것만 살리고, 억지로 다 넣지 말 것. 메모(세원 지시)와 부딪히면 메모가 먼저) ---\n${String(body.trends).slice(0, 2500)}` : "";


// ------------------------------------------------------------------ 1) 대본 뽑기

const ScriptSchema = z.object({
  title: z.string().describe("이 릴스를 한 줄로 부르는 이름. 예: '아침 출근룩 3초 훅'"),
  kind: z.string().describe("영상 형태. '자막형' / '목소리형' / '자막+목소리' / '브이로그형' 중 하나"),
  seconds: z.number().describe("대략 몇 초짜리로 보이는지. 모르면 0"),
  hook: z.string().describe("첫 1~3초에 쓰인 훅. 화면에 뜬 글자가 있으면 그대로"),
  script: z
    .string()
    .describe(
      "전체 대본. **한 줄에 자막(또는 말) 하나**, 줄 앞에 그 자막이 처음 뜬 시각을 [0:03.5] 처럼 붙인다(초는 소수 한 자리). " +
      "자막은 글자 그대로. 화면 자막이 아니라 목소리로만 한 말은 시각 뒤에 '말:' 을 붙여 구분한다(예: '[0:04.0] 말: 제일 만만한 건…'). " +
      "줄은 **시각 순서대로**(자막과 말이 섞여도). 시각을 모르면 줄 앞에 아무것도 붙이지 않는다",
    ),
  scenes: z
    .array(
      z.object({
        at: z.string().describe("시점. 예: '0:00~0:02.5'"),
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
  rhythm: z
    .string()
    .describe(
      "자막·컷 리듬 2~3줄. 자막이 몇 개이고 평균 몇 초에 하나씩 바뀌는지(대본 줄 수·시각으로 센다), 컷 전환 수, " +
      "그 속도가 보는 사람에게 무엇을 하게 만드는지. 예: '자막 34개가 평균 0.6초마다 바뀌어 읽느라 끝까지 보게 된다'",
    ),
  captionStyle: z
    .string()
    .describe("자막 모양 1~2줄 — 화면 위치·글자 크기·색·테두리·강조 방식·한 번에 몇 글자. 우리가 따라 만들 때 쓰게. 자막이 없으면 빈 문자열"),
  retention: z
    .array(z.string())
    .describe("끝까지 보게 만드는 장치 2~4개. 예: '1. 2. 번호로 몇 개 남았는지 궁금하게', '최고의 포인트는…으로 끊고 다음 컷에서 공개'"),
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

// 고친 대본으로 다시 짤 때 새로 쓰는 칸만 (장면·성과·자막 모양은 그대로 — 10/2 전부 다시 쓰니 209원이라 줄임)
const RestructureSchema = ScriptSchema.pick({
  hook: true,
  structure: true,
  rhythm: true,
  retention: true,
  empathy: true,
  hookFormula: true,
  lines: true,
  template: true,
  slots: true,
});

const SCRIPT_PROMPT = `너는 여성 의류 쇼핑몰의 릴스 기획자다. 아래 사진들은 **레퍼런스 릴스 영상에서
시간 순서대로 떠낸 장면들**이다. 사진 앞에 붙은 시간(초)을 보고 흐름을 읽어라.

**할 일**
1. 화면에 박힌 자막을 **글자 그대로** 읽어라. 자막이 릴스 대본이다. 맞춤법을 고치지 마라(영상에 쓰인 그대로).
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
  숫자를 추정해 만들지 마라. 캡션의 CTA(댓글 유도·저장 유도 등)도 성과 요인으로 본다.
`;

/**
 * 자막 띠 (10/2 세원: "거의 0.5초 단위로 대본이 지나가는 릴스들도 있어서… 조금 더 깊게 대본 분석")
 * 사무실 PC 가 0.33초마다 떠서 자막 줄만 잘라 쌓은 사진 — poclo-cafe24/captions.py
 */
function denseText(body) {
  const strips = Array.isArray(body.captionStrips) ? body.captionStrips : [];
  const r = body.rhythm || {};
  const nums = [r.seconds ? `영상 ${Math.round(r.seconds * 10) / 10}초` : "", r.cuts != null ? `장면 전환(컷) ${r.cuts}번` : ""].filter(Boolean).join(" · ");
  const out = [];
  if (strips.length)
    out.push(`**자막 띠 사진**이 함께 왔다 — 사무실 PC 가 영상을 ${r.fps ? `1초에 ${r.fps}번` : "촘촘히"} 떠서, 자막이 뜨는 줄만 잘라 시간 순으로 쌓은 것이다.
칸마다 왼쪽 위 검은 상자의 숫자가 그 칸의 시각(초)이다.
- 자막은 **띠 사진에서 읽어라.** 장면 사진은 1~3초에 한 장이라 빠른 자막을 놓친다.
- 0.3~0.5초만 떴다 사라지는 자막도 **하나도 빠뜨리지 마라.** 띠 사진에 보이는 자막은 전부 script 에 들어가야 한다.
- 같은 자막이 여러 칸에 이어지면 한 줄로. 글자가 한 자씩 늘어나며 완성되는 효과(타자 효과)는 **완성된 문장 하나로**, 시각은 처음 나타난 칸.
- 띠 칸에 자막 없이 사람·옷만 보이면 그 순간은 자막이 없는 것이다.
- 띠 칸은 자막 줄만 잘라 붙인 것이라 화면 구도는 장면 사진으로 본다.`);
  if (body.ocr)
    out.push(`기계 글자 읽기(OCR, 참고용 — 틀린 글자·빠진 자막이 많다. 시각·순서만 참고하고 글자는 사진을 믿어라):\n${String(body.ocr).slice(0, 5000)}`);
  if (nums) out.push(`리듬 숫자: ${nums} — rhythm 은 이 숫자와 대본 줄 수·시각으로 써라.`);
  return out.join("\n\n");
}

/** 띠 사진 → Claude 에 넘길 모양 */
function stripContent(body) {
  const strips = Array.isArray(body.captionStrips) ? body.captionStrips.slice(0, 20) : [];
  const out = [];
  for (const st of strips) {
    if (!st?.data) continue;
    out.push({ type: "text", text: `자막 띠 · ${st.from}~${st.to}초` });
    out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: st.data } });
  }
  return out;
}

/**
 * 고친 대본으로 다시 짜기 (10/2 세원: "대본을 내가 편집할 수 있게… 분석할 때 틀린 대본들이 있어서")
 * 사람이 바로잡은 대본이 정답. 글만 보내서 싸다(사진 없음).
 */
const RESTRUCTURE_PROMPT = `너는 여성 의류 쇼핑몰의 릴스 기획자다. 레퍼런스 릴스를 기계가 분석했는데 대본(자막)이 틀린 곳이 있어서
**사람이 영상을 보며 대본을 바로잡았다. 아래 '바로잡은 대본'이 정답이다.**

**할 일** — 이 대본을 기준으로 분석을 다시 써라.
- 대본은 다시 쓰지 않는다(앱이 그대로 가지고 있다). hook 은 대본의 첫 1~3초 자막(또는 말) 그대로.
- 구조(훅 유형·전개·CTA·먹히는 이유)·공감 포인트·훅 공식·문장별 분석·리듬·끝까지 보게 만드는 장치를 이 대본으로 다시.
- 빈칸 틀(template + slots)을 이 대본으로 다시 판다. 말투·리듬·구조는 그대로, 상품이 바뀌면 달라지는 자리만 {{핵심소재}} 처럼.
  빈칸 3~7개. **조사는 빈칸 안에** — 빈칸을 뺀 글자만 이어 읽어도 어색하지 않게. 줄 앞 시각은 대본의 시각을 쓴다.
- 결과는 전부 한국어. 없는 말을 지어내지 마라.`;

// ------------------------------------------------------------- 2) 우리 상품으로 바꾸기

/**
 * 대본 바탕 (10/3 세원: "AI가 레퍼런스의 대본을 그대로 가져와서 그걸 가공해 줬으면. 레퍼 대본을 참고해서 창작하지 말고.
 * 이걸 베이스로 깔아 줘. 그래서 내가 수정할 때도 괜찮을 것 같아.")
 */
const BASE_TEXT = `
--- 대본 만드는 법 (가장 중요) ---
- 레퍼런스 대본을 **한 줄도 빼지 말고 순서대로 그대로 깔고**(baseLines), 줄마다 **우리 상품에 안 맞는 말만** 바꿔라. 창작하지 마라.
- 바꾸는 것: 상품명·옷 종류·소재·색·핏·디테일·가격·입는 상황처럼 상품이 바뀌면 틀린 말이 되는 부분. 바꿔 넣는 말은 **우리 상품 글에 있는 사실**만.
- 그대로 두는 것: 말투·어미·문장 길이·줄 수·순서·시각·감탄사·문장부호·이모지·밈 표현·'말:' 표시. 바꿀 게 없는 줄은 **글자 그대로**.
- 새 문장을 지어 넣거나, 줄을 합치거나, 지우지 마라. 레퍼런스 줄이 우리 상품에 도저히 안 맞으면 그 줄만 최소한으로 고쳐라.
- 룩·상품이 여러 개인데 레퍼런스가 한 벌을 소개하면, 상품을 소개하는 줄 묶음을 룩마다 되풀이해도 된다(말투 그대로, 그 줄들의 at 은 비움).
- 메모(세원 지시)가 훅·문장을 정해 주면 그 줄만 메모대로 바꾼다.
- hook 은 baseLines 첫 줄(들)의 ours, scenes 의 text 도 ours 와 같게. script 는 빈 문자열로 둔다(앱이 ours 로 만든다).
- 레퍼런스 대본이 아예 없을 때만 baseLines 를 빈 배열로 두고 script 를 새로 쓴다.`;

/** 바탕 줄 → 대본 ([시각] 줄) */
function withBase(out) {
  const lines = Array.isArray(out.baseLines) ? out.baseLines.filter((l) => l && (l.ours || l.ref)) : [];
  if (!lines.length) return out;
  return { ...out, script: lines.map((l) => (l.at ? `[${l.at}] ` : "") + (l.ours ?? l.ref)).join("\n") };
}

const AdaptSchema = z.object({
  product: z.object({
    name: z.string().describe("대표 상품명(룩이 여럿이면 첫 룩의 주인공)"),
    price: z.string().describe("판매가. 페이지에서 읽은 그대로. 못 찾으면 빈 문자열"),
    look: z.string().describe("어떤 옷인지 2~3줄 (핏·소재·색·분위기)"),
    points: z.array(z.string()).describe("소구점 3~5개. 이 옷을 사게 만드는 이유"),
    target: z.string().describe("누구에게 팔 옷인지"),
    cautions: z.string().describe("영상에서 말하면 안 되거나 조심할 점. 없으면 빈 문자열"),
  }),
  looks: z
    .array(
      z.object({
        n: z.number().describe("룩 번호 (룩 1, 룩 2 …)"),
        name: z.string().describe("이 룩을 부르는 짧은 이름. 예: '출근룩 - 니트 + 벌룬팬츠'"),
        items: z.array(z.string()).describe("이 룩에 들어가는 상품명들"),
        point: z.string().describe("이 룩에서 보여줄 한 가지. 예: '앉았다 일어나도 안 눌리는 주름'"),
      }),
    )
    .describe("룩이 여러 개면 룩마다 한 줄. 상품이 하나면 룩 1 하나만"),
  filled: z
    .array(
      z.object({
        key: z.string().describe("빈칸 이름. 레퍼런스 slots 의 key 와 같게"),
        value: z.string().describe("우리 상품으로 채운 말. 상품 글에 있는 사실만"),
      }),
    )
    .describe("레퍼런스 틀의 빈칸을 우리 상품으로 채운 것. slots 가 주어졌으면 전부 채운다"),
  baseLines: z
    .array(
      z.object({
        at: z.string().describe("레퍼런스 대본 그 줄 앞 시각 그대로(예: '0:03.5'). 시각이 없으면 빈 문자열"),
        ref: z.string().describe("레퍼런스 대본 그 줄 그대로 (시각 표시만 빼고, '말:' 은 그대로)"),
        ours: z.string().describe("그 줄을 우리 상품에 맞게 바꾼 것. 바꿀 게 없으면 ref 와 글자 하나 다르지 않게 그대로"),
      }),
    )
    .describe("레퍼런스 대본을 한 줄도 빼지 않고 순서대로 깔고, 줄마다 우리 상품으로 바꾼 것 — 우리 대본의 바탕. 레퍼런스 대본이 없을 때만 빈 배열"),
  hook: z.string().describe("우리 릴스의 첫 1~3초 훅 — baseLines 첫 줄(들)의 ours"),
  script: z
    .string()
    .describe("baseLines 가 있으면 빈 문자열로 둔다(앱이 ours 로 만든다). 레퍼런스 대본이 없을 때만 새로 쓴 대본 전체를 줄바꿈으로"),
  scenes: z
    .array(
      z.object({
        at: z.string().describe("시점. 예: '0~2초'"),
        look: z.number().describe("이 장면의 룩 번호. 룩과 상관없는 장면이면 0"),
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
0. **룩이 여러 개면 룩 순서가 대본 순서다.** 룩 1 → 룩 2 → 룩 3 으로 넘어가게 짜고,
   룩마다 한 가지씩만 보여줘라(전부 설명하면 늘어진다). 한 룩에 상품이 여럿이면 같이 입은 코디다.
1. 상품 글을 읽고 **어떤 옷인지, 누구에게, 무엇으로 설득할지**를 먼저 정리해라.
2. 레퍼런스 **대본을 그대로 깔고 우리 상품에 안 맞는 말만 바꿔라** — 아래 '대본 만드는 법'을 따른다.
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

**메모는 세원이 준 지시다.** 메모에 훅 아이디어·하고 싶은 말이 있으면 **그걸 최우선으로 살려서**
훅과 대본에 넣어라(말투만 다듬는 건 괜찮다). 메모가 레퍼런스 구조와 부딪히면 메모를 따르고,
왜 그렇게 했는지 why 에 한 줄 적어라.

결과는 전부 **한국어**로 쓴다.`;

// ------------------------------------------------------------- 2-1) 상품에서 시작하는 릴스

const ProductReelSchema = AdaptSchema.extend({
  chosen: z.string().describe("고른 레퍼런스의 id (후보 목록의 [id]). 후보가 없으면 빈 문자열"),
  chosenWhy: z.string().describe("왜 이 레퍼런스 구조가 이 상품에 맞는지 1~2줄"),
  shots: z
    .array(z.object({ photo: z.number().describe("참고할 상품 사진 번호(사진 N). 없으면 0"), note: z.string() }))
    .describe("촬영 때 참고할 상품 사진 — 어떤 컷처럼 찍을지"),
});

/**
 * 섞어 만들기 (9/29 세원: "초반 후킹은 이 영상, 내용은 저 영상, 구도는 또 다른 영상, 대본은 부분부분 짬뽕").
 * 후보에서 하나를 고르는 대신, 부분마다 정해 준 레퍼런스를 빌려 한 편으로 잇는다.
 */
function mixText(mix) {
  const part = (k, label, lines) =>
    mix[k] ? [`\n[${label}] ← 레퍼런스 [${mix[k].id}] ${mix[k].title || ""}`, ...lines.filter(Boolean)].join("\n") : `\n[${label}] ← 정해 준 레퍼런스 없음. 상품에 맞게 네가 정한다.`;
  const h = mix.hook || {};
  const f = mix.flow || {};
  const s = mix.shots || {};
  const w = mix.script || {};
  return [
    "\n--- 이번엔 섞어 만든다 ---",
    "후보에서 하나를 고르지 말고, 아래처럼 **부분마다 다른 레퍼런스**를 빌려 우리 상품 릴스 한 편으로 이어라.",
    "- 대본 바탕(baseLines): **'대본 말투' 레퍼런스의 대본**(없으면 '내용 흐름' 레퍼런스 대본)을 그대로 깔고 우리 상품에 안 맞는 말만 바꾼다('대본 만드는 법').",
    "- 훅: 바탕 대본의 첫 줄(들)을 '훅' 레퍼런스의 훅 문장으로 갈아 끼우고 우리 상품 말만 바꾼다(그 줄의 ref 는 훅 레퍼런스 문장).",
    "- 내용 흐름: 그 레퍼런스의 전개 순서·장면 수·CTA 방식을 따른다.",
    "- 구도·촬영: scenes 의 shot 과 shots 를 그 레퍼런스의 구도·카메라·동작으로 짠다.",
    "부분끼리 어긋나면(예: 무자막 구도인데 말 많은 대본) 자연스럽게 맞추고, chosenWhy 에 **무엇을 어디서 빌려 어떻게 이었는지** 2~4줄로 적어라. 레퍼런스는 id(rm…) 말고 **제목으로** 불러라(사람이 읽는다).",
    "chosen 에는 훅을 빌린 레퍼런스 id(없으면 흐름 레퍼런스 id). 빈칸 틀은 쓰지 않으니 filled 는 빈 배열.",
    part("hook", "첫 1~3초 훅", [h.hook && `훅: ${h.hook}`, h.hookType && `훅 방식: ${h.hookType}`, h.formula?.line && `훅 공식: A=${h.formula.a} / B=${h.formula.b} — ${h.formula.why || ""}`, h.empathy && `공감 포인트: ${h.empathy}`]),
    part("flow", "내용 흐름", [f.flow && `흐름: ${f.flow}`, f.cta && `CTA: ${f.cta}`, f.lines?.length && `문장 역할:\n${f.lines.map((l) => "  " + l).join("\n")}`, f.script && `대본(바탕 후보):\n${f.script}`]),
    part("shots", "구도·촬영", [s.seconds && `길이: 약 ${s.seconds}초`, s.scenes?.length && `장면:\n${s.scenes.map((l) => "  " + l).join("\n")}`]),
    ownText(mix.own),
    part("script", "대본 말투", [w.kind && `형태: ${w.kind}`, w.script && `대본:\n${w.script}`]),
  ].join("\n");
}

/**
 * 우리가 찍은 영상 소스 (9/29 세원: "섞어서 만들래에서 구도·촬영에 우리 영상 소스를 넣으면 AI 가 알아서 파악하게").
 * 브라우저가 소스마다 장면 사진을 떠서 보낸다 → 사진은 글 뒤에 '소스 N · 몇 초' 로 붙인다(ownBlocks).
 */
function ownText(own) {
  if (!Array.isArray(own) || !own.length) return "";
  return [
    `\n[우리가 이미 찍은 영상 소스 ${own.length}개] — 아래 사진 중 '소스 N · 몇 초' 로 표시된 장면들`,
    ...own.map((o, i) => `  소스 ${i + 1}: ${o.title || "이름 없음"} (약 ${o.seconds || "?"}초)`),
    "이 소스들은 **실제로 쓸 컷**이다. 사진을 보고 무엇이 찍혀 있는지(구도·동작·옷·장소)를 파악해서,",
    "scenes 를 이 컷들 위주로 짜라 — 각 장면 shot 앞에 어느 소스 몇 초 컷인지 적는다(예: '[소스 2 · 3.5초] 측면 워킹').",
    "소스에 없는데 꼭 필요한 컷만 '[추가 촬영]' 으로 표시하고 무엇을 찍을지 적어라. 구도·촬영 레퍼런스가 따로 있으면 그 스타일로 소스를 배치·편집하는 방법을 제안해라.",
    "chosenWhy 에 소스를 어떻게 썼는지 한 줄 넣어라.",
  ].join("\n");
}

function ownBlocks(own) {
  const out = [];
  (Array.isArray(own) ? own : []).slice(0, 3).forEach((o, i) => {
    for (const f of (o.frames || []).slice(0, 10)) {
      out.push({ type: "text", text: `소스 ${i + 1} · ${f.at ?? "?"}초` });
      out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
    }
  });
  return out;
}

/**
 * 채팅으로 고치기 (9/29 세원: "내가 채팅으로 제안할 수도 있게. AI 가 알아듣고 세부적인 부분 변경").
 * 만든 기획(훅·대본·촬영 순서·본문) + 지금까지 대화 + 새 요청 → 고친 기획 + 무엇을 바꿨는지 한두 줄.
 * 사진은 다시 안 보낸다(글만). 기획 전체를 다시 돌려받아서 한 번에 약 100원 안팎.
 */
const ReviseSchema = z.object({
  reply: z.string().describe("무엇을 어떻게 바꿨는지 한두 줄, 존댓말. 요청이 애매하면 어떻게 해석했는지도"),
  hook: z.string().describe("고친 훅 (안 바꿀 거면 원래 그대로)"),
  script: z.string().describe("고친 대본 전체 (안 바꾼 줄은 그대로)"),
  scenes: z
    .array(
      z.object({
        at: z.string(),
        look: z.number(),
        shot: z.string(),
        text: z.string(),
      }),
    )
    .describe("고친 촬영 순서 전체 (안 바꾼 장면은 그대로)"),
  caption: z.string().describe("고친 본문 (안 바꿀 거면 그대로)"),
  hashtags: z.array(z.string()).describe("해시태그 (안 바꿀 거면 그대로)"),
});

const REVISE_PROMPT = `너는 여성 의류 쇼핑몰 **포클로**의 릴스 기획자다. 아래는 이미 만든 우리 릴스 기획이고,
운영자(세원)가 채팅으로 고쳐 달라고 한다. **요청한 부분만** 고치고 나머지는 글자 하나 바꾸지 말고 그대로 돌려줘라.
- 대본을 고치면 촬영 순서의 자막(text)도 맞춰 고친다. 장면을 더하거나 빼 달라면 시점(at)을 다시 매긴다.
- 상품 글에 없는 소재·기능·가격을 지어내지 않는다. 과장 광고 문구 금지.
- 자막 말투는 원래 대본 말투를 따른다(요청이 말투를 바꾸라는 게 아니면).
- reply 에 무엇을 바꿨는지 짧게. 요청이 불가능하거나 상품 정보에 없으면 그렇다고 말하고 가장 가까운 대안으로.`;

const PRODUCT_REEL_PROMPT = `너는 여성 의류 쇼핑몰 **포클로**의 릴스 기획자다.
이번엔 **상품이 먼저 정해졌다.** 아래 레퍼런스 후보(우리 라이브러리에 모아 둔, 잘 된 릴스 분석) 중에서
**이 상품에 가장 맞는 레퍼런스 하나**를 골라(chosen), **그 레퍼런스의 대본을 바탕으로 깔고** 우리 상품에 맞게 바꿔 기획해라(아래 '대본 만드는 법').

고르는 기준: 상품의 강점(핏·소재·코디 활용·가격)과 레퍼런스의 훅 방식·전개가 맞는지, 레퍼런스 성과가 좋은지,
판매 숫자(잘 팔림/뜨는 중)에 맞는 각도인지. 제목 앞에 **★BEST** 가 붙은 후보는 우리가 직접 "우리한테 맞고 좋다"고 고른 것 —
비슷하게 맞으면 BEST 를 먼저 골라라(억지로 안 맞는 BEST 를 고르지는 말 것). 후보에 빈칸 틀(template/slots)이 있으면 그 빈칸을 전부 채워라(filled).
후보가 없으면 chosen 은 빈 문자열로 두고 일반적으로 잘 되는 판매형 릴스 구조로 기획해라.
상품 사진(사진 1…)을 보고 어떤 컷처럼 찍을지 shots 에 적어라.

**룩이 여러 개면** 룩 순서가 대본 순서다. 룩마다 한 가지씩만 보여주고, 한 룩의 여러 상품은 같이 입은 코디로 다뤄라.
**메모는 세원이 준 지시다.** 훅 아이디어가 있으면 최우선으로 살려라.

**포클로 톤** — 20~30대 여성이 친구에게 말하듯. 과장 광고 문구 금지. 자막 한 줄 12~18자.
가격·소재는 상품 글에 있는 것만. 결과는 전부 **한국어**.`;

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

// ------------------------------------------------------------------ 핸들러

const fail = (res, code, error, message) => res.status(code).json({ error, message });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Claude 한 번 부르기 — 스트리밍으로 받아 끝난 메시지의 parsed_output 을 돌려준다.
 * 과부하(529)·한도(429)·잠깐 끊김(5xx)은 한 번만 쉬었다가 다시 부른다.
 */
async function ask(client, content, schema, effort = "high") {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 32000,
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
  return { ...r.parsed_output, _cost: costOf(r.usage) };
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

/**
 * 상품 주소들을 읽는다. looks: [{products:[{url}]}] (룩 단위) 또는 url 하나.
 * 세원 9/23: "룩 3개를 소개해주는 릴스라면 상품 주소를 다양하게 넣어야" → 룩으로 묶어서 받는다.
 */
async function readLooks(body) {
  const looks = Array.isArray(body.looks) && body.looks.length
    ? body.looks
    : [{ products: [{ url: body.url }] }];
  const flat = [];
  for (const [i, look] of looks.entries()) {
    for (const p of look.products || []) {
      const url = String(p?.url || "").trim();
      if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error("상품 주소(https://...)를 넣어주세요."), { userFacing: 400 });
      if (flat.length < 8) flat.push({ url, look: i + 1 });
    }
  }
  if (!flat.length) throw Object.assign(new Error("상품 주소(https://...)를 넣어주세요."), { userFacing: 400 });
  const read = await Promise.all(flat.map((f) => readProduct(f.url)));
  read.forEach((r, i) => Object.assign(flat[i], r));
  return { products: flat, count: looks.length };
}

/** 읽은 상품들을 룩 단위 글로 */
function looksText(products, count) {
  const many = count > 1 || products.length > 1;
  const lines = [];
  for (let n = 1; n <= count; n++) {
    const inLook = products.filter((p) => p.look === n);
    if (!inLook.length) continue;
    if (many) lines.push(`\n[룩 ${n}] ${inLook.map((p) => p.title).join(" + ")}`);
    for (const p of inLook) {
      lines.push(
        [
          `상품: ${p.title}`,
          `  주소: ${p.url}`,
          `  요약설명: ${p.summary}`,
          `  판매가: ${p.price}${p.listPrice ? ` (정가 ${p.listPrice})` : ""}`,
          `  상세:\n${(p.text || "").slice(0, many ? 2200 : 9000)}`,
        ].join("\n"),
      );
    }
  }
  return lines.join("\n");
}

/** 상품 사진을 '룩 K · 사진 N' 으로 붙인다 (합쳐 12장까지) */
function photoBlocks(products) {
  const per = Math.max(2, Math.floor(12 / products.length));
  const out = [];
  const urls = [];
  products.forEach((p) => {
    (p.images || []).slice(0, per).forEach((u) => {
      urls.push(u);
      out.push({ type: "text", text: `${p.title} · 사진 ${urls.length}` });
      out.push({ type: "image", source: { type: "url", url: u } });
    });
  });
  return { blocks: out, urls };
}

/** 다시 만들기 — 앞에 나온 것을 피하고 다른 방향으로 (세원 9/23: "대본을 아예 갈아엎을 수 있게") */
function redoText(body) {
  if (!body.avoid && !body.direction) return "";
  return [
    "\n--- 다시 만들기 ---",
    body.avoid ? `앞서 만든 것(이것과 똑같이 만들지 마라):\n${String(body.avoid).slice(0, 2000)}` : "",
    "레퍼런스 대본 바탕(줄·순서·말투)은 그대로 두고, **바꿔 넣는 말**(상품을 설명하는 표현·강조하는 점·소구점)을 앞서 만든 것과 다르게 골라라.",
    body.direction ? `이번엔 이렇게: ${String(body.direction).slice(0, 500)} (방향이 '새로 써'·'다른 레퍼런스' 처럼 바탕을 벗어나라는 뜻이면 그걸 따른다)` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  // 사무실 PC 분석기는 빠르게(medium) 부른다 — high 는 생각이 길어 1분을 넘겼다 (9/22 세원 "10분째야")
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "high";
  const client = new Anthropic();

  try {
    if (body.mode === "script") {
      const frames = Array.isArray(body.frames) ? body.frames.slice(0, 32) : [];
      if (!frames.length) return fail(res, 400, "bad_request", "영상에서 장면을 못 떴어요.");

      const content = [...frameContent(frames), ...stripContent(body)];
      const extra = [
        denseText(body),
        body.kind ? `영상 형태: ${body.kind}` : "",
        transcriptText(body),
        metaText(body.meta),
        body.memo ? `메모: ${String(body.memo).slice(0, 1000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      content.push({ type: "text", text: SCRIPT_PROMPT + (extra ? "\n\n---\n" + extra : "") });

      const r = await ask(client, content, ScriptSchema, effort);
      return res.status(200).json(parsedOf(r, "대본 뽑기"));
    }

    if (body.mode === "restructure") {
      const script = String(body.script || "").slice(0, 8000);
      if (!script.trim()) return fail(res, 400, "bad_request", "대본이 비어 있어요.");
      const ref = body.reference || {};
      const extra = [
        `바로잡은 대본(정답):\n${script}`,
        `예전 분석의 장면 흐름(시점·화면 설명은 맞다):\n${(ref.scenes || []).slice(0, 40).map((x) => `- ${x.at}: ${x.visual}`).join("\n")}`,
        ref.kind ? `영상 형태: ${ref.kind}` : "",
        ref.seconds ? `길이: ${ref.seconds}초` : "",
        ref.captionStyle ? `예전 분석의 자막 모양: ${ref.captionStyle}` : "",
        metaText(body.meta),
      ]
        .filter(Boolean)
        .join("\n\n");
      const r = await ask(client, [{ type: "text", text: RESTRUCTURE_PROMPT + "\n\n---\n" + extra }], RestructureSchema, effort);
      // 대본·장면·성과·자막 모양은 앱이 가진 그대로 두고 이것만 바꾼다
      return res.status(200).json(parsedOf(r, "구조 다시 짜기"));
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
      const r = await ask(client, content, ReviewSchema, effort);
      return res.status(200).json(parsedOf(r, "피드백"));
    }

    if (body.mode === "revise") {
      const plan = body.plan || {};
      const history = (Array.isArray(body.history) ? body.history : []).slice(-10);
      const ask1 = String(body.message || "").trim().slice(0, 1500);
      if (!ask1) return fail(res, 400, "bad_request", "무엇을 고칠지 적어 주세요.");
      const text = [
        REVISE_PROMPT,
        "\n--- 지금 기획 ---",
        plan.product ? `상품: ${plan.product}` : "",
        `훅: ${plan.hook || ""}`,
        `대본:\n${plan.script || ""}`,
        `촬영 순서:\n${(plan.scenes || []).map((x) => `- [${x.at}] (룩 ${x.look || 0}) ${x.shot} / 자막: ${x.text || ""}`).join("\n")}`,
        `본문:\n${plan.caption || ""}`,
        `해시태그: ${(plan.hashtags || []).join(" ")}`,
        trendText(body),
        STUDIO_TEXT,
        history.length ? `\n--- 앞서 나눈 대화 ---\n${history.map((h) => `${h.role === "me" ? "세원" : "AI"}: ${h.text}`).join("\n")}` : "",
        `\n--- 이번 요청 ---\n${ask1}`,
      ].join("\n");
      const r = await ask(client, [{ type: "text", text }], ReviseSchema, "low"); // 9/29 시험 medium 125원 → 생각을 줄여 아낀다
      return res.status(200).json(parsedOf(r, "고친 기획"));
    }

    if (body.mode === "product") {
      let got;
      try {
        got = await readLooks(body);
      } catch (err) {
        if (err.userFacing === 400) return fail(res, 400, "bad_request", err.message);
        return fail(res, 422, "product_unreadable", err.message || "상품 페이지를 못 읽었어요.");
      }
      const { products, count } = got;
      const photos = photoBlocks(products);
      const cands = Array.isArray(body.candidates) ? body.candidates.slice(0, 12) : [];
      const st = body.stats || {};
      const mix = body.mix && typeof body.mix === "object" ? body.mix : null;
      const text = [
        PRODUCT_REEL_PROMPT,
        BASE_TEXT,
        mix ? mixText(mix) : "\n--- 레퍼런스 후보 ---",
        mix ? "" : cands.length
          ? cands
              .map((c) =>
                [
                  `[${c.id}] ${c.title}`,
                  `  훅: ${c.hook || ""} (${c.hookType || ""})`,
                  `  구조: ${c.flow || ""} · CTA: ${c.cta || ""}`,
                  `  먹히는 이유: ${c.why || ""}`,
                  c.performance ? `  성과: ${c.performance}` : "",
                  c.template ? `  빈칸 틀:\n${String(c.template).split("\n").map((l) => "    " + l).join("\n")}` : "",
                  c.slots?.length ? `  빈칸: ${c.slots.map((x) => `${x.key}(${x.hint}; 원래 "${x.original}")`).join(" / ")}` : "",
                  c.script ? `  대본:\n${String(c.script).slice(0, 1600)}` : "",
                ]
                  .filter(Boolean)
                  .join("\n"),
              )
              .join("\n\n")
          : mix ? "" : "(없음)",
        count > 1 ? `\n--- 우리 상품 (룩 ${count}개) ---` : "\n--- 우리 상품 ---",
        looksText(products, count),
        st.reason ? `판매 숫자: ${st.reason}` : "",
        body.memo ? `\n--- 메모 (세원 지시) ---\n${String(body.memo).slice(0, 1500)}` : "",
        trendText(body),
        STUDIO_TEXT,
        redoText(body),
      ].join("\n");
      const imgs = photos.urls;
      const own = ownBlocks(mix?.own);
      const content = (use) => [{ type: "text", text }, ...own, ...(use ? photos.blocks : [])];
      let r;
      try {
        r = await ask(client, content(true), ProductReelSchema, effort);
      } catch (err) {
        if (err?.status === 400 && /image|url|fetch/i.test(String(err?.message))) r = await ask(client, content(false), ProductReelSchema, effort);
        else throw err;
      }
      return res.status(200).json({
        ...withBase(parsedOf(r, "릴스 기획")),
        productTitle: products[0].title,
        productTitles: products.map((p) => p.title),
        images: imgs,
      });
    }

    if (body.mode === "adapt") {
      let got;
      try {
        got = await readLooks(body);
      } catch (err) {
        if (err.userFacing === 400) return fail(res, 400, "bad_request", err.message);
        return fail(res, 422, "product_unreadable", err.message || "상품 페이지를 못 읽었어요.");
      }
      const { products, count } = got;
      if (products.every((p) => (p.text || "").length < 80)) {
        return fail(res, 422, "product_empty", "상품 페이지에서 글을 거의 못 찾았어요. 상세가 이미지뿐이면 상품 설명을 메모에 적어주세요.");
      }
      const photos = photoBlocks(products);

      const ref = body.reference || {};
      const text = [
        ADAPT_PROMPT,
        BASE_TEXT,
        "\n--- 레퍼런스 릴스 ---",
        `제목: ${ref.title || ""}`,
        `훅: ${ref.hook || ""}`,
        `구조: ${ref.structure?.flow || ""} (훅 방식: ${ref.structure?.hookType || ""}, CTA: ${ref.structure?.cta || ""})`,
        `대본:\n${ref.script || ""}`,
        ref.template ? `빈칸 틀:\n${ref.template}` : "",
        ref.slots?.length
          ? `빈칸 목록:\n${ref.slots.map((s) => `- ${s.key}: ${s.hint} (레퍼런스에선 "${s.original}")`).join("\n")}`
          : "",
        count > 1 ? `\n--- 우리 상품 판매페이지 (룩 ${count}개) ---` : "\n--- 우리 상품 판매페이지 ---",
        looksText(products, count),
        body.memo ? `\n--- 메모 (세원 지시) ---\n${String(body.memo).slice(0, 1500)}` : "",
        trendText(body),
        STUDIO_TEXT,
        redoText(body),
      ].join("\n");

      const content = (use) => [{ type: "text", text }, ...(use ? photos.blocks : [])];
      let r;
      try {
        r = await ask(client, content(true), AdaptSchema, effort);
      } catch (err) {
        if (err?.status === 400 && /image|url|fetch/i.test(String(err?.message))) r = await ask(client, content(false), AdaptSchema, effort);
        else throw err;
      }
      return res.status(200).json({
        ...withBase(parsedOf(r, "대본 만들기")),
        productTitles: products.map((p) => p.title),
        images: photos.urls,
      });
    }

    return fail(res, 400, "bad_request", "mode 는 script · adapt · product · review 중 하나여야 합니다.");
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
