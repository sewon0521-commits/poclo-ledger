/**
 * 사입 트래커 계산 (2026-10-19) — 보고 › 사입 트래커.
 * 사무실 PC poclo-cafe24/tracker.py 가 매일 아침 settings 'tracker_<날짜>' 에 경쟁몰 베스트를 남긴다.
 * 여기서는 **두 날 기록을 비교**(1일 변화 = 바로 전 기록, 7일 변화 = 7일 전 기록)하고 품목·가격대로 묶는다.
 * 비교를 화면에서 하므로 7일 변화도 따로 저장할 게 없다(기록은 30일 남는다).
 */

/** 품목 — 화면 순서. 한국 쇼핑몰 상품명은 옷 이름이 끝 쪽에 오므로 **가장 뒤에 나오는 낱말**로 정한다 */
export const CATS = ["아우터", "가디건", "니트", "블라우스·셔츠", "티·탑", "원피스", "세트·코디", "스커트", "데님팬츠", "와이드팬츠", "슬랙스", "팬츠(기타)", "신발", "가방", "잡화", "기타"];

const END = "(?=$|[\\s()\\[\\]/,·+\\-_~!]|\\d)"; // 낱말 끝
const WORDS = [
  ["아우터", "자켓|재킷|쟈켓|코트|점퍼|패딩|트렌치|블루종|야상|무스탕|바람막이|집업|아노락|조끼|베스트(?=$|\\s)|jacket|coat|jumper|blouson|parka|vest" + END + "|jk" + END],
  ["가디건", "가디건|가디간|cardigan"],
  ["니트", "니트|스웨터|knit|(?<=[가-힣])nt" + END],
  ["블라우스·셔츠", "블라우스|셔츠|남방|blouse|shirts?" + END],
  ["티·탑", "티셔츠|맨투맨|후드티|후디|스웨트|탑|나시|슬리브리스|민소매|캐미솔|뷔스티에|브라탑|롱슬리브|sweat ?shirts?|t-shirts?|long ?sleeves?|sleeveless|mtm|hoodie|tee|top" + END + "|티" + END + "|(?<=[가-힣\\s])t" + END],
  ["원피스", "원피스|드레스|ops" + END + "|dress"],
  ["세트·코디", "세트|셋업|투피스|set" + END],
  ["스커트", "스커트|치마|skirt|(?<=[가-힣])sk" + END],
  ["팬츠", "팬츠|바지|슬랙스|청바지|데님|진" + END + "|조거|트레이닝|카고|부츠컷|레깅스|쇼츠|pants|jeans?|denim|slacks|shorts|trousers|(?<=[가-힣])(pt|p)" + END],
  ["신발", "부츠(?!컷)|로퍼|샌들|슬리퍼|플랫|힐" + END + "|스니커즈|운동화|뮬" + END + "|어그|슈즈|메리제인|shoes"],
  ["가방", "가방|토트|숄더백|크로스백|백팩|(?<=[가-힣])백" + END + "|bag"],
  ["잡화", "목걸이|귀걸이|반지|팔찌|벨트|모자|볼캡|비니|머플러|스카프|양말|헤어|집게핀|선글라스|장갑|워머|scarf|belt|muffler|cap" + END],
].map(([cat, re]) => [cat, new RegExp(re, "gi")]);

/** '[가을/단독] 세레니 핀턱 퍼프 블라우스 (출근룩/데이트룩)' → '블라우스·셔츠' */
export function catOf(name) {
  const full = String(name || "");
  const n = full
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|【[^】]*】/g, " ")
    .replace(/[-–—]\s*\d+\s*(colou?rs?|c|컬러|size|사이즈).*$/i, " ")
    .replace(/\s+/g, " ");
  let best = null;
  for (const [cat, re] of WORDS) {
    re.lastIndex = 0;
    for (const m of n.matchAll(re)) {
      const end = m.index + m[0].length;
      if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { cat, end, len: m[0].length };
    }
  }
  // 상의 + 하의 묶음(나그랑 골지 티+폴딩 부츠컷 팬츠)은 세트
  if (/\+/.test(n) && best && /(코디|세트|set)/i.test(full)) return "세트·코디";
  if (!best) return /(코디|세트|set)/i.test(full) ? "세트·코디" : "기타";
  if (best.cat !== "팬츠") return best.cat;
  if (/데님|청바지|진(?=$|\s)|jeans?|denim/i.test(n)) return "데님팬츠";
  if (/와이드|wide/i.test(n)) return "와이드팬츠";
  if (/슬랙스|slacks/i.test(n)) return "슬랙스";
  return "팬츠(기타)";
}

/** 가격대 — 쇼만마 트래커와 같은 다섯 칸(10/19 세원 화면) */
export const BANDS = [
  ["~1.9만", 0, 19999],
  ["2만~2.9만", 20000, 29999],
  ["3만~3.9만", 30000, 39999],
  ["4만~5.9만", 40000, 59999],
  ["6만~", 60000, Infinity],
];
export function priceBand(p) {
  if (!p) return "";
  return BANDS.find(([, a, b]) => p >= a && p <= b)?.[0] || "";
}

/** 몰이 직접 만든 상품(MADE·자체제작) — 동대문에서 사입할 수 없는 것 */
export const isMade = (name) => /\bmade\b|자체\s*제작|p\.b\b/i.test(String(name || ""));

/**
 * 품목 안 디테일 키워드 — 핏·소재·넥라인·무늬·기장 (쇼만마 '품목 랭킹 디테일 키워드'와 같은 생각, 낱말은 우리 타겟에 맞춰)
 * → [{word, malls, count}] 몰 수 많은 순
 */
const DETAIL = [
  ["크롭", "크롭|crop"], ["오버핏", "오버핏|오버 ?사이즈|over"], ["루즈핏", "루즈|loose"], ["슬림", "슬림|slim"], ["와이드", "와이드|wide"],
  ["부츠컷·플레어", "부츠컷|플레어|flare"], ["벌룬", "벌룬"], ["밴딩", "밴딩|밴드"], ["셔링", "셔링|shirring"], ["프릴·러플", "프릴|러플"],
  ["레이스", "레이스|lace"], ["골지", "골지|립|rib"], ["울·캐시미어", "울|wool|캐시미어|cashmere"], ["모헤어·앙고라·알파카", "모헤어|mohair|앙고라|알파카"],
  ["코듀로이·골덴", "코듀로이|골덴|corduroy"], ["워싱·빈티지", "워싱|워시드|washed|빈티지|vintage"], ["퍼·양털·무스탕", "퍼|양털|무스탕|플리스|fleece|뽀글"],
  ["레더·스웨이드", "레더|leather|스웨이드|suede"], ["트위드", "트위드|tweed"], ["체크", "체크|check|타탄"], ["스트라이프", "스트라이프|stripe|단가라"],
  ["도트·플라워", "도트|땡땡이|플라워|flower|꽃"], ["브이넥", "브이넥|v넥|v-?neck|딥브이|딥v"], ["하이넥·터틀", "하이넥|터틀|폴라|목폴라"],
  ["카라", "카라|collar|폴로"], ["후드", "후드|hood"], ["집업", "집업|zip"], ["버튼·단추", "버튼|단추|button"], ["포켓", "포켓|pocket|카고"],
  ["플리츠·주름", "플리츠|주름|pleat"], ["미니", "미니|mini"], ["미디", "미디|midi"], ["롱·맥시", "맥시|롱(?!슬리브)|long"], ["기모", "기모|fleece"],
  ["1+1·기획", "1\\+1|기획"],
].map(([w, re]) => [w, new RegExp(re, "i")]);
export function detailWords(items) {
  const rows = [];
  for (const [word, re] of DETAIL) {
    const hit = items.filter((x) => re.test(x.name || ""));
    if (hit.length) rows.push({ word, re, malls: new Set(hit.map((x) => x.host)).size, count: hit.length });
  }
  return rows.sort((a, b) => b.malls - a.malls || b.count - a.count).slice(0, 8);
}

/** 어느 기록과 비교할지 — 1일 = 바로 전 기록, 7일 = 7일 전(없으면 가장 오래된 것) */
export function baseDay(days, day, span) {
  const older = days.filter((d) => d < day).sort().reverse();
  if (!older.length) return { base: "", exact: false };
  if (span === 1) return { base: older[0], exact: true };
  const want = shift(day, -span);
  const hit = older.find((d) => d <= want);
  return hit ? { base: hit, exact: hit === want } : { base: older[older.length - 1], exact: false };
}
export function shift(day, n) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

/**
 * 두 기록 비교 → 상품 줄 [{…item, mall, host, style, cat, band, was, gone}]
 * was = 기준일 순위(없으면 null = 새로 들어옴). 기준일에 그 몰 기록이 없으면(몰을 새로 넣었음) known=false — NEW 로 세지 않는다.
 * conf = 지금 몰 목록(스타일을 바꿨으면 그걸로)
 */
export function compareSnaps(cur, base, conf = {}) {
  const out = [];
  const gone = [];
  for (const [host, m] of Object.entries(cur?.malls || {})) {
    const style = conf[host]?.style || m.style;
    const name = conf[host]?.name || m.name;
    if (conf[host]?.off) continue;
    const b = base?.malls?.[host];
    const known = !!b?.items?.length;
    const was = new Map((b?.items || []).map((x) => [x.id, x.rank]));
    for (const it of m.items || []) {
      out.push({ ...it, mall: name, host, style, cat: catOf(it.name), band: priceBand(it.price), made: isMade(it.name), was: known ? (was.get(it.id) ?? null) : undefined, known });
    }
    if (known) {
      const now = new Set((m.items || []).map((x) => x.id));
      for (const x of b.items) if (!now.has(x.id)) gone.push({ ...x, mall: name, host, style, cat: catOf(x.name), band: priceBand(x.price), was: x.rank, gone: true, known });
    }
  }
  return { items: out, gone };
}

/** 품목별 — 몇 개 몰 베스트에 들었나(사입 우선순위) */
export function catBoard(items) {
  const by = new Map();
  for (const it of items) {
    const c = by.get(it.cat) || { cat: it.cat, malls: new Set(), items: [] };
    c.malls.add(it.host);
    c.items.push(it);
    by.set(it.cat, c);
  }
  return [...by.values()]
    // 사진은 새로 들어온 것 먼저, 그다음 순위 높은 것
    .map((c) => ({ ...c, mallCount: c.malls.size, items: c.items.sort((a, b) => (b.was === null) - (a.was === null) || a.rank - b.rank) }))
    .sort((a, b) => b.mallCount - a.mallCount || b.items.length - a.items.length);
}

/** 가장 많은 가격대 */
export function topBand(items) {
  const c = new Map();
  let n = 0;
  for (const it of items) {
    if (!it.band) continue;
    c.set(it.band, (c.get(it.band) || 0) + 1);
    n++;
  }
  const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { band: top[0], share: top[1] / n } : null;
}
