import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { codiItems, codiName } from "../lib/shoot";
import { picksOf, shotsOf, flipPhoto, flipCard, stripCode, recoOf, codiFolder, placeOfDay, poseFoldersOf, shotsOfLib, IN_ID, OUT_ID, OLD_ID } from "../lib/poses";
import { runOrder, stepLabel } from "../lib/shootOrder";
import { isFaceCard } from "../lib/poseReco";
import { withChildren } from "../lib/reelFolders";
import { Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";

/**
 * 코디 포즈 큰 창 (11/18, PC) — 세원: "지금 포즈판 편집은 거의 pc에서만 진행해서 만약 1번 누르면 고른 포즈 카드가 밑으로 쫙 보이는데
 *   이거 이렇게 하지말고 큰 창이 떠도 되니까 그냥 내가 고르기 편하게 만들어줘."
 * 왼쪽 묶음(TOP · SELFIE · BTM · FULL · OUTER 세부 · 예전 포즈 · 이 코디만) — 가운데 그 묶음 카드를 큰 사진 격자로 — 오른쪽 늘 보이는 '이 코디에 고른 것'(찍는 순서대로 · × 빼기).
 * 머리 ‹ 앞 코디 · 다음 코디 › (← →). 저장은 예전 그대로(flipPhoto · flipCard · posePicks · posePhotoOff · poseOwn). 폰은 예전 창(CodiPoseSheet).
 */
const CIRCLE = "①②③④⑤⑥⑦⑧⑨";
const OWN = "own";

export default function CodiPoseBig({ s, set, sRef, c, n, codis = [], onGo, d, cards, lib, urlOf, ownBlock, ownCount, onClose }) {
  const folders = poseFoldersOf(lib);
  const place = placeOfDay(s);
  const top = place === "out" ? OUT_ID : IN_ID;
  const other = place === "out" ? IN_ID : OUT_ID;
  const { ids, auto } = picksOf(s, c, cards, d.items);
  const off = new Set(s.posePhotoOff?.[c.id] || []);
  // 11/18 진짜 추천 — 코디 상품을 보고 고른 카드 + 이유(lib/poseReco)
  const rc = useMemo(() => recoOf(s, c, cards, d.items), [s, c, cards, d.items]);
  const reco = useMemo(() => new Set(rc.ids), [rc]);

  // 왼쪽 묶음 — 이 촬영 쪽(실내/야외) 아래 TOP·SELFIE·BTM·FULL·OUTER(세부) + 예전 포즈 + 다른 쪽 + 폴더 없는 것 + 이 코디만
  const groups = useMemo(() => {
    const under = (id) => new Set(withChildren(id, folders));
    const inG = (k, set0) => set0.has(k.folderId);
    const list = [];
    for (const f of folders.filter((x) => x.parent === top)) {
      const set0 = under(f.id);
      list.push({ id: f.id, name: f.name, depth: 0, cards: cards.filter((k) => inG(k, set0)) });
      for (const sub of folders.filter((x) => x.parent === f.id)) {
        const s1 = under(sub.id);
        list.push({ id: sub.id, name: sub.name, depth: 1, cards: cards.filter((k) => inG(k, s1)) });
      }
    }
    const used = new Set(list.filter((g) => !g.depth).flatMap((g) => g.cards.map((k) => k.id)));
    const old = under(OLD_ID);
    const oldCards = cards.filter((k) => old.has(k.folderId));
    if (oldCards.length) list.push({ id: OLD_ID, name: "예전 포즈", depth: 0, cards: oldCards });
    const oth = under(other);
    const othCards = cards.filter((k) => oth.has(k.folderId));
    if (othCards.length) list.push({ id: other, name: place === "out" ? "실내 포즈" : "야외 포즈", depth: 0, cards: othCards });
    const loose = cards.filter((k) => !used.has(k.id) && !old.has(k.folderId) && !oth.has(k.folderId));
    if (loose.length) list.push({ id: "loose", name: "폴더 없는 포즈", depth: 0, cards: loose });
    return list.filter((g) => g.cards.length || !g.depth);
  }, [folders, cards, top, other, place]);

  // 처음 열 때 — 그 코디 옷 종류에 맞는 묶음(없으면 첫 묶음). 코디를 넘겨도 보던 묶음은 그대로
  const [sel, setSel] = useState(() => {
    const f = codiFolder(c, d.items, folders, place, cards);
    return groups.find((g) => g.id === f)?.id || groups.find((g) => g.cards.length)?.id || OWN;
  });
  const [q, setQ] = useState("");
  const [shotF, setShotF] = useState("*"); // 11/18 찍는 방식 거르기(모든 묶음)
  const shotList = shotsOfLib(lib);
  const [big, setBig] = useState(null); // {urls, at}
  const g = groups.find((x) => x.id === sel);
  const qn = q.replace(/\s+/g, "").toLowerCase();
  const shown = (g?.cards || []).filter(
    (k) => (!qn || `${k.code}${k.title}${k.sec?.text || ""}`.replace(/\s+/g, "").toLowerCase().includes(qn)) && (shotF === "*" || (shotF === "" ? !k.shot : k.shot === shotF)),
  );

  // 앞뒤 코디 · ← → (글 칸 안에선 안 함)
  const at = codis.findIndex((x) => x.id === c.id);
  const goTo = (i) => i >= 0 && i < codis.length && onGo?.(codis[i]);
  useEffect(() => {
    const k = (e) => {
      if (e.target?.closest?.("input, textarea, [contenteditable=true]") || big) return;
      if (e.key === "ArrowLeft") goTo(at - 1);
      else if (e.key === "ArrowRight") goTo(at + 1);
      else if (e.key === "Escape") onClose();
    };
    // 붙잡기 단계에서 먼저 본다 — 크게 보기(BigSlides)가 Esc 로 닫히면서 다시 그려진 뒤 이 창까지 닫히지 않게
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  });

  // 오른쪽 '이 코디에 고른 것' — 찍는 순서(겹) 그대로
  const { steps, shots } = runOrder(s, c, cards, d.items);
  const nPicked = shotsOf(s, c, cards, d.items).shots.length; // 포즈판 줄의 'N장'과 같은 수(겹마다 다시 찍는 상의 포즈는 한 번만)
  const byId = new Map(cards.map((k) => [k.id, k]));
  const dropShot = (x) => {
    if (x.own) {
      const list = sRef.current.poseOwn?.[c.id] || [];
      set({ poseOwn: { ...(sRef.current.poseOwn || {}), [c.id]: list.filter((p) => p.key !== x.key) } });
      return;
    }
    const k = byId.get(x.cardId);
    if (k) set(flipPhoto(sRef.current, c, cards, d.items, k, x.key));
  };
  const pickedIn = (gr) => gr.cards.filter((k) => ids.includes(k.id)).length;
  const its = codiItems(c, d.items);

  return (
    <div data-posebig className="sheet relative z-10 flex h-[92vh] w-[92vw] max-w-[1680px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-4 py-2.5">
        <button type="button" onClick={() => goTo(at - 1)} disabled={at <= 0} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:border-rose-300 disabled:opacity-30">
          <ChevronLeft size={15} /> 앞 코디
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex shrink-0 gap-1">
            {its.slice(0, 4).map((x) => (
              <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-9 rounded-md" />
            ))}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-rose-700">
              코디 {n}
              {codis.length > 0 && <span className="font-normal text-stone-400"> / {codis.length}</span>}
              {auto && <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">지금은 상품 맞춤 추천 — 하나라도 바꾸면 고른 그대로</span>}
            </div>
            <div className="truncate text-sm font-semibold text-stone-900">{codiName(c, d.items)}</div>
          </div>
        </div>
        <button type="button" onClick={() => goTo(at + 1)} disabled={at < 0 || at >= codis.length - 1} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:border-rose-300 disabled:opacity-30">
          다음 코디 <ChevronRight size={15} />
        </button>
        <span className="text-[11px] text-stone-400">← → 로도</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={22} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[11.5rem_minmax(0,1fr)_15rem]">
        {/* 왼쪽 묶음 */}
        <nav className="min-h-0 overflow-y-auto border-r border-stone-200 bg-stone-50/60 p-2">
          {groups.map((gr) => {
            const on = gr.id === sel;
            const p = pickedIn(gr);
            return (
              <button
                key={gr.id}
                type="button"
                onClick={() => setSel(gr.id)}
                aria-pressed={on}
                className={
                  "mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm " +
                  (gr.depth ? "pl-6 text-xs " : "font-semibold ") +
                  (on ? "bg-rose-700 text-white" : "text-stone-700 hover:bg-white")
                }
              >
                <span className="min-w-0 truncate">{gr.name}</span>
                <span className={"shrink-0 text-[11px] tabular-nums " + (on ? "text-white/80" : p ? "font-semibold text-rose-700" : "text-stone-400")}>
                  {p} / {gr.cards.length}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSel(OWN)}
            aria-pressed={sel === OWN}
            className={"mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-2 text-left text-sm font-semibold " + (sel === OWN ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 text-stone-700 hover:bg-white")}
          >
            이 코디만 <span className={"text-[11px] tabular-nums " + (sel === OWN ? "text-white/80" : "text-stone-400")}>{ownCount}장</span>
          </button>
        </nav>

        {/* 가운데 격자 */}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          {sel === OWN ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-stone-800">
                이 코디만 <span className="font-normal text-stone-400">공용 포즈 카드엔 안 들어가요 · 붙여넣기 Ctrl+V · 끌어다 놓기 · 사진 고르기 · 촬영 레퍼런스에서</span>
              </h3>
              {ownBlock}
            </section>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-stone-800">
                  {g?.name} <span className="font-normal text-stone-400">카드 {g?.cards.length || 0}개 · 사진을 누르면 쓰기/안 쓰기 · 두 번 누르거나 돋보기 = 크게</span>
                </h3>
                <span className="ml-auto flex items-center gap-1">
                  {["*", ...shotList, ""].map((x) => (
                    <button
                      key={x || "none"}
                      type="button"
                      aria-pressed={shotF === x}
                      onClick={() => setShotF(x)}
                      className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + (shotF === x ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300")}
                    >
                      {x === "*" ? "전부" : x || "안 정함"} <span className="opacity-60">{(g?.cards || []).filter((k) => x === "*" || (x === "" ? !k.shot : k.shot === x)).length}</span>
                    </button>
                  ))}
                </span>
                <label className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-1 text-xs">
                  <Search size={13} className="text-stone-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 찾기" className="w-28 outline-none" />
                </label>
              </div>
              {!shown.length ? (
                <p className="py-10 text-center text-sm text-stone-400">이 묶음엔 포즈 카드가 없어요 — 왼쪽에서 다른 묶음을 눌러 봐요.</p>
              ) : (
                // 11/18 카드를 여러 칸으로 나란히(1440 → 5칸 · 1280 → 4칸) — 사진이 2장 넘는 카드만 두 칸, 그 안에서 옆으로 넘기기
                <div className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
                  {shown.map((k) => {
                    const on = ids.includes(k.id);
                    const photos = k.sec.photos || [];
                    const wide = photos.length > 1;
                    return (
                      <section key={k.id} className={"flex min-w-0 flex-col rounded-xl border p-2 " + (wide ? "col-span-2 " : "") + (on ? "border-rose-200 bg-rose-50/40" : "border-stone-200")}>
                        {/* 11/18 세원 "pc에서 카드째 버튼 깨진다" — 첫 줄 = 이름(말줄임) + 단추(늘 한 줄), 둘째 줄 = 추천 · 확인 전 · 찍는 방식(넘치면 다음 줄), 셋째 줄 = 이름 뒤 글 */}
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-stone-900" title={k.code}>
                            {k.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => set(flipCard(sRef.current, c, cards, d.items, k))}
                            title={on ? "카드 빼기" : "카드째 넣기"}
                            className={"shrink-0 rounded-md px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap " + (on ? "border border-stone-200 bg-white text-stone-600 hover:text-rose-700" : "bg-rose-700 text-white")}
                          >
                            {on ? "빼기" : "카드째"}
                          </button>
                        </div>
                        {(reco.has(k.id) || k.ok !== true || k.shot || isFaceCard(k)) && (
                          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                            {reco.has(k.id) && <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold whitespace-nowrap text-rose-700 ring-1 ring-rose-200">추천</span>}
                            {isFaceCard(k) && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold whitespace-nowrap text-amber-950">얼굴</span>}
                            {k.ok !== true && <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold whitespace-nowrap text-amber-700">확인 전</span>}
                            {k.shot && <span className="rounded-full bg-violet-50 px-1.5 text-[10px] font-semibold whitespace-nowrap text-violet-700">{k.shot}</span>}
                          </div>
                        )}
                        <div className="mt-1 mb-1.5 truncate text-[11px] text-stone-500" title={[stripCode(k.title), k.sec?.text].filter(Boolean).join(" — ")}>
                          {stripCode(k.title) || " "}
                        </div>
                        {rc.why[k.id] && (
                          <div className="-mt-1 mb-1.5 line-clamp-2 text-[11px] leading-snug text-rose-700" title={`고른 이유: ${rc.why[k.id]}`}>
                            {rc.why[k.id]}
                          </div>
                        )}
                        <div className={wide ? "flex snap-x gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]" : ""}>
                          {photos.map((p, i) => {
                            const use = on && !off.has(p.key);
                            return (
                              <div key={p.key} className={"group relative " + (wide ? "w-[calc(50%-0.1875rem)] shrink-0 snap-start" : "")}>
                                <button
                                  type="button"
                                  onClick={() => set(flipPhoto(sRef.current, c, cards, d.items, k, p.key))}
                                  onDoubleClick={() => setBig({ urls: photos.map((x) => urlOf(x.key)), at: i })}
                                  aria-pressed={use}
                                  aria-label={use ? "이 사진 안 쓰기" : "이 사진 쓰기"}
                                  className={"relative block w-full overflow-hidden rounded-lg " + (use ? "ring-[3px] ring-rose-600" : "opacity-55 hover:opacity-90")}
                                >
                                  <Photo url={urlOf(p.key)} className="aspect-[3/4] w-full" />
                                  {use && (
                                    <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-700 text-white shadow">
                                      <Check size={14} strokeWidth={3} />
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBig({ urls: photos.map((x) => urlOf(x.key)), at: i })}
                                  aria-label="크게 보기"
                                  className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100"
                                >
                                  <Search size={14} />
                                </button>
                                {p.cap && <div className="mt-1 line-clamp-2 text-[11px] text-stone-500">{p.cap}</div>}
                              </div>
                            );
                          })}
                        </div>
                        {wide && photos.length > 2 && <div className="mt-1 text-right text-[10px] text-stone-400">사진 {photos.length}장 · 옆으로 넘겨요</div>}
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* 오른쪽 — 이 코디에 고른 것 (찍는 순서) */}
        <aside className="min-h-0 overflow-y-auto border-l border-stone-200 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-stone-800">이 코디에 고른 것</span>
            <span className="text-xs font-semibold text-rose-700 tabular-nums">모두 {nPicked}장</span>
          </div>
          {shots.length !== nPicked && <p className="-mt-1 mb-2 text-[11px] text-stone-400">찍는 순서로는 {shots.length}장 — 상의를 겹쳐 입으면 상의 포즈를 그 겹에서 한 번 더 찍어요</p>}
          {!shots.length && <p className="text-xs text-stone-400">아직 없어요 — 가운데 사진을 누르면 여기 붙어요.</p>}
          <div className="space-y-3">
            {steps.map((st) => (
              <div key={st.n}>
                <div className="mb-1 text-[11px] font-semibold text-stone-600">
                  {CIRCLE[st.n - 1] || st.n} {stepLabel(st)} <span className="font-normal text-stone-400">{st.shots.length}장</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {st.shots.map((x, i) => (
                    <div key={x.doneKey + i} className="relative">
                      <button type="button" onClick={() => setBig({ urls: st.shots.map((y) => urlOf(y.key)), at: i })} title={`${x.code || "이 코디만"} ${x.title || ""}`} className="block w-full overflow-hidden rounded-md">
                        <Photo url={urlOf(x.key)} className="aspect-[3/4] w-full" />
                      </button>
                      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] font-semibold text-white">{x.own ? "이 코디" : x.code}</span>
                      <button
                        type="button"
                        onClick={() => dropShot(x)}
                        aria-label="이 사진 빼기"
                        className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm hover:text-rose-700"
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
      {big && <BigSlides urls={big.urls.filter(Boolean)} start={big.at} onClose={() => setBig(null)} />}
    </div>
  );
}
