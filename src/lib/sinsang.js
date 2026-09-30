// 신상 관리 (2026-10-01) — 노션 '쇼필공 OS' 의 신상관리 7쪽을 한 화면의 흐름으로.
//
// 세원(10/1, 노션 화면 17장과 함께): "샘플/사입 예정 등록 → 입고 픽 관리 → 코디 촬영 관리 → 업데이트 관리,
//   반납 등록하면 보류/반납 리스트, 입고일 기준 2주 안에 반납 — 샘플 반납/결제 관리. 지원이가 거의 다 관리하는데
//   들어갈 곳이 많고 복잡하다. 효율적으로 바꿀 건 바꾸고 디벨롭할 건 디벨롭해 줘."
//   "샘플/사입 예정 등록은 신상마켓 링크만 넣으면 딱 되게."
//
// 노션은 같은 상품을 쪽마다 다른 보기로 다시 찾았다. 여기서는 **상품 한 장이 단계를 옮겨 다닌다**:
//   요청(request) → 입고·픽(arrived) → 촬영(pick) → 등록(shot) → 완료(done)   / 보류·드랍(drop)
// 샘플의 끝(반납 또는 결제)은 단계와 따로 간다 — 픽해서 촬영·등록까지 한 샘플도 기한 안에 반납하거나 결제해야 하므로.
//   반납 기한 = 입고일 + 14일(상품마다 바꿀 수 있음). settle: "returned" | "paid".
//
// shoot_items 한 줄:
//   {id, type:"sample"|"buy", stage, name, vendor, place, kind, price, url, goodsId, photo(보관 이름)|photoUrl(바깥 주소),
//    colors, sizes, fabric, origin, memo,
//    asked, pickup, retryOn,               // 거래처 샘플 요청 · 샘플 픽업 요청 · 샘플 재요청 날짜
//    arrivedOn, arrivedOpts,               // 입고일 · 입고된 색상·사이즈
//    pickedOn, shootDate, shotOn, doneOn, channels:{cafe24,ably,zigzag,naver},
//    returning, hold, packed, settle, settledOn, returnDays, buyPrice,
//    notes:[{by, text, at}], createdAt}

import { dayKey, shiftDay } from "./journal";

export const STAGES = [
  ["request", "요청", "샘플·사입을 요청한 상품"],
  ["arrived", "입고·픽", "들어온 상품 — 입어 보고 픽할지 정해요"],
  ["pick", "촬영", "픽한 상품 — 촬영 대기"],
  ["shot", "등록", "촬영 끝 — 상품등록 대기"],
  ["done", "완료", "등록까지 끝난 상품"],
];
export const stageName = (k) => (k === "drop" ? "보류·드랍" : STAGES.find(([s]) => s === k)?.[1] || "요청");

export const CHANNELS = [
  ["cafe24", "카페24"],
  ["ably", "에이블리"],
  ["zigzag", "지그재그"],
  ["naver", "스마트스토어"],
];

export const RETURN_DAYS = 14;

/** 예전(9/30 첫 판) 상품은 status 만 있다 — 새 단계로 읽는다 */
const OLD = { want: "request", arrived: "arrived", pick: "pick", planned: "pick", shot: "shot", back: "drop" };
export function normalize(x) {
  return { type: "sample", ...x, stage: x.stage || OLD[x.status] || "request" };
}

/** 반납 기한 — 샘플이고 입고일이 있고 아직 반납·결제 전일 때만 */
export function dueOf(x) {
  if (x.type === "buy" || !x.arrivedOn || x.settle) return "";
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

/** 단계를 옮길 때 같이 적는 것 — 날짜는 그때 오늘로 */
export function moveTo(x, stage, today = dayKey()) {
  const p = { stage };
  if (stage === "arrived") Object.assign(p, { arrivedOn: x.arrivedOn || today, returning: false, hold: false });
  if (stage === "pick") Object.assign(p, { pickedOn: x.pickedOn || today, returning: false, hold: false });
  if (stage === "shot") p.shotOn = x.shotOn || today;
  if (stage === "done") p.doneOn = x.doneOn || today;
  return { ...x, ...p };
}

// ---------------------------------------------------------------- 신상마켓에서 담기
//
// 신상마켓은 자동 접속을 보안 확인(Cloudflare)으로 막는다(10/1 확인) — 뚫지 않는다.
// 대신 세원이 **자기 브라우저로 보고 있는 상품 화면**에서 즐겨찾기 단추(북마클릿)를 누르면,
// 그 화면에 보이는 글·사진을 읽어 ERP 작은 창(#clip=…)으로 넘긴다. 캡처해서 붙이던 걸 한 번 누르기로.

/** 즐겨찾기 막대에 끌어다 놓는 단추의 주소 */
export function bookmarklet(origin) {
  // String.raw — 정규식의 \s \d 가 그대로 들어가야 한다
  const code = String.raw`(async function(){
var w=window.open('about:blank','poclo-clip','width=470,height=760');
var els=[].slice.call(document.querySelectorAll('div,section,article,main')),best=null,bl=1e9;
for(var i=0;i<els.length;i++){var s=els[i].innerText||'',n=s.length;if(n>120&&n<4000&&/[₩￦]\s?[\d,]{3,}|[\d,]{4,}\s?원/.test(s)&&/혼용률|제조국/.test(s)&&n<bl){best=els[i];bl=n;}}
var node=best;for(var k=0;k<4&&node&&node.parentElement&&!/\d+\s*층/.test(node.innerText||'');k++){if((node.parentElement.innerText||'').length<6000)node=node.parentElement;else break;}
var t=node?node.innerText:'';
if(!t){var all=document.body.innerText,m=all.search(/[₩￦]\s?[\d,]{3,}/);t=all.slice(Math.max(0,m-700),m+1500);}
var vw=innerWidth,vh=innerHeight;
var imgs=[].slice.call(document.images).filter(function(g){var r=g.getBoundingClientRect();return g.naturalWidth>=200&&r.width>=120&&r.bottom>0&&r.top<vh&&r.right>0&&r.left<vw;}).map(function(g){var r=g.getBoundingClientRect();return{s:g.currentSrc||g.src,a:r.width*r.height};}).sort(function(a,b){return b.a-a.a;}).slice(0,5).map(function(x){return x.s;});
var d={u:location.href,ti:document.title,t:t.slice(0,4000),im:imgs,ph:''};
try{if(imgs[0]){var b=await(await fetch(imgs[0],{mode:'cors'})).blob();var bm=await createImageBitmap(b);var q=Math.min(1,720/Math.max(bm.width,bm.height));var c=document.createElement('canvas');c.width=Math.round(bm.width*q);c.height=Math.round(bm.height*q);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);var du=c.toDataURL('image/jpeg',0.72);if(du.length<400000)d.ph=du;}}catch(e){}
var url='${origin}/#clip='+encodeURIComponent(JSON.stringify(d));
if(w){w.location.href=url;w.focus();}else{location.href=url;}
})();`;
  return "javascript:" + encodeURIComponent(code.replace(/\n/g, ""));
}

const KIND_RULES = [
  ["신발·잡화", /부츠|슈즈|로퍼|샌들|슬리퍼|쪼리|스니커|구두|벨트|가방|백\b|숄더백|크로스백|모자|캡|비니|햇|스카프|머플러|목걸이|팔찌|귀걸이|양말/],
  ["아우터", /자켓|재킷|점퍼|코트|야상|패딩|집업|바람막이|블루종|트렌치|무스탕|JK|jk/],
  ["원피스·세트", /원피스|OPS|ops|세트|SET|set|투피스/],
  ["하의", /팬츠|바지|슬랙스|데님|청바지|진\b|스커트|치마|스커트|레깅스|쇼츠|반바지|PT|pt|SK|sk|와이드|조거|카고/],
];

/** 상품명으로 옷 종류 짐작 (틀리면 담는 창에서 고친다) */
export function guessKind(title) {
  for (const [kind, re] of KIND_RULES) if (re.test(title || "")) return kind;
  return "상의";
}

/**
 * 담기 단추가 넘긴 것 {u, ti, t, im, ph} → 상품 칸.
 * 신상마켓 상품 화면의 글 순서: 거래처명 / 위치(디오트 3층 E18) / (랭킹 표시) / 상품명 / 상품번호 / ₩가격 / 상세정보(제조국·색상·사이즈·혼용률…)
 */
export function parseClip(d) {
  const lines = String(d.t || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const pi = lines.findIndex((l) => /^[₩￦]\s?[\d,]{3,}$/.test(l) || /^[\d,]{4,}\s?원$/.test(l));
  const price = pi >= 0 ? Number(lines[pi].replace(/[^\d]/g, "")) : 0;
  const head = pi >= 0 ? lines.slice(0, pi) : lines.slice(0, 12);
  const noise = (l) => /랭킹|^\d+위$|^[\d,]+$|^NEW$|^BEST$|^디테일컷|^인기상품|^유사한 상품/.test(l);
  // 상품번호 — 가격 바로 위의 숫자 줄, 없으면 주소에서
  let goodsId = "";
  for (let i = head.length - 1; i >= Math.max(0, head.length - 3); i--) if (/^\d{7,11}$/.test(head[i])) goodsId = head[i];
  if (!goodsId) goodsId = (String(d.u || "").match(/(\d{8,11})/) || [])[1] || "";
  const texts = head.filter((l) => !noise(l));
  const title = texts[texts.length - 1] || String(d.ti || "").split("|")[0].trim();
  // 위치 — '○층' 이 든 줄. 그 윗줄이 거래처
  const li = head.findIndex((l) => /\d+\s*층|지하|B\d/.test(l) && l.length <= 30);
  const place = li >= 0 ? head[li] : "";
  const store = li > 0 ? head[li - 1] : texts.length > 1 ? texts[0] : "";
  // 상세정보 — '색상\t크림, …' 한 줄이거나 '색상' 다음 줄
  const field = (label) => {
    const i = lines.findIndex((l) => l === label || l.startsWith(label + "\t") || l.startsWith(label + " "));
    if (i < 0) return "";
    const rest = lines[i].slice(label.length).trim();
    return rest || lines[i + 1] || "";
  };
  const short = (s) => String(s || "").split(/[([]/)[0].trim();
  return {
    name: short(title) || title,
    fullName: title,
    vendor: short(store),
    vendorFull: store,
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
