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

export const CHANNELS = [
  { k: "cafe24_qna", label: "카페24 상품 Q&A", short: "Q&A", auto: true, tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  { k: "cafe24_consult", label: "카페24 1:1 상담", short: "1:1 상담", auto: true, tone: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  { k: "kakao", label: "카카오톡 채널", short: "카톡", tone: "bg-yellow-50 text-yellow-900 ring-yellow-200" },
  { k: "naver", label: "네이버 톡톡", short: "톡톡", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { k: "insta", label: "인스타 DM", short: "인스타", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
  { k: "phone", label: "전화·문자", short: "전화", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
  { k: "etc", label: "기타", short: "기타", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
];
export const channelOf = (k) => CHANNELS.find((c) => c.k === k) || CHANNELS[CHANNELS.length - 1];
export const isAuto = (k) => !!channelOf(k).auto;

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

export const DEFAULT_TEMPLATES = {
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
    "회원가입 쿠폰: 5% 쿠폰 자동 발급, 받은 날부터 3일 사용",
    "모델: JIWON 157cm · 상의 55 · 하의 26~27 · 신발 240mm",
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
      rules: "1. 상품 페이지 실측으로 답하기(실측 없으면 빈칸)\n2. 모델 정보(157cm · 상의 55 · 하의 26~27)와 비교\n3. 고객이 키·몸무게·평소 사이즈를 말했으면 추천 사이즈 제안\n4. '체형에 따라 개인차가 있을 수 있어요' 꼭 넣기",
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
      rules: "1. 회원가입 5% 쿠폰(받은 날부터 3일)\n2. 적립금 사용 조건(1,000원부터, 한 번에 3,000원까지, 배송 완료 20일 뒤)\n3. 진행 중인 할인은 [진행 중인 할인] 빈칸 — 지어내지 않기",
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
    greeting: v.greeting ?? DEFAULT_TEMPLATES.greeting,
    closing: v.closing ?? DEFAULT_TEMPLATES.closing,
    tone: v.tone ?? DEFAULT_TEMPLATES.tone,
    policy: v.policy ?? DEFAULT_TEMPLATES.policy,
    items: [...items, ...DEFAULT_TEMPLATES.items.filter((x) => !have.has(x.type))],
  };
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
