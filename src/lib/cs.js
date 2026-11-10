// CS 관리 (10/13 세원: 온라인테크트리 'CS 자동화' 영상·PDF — "포클로 일 칸에 CS 관리를 할 수 있는 칸. 너가 더 잘하니까 맡길게")
//
// 영상의 구조 그대로: 여러 채널 문의를 한 화면에 모으고 → 채널·유형으로 나누고 → 답변 초안을 미리 써 두고 → 사람이 확인해서 보낸다.
// "내 확인 없이 먼저 보내지 마라" — 보내기는 늘 사람이 '확인했어요'를 체크한 다음.
//
// 채널
//   카페24 상품 Q&A(게시판 6) · 1:1 맞춤상담(게시판 9) — 사무실 PC(poclo-cafe24/cs_worker.py)가 10분마다 모으고, '보내기'를 누르면 PC 가 답글을 단다.
//     카페24 앱에 게시판 권한(mall.read_community · mall.write_community)이 있어야 한다 — 없으면 화면에 하는 법이 뜬다.
//   카카오톡 채널 · 네이버 톡톡 · 인스타 DM · 전화 — 공식으로 글을 읽어 올 길이 없어서(채팅 API 없음) '문의 붙여넣기'(글 또는 캡처)로 넣고,
//     초안을 복사해 그 채팅창에 붙인다. 채팅창 자동 조작(매크로)은 하지 않는다 — 계정 제한 위험.
//
// 저장 (settings)
//   cs_inbox     {items:[문의]}            — 처리 끝난 지 7일 넘은 것은 cs_done_YYYYMM 으로 옮긴다(가볍게)
//   cs_templates {greeting, closing, tone, policy, items:[{id,type,title,rules,body}]}
//   cs_queue     {items:[{id, kind:"send"|"collect"|"lookup", at}]}  — 사무실 PC 일감
//   cs_worker    {at, host, inboxAt, collectAt, channels:{cafe24:{ok, msg, at, n}}}  — PC 가 적는다
//
// 문의 { id, channel, ext:{board, article, url, member}, customer, title, message, images:[보관 키],
//        product:{no,name,url}, order:{orders:[…]}, at(문의 시각), createdAt,
//        type, summary, caution, check[], blanks:[{key,hint}], fills:{key:값}, draft, basis(확인 근거·메모), confirmed,
//        status, final(보낸 글), sentAt, doneAt, error, cost(원) }

// ⭐ 11/10 세원 "반자동으로 — 고객 문의 → 너가 답변 만들어 놓고 → 내가 확인·수정 → 버튼 하나 누르면 쫙 보내게. 네이버페이·카카오도" · "카톡도 어사이드로 해"
//   via: 'cafe24' = 사무실 PC 가 카페24 API 로 읽고 답글 / 'aside' = 사무실 PC 가 세원이 로그인해 둔 어사이드 브라우저로 읽고 보냄 / 'paste' = 붙여넣고 복사
//   보내기는 늘 세원이 '보낼 준비'의 [한꺼번에 보내기]를 누를 때만. 사람 흉내(무작위 지연 등)는 쓰지 않는다.
//   PC 는 cs_worker.channels[k] = {ok, msg, at} 로 그 채널이 지금 되는지(로그인·권한) 적는다.
export const CHANNELS = [
  { k: "cafe24_qna", label: "카페24 상품 Q&A", short: "Q&A", auto: true, via: "cafe24", pc: "cafe24", tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  { k: "cafe24_consult", label: "카페24 1:1 상담", short: "1:1 상담", auto: true, via: "cafe24", pc: "cafe24", tone: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  { k: "npay", label: "네이버페이 주문형 문의", short: "N페이", via: "aside", pc: "npay", tone: "bg-green-50 text-green-800 ring-green-200" },
  // 11/10 세원 "카카오는 혹시 모르니까 카카오만 버튼 안 눌리게" — 카톡은 보내기 없음(초안 복사해서 세원이 채널 채팅창에 직접). 읽기만 어사이드
  { k: "kakao", label: "카카오톡 채널", short: "카톡", via: "aside", pc: "kakao", noSend: true, tone: "bg-yellow-50 text-yellow-900 ring-yellow-200" },
  { k: "naver", label: "네이버 톡톡", short: "톡톡", via: "aside", pc: "talk", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { k: "insta", label: "인스타 DM", short: "인스타", via: "paste", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
  { k: "phone", label: "전화·문자", short: "전화", via: "paste", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
  { k: "etc", label: "기타", short: "기타", via: "paste", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
];
export const channelOf = (k) => CHANNELS.find((c) => c.k === k) || CHANNELS[CHANNELS.length - 1];
export const isAuto = (k) => !!channelOf(k).auto;
/** 사무실 PC 가 보내 주는 채널인가 (카페24 API 또는 어사이드) */
export const canSend = (k) => ["cafe24", "aside"].includes(channelOf(k).via) && !channelOf(k).noSend;
/** PC 가 적은 채널 상태 {ok, msg, at} — 없으면 null */
export const pcState = (worker, k) => (worker?.channels || {})[channelOf(k).pc] || null;
/** PC 채널 상태 칸 — 화면 위 */
export const PC_CHANNELS = [
  ["cafe24", "카페24 게시판"],
  ["npay", "네이버페이"],
  ["kakao", "카톡 채널 (읽기만)"],
  ["talk", "톡톡"],
];

// 서버(api/cs.js TYPES)와 같은 이름·순서
export const TYPES = ["배송", "교환", "반품·환불", "교환·반품 배송비", "사이즈", "재입고·입고", "불량·오배송", "주문 변경·취소", "할인·쿠폰", "상품 문의", "기타"];

// 상태 — 답할 문의(new·ready·error) / 보낼 준비(approved·sending) / 처리 완료(sent·done)
export const STATUS = {
  new: { label: "초안 없음", tone: "bg-stone-100 text-stone-600" },
  drafting: { label: "초안 쓰는 중", tone: "bg-stone-100 text-stone-600" },
  ready: { label: "초안 준비", tone: "bg-rose-50 text-rose-700" },
  error: { label: "다시 해 주세요", tone: "bg-amber-50 text-amber-800" },
  approved: { label: "보낼 준비", tone: "bg-sky-50 text-sky-800" },
  sending: { label: "보내는 중", tone: "bg-sky-50 text-sky-800" },
  sent: { label: "보냄", tone: "bg-emerald-50 text-emerald-800" },
  done: { label: "처리 완료", tone: "bg-emerald-50 text-emerald-800" },
};
export const TABS = [
  ["todo", "답할 문의", ["new", "drafting", "ready", "error"]],
  ["approved", "보낼 준비", ["approved", "sending"]],
  ["done", "처리 완료", ["sent", "done"]],
  ["all", "전체", null],
];
export const inTab = (x, tab) => {
  const t = TABS.find(([k]) => k === tab);
  return !t || !t[2] || t[2].includes(x.status || "new");
};

/** 초안 + 빈칸에 적은 값 → 보낼 글 */
export function finalText(x) {
  let s = String(x?.draft || "");
  for (const [k, v] of Object.entries(x?.fills || {})) if (String(v || "").trim()) s = s.split(k).join(String(v).trim());
  return s;
}
/** 아직 안 채운 빈칸 */
export const openBlanks = (x) => (x?.blanks || []).filter((b) => finalText(x).includes(b.key));

/** 처리 끝난 지 7일 넘은 것 — 달마다 따로 모아 둔다(목록을 가볍게) */
export const ARCHIVE_DAYS = 7;
export const archiveKey = (iso) => `cs_done_${String(iso || "").slice(0, 7).replace("-", "")}`;
export function staleDone(items, now = Date.now()) {
  return (items || []).filter((x) => ["sent", "done"].includes(x.status) && now - new Date(x.doneAt || x.sentAt || x.createdAt || 0).getTime() > ARCHIVE_DAYS * 86400000);
}

/** 상품 번호·주소 → 우리 상품 주소 */
export function productUrl(v) {
  const s = String(v || "").trim();
  if (/^\d{1,6}$/.test(s)) return `https://ppoclo.kr/product/detail.html?product_no=${s}`;
  const m = s.match(/ppoclo\.(?:kr|cafe24\.com)\/(?:surl\/P\/(\d+)|product\/[^/]+\/(\d+))/) || s.match(/product_no=(\d+)/);
  if (m) return `https://ppoclo.kr/product/detail.html?product_no=${m[1] || m[2] || m[3]}`;
  return /^https?:\/\//.test(s) ? s : "";
}

// ------------------------------------------------------------------ 기본 답변 틀
// 사실은 쇼핑몰 '이용안내'(10/13 ppoclo.kr/shopinfo/guide.html)에 적힌 것만 넣었다. 모르는 금액·날짜는 [빈칸] — 세원이 '답변 틀'에서 채운다.

// 11/10 CS 지침서 — 쇼필공 단톡 사례(버킨: 업무 기준·예외를 AI 가 읽는 md 지침서로)를 따라 만든 첫 판. AI 가 초안 쓸 때 맨 먼저 읽고, 세원이 '답변 틀 › CS 지침서'에서 고친다.
export const DEFAULT_GUIDE = `# 포클로 CS 지침서
AI가 답변 초안을 쓸 때 맨 먼저 읽어요. 세원이 고치면 다음 초안부터 바뀌어요.

## 말투
- 부드러운 존댓말(~요), 두세 줄씩 끊기. 이모지는 맺음에 🤍 하나 정도. 🙏 는 쓰지 않아요.
- 과한 사과·변명은 빼고, 고객 불편은 먼저 받아 줘요("기다리게 해 드려 죄송해요" 한 줄이면 충분).
- 고객이 자세히 알려 주면 "꼼꼼하게 알려주셔서 감사합니다 ☺️"처럼 짧게.

## 사실은 확인된 것만
- 주문 상태·송장·출고일 = 같이 온 주문 정보에 있을 때만. 없으면 [주문 상태 확인]·[송장번호] 빈칸.
- 재고 = 같이 온 재고(넥스트팩 창고 + 사무실 렉)로만. 있으면 "바로 출고 가능해요", 수량은 말하지 않아요. 모르면 [재고 확인].
- 입고일 = 확정된 날만. 거래처 예정일이면 "○일 입고 예정"(약속처럼 쓰지 않기). 모르면 [입고 예정일].
- 금액·혜택 = 쇼핑몰 규정에 적힌 것만. 교환·반품 배송비는 [교환·반품 배송비] 빈칸.

## 경우별 기준
- 배송 지연: 결제 다음 날부터 주말 빼고 3일 넘게 출고가 안 됐으면 지연 안내 — 사과 한 줄 → 입고·출고 예정 → "들어오는 대로 가장 먼저 검수해서 보내 드릴게요" + 출고되면 송장 안내.
  **취소를 먼저 권하지 않아요**(세원 11/10 — 손님을 붙잡게). 손님이 먼저 취소를 원하실 때만 바로 도와드려요.
- 미송(거래처 입고 대기): 들어오는 대로 검수해 바로 출고, 출고되면 송장 문자로 안내.
- 하자(불량): 사과 → 불량 부분·택이 보이게 사진 부탁 → 확인되면 왕복 배송비 저희 부담으로 교환·반품.
- 오배송: 사과 → 받으신 상품 사진 부탁 → 맞는 상품을 저희 부담으로 보내고 잘못 간 상품은 회수.
- 품절: 사과 → 재입고는 확정일 때만 날짜, 아니면 약속하지 않기 → 비슷한 상품이 있으면 짧은 링크.
- 교환·반품(단순 변심): 받은 날부터 7일 안, 왕복 배송비 고객 부담, 착용·세탁 흔적이 있으면 어려움.
- 주문 취소·옵션 변경: 출고 전이면 바로 해 드림, 출고됐으면 받으신 뒤 교환·반품으로.
- 사이즈: 상품 페이지 실측 + 모델 정보로. "체형에 따라 개인차가 있을 수 있어요" 꼭.

## 자주 쓰는 것
- 상품 짧은 링크: https://ppoclo.kr/surl/P/상품번호
- 가입 혜택: 회원가입하고 쿠폰팩 받아 가세요 (3만 원 이상 3,000원 · 5만 원 이상 3,000원 · 7만 원 이상 4,000원) · 쿠폰은 주문당 한 장
`;

export const DEFAULT_TEMPLATES = {
  guide: DEFAULT_GUIDE,
  greeting: "안녕하세요 고객님 :) 포클로입니다 🤍",
  closing: "더 궁금하신 점 있으시면 편하게 말씀 주세요. 감사합니다 🤍",
  tone: "부드러운 존댓말(~요). 짧은 문단으로 끊고, 이모지는 맺음에 하나 정도. 과한 사과·변명은 빼고, 고객 불편은 먼저 받아 준다.",
  policy: [
    "배송: 택배 · 주문 금액 70,000원 미만이면 배송비 3,000원(70,000원 이상 무료) · 제주·도서산간 추가 5,000원",
    "출고: 주문(입금 확인) 후 평균 1~3일 이내 출고, 최대 7일 이내 배송 완료. 상품 입고 상황·택배사 사정에 따라 늦어질 수 있음",
    "교환·반품: 상품 받은 날부터 7일 이내 신청. 단순 변심(색상·사이즈 교환 포함)은 반송 비용 고객 부담 — 금액: [교환·반품 배송비]",
    "불량·오배송: 저희가 배송비를 부담해 교환·반품. 사진 확인 후 처리",
    "교환·반품 주소: 경기 파주시 와동동 1469-1 프라임타워 802호 (10896)",
    "반품·교환 불가: 착용 흔적·세탁·훼손으로 가치가 떨어진 경우, 시간이 지나 다시 팔 수 없는 경우",
    "환불: 반품 상품 확인 후 3영업일 이내 환불. 카드 결제는 승인 취소(카드사 사정으로 다음 달 청구 후 환급될 수 있음)",
    "적립금: 배송 완료 후 20일 뒤 사용 가능 · 1,000원부터 · 한 번에 최대 3,000원",
    "회원가입 쿠폰팩(10/19부터): 3만 원 이상 3,000원(7일) · 5만 원 이상 3,000원(30일) · 7만 원 이상 4,000원(30일). 쿠폰은 주문당 한 장",
    "모델: 상품마다 달라요 — 상품 페이지의 모델 정보(키·착용 사이즈)로 답하기",
    "고객센터: 070-4045-1169 · 평일 10:00~17:00 (점심 12~13시, 주말·공휴일 휴무)",
  ].join("\n"),
  items: [
    {
      id: "t_ship",
      type: "배송",
      title: "배송 언제 와요?",
      rules: "1. 기다리게 해서 죄송한 마음 한 줄\n2. 주문 정보가 있으면 지금 상태(출고 전/배송 중·송장) — 없으면 [입고 예정일]·[송장번호] 빈칸\n3. 출고되면 송장 문자로 안내드린다는 마무리",
      body: "안녕하세요 고객님 :) 포클로입니다 🤍\n우선 기다리게 해드려 죄송합니다.\n\n현재 고객님 주문 상품은 [입고 예정일] 입고 예정이에요.\n입고되는 대로 꼼꼼히 검수해서 바로 출고해 드리고, 출고되면 송장번호를 문자로 안내드릴게요.\n\n감사합니다 🤍",
    },
    {
      id: "t_exchange",
      type: "교환",
      title: "사이즈·색상 교환",
      rules: "1. 교환 가능 기간(받은 날부터 7일) 안인지\n2. 단순 변심 교환은 왕복 배송비 고객 부담 — 금액은 [교환·반품 배송비]\n3. 교환 신청 방법: [교환 신청 방법]\n4. 바꿀 옵션 재고가 있는지 [재고 확인] — 모르면 빈칸",
      body: "",
    },
    {
      id: "t_return",
      type: "반품·환불",
      title: "반품하고 환불받고 싶어요",
      rules: "1. 반품 가능 기간(받은 날부터 7일)\n2. 단순 변심이면 반송 배송비 고객 부담 [교환·반품 배송비]\n3. 반품 신청 방법 [반품 신청 방법]\n4. 반품 상품 확인 후 3영업일 이내 환불, 카드는 승인 취소",
      body: "",
    },
    {
      id: "t_fee",
      type: "교환·반품 배송비",
      title: "교환비를 왜 제가 내나요?",
      rules: "이 순서로 답할 것\n1. 고객님 마음 먼저 받아 주기(번거로우셨겠다는 공감 한 줄)\n2. 단순 변심 교환·반품은 왕복 배송비가 생긴다는 규정 안내\n3. 단, 오배송·불량이면 저희가 전액 부담한다는 안내\n4. 상품 사진 한 장만 보내 주시면 바로 확인해 드린다는 마무리",
      body: "",
    },
    {
      id: "t_size",
      type: "사이즈",
      title: "사이즈 추천",
      rules: "1. 상품 페이지 실측으로 답하기(실측 없으면 빈칸)\n2. 상품 페이지의 모델 정보(키·착용 사이즈)와 비교(없으면 빈칸)\n3. 고객이 키·몸무게·평소 사이즈를 말했으면 추천 사이즈 제안\n4. '체형에 따라 개인차가 있을 수 있어요' 꼭 넣기",
      body: "",
    },
    {
      id: "t_restock",
      type: "재입고·입고",
      title: "품절·재입고·입고 지연",
      rules: "1. 기다리게 해서 죄송한 마음\n2. 재입고·입고 날짜는 [입고 예정일] 빈칸(모르면 약속하지 않기)\n3. 입고되면 바로 출고·안내",
      body: "",
    },
    {
      id: "t_defect",
      type: "불량·오배송",
      title: "불량·다른 상품이 왔어요",
      rules: "1. 불편을 드려 죄송하다는 사과 먼저\n2. 상품 사진(불량 부분·택) 부탁\n3. 확인되면 저희가 배송비를 부담해 교환·반품\n4. 회수 방법 [회수 방법]",
      body: "",
    },
    {
      id: "t_change",
      type: "주문 변경·취소",
      title: "옵션 변경·주소 변경·취소",
      rules: "1. 출고 전이면 바로 변경·취소해 드림 — 주문 상태를 모르면 [주문 상태 확인]\n2. 이미 출고됐으면 받으신 뒤 교환·반품 절차 안내",
      body: "",
    },
    {
      id: "t_coupon",
      type: "할인·쿠폰",
      title: "쿠폰·적립금·할인",
      rules: "1. 회원가입 쿠폰팩(3만↑ 3,000 · 5만↑ 3,000 · 7만↑ 4,000, 주문당 한 장)\n2. 적립금 사용 조건(1,000원부터, 한 번에 3,000원까지, 배송 완료 20일 뒤)\n3. 진행 중인 할인은 [진행 중인 할인] 빈칸 — 지어내지 않기",
      body: "",
    },
    {
      id: "t_product",
      type: "상품 문의",
      title: "소재·두께·비침·색감 등",
      rules: "1. 상품 페이지에 있는 사실(소재·실측·착용정보)로만 답하기\n2. 페이지에 없는 건 [확인 후 안내] 빈칸",
      body: "",
    },
    { id: "t_etc", type: "기타", title: "그 밖의 문의", rules: "1. 물어본 것에 바로 답하기\n2. 모르는 건 확인 후 안내드린다고", body: "" },
  ],
};

/** 저장된 틀 + 기본 틀(새로 생긴 유형은 기본으로 채움) */
export function withDefaults(t) {
  const v = t && typeof t === "object" ? t : {};
  const items = Array.isArray(v.items) ? v.items : [];
  const have = new Set(items.map((x) => x.type));
  return {
    guide: v.guide ?? DEFAULT_TEMPLATES.guide,
    greeting: v.greeting ?? DEFAULT_TEMPLATES.greeting,
    closing: v.closing ?? DEFAULT_TEMPLATES.closing,
    tone: v.tone ?? DEFAULT_TEMPLATES.tone,
    // 10/19 회원가입 5% 쿠폰이 멈추고 쿠폰팩으로 바뀜 — 10/13 에 저장된 규정의 그 줄만 새것으로 (11/10)
    policy: String(v.policy ?? DEFAULT_TEMPLATES.policy).replace(/회원가입 쿠폰: 5% 쿠폰 자동 발급, 받은 날부터 3일 사용/, "회원가입 쿠폰팩(10/19부터): 3만 원 이상 3,000원(7일) · 5만 원 이상 3,000원(30일) · 7만 원 이상 4,000원(30일). 쿠폰은 주문당 한 장"),
    items: [...items, ...DEFAULT_TEMPLATES.items.filter((x) => !have.has(x.type))],
  };
}

/** 재고(settings stock — 넥스트팩 창고 + 사무실 렉)에서 그 상품 줄만 → 초안에 같이 보낼 짧은 글. 이름이 겹치는 줄이 없으면 빈 글자 */
export function stockFor(stock, productName) {
  const name = String(productName || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").replace(/\(\d+\s*color\)/i, "").trim();
  const code = name.split(/\s+/)[0] || "";
  if (!code || code.length < 2) return "";
  const hit = (n) => String(n || "").includes(code);
  const rows = [
    ...((stock?.nextpack?.rows || []).filter((r) => hit(r.name)).map((r) => `창고 ${r.option || ""} ${r.avail ?? r.qty ?? 0}`)),
    ...((stock?.rack || []).filter((r) => hit(r.name)).map((r) => `사무실 렉 ${r.option || ""} ${r.qty ?? 0}`)),
  ];
  return rows.slice(0, 30).join(" / ");
}

// ------------------------------------------------------------------ 고친 것 학습 (11/10 세원 "초안은 내가 고친 걸 너가 계속계속 학습해")
// settings cs_learn {items:[{id, at, type, channel, product, before(AI 초안), after(보낸 글)}]} — 최근 200개.
// 다음 초안 때 같은 유형(없으면 같은 채널)의 최근 것 3개를 예시로 같이 보낸다. '답변 틀'에서 고친 기록을 보고 지침서를 고친다.
export const LEARN_MAX = 200;
const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
/** AI 초안과 실제로 보낸 글이 다르면 학습 한 줄, 같으면 null */
export function learnRow(x, finalText) {
  const before = String(x?.aiDraft || "").trim();
  const after = String(finalText || "").trim();
  if (!before || !after || norm(before) === norm(after)) return null;
  return { id: `${x.id}-${Date.now().toString(36)}`, at: new Date().toISOString(), type: x.type || "", channel: x.channel || "", product: x.product?.name || "", before: before.slice(0, 1500), after: after.slice(0, 1500) };
}
export function pickExamples(learn, x, n = 3) {
  const items = learn?.items || [];
  const same = items.filter((l) => l.type && l.type === x.type);
  const ch = items.filter((l) => !same.includes(l) && l.channel === x.channel);
  return [...same, ...ch].slice(0, n).map((l) => ({ type: l.type, before: l.before.slice(0, 700), after: l.after.slice(0, 700) }));
}

/** 몇 분 전 · 오늘 14:20 · 10/12 */
export function when(iso, now = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso);
  const m = Math.round((now - t.getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const d = new Date(now);
  const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  if (t.toDateString() === d.toDateString()) return `오늘 ${hm}`;
  const y = new Date(now - 86400000);
  if (t.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${t.getMonth() + 1}/${t.getDate()} ${hm}`;
}
