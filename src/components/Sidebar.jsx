import { Store, BookOpen, X } from "lucide-react";

const MENU = [
  {
    group: "사입·정산",
    items: [
      { key: "vendors", label: "거래처", icon: Store },
      { key: "ledger", label: "포클로 매입 장부", icon: BookOpen },
    ],
  },
];

function Nav({ page, onPage }) {
  return (
    <nav className="p-3">
      {MENU.map((g) => (
        <div key={g.group} className="mb-4">
          <div className="px-3 pb-1.5 text-xs font-medium text-stone-400">{g.group}</div>
          {g.items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPage(key)}
              className={
                "mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition " +
                (page === key
                  ? "bg-rose-700 text-white"
                  : "text-stone-600 hover:bg-stone-100")
              }
            >
              <Icon size={17} className="shrink-0" />
              {label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ page, onPage, open, onClose }) {
  return (
    <>
      {/* 데스크톱: 항상 보이는 고정 사이드바 */}
      <aside className="hidden w-60 shrink-0 border-r border-stone-200 bg-white md:block">
        <div className="border-b border-stone-200 px-5 py-4">
          <div className="font-bold text-stone-900">포클로</div>
          <div className="text-xs text-stone-400">매입 관리</div>
        </div>
        <Nav page={page} onPage={onPage} />
      </aside>

      {/* 모바일: 왼쪽에서 밀어 나오는 서랍 */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={onClose}
            className="absolute inset-0 bg-stone-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <div>
                <div className="font-bold text-stone-900">포클로</div>
                <div className="text-xs text-stone-400">매입 관리</div>
              </div>
              <button type="button" onClick={onClose} aria-label="닫기" className="p-1 text-stone-400">
                <X size={20} />
              </button>
            </div>
            <Nav
              page={page}
              onPage={(k) => {
                onPage(k);
                onClose();
              }}
            />
          </aside>
        </div>
      )}
    </>
  );
}
