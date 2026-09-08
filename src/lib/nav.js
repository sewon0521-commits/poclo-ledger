// 화면 갈래. 왼쪽 좁은 띠에서 큰 갈래를 고르고, 옆 패널에서 화면을 고른다.
// 큰 갈래는 다섯 — 홈 / 일 / 돈 / 사람 / 콘텐츠.
import {
  Home,
  ListChecks,
  Wallet,
  Users,
  Palette,
  Store,
  BookOpen,
  Scale,
  TrendingUp,
  Tags,
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
    groups: [{ group: "기본", items: [{ key: "work", label: "할 일", icon: ListChecks }] }],
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
          { key: "price", label: "단가표", icon: Tags },
        ],
      },
      {
        group: "매입",
        items: [
          { key: "ledger", label: "포클로 매입 장부", icon: BookOpen },
          { key: "vendors", label: "거래처", icon: Store },
        ],
      },
      { group: "정산·세무", items: [{ key: "invoice", label: "세금계산서 대조", icon: Scale }] },
    ],
  },
  {
    key: "people",
    label: "사람",
    icon: Users,
    groups: [{ group: "기본", items: [{ key: "people", label: "고객", icon: Users }] }],
  },
  {
    key: "content",
    label: "콘텐츠",
    icon: Palette,
    groups: [{ group: "기본", items: [{ key: "content", label: "콘텐츠", icon: Palette }] }],
  },
];

const PAGE_SECTION = Object.fromEntries(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => [i.key, s.key]))),
);

export const sectionOf = (page) => PAGE_SECTION[page] || "home";

/** 그 갈래에서 처음 보여줄 화면 */
export const firstPageOf = (sectionKey) =>
  SECTIONS.find((s) => s.key === sectionKey)?.groups[0].items[0].key || "home";
