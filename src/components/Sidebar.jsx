import { useEffect, useRef, useState } from "react";
import { X, Volume2, VolumeX, Check } from "lucide-react";
import { SOUNDS, soundKind, setSoundKind, tick } from "../lib/clickSound";
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
      <SoundToggle />
    </div>
  );
}

/** 누르는 소리 고르기 — 눌러서 들어 보고 고른다. 기기마다 따로 기억 */
function SoundToggle() {
  const [kind, setKind] = useState(soundKind);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={box} data-sound-menu className="relative mt-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="누르는 소리 고르기"
        title="누르는 소리 고르기"
        className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-600"
      >
        {kind === "off" ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      {open && (
        <div className="sheet absolute bottom-0 left-full z-50 ml-2 w-60 rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg">
          <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-stone-400">누르는 소리 · 눌러서 들어 보기</div>
          {SOUNDS.map(([k, name, hint]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSoundKind(k);
                setKind(k);
                tick(k);
              }}
              className={"flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-stone-50 " + (kind === k ? "bg-rose-50" : "")}
            >
              <span className="mt-0.5 w-3.5 shrink-0 text-rose-700">{kind === k && <Check size={14} />}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-stone-800">{name}</span>
                <span className="block text-[11px] text-stone-400">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Panel({ section, page, onPage }) {
  const current = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  return (
    <nav className="w-52 shrink-0 border-r border-stone-200 bg-white p-3">
      <div className="px-2 pt-1 pb-3">
        <div className="font-bold text-stone-900">포클로ERP</div>
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
