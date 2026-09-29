import { useEffect, useMemo, useState } from "react";
import { Sparkles, Search, Clapperboard, Check, Shuffle, X, Video, Upload } from "lucide-react";
import { folderIdOf, withChildren } from "../lib/reelFolders";
import { hookKind, flowSteps, MIX_PARTS } from "../lib/reels";

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

/** 섞어 만들기 칸마다 보여 줄 한 줄 — 그 부분이 레퍼런스에서 어떻게 생겼는지 */
function partPreview(key, it) {
  const r = it.reference || {};
  if (key === "hook") return silent(r.hook) ? "자막 없이 영상으로 시작" : `“${r.hook || ""}”`;
  if (key === "flow") return <Steps flow={r.structure?.flow} max={4} />;
  if (key === "shots") return (r.scenes || []).slice(0, 2).map((s) => s.visual).join(" / ") || "장면 정보 없음";
  return String(r.script || "").split("\n").filter(Boolean).slice(0, 2).join(" / ") || "대본 없음";
}

export default function RefPicker({ library, value, onChange, mix = {}, onMix, own = [], onOwn, fileUrl, folders }) {
  // BEST(9/29) 를 맨 앞에
  const done = useMemo(() => {
    const d = library.filter((i) => i.reference?.structure);
    return [...d.filter((i) => i.best), ...d.filter((i) => !i.best)];
  }, [library]);
  // 우리 영상 소스 후보 — 영상이 보관된 것 전부(보관만 한 실루엣 영상 포함), 최근 것 먼저 (9/29)
  const clips = useMemo(() => library.filter((i) => i.hasVideo), [library]);
  // picking: 카드 목록을 연 까닭 — "one"(틀 하나) | MIX_PARTS 의 key(섞을 부분) | null(닫힘)
  const [picking, setPicking] = useState(null);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [thumbs, setThumbs] = useState({});

  const picked = value !== "auto" && value !== "mix" ? done.find((i) => i.id === value) : null;
  const mixed = useMemo(
    () => (value === "mix" ? MIX_PARTS.map(([k]) => done.find((i) => i.id === mix[k])).filter(Boolean) : []),
    [value, mix, done],
  );

  // 썸네일은 서명 주소라 목록이 열릴 때(닫혀 있으면 고른 것만) 받아 온다
  useEffect(() => {
    if (!fileUrl) return;
    const want = picking === "own" ? clips.slice(0, 48) : picking ? done.slice(0, 48) : picked ? [picked] : mixed;
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
  }, [picking, done, clips, picked, mixed, fileUrl, thumbs]);

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

  const choose = (it) => {
    if (picking === "one") onChange(it.id);
    else onMix({ ...mix, [picking]: it.id });
    setPicking(null);
  };
  const isOn = (it) => (picking === "one" ? value === it.id : mix[picking] === it.id);
  const partLabel = MIX_PARTS.find(([k]) => k === picking)?.[1];

  const mode = (key, icon, title, hint, onClick) => (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-start gap-2.5 rounded-xl border p-3 text-left " +
        ((key === "one" ? picked : value === key) ? "border-rose-600 bg-white ring-1 ring-rose-600" : "border-stone-200 bg-white hover:border-stone-300")
      }
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-stone-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{hint}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-stone-500">어떤 릴스 틀로 찍을까요?</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {mode("auto", <Sparkles size={16} className="mt-0.5 shrink-0 text-rose-700" />, "알아서 골라줘", `라이브러리 ${done.length}개 중 이 상품에 가장 맞는 틀을 골라요.`, () => {
          onChange("auto");
          setPicking(null);
        })}
        {mode("one", <Clapperboard size={16} className="mt-0.5 shrink-0 text-stone-600" />, "하나 고를게", picked ? "고른 틀 그대로 만들어요." : "마음에 드는 영상 하나의 틀로.", () =>
          setPicking((p) => (p === "one" ? null : "one")),
        )}
        {mode("mix", <Shuffle size={16} className="mt-0.5 shrink-0 text-stone-600" />, "섞어서 만들래", "훅·내용·구도·대본을 영상마다 골라 한 편으로.", () => {
          onChange("mix");
          setPicking(null);
        })}
      </div>

      {picked && !picking && (
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <RefSummary item={picked} thumb={thumbs[picked.id]} />
        </div>
      )}

      {value === "mix" && (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {MIX_PARTS.map(([k, label, hint]) => {
            const it = done.find((i) => i.id === mix[k]);
            return (
              <li key={k} className={"flex items-center gap-3 px-3 py-2.5 " + (picking === k ? "bg-rose-50/60" : "")}>
                <span className="w-20 shrink-0">
                  <span className="block text-xs font-semibold text-stone-800">{label}</span>
                  <span className="block text-[10px] leading-tight text-stone-400">{hint}</span>
                </span>
                {it ? (
                  <>
                    <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-stone-100">
                      {thumbs[it.id] && <img src={thumbs[it.id]} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block truncate text-xs font-semibold text-stone-700">{hookKind(it.reference?.structure?.hookType).name || it.title}</span>
                      <span className="line-clamp-1 block text-xs text-stone-500">{partPreview(k, it)}</span>
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-xs text-stone-400">안 고르면 상품에 맞게 알아서</span>
                )}
                <span className="flex shrink-0 items-center gap-1">
                  {it && (
                    <button type="button" onClick={() => onMix({ ...mix, [k]: null })} aria-label={`${label} 비우기`} className="rounded p-1 text-stone-300 hover:text-rose-600">
                      <X size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPicking((p) => (p === k ? null : k))}
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-800"
                  >
                    {it ? "바꾸기" : "고르기"}
                  </button>
                </span>
              </li>
            );
          })}
          <li className={"px-3 py-2.5 " + (picking === "own" ? "bg-sky-50/60" : "")}>
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0">
                <span className="block text-xs font-semibold text-sky-800">우리 영상 소스</span>
                <span className="block text-[10px] leading-tight text-stone-400">이미 찍은 컷 — AI가 보고 장면에 배치</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {own.length === 0 && <span className="text-xs text-stone-400">넣으면 이 컷들 위주로 촬영 순서를 짜요 (최대 3개)</span>}
                {own.map((o, i) => (
                  <span key={o.key} className="flex items-center gap-1 rounded-full bg-sky-100 py-0.5 pr-1 pl-2 text-[11px] font-medium text-sky-900">
                    소스 {i + 1} · <span className="max-w-[8rem] truncate">{o.title}</span>
                    <button type="button" onClick={() => onOwn((cur) => cur.filter((x) => x.key !== o.key))} aria-label="빼기" className="rounded-full p-0.5 hover:bg-sky-200">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <label className={"flex cursor-pointer items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-600 hover:border-sky-300 " + (own.length >= 3 ? "pointer-events-none opacity-40" : "")}>
                  <Upload size={12} /> 파일
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) onOwn((cur) => (cur.length < 3 ? [...cur, { key: `f${Date.now()}`, kind: "file", title: f.name.replace(/\.[^.]+$/, ""), file: f }] : cur));
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={own.length >= 3}
                  onClick={() => setPicking((p) => (p === "own" ? null : "own"))}
                  className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-600 hover:border-sky-300 disabled:opacity-40"
                >
                  <Video size={12} /> 라이브러리에서
                </button>
              </span>
            </div>
          </li>
        </ul>
      )}

      {picking === "own" && (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-white p-3">
          <div className="text-xs font-semibold text-sky-800">우리 영상 소스로 쓸 영상 고르기 · 보관만 한 실루엣 영상도 돼요</div>
          <ul className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
            {clips.map((it) => {
              const on = own.some((o) => o.id === it.id);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // 빨리 여러 개 눌러도 앞서 고른 게 안 지워지게 — 최신 목록에서 바꾼다
                      onOwn((cur) =>
                        cur.some((o) => o.id === it.id)
                          ? cur.filter((o) => o.id !== it.id)
                          : cur.length < 3
                            ? [...cur, { key: it.id, kind: "lib", id: it.id, title: it.title }]
                            : cur,
                      );
                    }}
                    className={"block w-full overflow-hidden rounded-lg border text-left " + (on ? "border-sky-600 ring-2 ring-sky-500" : "border-stone-200 hover:border-stone-300")}
                  >
                    <span className="relative block aspect-[3/4] bg-stone-100">
                      {thumbs[it.id] && <img src={thumbs[it.id]} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      {on && (
                        <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white">
                          <Check size={12} />
                        </span>
                      )}
                      {it.keepOnly && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[9px] text-white">보관만</span>}
                    </span>
                    <span className="block truncate px-1.5 py-1 text-[11px] text-stone-700">{it.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setPicking(null)} className="w-full rounded-lg bg-stone-800 py-2 text-xs font-semibold text-white">
            다 골랐어요 ({own.length}/3)
          </button>
        </div>
      )}

      {picking && picking !== "own" && (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          {partLabel && <div className="text-xs font-semibold text-rose-800">‘{partLabel}’ 을(를) 빌려 올 영상 고르기</div>}
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
                    className={"rounded-md px-2 py-1 font-medium " + (folder === f.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
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
                const on = isOn(it);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => choose(it)}
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
                          <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">{Math.round(r.seconds)}초</span>
                        )}
                        {on && (
                          <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-700 text-white">
                            <Check size={12} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
                          {it.best && <span className="shrink-0 rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">BEST</span>}
                          <span className="truncate">{k.name || it.title}</span>
                        </span>
                        {picking === "one" || picking === "hook" ? (
                          <>
                            <span className="line-clamp-2 block text-xs leading-snug text-stone-600">
                              {silent(r.hook) ? <span className="text-stone-400">자막 없이 영상으로 시작</span> : `“${r.hook || ""}”`}
                            </span>
                            <Steps flow={r.structure?.flow} max={4} />
                          </>
                        ) : (
                          <span className="line-clamp-3 block text-xs leading-snug text-stone-600">{partPreview(picking, it)}</span>
                        )}
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
