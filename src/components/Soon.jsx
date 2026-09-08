import { ListChecks, Users, Palette } from "lucide-react";

// 아직 안 만든 갈래. 빈 껍데기를 그럴듯하게 두면 있는 줄 알고 헛걸음하게 되므로,
// 여기 무엇이 들어올 것인지만 정직하게 적어 둔다.
const PLANS = {
  work: {
    icon: ListChecks,
    title: "일",
    lead: "상품이 사진에서 판매까지 가는 길을 여기서 봅니다.",
    items: [
      ["상품등록 대기열", "촬영본 → 보정 → 1000×1333 → 카페24 등록. 지금은 poclo-cafe24 폴더에서 배치 파일로 돌립니다."],
      ["촬영·보정 진행", "코디별 사진 분류와 태그 지우기까지는 이미 자동입니다."],
      ["오늘 할 일", "위 둘에서 밀린 것만 모아서."],
    ],
  },
  people: {
    icon: Users,
    title: "사람",
    lead: "누가 사는지, 다시 사는지.",
    items: [
      ["재구매 고객", "카페24 주문에 회원 정보가 같이 옵니다. 아직 안 씁니다."],
      ["신규 대 재구매", "광고비를 어디에 써야 하는지가 여기서 갈립니다."],
      ["반품이 잦은 주문", "지금은 전체 반품률만 보입니다."],
    ],
  },
  content: {
    icon: Palette,
    title: "콘텐츠",
    lead: "지금 제일 중요한 자리인데 아직 비어 있습니다.",
    items: [
      ["릴스", "크리에이터와 쇼핑몰의 경계가 없어져서 결국 콘텐츠 싸움입니다."],
      ["상세페이지", "에디봇 형식으로 자동 생성까지는 됩니다."],
      ["사진 감도", "광고비율 18%로 내리려면 여기가 먼저입니다. 설득력이 올라가면 광고가 덜 듭니다."],
    ],
  },
};

export default function Soon({ page }) {
  const plan = PLANS[page] || PLANS.work;
  const Icon = plan.icon;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">{plan.title}</h2>
        <p className="mt-0.5 text-sm text-stone-500">{plan.lead}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stone-400">
          <Icon size={16} /> 아직 안 만들었어요
        </div>
        <ul className="space-y-3.5">
          {plan.items.map(([name, why]) => (
            <li key={name}>
              <div className="text-sm font-semibold text-stone-800">{name}</div>
              <div className="mt-0.5 text-sm leading-relaxed text-stone-500">{why}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
