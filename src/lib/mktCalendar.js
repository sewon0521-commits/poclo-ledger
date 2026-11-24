// 마케팅 캘린더 (2026-11-25, 포클로_방향성 창)
//
// 세원: "마케팅 캘린더 — 아이보스 같은 거 참고해서 월별 이벤트, 올해 데이터로 다음 해 대비, 월별로 어떤 이슈가 있는지, 4-5월 성수기·8월 동대문 휴가 등등"
//   + "이벤트 캘린더랑 합치는 게 맞아 보이긴 해" + "이벤트 캘린더는 만들 거여?" → 이벤트 캘린더 화면(EventsPage)을 '마케팅 캘린더'로 이름 바꾸고 달력 위에 '이 달 노트'.
// 세원 정정(같은 날): "8월 동대문 휴가 전에 가을 소싱해서 올려도 그때 안 팔렸어(모델 바꾸기 전이라 실루엣 문제도) — 전에 촬영해 두고 보정·릴스·소재까지 끝내되
//   여름 상품을 계속 올려야 되는 비수기야." → 달마다 '올릴 것'과 '준비할 것'을 따로 적는다.
//
// settings 'mkt_calendar' {months: {"1": {season, industry, shopping, upload, prep, record, at}, … "12"}}
//   달(1~12)마다 한 장 — 이슈는 해마다 되풀이되니까 해를 나누지 않는다. 해마다 다른 숫자(그달 매출·광고비)는 저장하지 않고 매출 장부에서 그때그때 센다(monthStats).
//   한 번도 안 고친 달은 아래 DRAFT(Claude 초안)를 보여 주고 '초안' 표시 — 고쳐서 저장하면 그 달만 서버에 들어간다(초안은 서버에 안 씀).

export const KEY = "mkt_calendar";

/** 칸 — 화면 순서. tone = 색(올릴 것 로즈 · 준비할 것 앰버) */
export const FIELDS = [
  { k: "upload", label: "올릴 것", hint: "이 달에 실제로 올리는 옷·이벤트", tone: "rose" },
  { k: "prep", label: "준비할 것", hint: "다음 시즌을 위해 이 달에 미리 끝낼 것(소싱·촬영·보정·릴스·소재·쿠폰)", tone: "amber" },
  { k: "season", label: "시즌·날씨", hint: "옷이 바뀌는 때·날씨" },
  { k: "industry", label: "업계 이슈", hint: "동대문 휴무·성수기·비수기·경쟁몰 움직임" },
  { k: "shopping", label: "쇼핑 이슈·기념일", hint: "개강·연휴·기념일·쇼핑 행사" },
  { k: "record", label: "지난 기록 메모", hint: "잘 팔린 것·했던 이벤트·실수 — 숫자는 매출 장부에서 저절로" },
];

/** Claude 초안 (11/25) — 세원이 고치면 그 달은 세원 글로. 날짜가 해마다 바뀌는 건(설·추석) 달만 적었다. */
export const DRAFT = {
  1: {
    season: "한겨울\n겨울 아우터·니트 끝물",
    industry: "겨울 시즌오프 시작\n동대문 봄 신상이 1월 말부터 조금씩\n설 연휴 앞뒤로 쉬는 거래처 많음 → 연휴 1주 전 사입 마감",
    shopping: "신년\n겨울 세일 시즌",
    upload: "겨울 아우터·니트\n시즌오프 할인",
    prep: "봄 간절기 소싱 시작\n설 연휴 배송 안내 문구\n2월 회원 쿠폰(1월 말 전)",
    record: "",
  },
  2: {
    season: "늦겨울 → 봄 간절기\n아직 추움",
    industry: "설 연휴(2027년은 2월 초) — 동대문·택배 쉼, 앞뒤로 배송 지연\n봄 신상 본격적으로 나오기 시작",
    shopping: "발렌타인데이 2/14\n졸업·입학 준비",
    upload: "겨울 마무리\n봄 간절기 첫 드랍(가디건·니트·셔츠)",
    prep: "3월 개강·봄 아우터 소싱·촬영\n3월 회원 쿠폰",
    record: "2026: 2월 21일부터 매출 기록 시작(운영 초기)",
  },
  3: {
    season: "봄 간절기 · 일교차 큼\n트렌치·자켓·가디건",
    industry: "봄 신상 많이 나옴\n성수기 준비",
    shopping: "개강·입학\n화이트데이 3/14",
    upload: "봄 아우터·셔츠·블라우스·슬랙스",
    prep: "⭐ 4~5월 성수기 소싱·촬영 미리(원피스·반팔 이너)\n4월 이벤트(벚꽃) 쿠폰·배너",
    record: "",
  },
  4: {
    season: "봄 · 벚꽃 · 나들이\n아우터가 가벼워짐",
    industry: "⭐ 성수기 시작(4~5월)",
    shopping: "벚꽃 나들이\n중간고사 · 봄 축제",
    upload: "원피스·블라우스·가디건·데님\n얇은 아우터",
    prep: "5월 가정의 달·초여름(반팔·린넨) 촬영\n성수기 광고 늘릴 준비(쇼만마)",
    record: "",
  },
  5: {
    season: "늦봄 → 초여름\n반팔 시작",
    industry: "⭐ 성수기\n연휴 많음 — 택배 쉬는 날 확인",
    shopping: "어린이날·어버이날(가정의 달)\n대학 축제 · 스승의 날",
    upload: "반팔·나시 이너·얇은 셔츠·린넨·반바지",
    prep: "여름 본격 소싱(나시·반바지·원피스)\n6월 여름맞이 이벤트",
    record: "",
  },
  6: {
    season: "초여름 → 장마 시작(하순)",
    industry: "여름 신상 본격",
    shopping: "여름 휴가 준비\n기말고사·종강",
    upload: "나시·반바지·원피스·여름 셋업",
    prep: "7월 바캉스 룩\n장마(빨리 마르는 소재)",
    record: "2026: 여름 나시로 매출이 크게 오르기 시작",
  },
  7: {
    season: "한여름 · 장마 · 휴가철",
    industry: "여름 피크\n말쯤 여름 시즌오프 시작",
    shopping: "여름 휴가·바캉스\n방학",
    upload: "여름 상품 계속\n잘 팔리는 것 색 추가·리오더",
    prep: "가을 첫 소싱 시작\n8월 동대문 휴가 전 사입 계획",
    record: "2026: 1년 중 가장 많이 팔린 달(여름 나시)",
  },
  8: {
    season: "여름 끝물 · 아직 더움",
    industry: "⭐ 동대문 여름휴가(보통 8월 초 1주 — 거래처마다 확인)\n⭐ 비수기",
    shopping: "방학\n개강 준비(하순)",
    upload: "⭐ 여름 상품 계속 올림",
    prep: "⭐ 가을 옷 미리 촬영 → 보정·릴스·광고 소재까지 끝내 두기\n휴가 전에 사입",
    record: "2026: 8월에 가을 옷을 올렸는데 안 팔림(모델 바꾸기 전이라 실루엣 문제도)",
  },
  9: {
    season: "초가을 간절기\n낮엔 아직 더움",
    industry: "추석 연휴 — 앞뒤로 동대문·택배 쉼\n가을 신상 본격",
    shopping: "개강 · 추석",
    upload: "가을 간절기 첫 드랍(8월에 준비해 둔 것)\n긴팔티·가디건·얇은 니트",
    prep: "10월 가을 아우터·니트 촬영\n추석 배송 안내 문구",
    record: "2026: 매출이 확 빠짐 — 간절기 공백 + 광고비 줄임",
  },
  10: {
    season: "가을 본격 · 일교차\n하순부터 추워짐",
    industry: "경쟁몰 얼리윈터가 9월 말~10월에 시작(2026 제니어리)",
    shopping: "할로윈 10/31\n중간고사",
    upload: "니트·자켓·트렌치·코듀로이\n하순 얼리윈터",
    prep: "11월 블프·겨울 아우터(퍼·패딩) 촬영\n블프 쿠폰·배너",
    record: "2026: 여름 뒤로 가장 낮은 달 — 광고비도 가장 적었음",
  },
  11: {
    season: "초겨울\n패딩·퍼·니트",
    industry: "겨울 아우터 성수기",
    shopping: "빼빼로데이 11/11 · 수능\n블랙프라이데이",
    upload: "얼리윈터 아우터·니트·부츠·머플러",
    prep: "12월 크리스마스·연말 파티룩\n12월 회원 쿠폰(11/30 전)",
    record: "2026: 얼리윈터 x 블프(11/1~8)로 다시 올라옴",
  },
  12: {
    season: "한겨울",
    industry: "겨울 피크\n연말 택배 몰림",
    shopping: "크리스마스 · 연말 모임 · 새해",
    upload: "겨울 아우터·니트\n연말룩(레이스·벨벳)·소품",
    prep: "1월 시즌오프\n봄 소싱 계획\n1월 회원 쿠폰(12월 말 전)",
    record: "",
  },
};

/** 그 달 노트 — 세원이 고친 게 있으면 그것, 없으면 초안 */
export function noteOf(saved, m) {
  const s = saved?.months?.[String(m)];
  if (s) return { ...s, draft: false };
  return { ...DRAFT[m], draft: true };
}

/** 저장 — 그 달만 바꿔 쓴다(다른 달은 서버 최신 그대로) */
export const putMonth = (m, note) => (v) => {
  const { draft, ...rest } = note; // eslint-disable-line no-unused-vars
  const { items, ...base } = v || {}; // eslint-disable-line no-unused-vars -- 빈 키를 읽으면 {items:[]} 로 와서 떼어 낸다
  return { ...base, months: { ...(base.months || {}), [String(m)]: { ...rest, at: new Date().toISOString() } } };
};

/** 해 y · 달 m 의 매출 장부 합 — 총매출(카페24 결제합계)·광고비·기록한 날 수. 기록이 없으면 null */
export function monthStats(rows, y, m) {
  const p = `${y}-${String(m).padStart(2, "0")}`;
  let gross = 0;
  let ads = 0;
  let days = 0;
  for (const r of rows || []) {
    if (!r.date?.startsWith(p)) continue;
    gross += r.cafeGross || r.gross || 0;
    ads += r.ads || 0;
    days++;
  }
  return days ? { y, m, gross, ads, days } : null;
}

/** 그 달(1~12)이 들어 있는 해들 — 최근 해부터 */
export function yearsOf(rows, m) {
  const mm = `-${String(m).padStart(2, "0")}-`;
  const ys = new Set();
  for (const r of rows || []) if (r.date?.slice(4, 8) === mm) ys.add(Number(r.date.slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

/** 만 원 단위 — 5,928만 */
export const man = (w) => `${Math.round((w || 0) / 10000).toLocaleString("ko-KR")}만`;
