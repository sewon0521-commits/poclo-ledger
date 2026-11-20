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
  // 11/17 세원 "게시판 리뷰 달리는 거 답변해 주는 것도 — 앞으로 리뷰도 중요하게" — 카페24 REVIEW 게시판(문의와 따로). 답글은 Q&A 와 같은 답변글(비밀글이면 비밀)
  { k: "cafe24_review", label: "카페24 리뷰", short: "리뷰", auto: true, via: "cafe24", pc: "cafe24", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  { k: "npay", label: "네이버페이 주문형 문의", short: "N페이", via: "aside", pc: "npay", tone: "bg-green-50 text-green-800 ring-green-200" },
  // 11/10 세원 "카카오만 버튼 안 눌리게"(복사만) → 11/17 세원 "카톡도 보내주되 내가 답장 보내기를 누르면 30분 단위로 모아서" —
  // [한꺼번에 보내기]로 맡긴 카톡 답은 사무실 PC 가 카톡 읽기 차례(10~19시 30분마다)에 한꺼번에 보낸다(batch). 일부러 넣는 기다림 없음.
  { k: "kakao", label: "카카오톡 채널", short: "카톡", via: "aside", pc: "kakao", batch: true, tone: "bg-yellow-50 text-yellow-900 ring-yellow-200" },
  { k: "naver", label: "네이버 톡톡", short: "톡톡", via: "aside", pc: "talk", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { k: "insta", label: "인스타 DM", short: "인스타", via: "paste", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
  { k: "phone", label: "전화·문자", short: "전화", via: "paste", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
  { k: "etc", label: "기타", short: "기타", via: "paste", tone: "bg-stone-100 text-stone-700 ring-stone-200" },
];
export const channelOf = (k) => CHANNELS.find((c) => c.k === k) || CHANNELS[CHANNELS.length - 1];
/** 11/21 네이버페이 고객문의는 24시간 안에 답해야 한다(네이버페이센터 '고객 문의에 대해서는 24시간 내에 답변부탁드립니다' · 처리율이 보임)
 *  — 아직 안 보낸 N페이 문의가 받은 지 24시간 넘었으면 넘은 시간(시간 단위), 아니면 0 */
export function npayLate(x, now = Date.now()) {
  if (x?.channel !== "npay" || ["sent", "done"].includes(x.status) || !x.at) return 0;
  const h = (now - new Date(x.at).getTime()) / 3600e3;
  return h > 24 ? Math.floor(h) : 0;
}
export const isAuto = (k) => !!channelOf(k).auto;
/** 사무실 PC 가 보내 주는 채널인가 (카페24 API 또는 어사이드) */
export const canSend = (k) => ["cafe24", "aside"].includes(channelOf(k).via) && !channelOf(k).noSend;
/** PC 가 적은 채널 상태 {ok, msg, at} — 없으면 null */
export const pcState = (worker, k) => (worker?.channels || {})[channelOf(k).pc] || null;
/** PC 채널 상태 칸 — 화면 위 */
export const PC_CHANNELS = [
  ["cafe24", "카페24 게시판"],
  ["npay", "네이버페이"],
  ["kakao", "카톡 채널"],
  ["talk", "톡톡"],
];

// 서버(api/cs.js TYPES)와 같은 이름·순서
// 11/11 세원 "강다인님은 취소 요청 없는 사람인데 왜 취소 요청이 있다고 뜨냐" → '주문 변경·취소'를 둘로. '주문 취소'는 손님 말에 취소·환불이 직접 있을 때만
export const TYPES = ["배송", "교환", "반품·환불", "교환·반품 배송비", "사이즈", "재입고·입고", "불량·오배송", "주문 변경", "주문 취소", "할인·쿠폰", "상품 문의", "후기", "기타"];
/** 예전 묶음 유형 → 새 유형 (손님 말에 취소·환불이 있으면 주문 취소) */
export const fixType = (type, text = "") => (type === "주문 변경·취소" ? (/취소|환불/.test(String(text)) ? "주문 취소" : "주문 변경") : type);

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

// 11/17 세원 "빈칸에 '10~15cm정도까지' 넣었는데" — 빈칸 바로 뒤가 '까지 늘어나요'라 '정도까지까지'가 됐다.
// 채운 말 끝 ↔ 빈칸 뒤 글 앞(또는 빈칸 앞 글 끝 ↔ 채운 말 앞)이 같은 글자면 겹침. 표시만 하고 고치지 않는다.
// 바로 붙어 있으면 한글 한 글자도(에·까지·개), 띄어쓰기를 사이에 두면 두 글자부터(다음 주 + 주말 은 겹침 아님).
const DUP_OK = /[가-힣A-Za-z0-9]/;
const NL = String.fromCharCode(10);
function tailHead(a, b, minK) {
  for (let k = Math.min(a.length, b.length, 12); k >= minK; k--) {
    const s = b.slice(0, k);
    if (a.endsWith(s) && DUP_OK.test(s) && (k >= 2 || /[가-힣]/.test(s))) return k;
  }
  return 0;
}
/** 빈칸 key 에 value 를 넣었을 때 겹치는 곳 [{key, side:"after"|"before", dup, core(보낼 글에 생긴 겹친 글), sample}] */
export function blankOverlaps(draft, key, value) {
  const val = String(value || "").trim();
  const d = String(draft || "");
  if (!val || !key) return [];
  const out = [];
  for (let i = d.indexOf(key); i >= 0; i = d.indexOf(key, i + key.length)) {
    const after = d.slice(i + key.length);
    const before = d.slice(0, i);
    // 뒤: 채운 말 끝 = 뒤 글 앞
    const lead = after.length - after.replace(/^[ \t]+/, "").length;
    let k = tailHead(val, after, 1);
    let gap = 0;
    if (!k && lead) {
      k = tailHead(val, after.slice(lead), 2);
      gap = k ? lead : 0;
    }
    if (k) {
      const core = val.slice(-Math.min(val.length, k + 4)) + after.slice(0, gap + k);
      out.push({ key, side: "after", dup: after.slice(gap, gap + k).trim(), core, sample: ("…" + val.slice(-10) + after.slice(0, gap + k + 8)).split(NL)[0] });
    }
    // 앞: 앞 글 끝 = 채운 말 앞
    const rev = (t) => [...t].reverse().join("");
    const trail = before.length - before.replace(/[ \t]+$/, "").length;
    let j = tailHead(rev(val), rev(before), 1);
    let gap2 = 0;
    if (!j && trail) {
      j = tailHead(rev(val), rev(before.slice(0, before.length - trail)), 2);
      gap2 = j ? trail : 0;
    }
    if (j) {
      const core = before.slice(before.length - gap2 - j) + val.slice(0, Math.min(val.length, j + 4));
      out.push({ key, side: "before", dup: val.slice(0, j).trim(), core, sample: (before.slice(Math.max(0, before.length - gap2 - j - 8)) + val.slice(0, 10) + "…").split(NL).pop() });
    }
  }
  const seen = new Set();
  return out.filter((o) => !seen.has(o.side + o.core) && seen.add(o.side + o.core));
}
/** 지금 채운 빈칸들의 겹침 전부 */
export const fillOverlaps = (x) => Object.entries(x?.fills || {}).flatMap(([k, val]) => blankOverlaps(x?.draft, k, val));
/** 초안 칸을 직접 고칠 때 — 채운 말을 글에 넣고(빈칸 닫힘) 겹침은 dups 로 남긴다(고칠 때까지 경고) */
export function bakeFills(x, nextText) {
  const filled = Object.entries(x?.fills || {}).filter(([, val]) => String(val || "").trim());
  if (!filled.length) return { draft: nextText };
  const fills = Object.fromEntries(Object.entries(x.fills).filter(([k]) => nextText.includes(k)));
  const dups = [...new Set([...(x.dups || []), ...fillOverlaps(x).map((o) => o.core)])];
  return { draft: nextText, fills, dups };
}

/** 처리 끝난 지 7일 넘은 것 — 달마다 따로 모아 둔다(목록을 가볍게) */
export const ARCHIVE_DAYS = 7;
export const archiveKey = (iso) => `cs_done_${String(iso || "").slice(0, 7).replace("-", "")}`;
export function staleDone(items, now = Date.now()) {
  return (items || []).filter((x) => ["sent", "done"].includes(x.status) && now - new Date(x.doneAt || x.sentAt || x.createdAt || 0).getTime() > ARCHIVE_DAYS * 86400000);
}

/** 11/11 세원 "cs칸에서 누르면 주문 상세정보칸 뜨게" — 카페24 관리자 주문상세정보(네이버페이 주문도 카페24 주문번호면 같은 주소) */
export function orderAdminUrl(no) {
  const s = String(no || "").trim();
  return /^\d{8}-\d{7}$/.test(s) ? `https://ppoclo.cafe24.com/admin/php/s_new/order_detail.php?order_id=${s}&menu_no=2057` : "";
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

## 말투 (⭐ 11/17 세원 "너무 형식적으로 하고 있어서" — 세원·지원이 실제로 보낸 말 기준)
- 채팅(카톡·톡톡)은 **채팅처럼** 써요. 한두 줄로 되는 건 한두 줄. 실제로 보낸 말:
  "네!! 안감 스웨이드 재질입니당 ㅎㅎㅎ" · "고객님!! 오늘 출고돼요!!!!ㅎㅎㅎ" · "안녕하세요 고객님!!! 성함 한번만 부탁드려욧!!" ·
  "넵!!! 확인했습니다!" · "저희 오늘 제품 도착했구 검수 후 바로 환불드리겠습니다!!!" · "아 고객님 저희 상품이 들어오긴했는데 그냥 취소 해드리면 될까요~??"
- 끝은 '..!!' · '!!' · '~?' 를 자연스럽게, 미안할 땐 'ㅠㅠ', 좋은 소식엔 'ㅎㅎ'. 같은 부호를 줄마다 되풀이하지는 않아요.
- ⭐ 대화 중간(그 방에서 저희가 이미 답한 적이 있으면): 인사("안녕하세요 고객님 :) 포클로입니다 🤍")도, "더 궁금하신 점 있으시면 편하게 말씀 주세요. 감사합니다 🤍" 맺음도 **빼요**. 본론만.
- 첫 답·게시판 답만 인사 한 줄로 시작해요. 맺음 문장을 매번 붙이지 않아요 — 할 말이 끝났으면 🤍 하나로 충분.
- 손님이 물은 것만 답해요. 묻지 않은 참고 문단(모델 키·교환 안내·적립금 등)은 덧붙이지 않아요(세원이 고친 기록에서 늘 지운 부분).
- 손님 말이 짧으면 저희도 짧게. 미안한 일이면 "기다리게 해 드려 죄송해요ㅠㅠ" 한 줄 — 과한 사과·변명은 빼요. 🙏 는 쓰지 않아요.
- 손님이 고맙다·좋은 하루만 보냈으면 답이 꼭 필요하지 않아요(세원 11/17 — 답 안 하거나 🤍 하나).

## 사실은 확인된 것만
- 주문 상태·송장·출고일 = 같이 온 주문 정보에 있을 때만. 없으면 [주문 상태 확인]·[송장번호] 빈칸.
- 재고 = 같이 온 '재고·입고 예정'(넥스트팩 창고 + 거래처 입고 예정 표)으로만. 출고는 넥스트팩에서만 해요(사무실 렉 출고 없음, 세원 11/11).
  있으면 "바로 출고 가능해요", 수량은 말하지 않아요. ⭐ 이 정보로 답할 수 있으면 [재고 확인] 빈칸을 쓰지 않아요(세원 11/11) — 옵션 변경 문의면 바꿀 옵션의 출고 가능일로 답해요. 정보에 없을 때만 [재고 확인].
- 입고일 = 확정된 날만. 거래처 예정일이면 "○일 입고 예정"(약속처럼 쓰지 않기). 모르면 [입고 예정일].
- 금액·혜택 = 쇼핑몰 규정에 적힌 것만. 교환·반품 배송비는 [교환·반품 배송비] 빈칸.
- ⭐ 빈칸은 **저희가 확인해서 채울 사실**(출고일·송장·재고·금액)에만 써요(세원 11/11). 손님이 알려 주셔야 하는 것(환불 계좌·연락처·주소·사진·사이즈 등)은
  빈칸이 아니라 **묻는 문장**으로 써요. 예: "환불받으실 계좌(은행·계좌번호·예금주)를 알려 주시면 바로 환불해 드릴게요."
- ⭐ 빈칸은 되도록 0개(많아야 2개, 세원 11/17 "빈칸 넣어두고 하는 것도 불편"). 같이 온 주문·재고·입고 예정·상품 페이지·**같은 상품에 전에 보낸 답**으로 답할 수 있으면 빈칸 없이 써요.
  예: 588 볼륨 조거 허리 = "최대로 늘렸을 때 10~15cm 정도 더 늘어나요, 고무줄은 잘 늘어나는 편이에요"(11/17 세원 답).

## 경우별 기준
- ⭐ 주문을 못 찾을 때(세원 11/12): 같이 온 주문 정보가 없고 손님 말에도 성함·주문번호·연락처가 없어 주문을 특정할 수 없으면,
  배송 날짜를 짐작해 답하지 말고 **먼저 이 글로 여쭤요**(줄바꿈 그대로, 빈칸 없이):
  > 안녕하세요 고객님 :) 포클로입니다 🤍
  >
  > 배송 기다리게 해 드려 죄송해요.
  >
  > 혹시 성함 혹은 주문번호 말씀주실 수 있나요~?
  교환·취소 등 다른 주문 문의도 주문을 못 찾으면 같은 모양으로 — 가운데 '죄송해요' 줄만 상황에 맞게 바꿔요. 그 방에서 이미 답한 적이 있으면 첫 인사 줄은 빼요.
  손님이 성함·주문번호를 주시면 그다음은 평소처럼 주문을 찾아 재고·입고 일정으로 답해요.
- 배송 지연: 결제 다음 날부터 주말 빼고 3일 넘게 출고가 안 됐으면 지연 안내 — 사과 한 줄 → 입고·출고 예정 → "들어오는 대로 가장 먼저 검수해서 보내 드릴게요" + 출고되면 송장 안내.
  **취소를 먼저 권하지 않아요**(세원 11/10 — 손님을 붙잡게). 손님이 먼저 취소를 원하실 때만 바로 도와드려요.
- 미송(거래처 입고 대기): 들어오는 대로 검수해 바로 출고, 출고되면 송장 문자로 안내.
- 하자(불량): 사과 → 불량 부분·택이 보이게 사진 부탁 → 확인되면 왕복 배송비 저희 부담으로 교환·반품.
- 오배송: 사과 → 받으신 상품 사진 부탁 → 맞는 상품을 저희 부담으로 보내고 잘못 간 상품은 회수.
- 품절: 사과 → 재입고는 확정일 때만 날짜, 아니면 약속하지 않기 → 비슷한 상품이 있으면 짧은 링크.
- 교환·반품(단순 변심): 받은 날부터 7일 안, 왕복 배송비 고객 부담, 착용·세탁 흔적이 있으면 어려움.
- 주문 취소·옵션 변경: 출고 전이면 바로 해 드림, 출고됐으면 받으신 뒤 교환·반품으로.
- ⭐ 부분 배송(세원 11/10): 한 주문 안에서 옵션마다 출고 가능일을 따로 봐요(같이 온 '거래처 입고 예정'·재고). 바로 나갈 수 있는 것과 늦는 것이 섞이면
  어떤 옵션이 언제 나가는지 적고 "가능한 것부터 먼저 보내 드릴까요?"를 꼭 넣어요. 날짜 도착은 약속하지 않아요.
  먼저 보내는 두 번째 택배비는 **지금은 저희가 내요**(세원 11/11) — 손님에게 배송비를 따로 받지 않아요.
- 배송지연 안내는 세원 틀(11/11)대로: "현재 주문 폭주로 물량이 딸리고 있어요 … 공장에 긴급 리오더 요청 … (일정)에 출고될 예정이에요!"
  ⭐ 문자·카톡·톡톡으로 보내는 안내는 네이버페이 주문이어도 **일반판 하나만** 써요(세원 11/11 "카페24 메시지엔 네이버 문단 빼버려").
  "시스템상 배송 기한 연장을 위해 출고 예정일을 '(2주 뒤)'로 … 실제로는 (예상일자) 훨씬 빠르게" 문단은 **네이버페이센터 발송지연 처리의 상세사유에만** 들어가요.
- 문의 유형: '주문 취소'는 손님 말에 '취소'·'환불'이 직접 있을 때만. 옵션·수량·주소를 바꾸고 싶다는 건 '주문 변경'(세원 11/11 — 강다인 네이비→그레이는 변경).
- 취소 요청: 출고 전이면 바로 취소·전액 환불. 취소는 세원이 카페24에서 처리한 뒤에 '취소 완료' 답을 보내요.
- ⭐ 무통장(현금) 취소·환불은 **두 번에 나눠요**(세원 11/11):
  ① 첫 답 = 계좌만 여쭤요. "취소 접수했어요·환불해 드릴게요"는 아직 쓰지 않아요.
     예: "요번에는 무통장(현금)으로 결제해 주셔서, 환불받으실 계좌(은행·계좌번호·예금주)를 알려 주시면 그 계좌로 바로 보내 드릴게요..!!"
  ② 계좌가 오면 = 사과 + "입금 처리 후 취소 해드릴게요..!"
  순서는 **입금(환불) 먼저 → 그다음 카페24 주문 취소**예요.
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
      type: "주문 변경",
      title: "옵션·수량·주소 변경",
      rules: "1. 출고 전이면 바로 바꿔 드림 — 바꿀 옵션의 출고 가능일을 같이 온 재고·입고 예정으로 안내\n2. 이미 출고됐으면 받으신 뒤 교환 절차 안내\n3. 취소를 먼저 권하지 않기",
      body: "",
    },
    {
      id: "t_cancel",
      type: "주문 취소",
      title: "주문 취소·환불 (손님이 취소를 말했을 때만)",
      rules: "1. 손님이 직접 취소·환불을 원하실 때만 이 유형\n2. 출고 전이면 바로 취소·전액 환불, 카드는 승인 취소(카드사에 따라 며칠)\n3. 무통장은 두 번에 — 먼저 환불 계좌만 여쭙기, 계좌가 오면 입금 처리 후 취소\n4. 이미 출고됐으면 받으신 뒤 반품",
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
  // 11/11 저장된 '주문 변경·취소' 틀 → '주문 변경'(새 규칙), 기본 '주문 취소' 틀이 새로 붙는다
  const chg = DEFAULT_TEMPLATES.items.find((d) => d.type === "주문 변경");
  const items = (Array.isArray(v.items) ? v.items : []).map((x) => (x.type === "주문 변경·취소" ? { ...x, type: chg.type, title: chg.title, rules: chg.rules } : x));
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
/**
 * 11/11 세원 "답변 초안 만들 때 너가 재고 확인을 제대로 바로 해 주고" — 초안에 같이 보내는 '재고·입고 예정' 글.
 * 출고는 넥스트팩에서만(사무실 렉 출고 없음, 11/11). 넥스트팩 현재고 파일은 재고 1장 이상인 옵션만 있어서 없으면 창고 0.
 * 주문한 옵션만이 아니라 그 상품의 모든 옵션을 넣는다 — '네이비를 그레이로 바꿀 수 있나요' 같은 문의도 바로 답하게.
 * 사무실 PC 초안(cs_worker.stock_eta)과 같은 글. → {text, at(현재고 기준 시각)}
 */
export function stockFor(stock, inbound, lines = [], names = []) {
  const np = stock?.nextpack || {};
  const rows = np.rows || [];
  const codes = [];
  for (const n of [...(lines || []).map((l) => l.name), ...names]) {
    const c = codeOf(n);
    if (c.length >= 2 && !codes.includes(c)) codes.push(c);
  }
  if (!codes.length) return { text: "", at: np.at || "" };
  let head = "";
  if (np.at) {
    const t = new Date(np.at);
    const hrs = (Date.now() - t.getTime()) / 3600000;
    head = `(넥스트팩 현재고 ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} 기준${hrs >= 6 ? ` — ${Math.floor(hrs)}시간 전이라 그 뒤 들어온 것은 입고 예정 표로 볼 것` : ""} · 출고는 넥스트팩에서만, 현재고 파일은 재고 1장 이상인 옵션만 있어서 없으면 창고 재고 0)`;
  }
  const out = codes.slice(0, 4).map((c) => {
    const sr = rows.filter((r) => String(r.name || "").includes(c));
    const ir = (inbound?.items || []).filter((x) => x.code === c);
    const st = sr.map((r) => `${r.option || ""} ${r.avail ?? r.qty ?? 0}`).join(" / ") || "없음";
    const eta = ir.map((x) => `${x.option || "모든 색"}: ${etaLabel(x)}`).join(" / ") || "표에 없음";
    return `${c} — 창고 재고: ${st} · 거래처 입고 예정: ${eta}`;
  });
  return { text: [head, ...out].filter(Boolean).join(String.fromCharCode(10)), at: np.at || "" };
}
/** 현재고 기준 시각이 몇 시간 전인지 (없으면 null) */
export const stockAge = (stock) => (stock?.nextpack?.at ? (Date.now() - new Date(stock.nextpack.at).getTime()) / 3600000 : null);

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

// ------------------------------------------------------------------ 거래처 입고 예정 (11/10 세원 "투톤 네이비만 일밤, 그레이는 오늘 가능 — 이런 건 말해 주고 학습해서 다음에도")
// settings inbound_eta {items:[{id, code(고유네임), option('네이비' · '' = 모든 색), status: now|date|later|unknown, date, memo, at, by}]}
//   now = 지금 출고 가능 · date = 그 날 입고(memo 에 '밤 입고' 등) · later = 날짜 모름이지만 대략(memo: '다음 주 주중') · unknown = 모름
// 화면: 일 › 배송지연 안내 '거래처 입고 예정' · 사무실 PC `python poclo-cafe24/inbound.py set 578 네이비 2026-11-15 "밤 입고"`
const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const codeOf = (name) => (String(name || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim().split(/\s+/)[0] || "");
function etaLabel(x) {
  if (x?.status === "now") return "지금 출고 가능" + (x.memo ? `(${x.memo})` : "");
  if (x?.status === "date" && x.date) {
    const d = new Date(x.date + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${x.memo || "입고"}`;
  }
  if (x?.status === "later") return x.memo || "입고 예정";
  return "입고일 모름";
}
export function etaFor(inbound, stock, code, option) {
  const opt = String(option || "");
  const rows = (inbound?.items || []).filter((x) => x.code && x.code === code);
  const hit = rows.find((x) => x.option && opt.includes(x.option)) || rows.find((x) => !x.option);
  // 11/11 출고는 넥스트팩에서만 — 사무실 렉 재고는 안 본다
  const inStock = (stock?.nextpack?.rows || []).some((r) => String(r.name || "").includes(code) && (!opt || opt.split(/[,/+ ]/).some((o) => o && String(r.option || "").includes(o))) && (r.avail ?? r.qty ?? 0) > 0);
  if (inStock || hit?.status === "now") return { tone: "ok", label: "지금 출고 가능", memo: hit?.memo || (inStock ? "재고 있음" : "") };
  if (hit?.status === "date" && hit.date) return { tone: "wait", label: etaLabel(hit), memo: hit.memo || "" };
  if (hit?.status === "later") return { tone: "wait", label: hit.memo || "입고 예정", memo: hit.memo || "" };
  return { tone: "none", label: "입고일 모름", memo: "" };
}
/** 초안에 같이 보낼 '옵션별 출고 가능' 글 */
export function etaText(inbound, stock, lines) {
  return (lines || []).map((l) => `${l.name} · ${l.option || "옵션 없음"} · ${l.qty || 1}개 → ${etaFor(inbound, stock, codeOf(l.name), l.option).label}`).join(String.fromCharCode(10));
}

// ------------------------------------------------------------------ 배송지연 안내 틀 (11/11 세원이 직접 씀 — () 칸만 바꾼다)
// (일정) = 출고 예정 · (2주뒤) = 네이버페이 연장 기한 · (예상일자) = 실제 예상일. 네이버 문단은 네이버페이 주문에만.
export const DELAY_TEMPLATE = [
  "안녕하세요 고객님 포클로입니다!",
  "",
  "지금 고객님께서 주문해주신 상품이 현재 주문 폭주로 물량이 딸리고 있어요ㅠㅠㅠ",
  "빠르게 보내드리고 싶었는데 배송 지연으로 불편을 드려 너무 죄송합니다..",
  "",
  "현재 공장에 긴급 리오더 요청을 드려 입고 준비 중이며",
  "(일정)에 출고될 예정이에요!",
  "",
  "@@NAVER@@",
  "조금만 더 기다려주시면 꼼꼼하게 검수해서 최대한 빨리 예쁘게 보내드릴게요!",
  "감사합니다!",
].join(String.fromCharCode(10));
// ⚠ 네이버페이센터 발송지연 상세사유에만 — 문자·카톡·톡톡 안내에는 넣지 않는다(세원 11/11)
export const DELAY_NAVER = [
  "네이버 페이로 주문해 주신 고객님의 경우 시스템상 배송 기한 연장을 위해 출고 예정일을 '(2주뒤)'로 설정해 두었어요!",
  "실제로는 공장 입고되는 대로(예상일자) 훨씬 빠르게 발송해 드릴 예정이니 날짜는 신경 쓰지 않으셔도 됩니다!",
  "",
].join(String.fromCharCode(10));
/** 틀에 () 칸 채우기 — naver 면 네이버 문단 넣고, 아니면 뺀다 */
export function fillDelay(tpl, { when = "", until = "", expect = "", naver = false } = {}) {
  const NL = String.fromCharCode(10);
  return String(tpl || DELAY_TEMPLATE)
    .replace("@@NAVER@@" + NL, naver ? DELAY_NAVER : "")
    .replace("@@NAVER@@", naver ? DELAY_NAVER : "")
    .split("(일정)").join(when || "(일정)")
    .split("(2주뒤)").join(until || "(2주뒤)")
    .split("(예상일자)").join(expect || "(예상일자)");
}
const MD = (d) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");
/** (일정)에 넣을 말 — 거래처 입고 예정에서. '밤 입고 → 11/13 출고' → '11/13' · '리오더 중 · 11/23~27 출고 예정' → '11/23~27' · '다음 주 주중 입고' → '다음 주 주중' */
export function scheduleText(inbound, code, option) {
  const rows = (inbound?.items || []).filter((x) => x.code === code);
  const hit = rows.find((x) => x.option && String(option || "").includes(x.option)) || rows.find((x) => !x.option);
  if (!hit) return "";
  const memo = String(hit.memo || "");
  const arrow = memo.match(/→\s*([^\s·]+)\s*출고/);
  if (arrow) return arrow[1];
  const range = memo.match(/(\d+\/\d+(?:~\d+(?:\/\d+)?)?)\s*출고/);
  if (range) return range[1];
  if (hit.status === "date" && hit.date) return `${Number(hit.date.slice(5, 7))}/${Number(hit.date.slice(8, 10))} 입고 뒤 바로`;
  return memo.replace(/\s*입고.*$/, "").trim();
}
export const mdKo = MD;

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

// ------------------------------------------------------------------ 같은 손님 연락 기록 잇기 (11/11 세원 "합쳐줘" — CS 관리 + 배송지연 안내)
// 문의 답장과 지연 안내가 같은 손님에게 따로 두 번 나가지 않게. 주문번호로 맞추고, 네이버페이 행(주문번호가 네이버 것)은 이름 첫 글자 + 상품 고유네임으로 맞춘다(힌트).
const first = (s) => String(s || "").trim().charAt(0);
/** 문의 카드의 상품 고유네임들 */
export function codesOfItem(x) {
  const names = [
    ...(x?.lines || []).map((l) => l.name),
    x?.product?.name,
    ...((x?.order?.orders || []).flatMap((o) => [...(o.lines || []).map((l) => l.name), ...(o.items || []).map((i) => (typeof i === "string" ? i : i?.name))])),
  ];
  return [...new Set(names.map(codeOf).filter((c) => c && c.length >= 2))];
}
const ordersOfItem = (x) => [x?.orderNo, ...((x?.order?.orders || []).map((o) => o.id))].filter(Boolean);
/** 최근 days 일 안에 개별 답장을 받았거나(보냄·처리 완료) 보낼 목록에 든 문의 */
export function recentReplies(inbox, now, days = 3) {
  return (inbox || [])
    .filter((x) => ["sent", "done", "approved", "sending"].includes(x.status))
    .map((x) => ({ x, at: x.sentAt || x.doneAt || x.approvedAt || x.draftedAt || x.at || "" }))
    .filter((r) => r.at && now - new Date(r.at).getTime() < days * 864e5);
}
/** 지연 안내 대상 한 줄 → 그 손님이 최근 개별 답장을 받았으면 {x, at, label} */
export function repliedTo(replies, { orderNo, buyer, products = [] }) {
  const codes = products.map(codeOf).filter((c) => c && c.length >= 2);
  for (const r of replies || []) {
    const hit = (orderNo && ordersOfItem(r.x).includes(orderNo)) || (buyer && first(buyer) === first(r.x.customer) && codes.some((c) => codesOfItem(r.x).includes(c)));
    if (hit) {
      const d = new Date(r.at);
      return { ...r, label: `개별 답장 ${channelOf(r.x.channel).short} ${d.getMonth() + 1}/${d.getDate()}${r.x.status === "approved" || r.x.status === "sending" ? "(보낼 예정)" : ""} · ${r.x.customer || ""}` };
    }
  }
  return null;
}
/** 문의 카드 → 그 손님에게 나간 지연 안내 [{kind, at}] — 네이버 발송지연 처리함 · 지연 문자 보냄 */
export function delaysFor(x, npay, sms) {
  const out = [];
  const codes = codesOfItem(x);
  for (const n of npay?.items || []) {
    if (n.status === "done" && first(n.buyer) && first(n.buyer) === first(x?.customer) && codes.includes(codeOf(n.product))) out.push({ kind: "네이버 발송지연", at: n.doneAt || "" });
  }
  const orders = ordersOfItem(x);
  for (const s of sms?.items || []) if (s.status === "sent" && orders.includes(s.orderNo)) out.push({ kind: "지연 문자", at: s.sentAt || "" });
  return out;
}

// ------------------------------------------------------------------ 마무리 말 (11/17 세원)
// "내가 답변을 마무리하면 고객님이 감사인사를 보내거나 하면 거기에 대한 답변을 안하고 이모티콘만 보내던 하면 되는데 그걸 하나하나 할때마다 세팅을 해야하니까"
// 우리가 답한 뒤 손님이 '감사합니다·넵·좋은 하루 되세요'만 보냈으면 → AI 초안 없이 작은 카드: [답 안 하고 넘기기] / 짧은 답 칩.
// 사무실 PC(chat_collect.is_closing)와 같은 규칙. 물음표가 있거나, 우리 마지막 말이 질문이었으면(손님 '네' = 대답) 마무리로 안 본다.
const CLOSE_WORDS = [
  "감사합니다", "감사해요", "감사드려요", "감사드립니다", "감사합니당", "감사해용", "감사요", "감사", "고맙습니다", "고마워요", "고맙습니당", "고마워용",
  "알겠습니다", "알겠어요", "알겠습니당", "알겠어용", "알았어요", "알았습니다",
  "확인했습니다", "확인했어요", "확인했습니당", "확인했어용", "확인완료",
  "잘받았습니다", "잘받았어요", "잘받았어용",
  "좋은하루되세요", "좋은하루보내세요", "좋은주말되세요", "좋은주말보내세요", "즐거운주말되세요", "즐거운주말보내세요", "즐거운하루되세요", "행복한하루되세요",
  "주말잘보내세요", "좋은밤되세요", "좋은저녁되세요", "편안한밤되세요", "즐거운", "행복한", "좋은", "하루", "주말", "되세요", "보내세요",
  "수고하세요", "수고하셨습니다", "수고많으세요", "수고많으셨어요", "수고많으십니다",
  "기다릴게요", "기다리겠습니다", "기다릴게용", "기다릴께요",
  "잘부탁드려요", "잘부탁드립니다", "잘부탁드릴게요", "잘부탁드릴께요",
  "답변", "빠른", "친절한", "친절하게", "상세하게", "자세하게", "알려주셔서", "말씀해주셔서", "말씀주셔서", "안내해주셔서", "신경써주셔서", "챙겨주셔서",
  "너무", "정말", "진짜", "완전", "항상", "사장님", "이모티콘", "스티커",
  "넵넵", "네네", "넵", "넹", "네", "녜", "옙", "예", "응", "웅", "앗", "아", "오", "와",
].sort((a, b) => b.length - a.length);
/** 손님 말 하나가 '고마워요·넵·좋은 하루' 같은 마무리 말뿐인가 */
export function isClosingText(t) {
  const s = String(t || "");
  if (!s.trim() || /[?？]/.test(s) || /\(사진\)/.test(s)) return false;
  let r = s.replace(/[^가-힣a-zA-Z0-9]/g, "");
  for (const w of CLOSE_WORDS) r = r.split(w).join("");
  return /^[요용당여유]{0,2}$/.test(r);
}
const realUs = (m) => m?.from === "us" && m.who !== "자동" && m.who !== "알림톡";
/** 이 문의가 '마무리 말' 카드인가 → {text, at, by} 또는 null. x.closing(PC·AI 가 정한 것)이 먼저, 없으면 대화로 판단 */
export function closingOf(x, thread) {
  if (x?.closing && typeof x.closing === "object") return x.closing;
  const th = Array.isArray(thread) ? thread : Array.isArray(x?.thread) ? x.thread : [];
  let last = -1;
  th.forEach((m, i) => realUs(m) && (last = i));
  if (last < 0) return null;
  if (/[?？]|까요|실래요/.test(String(th[last].text || ""))) return null; // 우리가 물어본 뒤의 '네'는 대답
  const fresh = th.slice(last + 1).filter((m) => m.from === "them");
  if (!fresh.length || !fresh.every((m) => !m.img && !m.menu && isClosingText(m.text))) return null;
  return { text: fresh.map((m) => m.text).join(" / "), at: fresh[fresh.length - 1].at || "", by: "rule" };
}
/** 짧은 답 칩 — 세원이 많이 고른 순(settings cs_voice.closers {글: 횟수}), 기본 셋 */
export const CLOSERS = ["🤍", "감사합니다 고객님 🤍", "좋은 하루 보내세요 🤍"];
/** 11/17 리뷰 — 짧은 답 단추 · '확인 필요'(별점 3 이하이거나 AI 가 불만으로 본 것) */
export const REVIEW_QUICK = ["감사합니다 고객님 🤍", "소중한 후기 감사합니다 고객님 🤍", "예쁘게 입어 주셔서 감사해요 🤍"];
export const isReview = (x) => x?.channel === "cafe24_review";
export const reviewFlag = (x) => isReview(x) && ((Number(x.rating) >= 1 && Number(x.rating) <= 3) || /^확인 필요/.test(String(x.caution || "")));
export function closerChips(voice, extra = "") {
  const n = voice?.closers || {};
  const all = [...new Set([extra, ...Object.keys(n), ...CLOSERS].map((t) => String(t || "").trim()).filter(Boolean))];
  return all.sort((a, b) => (n[b] || 0) - (n[a] || 0) || (a === extra ? -1 : b === extra ? 1 : 0)).slice(0, 4);
}

// ------------------------------------------------------------------ 같은 상품에 전에 보낸 답 (11/17 세원 "빈칸 답변 초안에 넣어두고 하는 것도 불편")
// settings cs_answers {items:[{id, at, ch, type, codes[고유네임], product, q(손님 말 요약), a(보낸 글)}]} — 최근 150개.
// 보내거나 복사해서 처리할 때 저장 → 같은 상품 문의가 오면 초안 서버에 같이 줘서 실측·늘어남 같은 사실을 다시 쓴다(빈칸 대신).
export const ANSWERS_MAX = 150;
export function answerRow(x, text) {
  const a = String(text || "").trim();
  const codes = codesOfItem(x);
  if (!a || !codes.length) return null;
  const q = threadOfLite(x).filter((m) => m.from === "them").slice(-3).map((m) => m.text).join(" / ") || x?.message || x?.title || "";
  return { id: x.id, at: new Date().toISOString(), ch: x.channel || "", type: x.type || "", codes, product: x.product?.name || "", q: String(q).slice(0, 240), a: a.slice(0, 900) };
}
function threadOfLite(x) {
  return Array.isArray(x?.thread) && x.thread.length ? x.thread : [];
}
/** 초안 요청에 같이 보낼 것 — 이 문의 상품과 고유네임이 겹치는 예전 답(최근 5개) */
export function answersFor(answers, x, n = 5) {
  const codes = codesOfItem(x);
  if (!codes.length) return [];
  return (answers?.items || [])
    .filter((r) => r.id !== x.id && (r.codes || []).some((c) => codes.includes(c)))
    .slice(0, n)
    .map((r) => ({ product: r.product, type: r.type, at: String(r.at || "").slice(0, 10), q: r.q, a: r.a }));
}

// ------------------------------------------------------------------ 말투 모음 (11/17 세원 "너무 형식적으로 하고 있어서 … 내 기존 대화를 보고 학습해서")
// settings cs_voice {items:[{id, text(우리가 실제로 보낸 말), ctx(바로 앞 손님 말), ch, at, src: chat|board|learn}], closers:{}, at}
// 사무실 PC 가 채팅방을 읽을 때 사람(세원·지원)이 쓴 말을 계속 모은다. 초안마다 같은 채널 것 먼저 몇 개 → 초안 서버가 말투·길이를 따라 쓴다.
export function voiceFor(voice, x, n = 8) {
  const items = voice?.items || [];
  const same = items.filter((v) => v.ch === x.channel);
  const rest = items.filter((v) => v.ch !== x.channel);
  return [...same, ...rest].slice(0, n).map((v) => ({ ch: v.ch, ctx: String(v.ctx || "").slice(0, 120), text: String(v.text || "").slice(0, 280) }));
}
