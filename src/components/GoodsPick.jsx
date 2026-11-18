import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X, ZoomIn } from "lucide-react";
import { codiName, codiItems } from "../lib/shoot";
import { normalize, stageName } from "../lib/sinsang";
import { GOODS, goodsKey, goodsOf, pickedGoods } from "../lib/styling";
import { Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";

/**
 * 신발·잡화 고르기 큰 창 (11/18) — 세원: "신발, 가방, 목걸이등 악세를 선택할 수 있는 칸이 업데이트가 안되고 너무 고르기가 빡센데
 *   요번에 포즈판에 쓴것 처럼 하나씩 고르는게 어떻까? 어떻게 하는게 가독성이 좋을까?"
 * 포즈 큰 창(CodiPoseBig)과 같은 모양: 위 종류 탭(전체 · 신발 · 가방 · 목걸이·귀걸이 · 반지·팔찌 · 양말·스타킹 · 벨트 · 모자·머플러 · 기타) + 찾기,
 * 가운데 큰 사진 격자(PC 5칸 · 폰 3칸, 최근 담은 것 먼저), 누르면 바로 체크. 이날 다른 코디에서 쓴 것은 '코디2에서 씀', 이 코디 상품은 '이 코디 상품'.
 * 아래 직접 적기(모델 개인 신발 등) — 종류를 골라 적는다. 저장은 styling.<key> 그대로(lib/styling GOODS) — 스타일링 창이 알아서 저장한다.
 */
const ALL = "all";
const tabCls = (on) =>
  "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap " +
  (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300");

export default function GoodsPick({ st, setSt, d, codi, dayCodis = [], start = ALL, onClose }) {
  const [tab, setTab] = useState(start);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState(start === ALL ? "shoes" : start);
  const [typed, setTyped] = useState("");
  const [big, setBig] = useState(null); // {urls, at}

  // 신발·잡화 전부 — 휴지통 빼고, 최근 담은 것 먼저
  const pool = useMemo(
    () =>
      d.items
        .map(normalize)
        .filter((x) => x.stage !== "trash")
        .map((x) => ({ x, key: goodsKey(x) }))
        .filter((o) => o.key)
        .sort((a, b) => String(b.x.createdAt || "").localeCompare(String(a.x.createdAt || ""))),
    [d.items],
  );
  const picked = pickedGoods(st);
  const ids = new Set(picked.map((p) => p.s.itemId).filter(Boolean));

  // 이날 다른 코디에서 쓴 것 — 그 코디 스타일링에서 고른 것 + 그 코디 상품
  const usedBy = useMemo(() => {
    const m = new Map();
    dayCodis.forEach((c, i) => {
      if (c.id === codi.id) return;
      const mine = new Set([...pickedGoods(c.styling).map((p) => p.s.itemId), ...(c.itemIds || [])].filter(Boolean));
      for (const id of mine) m.set(id, [...(m.get(id) || []), i + 1]);
    });
    return m;
  }, [dayCodis, codi.id]);
  const inCodi = new Set(codi.itemIds || []);

  const qn = q.replace(/\s+/g, "").toLowerCase();
  const hit = (x) => !qn || `${x.name}${x.fullName || ""}${x.vendor || ""}${x.colors || ""}`.replace(/\s+/g, "").toLowerCase().includes(qn);
  const shown = pool.filter((o) => (tab === ALL || o.key === tab) && hit(o.x));
  const count = (k) => pool.filter((o) => (k === ALL || o.key === k) && hit(o.x)).length;
  const pickedIn = (k) => picked.filter((p) => k === ALL || p.key === k).length;

  const flip = (o) =>
    setSt((s) => {
      const on = GOODS.some((p) => (s[p.key] || []).some((y) => y.itemId === o.x.id));
      if (on) return { ...s, ...Object.fromEntries(GOODS.map((p) => [p.key, (s[p.key] || []).filter((y) => y.itemId !== o.x.id)])) };
      return { ...s, [o.key]: [...(s[o.key] || []), { itemId: o.x.id }] };
    });
  const addTyped = () => {
    const v = typed.trim();
    if (v) setSt((s) => ((s[kind] || []).some((y) => y.text === v) ? s : { ...s, [kind]: [...(s[kind] || []), { text: v }] }));
    setTyped("");
  };
  const dropTyped = (key, text) => setSt((s) => ({ ...s, [key]: (s[key] || []).filter((y) => y.text !== text) }));

  // Esc — 크게 보기가 떠 있으면 그것만, 아니면 이 창만(아래 스타일링 창은 그대로). 붙잡기 단계에서 먼저 받아 아래로 안 보낸다
  useEffect(() => {
    const k = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (big) setBig(null);
      else onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [big, onClose]);

  const urlOf = (x) => d.urls[x.photo] || x.photoUrl || "";
  const its = codiItems(codi, d.items);
  const typedList = picked.filter((p) => p.s.text);

  return createPortal(
    <div className="backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div data-goodsbig className="sheet relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:w-[92vw] sm:max-w-6xl sm:rounded-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-4 py-2.5">
          <div className="flex shrink-0 gap-1 max-sm:hidden">
            {its.slice(0, 4).map((x) => (
              <Photo key={x.id} url={urlOf(x)} className="aspect-[3/4] w-9 rounded-md" />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-stone-900">신발·잡화 고르기</div>
            <div className="truncate text-[11px] text-stone-500">{codiName(codi, d.items)}</div>
          </div>
          <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 tabular-nums">고른 것 {picked.length}</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700">
            <X size={22} />
          </button>
        </header>

        {/* 종류 탭 + 찾기 */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-stone-100 px-4 py-2.5 sm:flex-row sm:items-center">
          <div className="-mx-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {[{ key: ALL, label: "전체" }, ...GOODS].map((p) => {
              const on = tab === p.key;
              const n = pickedIn(p.key);
              return (
                <button key={p.key} type="button" aria-pressed={on} onClick={() => (setTab(p.key), p.key !== ALL && setKind(p.key))} className={tabCls(on)}>
                  {p.label}
                  <span className={"tabular-nums " + (on ? "text-white/75" : "text-stone-400")}>{count(p.key)}</span>
                  {n > 0 && <span className={"rounded-full px-1.5 text-[10px] tabular-nums " + (on ? "bg-white text-rose-700" : "bg-rose-700 text-white")}>✓{n}</span>}
                </button>
              );
            })}
          </div>
          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm sm:w-52">
            <Search size={14} className="shrink-0 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품명 · 거래처 찾기" className="min-w-0 flex-1 bg-transparent outline-none" />
            {q && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="찾기 지우기" className="text-stone-400 hover:text-stone-700">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        {/* 큰 사진 격자 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {!shown.length ? (
            <p className="py-12 text-center text-sm text-stone-400">
              {q ? "찾는 상품이 없어요 — 다른 말로 찾아보거나 아래에 직접 적어요." : "이 종류엔 신상 관리 상품이 아직 없어요 — 아래에 직접 적어도 돼요."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {shown.map((o) => {
                const x = o.x;
                const on = ids.has(x.id);
                const by = usedBy.get(x.id);
                const urls = [...new Set([urlOf(x), ...(x.photos || [])].filter(Boolean))];
                const away = x.stage === "drop" || x.stage === "back";
                return (
                  <div key={x.id} className="group relative min-w-0">
                    <button type="button" onClick={() => flip(o)} aria-pressed={on} title={x.name} className="block w-full min-w-0 text-left">
                      <span className={"relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "ring-1 ring-stone-200 group-hover:ring-rose-300")}>
                        {urlOf(x) && <img src={urlOf(x)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                        <span
                          className={
                            "absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow " +
                            (on ? "bg-rose-700 text-white" : "border-2 border-white bg-black/15 text-transparent")
                          }
                        >
                          <Check size={14} strokeWidth={3} />
                        </span>
                        <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] flex-col items-start gap-0.5">
                          {inCodi.has(x.id) && <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">이 코디 상품</span>}
                          {by && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">코디{by.join("·")}에서 씀</span>}
                        </span>
                      </span>
                      <span className={"mt-1 line-clamp-2 text-xs leading-snug " + (on ? "font-semibold text-rose-800" : "text-stone-700")}>{x.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-stone-400">
                        {tab === ALL && goodsOf(o.key)?.label}
                        {tab === ALL && (x.vendor || away) && " · "}
                        {away ? stageName(x.stage) : x.vendor}
                      </span>
                    </button>
                    {urls.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBig({ urls, at: 0 })}
                        aria-label="크게 보기"
                        className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 max-sm:hidden"
                      >
                        <ZoomIn size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 직접 적기 */}
        <footer className="shrink-0 space-y-2 border-t border-stone-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {typedList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {typedList.map((p) => (
                <span key={p.key + p.s.text} className="flex items-center gap-1 rounded-full border border-dashed border-rose-400 bg-rose-50 py-1 pr-1.5 pl-2.5 text-xs text-rose-800">
                  <span className="text-[10px] text-rose-500">{goodsOf(p.key)?.label}</span>
                  <span className="font-medium">{p.s.text}</span>
                  <button type="button" onClick={() => dropTyped(p.key, p.s.text)} aria-label={`${p.s.text} 빼기`} className="p-0.5 text-rose-400 hover:text-rose-700">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="직접 적을 종류" className="w-28 shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs max-sm:w-[5.5rem]">
              {GOODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), addTyped())}
              placeholder={`직접 적기 (예: ${goodsOf(kind)?.place || "모델 개인 신발"})`}
              className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
            <button type="button" onClick={addTyped} disabled={!typed.trim()} className="shrink-0 rounded-lg bg-stone-800 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-30">
              넣기
            </button>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white max-sm:w-full">
              다 골랐어요
            </button>
          </div>
        </footer>
      </div>
      {big && <BigSlides urls={big.urls} start={big.at} onClose={() => setBig(null)} />}
    </div>,
    document.body,
  );
}
