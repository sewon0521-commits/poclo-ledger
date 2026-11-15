import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ImagePlus, Images, Loader2, Pencil, X } from "lucide-react";
import { codiItems, codiName } from "../lib/shoot";
import { newId } from "../lib/id";
import { clipImages, filesOf } from "../lib/pasteImages";
import { guidePhoto } from "../lib/modelGuide";
import { picksOf, shotsOf, flipDone, flipPhoto, flipCard } from "../lib/poses";
import { Photo } from "./ShootBits";
import { SlideViewer } from "./ContentBits";
import RefPick from "./RefPick";
import { usePoseUrls } from "../lib/usePoseUrls";

/**
 * 촬영 날 화면 · 코디 포즈 창 (11/16 밤) — 세원: "포즈판 개어려운데 이거 보면서 촬영할 수 있는 거 맞아?" · "포즈 사진을 우리가 변경할 수 있나?" ·
 *   "이 코디에 이 포즈를 고를 수 있게 만들면 더 좋을 것 같은데, 이 코디에만 적용되는 포즈."
 * 방향성 창: 격자는 PC 에서 미리 고르기, 촬영 날은 폰에서 코디 하나씩 → ShootRun.
 *   ShootRun: 코디 1 → 2 → 3, 맨 위 코디 상품 사진·이름, 그 아래 고른 포즈 사진을 크게 한 장씩(SlideViewer) · 사진마다 '찍음 ✓' · 다 찍으면 '다음 코디'.
 *   CodiPoseSheet: 이 코디 포즈 — 카드째 넣기/빼기, 카드 안 사진 한 장만 쓰기, 이 코디만 사진(붙여넣기 · 끌어다 놓기 · 고르기 · 촬영 레퍼런스).
 * 데이터는 촬영 줄(set → shoot_days) — lib/poses.js '코디마다 찍을 사진'.
 */

/** 코디 상품 사진 줄 + 이름 */
function CodiHead({ c, d, n, small }) {
  const its = codiItems(c, d.items);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex shrink-0 gap-1">
        {its.slice(0, 4).map((x) => (
          <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className={"aspect-[3/4] rounded-md " + (small ? "w-9" : "w-12")} />
        ))}
      </div>
      <div className="min-w-0">
        {n && <div className="text-xs font-bold text-rose-700">코디 {n}</div>}
        <div className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900">{codiName(c, d.items)}</div>
      </div>
    </div>
  );
}

/** 이 코디 포즈 고치기 */
export function CodiPoseSheet({ s, set, c, n, d, cards, online, onClose }) {
  const sRef = useRef(s);
  useEffect(() => {
    sRef.current = s;
  });
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(false);
  const fileRef = useRef(null);
  const { ids, auto } = picksOf(s, c, cards, d.items);
  const off = new Set(s.posePhotoOff?.[c.id] || []);
  const own = s.poseOwn?.[c.id] || [];
  const { urlOf, setFresh } = usePoseUrls([...cards.flatMap((k) => (k.sec.photos || []).map((p) => p.key)), ...own.map((p) => p.key)], online, d);
  const putOwn = (list) => set({ poseOwn: { ...(sRef.current.poseOwn || {}), [c.id]: list } });
  const add = async (files) => {
    const imgs = [...(files || [])].filter((f) => f.type?.startsWith("image/"));
    if (!imgs.length) return;
    setErr("");
    for (const f of imgs) {
      const pv = URL.createObjectURL(f);
      setPending((p) => [...p, pv]);
      try {
        const key = await guidePhoto(f, online);
        if (!key.startsWith("data:")) setFresh(key, pv);
        putOwn([...(sRef.current.poseOwn?.[c.id] || []), { id: newId("po"), key, cap: "" }]);
      } catch (e) {
        setErr(e.message || "사진을 넣지 못했어요.");
      }
      setPending((p) => p.filter((u) => u !== pv));
    }
  };
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  // 창이 떠 있는 동안 화면 어디서든 Ctrl+V (글 칸 안은 그대로)
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target?.closest?.("input, textarea")) return;
      const cl = clipImages(e.clipboardData);
      if (!cl.files.length && !cl.urls.length) return;
      e.preventDefault();
      e.stopPropagation();
      filesOf(cl).then((fs) => addRef.current(fs));
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, []);
  const pickDone = (refIds) => {
    const now = sRef.current.poseOwn?.[c.id] || [];
    const keep = now.filter((p) => !p.refId || refIds.includes(p.refId));
    const had = new Set(keep.map((p) => p.refId));
    const more = refIds
      .filter((id) => !had.has(id))
      .map((id) => d.refs.find((r) => r.id === id))
      .filter((r) => r?.photo)
      .map((r) => ({ id: newId("po"), key: r.photo, cap: "", refId: r.id }));
    putOwn([...keep, ...more]);
    setPicking(false);
  };
  const used = cards.filter((k) => ids.includes(k.id));
  const rest = cards.filter((k) => !ids.includes(k.id));
  const card = (k, on) => (
    <li key={k.id} className={"rounded-xl border p-2.5 " + (on ? "border-rose-200 bg-rose-50/40" : "border-stone-200")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-bold text-stone-900">{k.code}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-stone-600">{k.title.replace(/^P\d+\s*/, "")}</span>
        {k.ok !== true && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">확인 전</span>}
        <button
          type="button"
          onClick={() => set(flipCard(sRef.current, c, cards, d.items, k))}
          className={"shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold " + (on ? "border border-stone-200 bg-white text-stone-600 hover:text-rose-700" : "bg-rose-700 text-white")}
        >
          {on ? "카드 빼기" : "카드째 넣기"}
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {(k.sec.photos || []).map((p) => {
          const use = on && !off.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => set(flipPhoto(sRef.current, c, cards, d.items, k, p.key))}
              aria-pressed={use}
              aria-label={use ? "이 사진 안 쓰기" : "이 사진 쓰기"}
              className={"relative w-16 shrink-0 overflow-hidden rounded-lg " + (use ? "ring-2 ring-rose-600" : "opacity-45 hover:opacity-80")}
            >
              <Photo url={urlOf(p.key)} className="aspect-[3/4] w-full" />
              {use && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-700 text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </li>
  );
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        className="sheet relative z-10 flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          filesOf(clipImages(e.dataTransfer)).then(add);
        }}
      >
        <header className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <CodiHead c={c} d={d} n={n} small />
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-xs text-stone-500">
            사진을 누르면 이 코디에서 쓰고(분홍 테두리) 안 써요. 카드에서 한 장만 골라 써도 돼요.
            {auto && <b className="font-semibold text-rose-700"> 지금은 옷 종류로 고른 추천이에요 — 하나라도 바꾸면 고른 그대로 남아요.</b>}
          </p>
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-stone-800">
              이 코디만 <span className="font-normal text-stone-400">공용 포즈 카드엔 안 들어가요 · 붙여넣기 Ctrl+V · 끌어다 놓기</span>
            </h3>
            <div className="flex flex-wrap items-start gap-2">
              {own.map((p) => (
                <div key={p.id} className="group relative w-20">
                  <Photo url={urlOf(p.key)} className="aspect-[3/4] w-full rounded-lg" />
                  <button
                    type="button"
                    onClick={() => putOwn((sRef.current.poseOwn?.[c.id] || []).filter((x) => x.id !== p.id))}
                    aria-label="사진 빼기"
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
                  >
                    <X size={12} />
                  </button>
                  <input
                    defaultValue={p.cap || ""}
                    onBlur={(e) => e.target.value !== (p.cap || "") && putOwn((sRef.current.poseOwn?.[c.id] || []).map((x) => (x.id === p.id ? { ...x, cap: e.target.value.trim() } : x)))}
                    placeholder="설명 (선택)"
                    aria-label="사진 설명"
                    className="mt-1 w-full rounded-md border border-stone-200 px-1.5 py-1 text-[11px] outline-none focus:border-rose-400"
                  />
                </div>
              ))}
              {pending.map((u) => (
                <span key={u} className="relative block aspect-[3/4] w-20 overflow-hidden rounded-lg bg-stone-100">
                  <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
                  <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-white drop-shadow" />
                </span>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-[3/4] w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 px-1 text-center text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
                <ImagePlus size={16} /> 사진 고르기
              </button>
              {d.refs && (
                <button type="button" onClick={() => setPicking(true)} className="flex aspect-[3/4] w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-rose-300 bg-rose-50/40 px-1 text-center text-[11px] font-medium text-rose-800 hover:border-rose-500">
                  <Images size={16} /> 촬영 레퍼런스에서
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
            </div>
            {err && <p className="mt-1.5 text-xs text-rose-700">{err}</p>}
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-stone-800">
              고른 포즈 카드 <span className="font-normal text-stone-400">{used.length}개</span>
            </h3>
            {used.length ? <ul className="space-y-2">{used.map((k) => card(k, true))}</ul> : <p className="text-xs text-stone-400">아직 없어요 — 아래 카드에서 넣어요.</p>}
          </section>
          {rest.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-stone-500">다른 포즈 카드 · 사진 한 장만 눌러도 들어가요</h3>
              <ul className="space-y-2">{rest.map((k) => card(k, false))}</ul>
            </section>
          )}
        </div>
        <footer className="flex justify-end border-t border-stone-200 px-4 py-2.5">
          <button type="button" onClick={onClose} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </footer>
      </div>
      {picking && <RefPick d={d} picked={own.map((p) => p.refId).filter(Boolean)} onDone={pickDone} onClose={() => setPicking(false)} />}
    </div>,
    document.body,
  );
}

/** 촬영 날 화면 — 폰 먼저. 코디 하나씩, 포즈 사진 크게, 사진마다 찍음 ✓ */
export function ShootRun({ s, set, codis, d, cards, online, onClose, onCodi }) {
  const memo = "poclo_run_" + s.id;
  const [ci, setCi] = useState(() => {
    try {
      return Math.min(codis.length - 1, Math.max(0, Number(sessionStorage.getItem(memo)) || 0));
    } catch {
      return 0;
    }
  });
  const [at, setAt] = useState(0);
  const [jump, setJump] = useState(null);
  const c = codis[ci];
  const all = codis.map((x) => shotsOf(s, x, cards, d.items).shots);
  const shots = all[ci] || [];
  const cur = shots[at];
  const { urlOf } = usePoseUrls(all.flat().map((x) => x.key), online, d);
  useEffect(() => {
    try {
      sessionStorage.setItem(memo, String(ci));
    } catch {
      /* 무시 */
    }
  }, [ci, memo]);
  // 촬영하는 동안 폰 화면이 꺼지지 않게 (되는 브라우저만)
  useEffect(() => {
    let lock = null;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => lock?.release?.().catch?.(() => {});
  }, []);
  const go = (i) => {
    setCi(i);
    setAt(0);
  };
  const flip = () => {
    if (!cur) return;
    const wasDone = cur.done;
    set(flipDone(s, c, cards, d.items, cur.key));
    if (!wasDone) {
      // 다음 안 찍은 사진으로
      const next = shots.findIndex((x, i) => i > at && !x.done);
      if (next >= 0) setTimeout(() => setJump({ i: next, n: Date.now() }), 250);
    }
  };
  const nDone = shots.filter((x) => x.done).length;
  const allDone = shots.length > 0 && nDone === shots.length;
  const last = ci === codis.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-3 py-2">
        <button type="button" onClick={onClose} aria-label="촬영 화면 닫기" className="-m-1 p-1.5 text-stone-500 hover:text-stone-800">
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-stone-900">
            코디 {ci + 1} <span className="font-normal text-stone-400">/ {codis.length}</span>
          </div>
          <div className="mt-0.5 flex gap-1">
            {all.map((l, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`코디 ${i + 1}로`}
                className={"h-1.5 flex-1 rounded-full " + (i === ci ? "bg-rose-700" : l.length && l.every((x) => x.done) ? "bg-emerald-500" : "bg-stone-200")}
              />
            ))}
          </div>
        </div>
        <button type="button" onClick={() => onCodi(c)} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300">
          <Pencil size={12} /> 포즈 고치기
        </button>
      </header>
      <div className="shrink-0 px-3 py-2">
        <CodiHead c={c} d={d} />
      </div>
      {shots.length ? (
        <>
          <div className="relative min-h-0 flex-1 bg-stone-100">
            <SlideViewer key={c.id} urls={shots.map((x) => urlOf(x.key))} onAt={setAt} jump={jump} expandable className="h-full w-full" />
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
              {cur?.code} · {at + 1}/{shots.length}
            </span>
            {cur?.done && (
              <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                <Check size={13} strokeWidth={3} /> 찍음
              </span>
            )}
          </div>
          <div className="shrink-0 space-y-1.5 px-3 pt-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-stone-900">
                {cur?.title}
                {cur && !cur.ok && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">확인 전</span>}
              </div>
              {(cur?.text || cur?.cap) && <p className="line-clamp-2 text-xs text-stone-500">{[cur.text, cur.own ? "" : cur.cap].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {shots.map((x, i) => (
                <button key={x.key + i} type="button" onClick={() => setJump({ i, n: Date.now() })} aria-label={`${i + 1}번째 포즈`} className={"relative w-10 shrink-0 overflow-hidden rounded-md " + (i === at ? "ring-2 ring-rose-700" : "")}>
                  <Photo url={urlOf(x.key)} className="aspect-[3/4] w-full" />
                  {x.done && (
                    <span className="absolute inset-0 flex items-center justify-center bg-emerald-600/55 text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-stone-50 px-6 text-center text-sm text-stone-500">
          이 코디에 고른 포즈가 없어요.
          <button type="button" onClick={() => onCodi(c)} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">
            포즈 고르기
          </button>
        </div>
      )}
      <footer className="flex shrink-0 items-center gap-2 border-t border-stone-200 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => ci > 0 && go(ci - 1)} disabled={ci === 0} aria-label="앞 코디" className="rounded-xl border border-stone-200 p-3 text-stone-600 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        {shots.length > 0 && (
          <button
            type="button"
            onClick={flip}
            className={"flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold " + (cur?.done ? "border-2 border-emerald-600 bg-white text-emerald-700" : "bg-emerald-600 text-white")}
          >
            <Check size={17} strokeWidth={3} /> {cur?.done ? "찍음 풀기" : "찍음"}
            <span className="font-normal tabular-nums opacity-80">
              {nDone}/{shots.length}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? onClose() : go(ci + 1))}
          className={"flex items-center justify-center gap-1 rounded-xl px-4 py-3 text-sm font-bold " + (allDone || !shots.length ? "bg-rose-700 text-white" : "border border-stone-200 text-stone-700") + (shots.length ? "" : " flex-1")}
        >
          {last ? "촬영 끝" : "다음 코디"} {!last && <ChevronRight size={17} />}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
