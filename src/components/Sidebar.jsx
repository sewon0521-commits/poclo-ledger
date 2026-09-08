import { X } from "lucide-react";
import { SECTIONS, sectionOf, firstPageOf } from "../lib/nav";

function Rail({ section, onSection }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-white py-3">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-rose-700 text-sm font-bold text-white">
        포
      </div>
      {SECTIONS.map(({ key, label, icon: Icon }) => {
        const on = section === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSection(key)}
            aria-current={on ? "page" : undefined}
            className={
              "flex w-12 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition " +
              (on ? "bg-rose-700 text-white" : "text-stone-500 hover:bg-stone-100")
            }
          >
            <Icon size={19} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Panel({ section, page, onPage }) {
  const current = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  return (
    <nav className="w-52 shrink-0 border-r border-stone-200 bg-white p-3">
      <div className="px-2 pt-1 pb-3">
        <div className="font-bold text-stone-900">포클로</div>
        <div className="text-xs text-stone-400">{current.label}</div>
      </div>
      {current.groups.map((g) => (
        <div key={g.group} className="mb-4">
          <div className="px-3 pb-1.5 text-xs font-medium text-stone-400">{g.group}</div>
          {g.items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPage(key)}
              className={
                "mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition " +
                (page === key ? "bg-rose-700 text-white" : "text-stone-600 hover:bg-stone-100")
              }
            >
              <Icon size={17} className="shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ page, onPage, open, onClose }) {
  const section = sectionOf(page);
  const goSection = (k) => onPage(firstPageOf(k));

  return (
    <>
      {/* 데스크톱: 띠 + 패널 */}
      <div className="hidden md:flex">
        <Rail section={section} onSection={goSection} />
        <Panel section={section} page={page} onPage={onPage} />
      </div>

      {/* 모바일: 왼쪽에서 밀어 나오는 서랍. 같은 두 칸을 그대로 담는다 */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={onClose}
            className="absolute inset-0 bg-stone-900/40"
          />
          <div className="absolute inset-y-0 left-0 flex bg-white shadow-xl">
            <Rail section={section} onSection={goSection} />
            <div className="relative">
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="absolute top-3 right-3 z-10 p-1 text-stone-400"
              >
                <X size={20} />
              </button>
              <Panel
                section={section}
                page={page}
                onPage={(k) => {
                  onPage(k);
                  onClose();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
