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
} from "lucide-react";

export const SECTIONS = [
  {
    key: "home",
    label: "홈",
    icon: Home,
    groups: [{ group: "기본", items: [{ key: "home", label: "홈", icon: Home }] }],
  },
  {
    key: "work",
    label: "일",
    icon: ListChecks,
    groups: [{ group: "기본", items: [{ key: "journal", label: "업무일지", icon: NotebookPen }] }],
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
          // 10/6 세원: "넥스트팩 발주 변환기를 ERP 에 넣고 단가 칸에 단가를 넣어 줘" — 이지어드민 발주 → SO+ 붙여넣기
          { key: "soOrder", label: "SO+ 발주 변환", icon: FileSpreadsheet },
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
          { key: "shootPlan", label: "코디 촬영 관리", icon: ClipboardList },
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
