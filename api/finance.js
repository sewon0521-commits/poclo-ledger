// 재무 비서 — 규칙으로 분류하고 남은 곳만 Claude 에게 묻는다 (세원 10/15 "규칙 + 남는 것만 Claude", 버튼을 눌렀을 때만).
// 받는 것: 곳 이름·적요·업종·입출금·건수·합계뿐. 계좌·카드번호는 앱이 끝 4자리만 갖고 있고 여기로 보내지도 않는다.
// ANTHROPIC_API_KEY 는 이 함수의 환경변수로만 존재한다.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { costOf } from "./_cost.js";

export const config = { maxDuration: 120 };

const MODEL = "claude-opus-5-5";
// 앱(src/lib/finance.js CATS)과 같은 이름
const CATS = ["매출 입금", "기타 수입", "상품 매입", "광고비", "택배·물류", "인건비·외주", "구독·프로그램", "수수료·세무", "임차·관리비", "통신비", "소모품·사무", "식대·복리후생", "교통·차량", "세금·공과", "이자·금융비용", "기타 경비", "카드 대금", "내 계좌 이동", "대출 원금", "대표·개인"];
const MAX_ITEMS = 150;

const Schema = z.object({
  items: z.array(
    z.object({
      i: z.number().int().describe("받은 줄 번호"),
      cat: z.enum(CATS),
      sure: z.enum(["high", "mid", "low"]).describe("이름만으로 확실하면 high, 짐작이면 low"),
      why: z.string().describe("왜 이 분류인지 20자 안쪽"),
    }),
  ),
});

const PROMPT = `너는 여성 의류 쇼핑몰 '포클로'(ppoclo.kr, 카페24 자사몰, 동대문 도매 사입, 메타 광고, 넥스트팩 3PL)의 통장·카드 내역을 나누는 사람이다.
규칙으로 못 나눈 곳만 받았다. 곳마다 분류를 하나씩 고른다. 사람이 나중에 확인하고 고친다.

분류 뜻
- 매출 입금: 결제대행 정산·고객 입금 / 기타 수입: 이자·환급 등
- 상품 매입: 옷 도매 거래처에 보낸 돈 / 광고비 / 택배·물류 / 인건비·외주(모델·파트타이머·대행) / 구독·프로그램
- 수수료·세무 / 임차·관리비 / 통신비 / 소모품·사무 / 식대·복리후생 / 교통·차량 / 세금·공과 / 이자·금융비용 / 기타 경비
- 손익에서 빼는 것: 카드 대금 · 내 계좌 이동 · 대출 원금 · 대표·개인(사업과 무관해 보이는 쓰임)

지킬 것
1. 이름에 없는 사실을 지어내지 말 것. 사람 이름만 있으면 무엇인지 모른다 — 입금이면 '매출 입금'(고객 무통장 입금일 수 있음), 출금이면 '기타 경비'로 두고 sure 는 low.
2. 쿠팡·네이버페이 같은 결제 중개는 무엇을 샀는지 이름에 없으면 '소모품·사무' 또는 '기타 경비', sure 는 low.
3. 받은 줄마다 정확히 한 줄씩, i 는 받은 번호 그대로.`;

const fail = (res, code, error, message) => res.status(code).json({ error, message });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s, n) => String(s ?? "").replace(/\d[\d-]{8,}\d/g, "****").slice(0, n);

async function ask(client, text) {
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: zodOutputFormat(Schema) },
        messages: [{ role: "user", content: text }],
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "method", "POST만 받습니다.");
  }
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return fail(res, 503, "not_configured", "Claude 분류가 아직 켜져 있지 않아요.");
  if (!/^sk-ant-[\x21-\x7e]+$/.test(key)) return fail(res, 503, "bad_key", "API 키 형태가 이상해요. ANTHROPIC_API_KEY를 확인해 주세요.");

  const body = req.body || {};
  if (body.mode !== "classify") return fail(res, 400, "bad_request", "mode 는 classify 만 받아요.");
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS);
  if (!items.length) return fail(res, 400, "bad_request", "물어볼 곳이 없어요.");

  const lines = items.map((x, i) =>
    [i, x.s === "card" ? "카드" : "통장", x.io === "입금" ? "입금" : "출금", safe(x.name, 40), safe(x.sub, 24), `${Number(x.n) || 1}건`, `${Math.round(Number(x.total) || 0)}원`].join(" | "),
  );
  try {
    const client = new Anthropic();
    const r = await ask(client, `${PROMPT}\n\n번호 | 어디 | 입출금 | 이름 | 적요·업종 | 건수 | 합계\n${lines.join("\n")}`);
    if (r.stop_reason === "refusal") return fail(res, 422, "refusal", "이 내역은 분류하지 못했어요. 직접 골라 주세요.");
    if (!r.parsed_output) return fail(res, 422, "unreadable", "답이 잘렸어요. 다시 눌러 주세요.");
    return res.status(200).json({ items: r.parsed_output.items.filter((x) => x.i >= 0 && x.i < items.length), _cost: costOf(r.usage) });
  } catch (err) {
    const status = err?.status;
    const msg = String(err?.message || "");
    if (status === 400 && /credit|balance/i.test(msg)) return fail(res, 402, "no_credit", "API 잔액이 부족해요.");
    if (status === 401 || /authentication|x-api-key/i.test(msg)) return fail(res, 503, "bad_key", "Claude API 키가 막혔어요(잘못된 키). 새 키를 Vercel 의 ANTHROPIC_API_KEY 에 넣고 다시 배포해야 해요.");
    console.error(err);
    const why =
      status === 429 ? "요청이 몰려 한도에 걸렸어요. 1분 뒤 다시 해 주세요."
      : status === 529 || /overloaded/i.test(msg) ? "Claude 서버가 붐벼요. 잠시 뒤 다시 해 주세요."
      : status === 400 ? `요청 형식 문제예요: ${msg.slice(0, 160)}`
      : `잠시 뒤 다시 시도해 주세요. (${status || "연결"} ${msg.slice(0, 120)})`;
    return fail(res, 502, "upstream", why);
  }
}
