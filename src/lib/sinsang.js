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
//    asked, pickup, retryOn,               // 거래처 샘플 요청 · 샘플 픽업 요청 · 샘플 재요청 날짜
//    arrivedOn, arrivedOpts,               // 입고일 · 입고된 색상·사이즈
//    pickedOn, shootDate, shootOpts,       // 촬영 날짜 · 촬영 색상 및 사이즈
//    shotOn, doneOn, channels:{cafe24},
//    returning, hold, packed, packedOn, paid, returnedOn, returnDays,
//    notes:[{by, text, at}], createdAt}

import { dayKey, shiftDay } from "./journal";

export const STAGES = [
  ["request", "요청", "샘플·사입을 요청한 상품"],
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

/**
 * 신상마켓 상품명 → 부르는 이름 (세원 10/1):
 *   '가을신상)유카 셔링 하이넥 집업 바람막이 점퍼' → '유카 셔링 하이넥 집업 바람막이'
 *   '신상) 로이 하이넥 집업 니트 (도톰 니트가디건)' → '로이 하이넥 집업'      '가을 신상) 로즈sk' → '로즈sk'
 * ① 맨 앞 '…)' 머리말을 뗀다 ② 괄호·대괄호 안을 뗀다 ③ 끝 낱말이 큰 갈래 말(점퍼·니트…)이고 바로 앞이 이미 옷 모양 말(집업·바람막이…)이면 끝 낱말을 뗀다.
 */
export function cleanName(title) {
  let s = String(title || "").trim();
  s = s.replace(/^[^()[\]]{0,14}\)\s*/, ""); // 가을신상) · 신상) · ss신상)
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[★☆♥♡●◆■]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const w = s.split(" ");
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

/**
 * 매입 장부 거래처(돈 › 거래처)에서 같은 곳 찾기. 이름(한글 또는 영어 부분)이 같고,
 * 여럿이면 위치(디오트 1층 C13)가 같은 곳을 고른다. 이름이 다르면 위치가 같아도 다른 가게로 본다(자리는 바뀐다).
 */
export function findVendor(name, place, vendors) {
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

// ---------------------------------------------------------------- 신상마켓에서 담기
//
// 신상마켓은 자동 접속을 보안 확인(Cloudflare)으로 막는다(10/1 확인) — 뚫지 않는다.
// 대신 세원이 **자기 브라우저로 보고 있는 상품 화면**에서 즐겨찾기 단추를 누르면, 그 화면의 글·사진을 읽어
// ERP 작은 창(#clip=…)으로 넘긴다. 읽는 코드는 public/clip.js 하나 — 단추는 그걸 불러오고, 막히면 안에 넣어 둔 같은 코드를 돌린다.

/** 즐겨찾기 막대에 끌어다 놓는 단추의 주소. core = clip.js 의 글(막혔을 때 쓸 것) */
export function bookmarklet(origin, core) {
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

/** 상품명으로 옷 종류 짐작 (틀리면 담는 창에서 고친다) */
export function guessKind(title) {
  for (const [kind, re] of KIND_RULES) if (re.test(title || "")) return kind;
  return "상의";
}

const PRICE = /[₩￦]\s?([\d,]{3,})|([\d,]{4,})\s?원/;
const FLOOR = /(지하\s?\d+\s*층|\d+\s*층|B\d)/;

/**
 * 담기 단추가 넘긴 것 {u, ti, t, im, ph} → 상품 칸.
 * 신상마켓 상품 화면의 글 순서: 거래처명 / 위치(디오트 3층 E18) / (랭킹 표시) / 상품명 / 상품번호 / ₩가격 / 상세정보(제조국·색상·사이즈·혼용률…)
 */
export function parseClip(d) {
  const lines = String(d.t || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  // 위치 — '○층' 이 든 짧은 줄 중 첫 번째. 그 윗줄이 거래처
  const li = lines.findIndex((l) => FLOOR.test(l) && l.length <= 30);
  const place = li >= 0 ? lines[li] : "";
  // 가격 — 위치 아래에서 처음 나오는 ₩ 줄 (한 줄에 다른 글이 같이 있어도, '₩' 와 숫자가 줄이 갈려 있어도)
  let pi = -1;
  let price = 0;
  for (let i = Math.max(0, li); i < lines.length; i++) {
    const m = lines[i].match(PRICE);
    const split = /^[₩￦]$/.test(lines[i]) && /^[\d,]{3,}$/.test(lines[i + 1] || "");
    if (m || split) {
      pi = i;
      price = Number((m ? m[1] || m[2] : lines[i + 1]).replace(/[^\d]/g, ""));
      break;
    }
    if (lines[i] === "상세정보") break;
  }
  const di = lines.indexOf("상세정보");
  const end = pi >= 0 ? pi : di >= 0 ? di : Math.min(lines.length, Math.max(li, 0) + 8);
  const head = lines.slice(Math.max(0, li + 1), end);
  const noise = (l) => /랭킹|^\d+위$|^[\d,]+$|^NEW$|^BEST$|^디테일컷|^인기상품|^유사한 상품/.test(l);
  // 상품번호 — 가격 바로 위의 숫자 줄, 없으면 주소에서
  let goodsId = head.filter((l) => /^\d{7,11}$/.test(l)).pop() || "";
  if (!goodsId) goodsId = (String(d.u || "").match(/(\d{8,11})/) || [])[1] || "";
  const texts = head.filter((l) => !noise(l));
  const title = texts[texts.length - 1] || "";
  const store = li > 0 ? lines[li - 1] : "";
  // 상세정보 — '색상\t크림, …' 한 줄이거나 '색상' 다음 줄. 상세정보 아래에서만 찾는다(옆 필터의 '색상' 과 헷갈리지 않게)
  const detail = di >= 0 ? lines.slice(di) : lines;
  const field = (label) => {
    const i = detail.findIndex((l) => l === label || l.startsWith(label + "\t") || l.startsWith(label + " "));
    if (i < 0) return "";
    const rest = detail[i].slice(label.length).trim();
    return rest || detail[i + 1] || "";
  };
  return {
    ok: !!(title && place),
    name: cleanName(title),
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
    kind: guessKind(title),
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
