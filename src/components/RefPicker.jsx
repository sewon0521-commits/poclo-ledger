import { useEffect, useMemo, useState } from "react";
import { Sparkles, Search, Clapperboard, Check, ChevronDown } from "lucide-react";
import { folderIdOf, withChildren } from "../lib/reelFolders";
import { hookKind, flowSteps } from "../lib/reels";

/**
 * 우리 상품 릴스를 '어떤 틀로' 찍을지 고르는 칸 (9/23 세원: "어떤 레퍼런스 구조로? 여기가 겁나 헷갈려.
 * 제목만 보고 알 수 없잖아"). 예전엔 제목만 늘어놓은 드롭다운이었다.
 *
 * 카드 하나 = 레퍼런스 하나: 썸네일 · 훅 유형(':' 앞) · 첫 문장(실제 훅) · 흐름(→ 로 끊어 단계 칩) · 길이.
 * 제목이 아니라 '어떻게 시작해서 어떻게 흘러가는지'로 고르게 한다.
 */

const silent = (hook) => /자막\s*없|무자막|\(화면 자막 없음\)/.test(hook || "");

function Steps({ flow, max = 5 }) {
  const steps = flowSteps(flow);
  const shown = steps.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] leading-none text-stone-600">
      {shown.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-stone-300">›</span>}
          <span className="max-w-[9rem] truncate rounded bg-stone-100 px-1.5 py-1">{s}</span>
        </span>
      ))}
      {steps.length > max && <span className="text-stone-400">+{steps.length - max}</span>}
    </span>
  );
}

/** 고른 레퍼런스를 한 줄로 — 기획 만들기 칸·기획안 머리에서 같이 쓴다 */
export function RefSummary({ item, thumb, onOpen }) {
  const r = item?.reference || {};
  const k = hookKind(r.structure?.hookType);
  return (
    <div className="flex gap-3">
      <span className="h-20 w-[3.75rem] shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-stone-300">
            <Clapperboard size={16} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-semibold text-stone-900">{k.name || "구조 정보 없음"}</span>
        <span className="line-clamp-1 block text-xs text-stone-600">
          {silent(r.hook) ? "자막 없이 영상으로 시작" : `“${r.hook || ""}”`}
          {r.seconds > 0 && <span className="text-stone-400"> · {Math.round(r.seconds)}초</span>}
        </span>
        <Steps flow={r.structure?.flow} max={4} />
        {onOpen && (
          <button type="button" onClick={() => onOpen(item)} className="text-[11px] font-medium text-rose-700 hover:underline">
            레퍼런스 영상 보기
          </button>
        )}
      </span>
    </div>
  );
}

export default function RefPicker({ library, value, onChange, fileUrl, folders }) {
  const done = useMemo(() => library.filter((i) => i.reference?.structure), [library]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [thumbs, setThumbs] = useState({});

  const picked = value !== "auto" ? done.find((i) => i.id === value) : null;

  // 썸네일은 서명 주소라 목록이 열릴 때(닫혀 있으면 고른 것 하나만) 받아 온다
  useEffect(() => {
    if (!fileUrl) return;
    const want = open ? done.slice(0, 48) : picked ? [picked] : [];
    let alive = true;
    (async () => {
      for (const it of want) {
        if (thumbs[it.id] !== undefined) continue;
        const u = await fileUrl(`${it.id}-thumb.jpg`);
        if (!alive) return;
        setThumbs((p) => ({ ...p, [it.id]: u }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, done, picked, fileUrl, thumbs]);

  const tops = useMemo(() => {
    const list = (folders || []).filter((f) => !f.parent);
    return list
      .map((f) => {
        const ids = new Set(withChildren(f.id, folders));
        return { ...f, n: done.filter((it) => ids.has(folderIdOf(it, folders))).length };
      })
      .filter((f) => f.n > 0);
  }, [folders, done]);

  const shown = useMemo(() => {
    const n = q.trim().replace(/\s+/g, "").toLowerCase();
    const ids = folder === "all" ? null : new Set(withChildren(folder, folders));
    return done.filter((it) => {
      if (ids && !ids.has(folderIdOf(it, folders))) return false;
      if (!n) return true;
      const r = it.reference || {};
      return JSON.stringify([it.title, r.title, r.hook, r.structure?.hookType, r.structure?.flow, it.shop?.name])
        .replace(/\s+/g, "")
        .toLowerCase()
        .includes(n);
    });
  }, [done, q, folder, folders]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-stone-500">어떤 릴스 틀로 찍을까요?</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            onChange("auto");
            setOpen(false);
          }}
          className={
            "flex items-start gap-2.5 rounded-xl border p-3 text-left " +
            (value === "auto" ? "border-rose-600 bg-white ring-1 ring-rose-600" : "border-stone-200 bg-white hover:border-stone-300")
          }
        >
          <Sparkles size={16} className="mt-0.5 shrink-0 text-rose-700" />
          <span>
            <span className="block text-sm font-semibold text-stone-900">알아서 골라줘</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
              라이브러리 {done.length}개 중 이 상품에 가장 맞는 틀을 고르고, 왜 골랐는지 적어 줘요.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={
            "flex items-start gap-2.5 rounded-xl border p-3 text-left " +
            (value !== "auto" ? "border-rose-600 bg-white ring-1 ring-rose-600" : "border-stone-200 bg-white hover:border-stone-300")
          }
        >
          <Clapperboard size={16} className="mt-0.5 shrink-0 text-stone-600" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-1 text-sm font-semibold text-stone-900">
              내가 고를게
              <ChevronDown size={15} className={"shrink-0 text-stone-400 transition-transform " + (open ? "rotate-180" : "")} />
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
              {picked ? "아래에서 고른 틀로 만들어요." : "영상을 보고 시작·흐름이 마음에 드는 걸 골라요."}
            </span>
          </span>
        </button>
      </div>

      {picked && !open && (
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <RefSummary item={picked} thumb={thumbs[picked.id]} />
        </div>
      )}

      {open && (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="relative">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="훅·흐름으로 찾기 (예: 룩북)"
                className="w-56 rounded-lg border border-stone-300 bg-white py-1.5 pr-2 pl-7 text-sm outline-none focus:border-rose-600"
              />
            </span>
            {tops.length > 0 && (
              <span className="flex flex-wrap gap-1 rounded-lg bg-stone-100 p-0.5 text-xs">
                {[{ id: "all", name: "전체", n: done.length }, ...tops].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFolder(f.id)}
                    className={
                      "rounded-md px-2 py-1 font-medium " + (folder === f.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")
                    }
                  >
                    {f.name} <span className="text-stone-400">{f.n}</span>
                  </button>
                ))}
              </span>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">
              {done.length ? "맞는 레퍼런스가 없어요." : "분석까지 끝난 레퍼런스가 아직 없어요. 라이브러리 탭에서 담아 주세요."}
            </p>
          ) : (
            <ul className="grid max-h-[26rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {shown.map((it) => {
                const r = it.reference || {};
                const k = hookKind(r.structure?.hookType);
                const on = value === it.id;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(it.id);
                        setOpen(false);
                      }}
                      className={
                        "flex w-full gap-3 rounded-xl border p-2 text-left " +
                        (on ? "border-rose-600 bg-rose-50/50 ring-1 ring-rose-600" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50")
                      }
                    >
                      <span className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-stone-100">
                        {thumbs[it.id] ? (
                          <img src={thumbs[it.id]} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-stone-300">
                            <Clapperboard size={16} />
                          </span>
                        )}
                        {r.seconds > 0 && (
                          <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
                            {Math.round(r.seconds)}초
                          </span>
                        )}
                        {on && (
                          <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-700 text-white">
                            <Check size={12} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-sm font-semibold text-stone-900">{k.name || it.title}</span>
                        <span className="line-clamp-2 block text-xs leading-snug text-stone-600">
                          {silent(r.hook) ? <span className="text-stone-400">자막 없이 영상으로 시작</span> : `“${r.hook || ""}”`}
                        </span>
                        <Steps flow={r.structure?.flow} max={4} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
