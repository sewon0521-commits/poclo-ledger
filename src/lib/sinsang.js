// 신상 관리 (2026-10-01) — 노션 '쇼필공 OS' 의 신상관리 7쪽을 한 화면의 흐름으로.
//
// 세원(10/1, 노션 화면 17장과 함께): "샘플/사입 예정 등록 → 입고 픽 관리 → 코디 촬영 관리 → 업데이트 관리,
//   반납 등록하면 보류/반납 리스트, 입고일 기준 2주 안에 반납 — 샘플 반납/결제 관리. 지원이가 거의 다 관리하는데
//   들어갈 곳이 많고 복잡하다. 효율적으로 바꿀 건 바꾸고 디벨롭할 건 디벨롭해 줘."
//
// 노션은 같은 상품을 쪽마다 다른 보기로 다시 찾았다. 여기서는 **상품 한 장이 단계를 옮겨 다닌다**:
//   요청(request) → 입고·픽(arrived) → 촬영(pick) → 등록(shot) → 업데이트 완료(done)   / 보류·드랍(drop)
// 샘플의 끝(반납·결제)은 단계와 따로 간다 — 픽해서 촬영·등록까지 한 샘플도 기한 안에 반납하거나 결제해야 하므로.
//   반납 기한 = 입고일 + 14일(상품마다 바꿀 수 있음).
//   **결제와 반납은 같이 된다** (세원 10/1: "6컬러 M·L 12장을 받아 1컬러 M 만 결제하고 나머지는 반납") —
//   paid {on, colors, sizes, qty, amount, all} 와 returnedOn 을 따로 둔다. 반납했거나 '전부 결제'면 끝(closed).
//
// shoot_items 한 줄:
//   {id, type:"sample"|"buy", stage, name, fullName, vendor, vendorId, place, kind, price, url, goodsId,
//    photo(보관 이름)|photoUrl(바깥 주소), colors, sizes, fabric, origin, memo,
//    contact {mobile, tel, kakao, insta, site}, desc,   // 신상마켓 '제품 설명'에 거래처가 적어 둔 연락처 · 그 글
//    asked, askedOn, pickup, retryOn,      // 거래처 샘플 요청(+날짜) · 샘플 픽업 요청 · 샘플 재요청 날짜
//    refused, refusedOn,                   // 거래처가 샘플이 안 된다고 함 → 보류·드랍에 '샘플 안 됨'으로
//    arrivedOn, arrivedOpts,               // 입고일 · 입고된 색상·사이즈
//    pickedOn, shootDate, shootOpts,       // 촬영 날짜 · 촬영 색상 및 사이즈
//    shotOn, doneOn, channels:{cafe24},
//    returning, hold, packed, packedOn, paid, returnedOn, returnDays,
//    notes:[{by, text, at}], createdAt}

import { dayKey, shiftDay } from "./journal";

export const STAGES = [
  ["request", "요청", "요청할 상품을 담아 두고, 거래처 이름 옆 '카톡 글 복사'로 요청하세요. 안 된다는 상품은 '안 됨'."],
  ["arrived", "입고·픽", "들어온 상품 — 입어 보고 픽할지 정해요"],
  ["pick", "촬영", "픽한 상품 — 촬영 대기"],
  ["shot", "등록", "촬영 끝 — 상품등록 대기"],
  ["done", "업데이트 완료", "등록까지 끝난 상품"],
];
export const stageName = (k) => (k === "drop" ? "보류·드랍" : STAGES.find(([s]) => s === k)?.[1] || "요청");

// 10/1 세원: "지금은 카페24 업로드 빼고 에이블리·지그재그·스마트스토어 다 없애줘"
export const CHANNELS = [["cafe24", "카페24"]];

export const RETURN_DAYS = 14;

/** 예전 기록 읽기 — 9/30 첫 판(status), 10/1 첫 판(settle 하나) */
const OLD = { want: "request", arrived: "arrived", pick: "pick", planned: "pick", shot: "shot", back: "drop" };
export function normalize(x) {
  const y = { type: "sample", ...x, stage: x.stage || OLD[x.status] || "request" };
  if (x.settle === "returned" && !x.returnedOn) y.returnedOn = x.settledOn || "";
  if (x.settle === "paid" && !x.paid) y.paid = { on: x.settledOn || "" };
  return y;
}

/** 샘플의 끝 — 거래처에 반납했거나, 받은 걸 전부 결제했다 */
export const closed = (x) => !!x.returnedOn || !!x.paid?.all;

/** 반납 기한 — 샘플이고 입고일이 있고 아직 끝나지 않았을 때만 */
export function dueOf(x) {
  if (x.type === "buy" || !x.arrivedOn || closed(x)) return "";
  return shiftDay(x.arrivedOn, Number(x.returnDays) || RETURN_DAYS);
}

/** 오늘부터 며칠 남았나 (음수 = 초과) */
export function daysLeft(due, today = dayKey()) {
  const d = (k) => {
    const [y, m, dd] = k.split("-").map(Number);
    return new Date(y, m - 1, dd).getTime();
  };
  return Math.round((d(due) - d(today)) / 86400000);
}

export function dueLabel(n) {
  return n < 0 ? `반납 ${-n}일 초과` : n === 0 ? "반납 당일" : `반납 ${n}일 남음`;
}

/** 결제한 것 한 줄 — '블랙 M 1장 22,000원' */
export function paidLabel(p) {
  if (!p) return "";
  const n = Number(p.amount) ? `${Number(p.amount).toLocaleString("ko-KR")}원` : "";
  return [p.colors, p.sizes, p.qty ? `${p.qty}장` : "", n].filter(Boolean).join(" ") || "결제함";
}

/** 단계를 옮길 때 같이 적는 것 — 날짜는 그때 오늘로 */
export function moveTo(x, stage, today = dayKey()) {
  const p = { stage };
  if (stage !== "drop") p.refused = false;
  if (stage === "arrived") Object.assign(p, { arrivedOn: x.arrivedOn || today, returning: false, hold: false });
  if (stage === "pick") Object.assign(p, { pickedOn: x.pickedOn || today, returning: false, hold: false });
  if (stage === "shot") p.shotOn = x.shotOn || today;
  if (stage === "done") p.doneOn = x.doneOn || today;
  return { ...x, ...p };
}

// ---------------------------------------------------------------- 이름 다듬기

// 옷 '모양' 낱말 — 이 뒤에 또 큰 갈래 낱말이 오면 겹치는 말이라 뗀다
const SHAPE = /(집업|바람막이|가디건|후드|맨투맨|조끼|베스트|야상|패딩|트렌치|블루종|나시|뷔스티에|원피스|스커트|슬랙스|데님|레깅스)$/;
const GENERIC = /^(점퍼|니트|자켓|재킷|티|티셔츠|셔츠|남방|팬츠|바지|코트|아우터|상의|하의|의류)$/;

// 머리말에 쓰는 말 — 이것만으로 된 '…)' 은 이름이 아니라 꾸밈말이다 (가을신상) · 26FW 재진행) · 주문폭주))
const HYPE = /신상|신규|재진행|재입고|리오더|인기|폭주|주문|베스트|추천|당일|출고|간절기|봄|여름|가을|겨울|s\/?s|f\/?w|new|best|hot|sale|세일|특가|단독|자체제작|국내생산|이번\s*주|금주|\d+\s*(차|월|년)?|[초늦한]/gi;

/** '머리 ) 나머지' 를 가른다 — 머리가 꾸밈말이면 나머지가 이름, 머리가 이름이면 나머지는 설명 */
function headOrTail(s) {
  const m = s.match(/^([^()[\]]{1,16}?)\s*\)+\s*(.*)$/);
  if (!m) return s;
  const head = m[1].trim();
  const tail = m[2].trim();
  const left = head.replace(HYPE, "").replace(/[^0-9A-Za-z가-힣]/g, "");
  return left ? head : tail || head;
}

/**
 * 신상마켓 상품명 → 부르는 이름 (세원 10/1):
 *   '가을신상)유카 셔링 하이넥 집업 바람막이 점퍼' → '유카 셔링 하이넥 집업 바람막이'
 *   '신상) 로이 하이넥 집업 니트 (도톰 니트가디건)' → '로이 하이넥 집업'      '가을 신상) 로즈sk' → '로즈sk'
 *   '에이골덴SK )) FW 재진행 골덴 코듀로이 셔링 플리츠 플레어 뒷밴딩' → '에이골덴SK'   (앞이 이름, 뒤는 설명)
 * 세원 10/1 (카톡에 적을 때 안 길어지게): 이름 한 낱말 뒤에 검색용 낱말을 늘어놓은 상품명은 **앞 낱말만**
 *   '코이셔링PT 쭈리 fw가을 부츠컷 발레코어 팬츠 밴딩 체형보정' → '코이셔링PT'   '26FW)제나폴딩P 와이드부츠컷 면바지…' → '제나폴딩P'
 *   '345 사계절 3컬러 와이드 절개 팬츠 허리밴딩 청바지' → '345'  (번호로 부르는 상품)
 *   '부츠컷팬츠 셔링팬츠 밴딩팬츠 레이어드팬츠…' → '부츠컷팬츠'   '[블룸PT] 부츠컷팬츠 셔링팬츠…' → '블룸PT' (맨 앞 괄호 안이 이름이면 그것)
 * ① 맨 앞 괄호 안이 이름(코드·번호)이면 그것 ② 맨 앞 '…)' 가 꾸밈말(가을신상)이면 떼고, 이름이면 그것만 ③ 괄호·대괄호 안을 뗀다
 * ④ 첫 낱말이 번호(345) · 코드(한글+영문 끝: PT·SK·P) · 옷 이름(부츠컷팬츠)이면 그것만
 * ⑤ 아니면 끝 낱말이 큰 갈래 말(점퍼·니트…)이고 바로 앞이 이미 옷 모양 말(집업·바람막이…)일 때 끝 낱말을 뗀다.
 */
const CODE = /[가-힣][A-Za-z]{1,4}$/;
const NUMBER = /^(?!(19|20)\d\d$)\d{2,5}$/;
const NOUN = /(팬츠|바지|슬랙스|청바지|데님|스커트|치마|원피스|니트|티셔츠|티|셔츠|블라우스|자켓|재킷|점퍼|코트|가디건|조끼|베스트|후드|맨투맨|나시|집업|바람막이|패딩|야상|세트)$/;

export function cleanName(title) {
  let s = String(title || "").trim();
  const lead = s.match(/^[[(]\s*([^\])]+?)\s*[\])]/);
  if (lead && (CODE.test(lead[1]) || NUMBER.test(lead[1]))) return lead[1];
  s = headOrTail(headOrTail(s));
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[★☆♥♡●◆■()[\]]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const w = s.split(" ");
  if (w.length > 1 && (NUMBER.test(w[0]) || CODE.test(w[0]) || (NOUN.test(w[0]) && w[0].replace(NOUN, "").length >= 2))) return w[0];
  if (w.length >= 3 && GENERIC.test(w[w.length - 1]) && SHAPE.test(w[w.length - 2])) w.pop();
  return w.join(" ") || String(title || "").trim();
}

/** 거래처 이름 — 한글 먼저, 영어 뒤 (세원 10/1: 'mineD 마인디' → '마인디 mineD', 매입 거래처 표기와 같게) */
export function vendorName(raw) {
  const s = String(raw || "").replace(/[()[\]]/g, " ");
  const ko = (s.match(/[가-힣][가-힣0-9]*/g) || []).join(" ").trim();
  const en = (s.match(/[A-Za-z][A-Za-z0-9.&'-]*/g) || []).join(" ").trim();
  return [ko, en].filter(Boolean).join(" ") || s.trim();
}

const squash = (s) => String(s || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const koPart = (s) => squash((String(s || "").replace(/주식회사|\(주\)/g, "").match(/[가-힣]+/g) || []).join(""));
const enPart = (s) => squash((String(s || "").match(/[A-Za-z]+/g) || []).join(""));

const digits = (v) => String(v || "").replace(/\D/g, "");

/**
 * 매입 장부 거래처(돈 › 거래처)에서 같은 곳 찾기.
 * ① 전화번호가 같으면 그 거래처다(이름은 흔들려도 번호는 안 흔들린다 — 장끼 맞추기와 같은 규칙)
 * ② 이름(한글 또는 영어 부분)이 같고, 여럿이면 위치(디오트 1층 C13)가 같은 곳. 이름이 다르면 위치가 같아도 다른 가게로 본다(자리는 바뀐다).
 */
export function findVendor(name, place, vendors, contact) {
  const nums = [contact?.mobile, contact?.tel].map(digits).filter((n) => n.length >= 9);
  const byPhone = nums.length ? (vendors || []).find((v) => nums.includes(digits(v.phone))) : null;
  if (byPhone) return byPhone;
  const ko = koPart(name);
  const en = enPart(name);
  const same = (vendors || []).filter((v) => {
    const vk = koPart(v.name);
    const ve = enPart(v.name);
    return (ko.length >= 2 && vk === ko) || (en.length >= 3 && ve === en);
  });
  if (same.length <= 1) return same[0] || null;
  return same.find((v) => squash(v.address) === squash(place)) || same[0];
}

// ---------------------------------------------------------------- 거래처 연락처 (신상마켓 '제품 설명')
//
// 세원 10/1: "제품 설명을 누르면 거기 카카오톡 아이디, 인스타그램, 전화번호 — 거래처가 만든 정보가 나와. 이것도 같이."
//   Tel : 02-2117-8872 / 매장폰 : 010-4896-9951 / 카카오톡 주문 아이디: ozbridge2 / http://www.ozbridge.co.kr/

const fmtPhone = (raw) => {
  const n = digits(raw);
  const head = n.startsWith("02") ? 2 : 3;
  return `${n.slice(0, head)}-${n.slice(head, n.length - 4)}-${n.slice(-4)}`;
};

/** 제품 설명 글 → {mobile, tel, kakao, insta, site} (없는 건 빈 글) */
export function contactOf(text) {
  const s = String(text || "");
  const c = { mobile: "", tel: "", kakao: "", insta: "", site: "" };
  for (const m of s.matchAll(/(?:^|[^\d])(0\d{1,2}[-.\s)]{0,2}\d{3,4}[-.\s]{0,2}\d{4})(?!\d)/g)) {
    const n = digits(m[1]);
    if (n.length < 9 || n.length > 11) continue;
    const mobile = /^01[016789]/.test(n);
    if (mobile && !c.mobile) c.mobile = fmtPhone(n);
    if (!mobile && !c.tel) c.tel = fmtPhone(n);
  }
  const kUrl = s.match(/(?:pf|open)\.kakao\.com\/[^\s<>"']+/i);
  const kId =
    s.match(/(?:카카오\s*톡?|카톡|kakao\s*talk|kakao)[^\n:：)\]》]{0,14}[:：)\]》]\s*@?([A-Za-z0-9][\w.-]{2,29})/i) ||
    s.match(/(?:카카오\s*톡?|카톡|kakao\s*talk|kakao)\s*(?:주문\s*)?(?:id|아이디)?\s*@?([A-Za-z][\w.-]{2,29})/i);
  c.kakao = kUrl ? kUrl[0] : kId && !/^(https?|www|id)$/i.test(kId[1]) ? kId[1] : "";
  const ig =
    s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i) ||
    s.match(/(?:인스타\s*그램|인스타|insta\s*gram|insta(?!\s*gram))\s*(?:아이디|계정|주소|id)?\s*[:：)\]》=-]?\s*@?([A-Za-z0-9_.]{3,30})/i);
  // 그냥 '@아이디' 만 적힌 건 인스타로 본다 — 카톡 아이디를 '@' 로 적은 것과 겹치면 뺀다
  const bare = ig ? null : s.match(/(?:^|\s)@([A-Za-z0-9_.]{3,30})/);
  const insta = (ig || bare)?.[1]?.replace(/\.$/, "") || "";
  c.insta = insta && !/^(https?|www|com|id|gram)$/i.test(insta) && !(bare && insta === c.kakao) ? insta : "";
  const site = (s.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).find((u) => !/instagram\.com|kakao\.com/i.test(u));
  c.site = site || "";
  return c;
}

/** 연락처를 읽기 좋게 — ['매장폰 010-…', '전화 02-…', '카톡 ozbridge2', '인스타 @…', '홈페이지 …'] */
export function contactLines(c) {
  if (!c) return [];
  return [c.mobile && `매장폰 ${c.mobile}`, c.tel && `전화 ${c.tel}`, c.kakao && `카톡 ${c.kakao}`, c.insta && `인스타 @${c.insta}`, c.site && `홈페이지 ${c.site}`].filter(Boolean);
}

/**
 * 거래처에 연락처 채우기 — **빈 칸만 채우고 이미 적힌 건 건드리지 않는다** (지원이 적어 둔 메모·전화가 기준).
 * 전화 칸은 하나라 휴대폰(매장폰)을 먼저 넣는다(장끼의 전화번호와 맞물린다). 나머지는 메모 뒤에 ' / ' 로 잇는다.
 * 바꿀 게 없으면 null.
 */
export function vendorFill(v, c) {
  if (!c) return null;
  const phone = v.phone || c.mobile || c.tel || "";
  const hay = `${v.memo || ""} ${phone}`.toLowerCase();
  const hayNum = digits(hay);
  const has = (val) => (/^[\d-]+$/.test(val) ? hayNum.includes(digits(val)) : hay.includes(String(val).toLowerCase()));
  const add = [
    [c.mobile, `매장폰 ${c.mobile}`],
    [c.tel, `전화 ${c.tel}`],
    [c.kakao, `카톡 ${c.kakao}`],
    [c.insta, `인스타 @${c.insta}`],
    [c.site, `홈페이지 ${c.site}`],
  ]
    .filter(([val]) => val && !has(val))
    .map(([, line]) => line);
  if (phone === (v.phone || "") && !add.length) return null;
  return { phone, memo: [v.memo, ...add].filter(Boolean).join(" / ") };
}

// ---------------------------------------------------------------- 거래처에 보내는 샘플 요청 글
//
// 세원 10/1: "거래처한테 카톡을 보내는 게 좀 힘든데 자동화할 수 있을까?" — 카카오는 개인 카톡을 밖에서 보내는 길을 안 열어 뒀고
// 매크로는 계정이 제한될 수 있어 안 한다. 대신 **거래처마다 요청 글을 만들어 복사**해 준다(카톡에서 방 열고 붙여넣기만).
// 글은 두 가지 — 처음 거래하는 곳(소개 + 연락처) / 거래해 본 곳(짧게). [상품명] 자리에 그 거래처에 담아 둔 상품 이름이 들어간다.
// 실제 문구(세원 이름·연락처가 든 것)는 코드에 두지 않고 settings 'shoot_msg' {first, again} 에 둔다 — 화면에서 고친다.

export const MSG_SLOT = "[상품명]";
export const DEFAULT_MSGS = {
  first: `안녕하세요 사장님
여성의류 쇼핑몰 ‘포클로’입니다 :)

요번에 [상품명] 상품이
저희 촬영 컨셉과 잘 맞아서 샘플 요청 드리고자 합니다.

촬영 후에는 말씀해주신 기간 내에
깔끔하게 포장해서 반납드리도록 하겠습니다..!

잘 부탁드립니다 :)`,
  again: `사장님 안녕하세요!!

[상품명] 상품이
저희 요번주 촬영 컨셉과 잘 맞아서 샘플 요청 드리고자 합니다.
예쁘게 촬영 후 깔끔하게 포장해서 올려드리겠습니다!
감사합니다.`,
};

/**
 * 카톡 친구 이름 — '건물_상호명' (세원 10/1: "래래 라는 거래처면 디오트_래래 RAERAE")
 * 건물은 위치의 첫 낱말(디오트 지하1층 F15 → 디오트). 첫 낱말이 층·호수면 건물 없이 상호명만.
 */
export function friendName(vendor, place) {
  const first = String(place || "").trim().split(/\s+/)[0] || "";
  const building = /\d|층|호$/.test(first) ? "" : first;
  return [building, String(vendor || "").trim()].filter(Boolean).join("_");
}

/** 틀의 [상품명] 자리에 상품 이름들을 넣는다 — 세원 10/1: "[345,348] 이런 식으로 [] 괄호" */
export const requestText = (tpl, names) => String(tpl || "").split(MSG_SLOT).join(`[${names.join(",")}]`);

// ---------------------------------------------------------------- 신상마켓에서 담기
//
// 신상마켓은 자동 접속을 보안 확인(Cloudflare)으로 막는다(10/1 확인) — 뚫지 않는다.
// 대신 세원이 **자기 브라우저로 보고 있는 상품 화면**에서 즐겨찾기 단추를 누르면, 그 화면의 글·사진을 읽어
// ERP 작은 창(#clip=…)으로 넘긴다. 읽는 코드는 public/clip.js 하나 — 단추는 그걸 불러오고, 막히면 안에 넣어 둔 같은 코드를 돌린다.

/** 즐겨찾기 막대에 끌어다 놓는 단추의 주소. core = clip.js 의 글(막혔을 때 쓸 것) */
export function bookmarklet(origin, core) {
  core = String(core || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n");
  const code =
    `(function(){var o='${origin}';window.__pocloO=o;window.__pocloW=window.open('about:blank','poclo-clip','width=470,height=760');` +
    `var s=document.createElement('script');s.src=o+'/clip.js?t='+Date.now();s.onerror=function(){${core}};document.documentElement.appendChild(s);})();`;
  return "javascript:" + encodeURIComponent(code);
}

const KIND_RULES = [
  ["신발·잡화", /부츠|슈즈|로퍼|샌들|슬리퍼|쪼리|스니커|구두|벨트|가방|숄더백|크로스백|백$|모자|캡$|비니|햇$|스카프|머플러|목걸이|팔찌|귀걸이|양말/],
  ["아우터", /자켓|재킷|점퍼|코트|야상|패딩|집업|바람막이|블루종|트렌치|무스탕|jk$/i],
  ["원피스·세트", /원피스|ops|세트|set$|투피스/i],
  ["하의", /팬츠|바지|슬랙스|데님|청바지|스커트|치마|레깅스|쇼츠|반바지|pt$|sk$|와이드|조거|카고/i],
];

const CAT_RULES = [
  ["신발·잡화", /신발|슈즈|가방|주얼리|잡화|액세서리|모자|양말/],
  ["원피스·세트", /원피스|세트|투피스/],
  ["아우터", /아우터|자켓|재킷|점퍼|코트|패딩/],
  ["하의", /스커트|팬츠|바지|데님|청바지|레깅스|하의/],
  ["상의", /티셔츠|니트|블라우스|셔츠|맨투맨|후드|나시|상의/],
];

/** 상품명으로 옷 종류 짐작 (틀리면 담는 창에서 고친다) */
export function guessKind(title, cat = "") {
  // 신상마켓 갈래(여성 > 미디/롱스커트)가 같이 왔으면 그걸 먼저 믿는다 — 상품명만으로는 '뒷밴딩' 같은 말이라 모른다
  for (const [kind, re] of CAT_RULES) if (re.test(cat)) return kind;
  for (const [kind, re] of KIND_RULES) if ((title || "").split(/\s+/).some((w) => re.test(w)) || re.test(title || "")) return kind;
  return "상의";
}

const PRICE = /[₩￦]\s?([\d,]{3,})|([\d,]{4,})\s?원/;
const FLOOR = /(지하\s?\d+\s*층|\d+\s*층|B\d)/;
// 상품 칸의 작은 제목들 — 여기서 앞 칸이 끝난다
const SECTION = /^(상세정보|세탁 및 상품 주의사항|제품 설명|재고문의|연관 추천 상품)$|^상품 문의\s*(\(\d+\))?$|^총 금액/;
const NOISE = /랭킹|^\d+위$|^[\d,]+$|^NEW$|^BEST$|^디테일컷|^인기상품|^유사한 상품|^[^0-9A-Za-z가-힣]+$/;

/** 주소에 든 상품번호 (상품을 누르면 주소 뒤에 modalGid=… 가 붙는다) */
const urlGoods = (u) => (String(u || "").match(/(?:modalGid|gid|goodsId)=(\d{6,11})/i) || String(u || "").match(/\/goods\/(\d{6,11})/) || [])[1] || "";

/**
 * 담기 단추가 넘긴 것 {u, ti, t, im, ph, v, g, a, ds, hd} → 상품 칸.
 * 신상마켓 상품 창의 글 순서 (세원 10/1 화면): 거래처명 / 위치(디오트 1층 C09) / 상품명 / 상품번호 / ₩가격 /
 *   상세정보(제조국·색상·사이즈·혼용률·낱장여부·상품등록정보) / (세탁 및 상품 주의사항) / 제품 설명 / 상품 문의 / 재고문의…
 * **상품번호 줄을 기준으로** 위아래를 읽는다 — 주변 글(뒤에 깔린 목록·필터)이 같이 와도 엉뚱한 걸 안 집는다.
 * 번호를 모르면 '상세정보' 줄을 기준으로 한다.
 */
export function parseClip(d) {
  const lines = String(d.t || "")
    .split("\n")
    .map((s) => s.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  const known = String(d.g || urlGoods(d.u) || "");
  const gi = known ? lines.indexOf(known) : -1;
  const di = lines.findIndex((l, i) => i > gi && l === "상세정보");
  const ref = gi >= 0 ? gi : di;
  // 위치 — 기준 줄 위에서 가장 가까운 '○층' 줄(기준이 없으면 맨 처음 것). 그 윗줄이 거래처
  const isPlace = (l) => FLOOR.test(l) && l.length <= 30 && !PRICE.test(l);
  let li = ref >= 0 ? -1 : lines.findIndex(isPlace);
  for (let i = ref - 1; i >= 0 && li < 0; i--) if (isPlace(lines[i])) li = i;
  const place = li >= 0 ? lines[li] : "";
  // 가격 — 상품번호(없으면 위치) 아래에서 처음 나오는 ₩ 줄. '₩' 와 숫자가 줄이 갈려 있어도 읽는다
  let pi = -1;
  let price = 0;
  for (let i = Math.max(gi, li, 0); i < lines.length; i++) {
    if (i === di) break;
    const m = lines[i].match(PRICE);
    const split = /^[₩￦]$/.test(lines[i]) && /^[\d,]{3,}$/.test(lines[i + 1] || "");
    if (m || split) {
      pi = i;
      price = Number((m ? m[1] || m[2] : lines[i + 1]).replace(/[^\d]/g, ""));
      break;
    }
  }
  // 상품명 — 위치와 상품번호(없으면 가격) 사이의 마지막 글
  const end = gi >= 0 ? gi : pi >= 0 ? pi : di >= 0 ? di : Math.min(lines.length, Math.max(li, 0) + 8);
  const head = lines.slice(li >= 0 ? li + 1 : Math.max(0, end - 4), end);
  const title = head.filter((l) => !NOISE.test(l)).pop() || "";
  const goodsId = (gi >= 0 ? known : "") || head.filter((l) => /^\d{7,11}$/.test(l)).pop() || known;
  let si = li - 1;
  while (si > 0 && NOISE.test(lines[si])) si--;
  const store = si >= 0 ? lines[si] : "";
  // 상세정보 — '색상\t크림, …' 한 줄이거나 '색상' 다음 줄. 상세정보 칸 안에서만 찾는다(옆 필터·제품 설명의 '색상' 과 헷갈리지 않게)
  const after = (i) => {
    const n = lines.findIndex((l, k) => k > i && SECTION.test(l));
    return n < 0 ? lines.length : n;
  };
  const detail = di >= 0 ? lines.slice(di, after(di)) : lines;
  const field = (label) => {
    const i = detail.findIndex((l) => l === label || l.startsWith(label + "\t") || l.startsWith(label + " "));
    if (i < 0) return "";
    const rest = detail[i].slice(label.length).trim();
    return rest || detail[i + 1] || "";
  };
  // 제품 설명 — 단추가 따로 읽어 준 것(ds)이 있으면 그것, 없으면 글에서
  const pi2 = lines.findIndex((l, i) => i > Math.max(gi, di) && l === "제품 설명");
  const desc = (d.ds ? String(d.ds).split("\n") : pi2 >= 0 ? lines.slice(pi2 + 1, after(pi2)) : [])
    .filter((l) => /[0-9A-Za-z가-힣]/.test(l)) // 접고 펴는 +, — 표시 같은 줄은 뺀다
    .join("\n")
    .trim();
  // 갈래(여성 > 미디/롱스커트) — 상품 창 맨 위의 짧은 글 몇 줄 (사진 칸·거래처 이름이 나오기 전까지)
  const cat = [];
  for (const l of String(d.hd || "").split("\n").map((x) => x.trim()).filter(Boolean)) {
    if (cat.length >= 3 || l === store || l.length > 20 || /^유사한 상품|^\d+\s*\/\s*\d+$|^대표$/.test(l)) break;
    cat.push(l);
  }
  const name = cleanName(title);
  return {
    // 위치가 없어도 상품번호 줄을 찾았으면 그 상품이 맞다
    ok: !!(title && (place || gi >= 0)),
    name,
    fullName: title,
    vendor: vendorName(store),
    place,
    price,
    goodsId,
    url: d.u || "",
    colors: field("색상"),
    sizes: field("사이즈"),
    fabric: field("혼용률"),
    origin: field("제조국"),
    kind: guessKind(`${name} ${title}`, cat.join(" ")),
    contact: contactOf(desc),
    desc: desc.slice(0, 800),
    photoUrl: (d.im || [])[0] || "",
    photoData: d.ph || "",
  };
}

/** 주소 뒤 #clip=… 읽기 */
export function readClipHash(hash) {
  const m = String(hash || "").match(/^#clip=(.+)$/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}
