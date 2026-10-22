// 화면 갈래. 왼쪽 좁은 띠에서 큰 갈래를 고르고, 옆 패널에서 화면을 고른다.
// 큰 갈래는 다섯 — 홈 / 일 / 돈 / 촬영 / 콘텐츠. ('사람'은 9/23 세원 요청으로 뺐다 — 쓸 일이 없어서)
import {
  Home,
  ListChecks,
  NotebookPen,
  Wallet,
  Palette,
  Store,
  BookOpen,
  Scale,
  TrendingUp,
  Clock,
  Calculator,
  Clapperboard,
  GalleryHorizontal,
  Radar,
  Camera,
  Images,
  ClipboardList,
  Repeat,
  FileCheck,
  FileSpreadsheet,
  Music,
  CalendarDays,
  Newspaper,
  ScanSearch,
  Trophy,
  BadgePercent,
} from "lucide-react";

export const SECTIONS = [
  {
    key: "home",
    label: "홈",
    icon: Home,
    groups: [{ group: "기본", items: [{ key: "home", label: "홈", icon: Home }] }],
  },
  {
    // 10/19 세원: "쇼만마 커리큘럼은 그대로, 우리 쇼핑몰로 채우고 UI 는 우리 것. 보고는 ERP 안에" (위키 topics/보고-체계-설계.md)
    key: "report",
    label: "보고",
    icon: Newspaper,
    groups: [
      {
        group: "기본",
        items: [
          { key: "reports", label: "매일 보고", icon: Newspaper },
          { key: "tracker", label: "사입 트래커", icon: ScanSearch },
          // 10/22 세원 "제니어리랑 경쟁사들 이벤트도 계속 모니터링 — 누가 언제 뭘하는지" (poclo-cafe24/mall_events.py)
          { key: "mallEvents", label: "경쟁몰 이벤트", icon: BadgePercent },
          // 10/19 밤 세원 "가나다라 다 만들어줘" — 소재 성적표(가·다) · 콘텐츠 트래커(나·라)
          { key: "creatives", label: "소재 성적표", icon: Trophy },
          { key: "contentTracker", label: "콘텐츠 트래커", icon: Clapperboard },
        ],
      },
    ],
  },
  {
    key: "work",
    label: "일",
    icon: ListChecks,
    groups: [
      {
        group: "기본",
        items: [
          { key: "journal", label: "업무일지", icon: NotebookPen },
          // 10/6 세원: "넥스트팩 발주 변환기를 ERP 에 넣고 단가 칸에 단가를 넣어 줘" → 이지어드민 발주 → SO+ 붙여넣기. "일 카테고리로"
          { key: "soOrder", label: "SO+ 발주 변환", icon: FileSpreadsheet },
          // 10/17 세원: "재구매 쿠폰·이벤트를 배너로 알리는 계획을 짜는 틀 — 이벤트 캘린더"
          { key: "events", label: "이벤트 캘린더", icon: CalendarDays },
          // 10/13 세원: CS 자동화 영상·PDF — "포클로 일 칸에 CS 관리를 할 수 있는 칸"
          // 10/16 세원: "카톡·톡톡 같은 걸 못 읽으면 그냥 안 하는 게 낫다" → 메뉴에서 숨김(화면·코드는 남김, 다시 쓰려면 이 줄 주석만 풀면 됨)
          // { key: "cs", label: "CS 관리", icon: Headset },
        ],
      },
    ],
  },
  {
    key: "money",
    label: "돈",
    icon: Wallet,
    groups: [
      {
        group: "매출",
        items: [
          { key: "sales", label: "포클로 매출 장부", icon: TrendingUp },
          { key: "pnl", label: "손익", icon: Scale },
          { key: "pricing", label: "판매가 계산기", icon: Calculator },
        ],
      },
      {
        group: "매입",
        items: [
          { key: "ledger", label: "포클로 매입 장부", icon: BookOpen },
          { key: "pending", label: "미송 · 매입금", icon: Clock },
          { key: "vendors", label: "거래처", icon: Store },
        ],
      },
      {
        group: "정산·세무",
        items: [
          // 10/2 세원: "오토장끼 참고해서 계산서 발행 요청, 확인 란" — 달마다 계산서 요청·부가세 후입금 송금
          { key: "invoiceReq", label: "계산서 발행 요청·확인", icon: FileCheck },
          { key: "invoice", label: "세금계산서 대조", icon: Scale },
        ],
      },
      // 10/1 세원: "어떤 사이트를 구독하고 있고 어디서 금액이 나가는지 한 번에"
      { group: "지출", items: [{ key: "subs", label: "구독 · 고정 지출", icon: Repeat }] },
    ],
  },
  {
    // 촬영 (9/30 세원: "왼쪽 띠에 촬영 갈래") — 동대문클릭처럼 상품 블록 → 코디, 그리고 착용샷 참고 사진
    key: "shoot",
    label: "촬영",
    icon: Camera,
    groups: [
      {
        group: "기본",
        items: [
          { key: "shoot", label: "신상 관리", icon: Camera },
          { key: "shootRefs", label: "촬영 레퍼런스", icon: Images },
          // 10/4 세원: "코디 촬영 관리란 — 찍을 컷·영상, 쇼핑몰별 베스트컷, 날씨, 쇼만마 코디"
          // 10/12 세원: "스튜디오가 생겨 수시로 촬영하니까 코디 촬영 관리 → 소싱 관리"
          { key: "shootPlan", label: "소싱 관리", icon: ClipboardList },
        ],
      },
    ],
  },
  {
    key: "content",
    label: "콘텐츠",
    icon: Palette,
    groups: [
      {
        group: "기본",
        items: [
          { key: "reels", label: "릴스 기획", icon: Clapperboard },
          { key: "carousel", label: "캐러셀 기획", icon: GalleryHorizontal },
          { key: "accounts", label: "계정 아카이브", icon: Radar },
          // 10/6 세원: "저작권 없는 음악을 맨날 다운받고 지우고 — 저장하는 칸"
          { key: "music", label: "음악 보관함", icon: Music },
        ],
      },
    ],
  },
];

const PAGE_SECTION = Object.fromEntries(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => [i.key, s.key]))),
);

export const sectionOf = (page) => PAGE_SECTION[page] || "home";

/** 그 갈래에서 처음 보여줄 화면 */
export const firstPageOf = (sectionKey) =>
  SECTIONS.find((s) => s.key === sectionKey)?.groups[0].items[0].key || "home";
