import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronLeft, ChevronRight, Film, ImagePlus, Images, Loader2, Pencil, Smartphone, Video, X } from "lucide-react";
import { ReelKitCtx, signedUrls, videoKey, thumbKey, reelTitle } from "../lib/refClips";
import { stepClips, useVideoRefs } from "../lib/shootVideoRefs";
import { useLookbook, lookOf, shootVideoRows, flipShootVideo } from "../lib/lookbook";
import { seedFolders } from "../lib/reelFolders";
import { useSegmentLoop } from "../lib/useSegmentLoop";
import { ClipBig } from "./LoopClip";
import { ReelPick } from "./RefClips";
import CodiPoseBig from "./CodiPoseBig";
import { codiItems, codiName } from "../lib/shoot";
import { newId } from "../lib/id";
import { clipImages, filesOf } from "../lib/pasteImages";
import { guidePhoto } from "../lib/modelGuide";
import { picksOf, flipPhoto, flipCard, stripCode } from "../lib/poses";
import { runOrder, flipRun, stepLabel, GROUP_NAME } from "../lib/shootOrder";
import { poseAiVer, isFaceCard } from "../lib/poseReco";
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

/** 화면이 넓은가 (PC) — 포즈 큰 창은 1024px 넘을 때만 */
const WIDE = "(min-width: 1024px)";
function useWide() {
  const [w, setW] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return;
    const f = () => setW(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return w;
}

/** 이 코디 포즈 고치기 — PC 는 큰 창(CodiPoseBig, 11/18), 폰은 이 창 */
export function CodiPoseSheet({ s, set, c, n, d, cards, online, onClose, codis, onGo, lib }) {
  const wide = useWide();
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
  const ownBlock = (
    <>
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
    </>
  );
  if (wide)
    return createPortal(
      <div
        className="backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          filesOf(clipImages(e.dataTransfer)).then(add);
        }}
      >
        <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
        <CodiPoseBig s={s} set={set} sRef={sRef} c={c} n={n} codis={codis} onGo={onGo} d={d} cards={cards} lib={lib} urlOf={urlOf} ownBlock={ownBlock} ownCount={own.length} onClose={onClose} />
        {picking && <RefPick d={d} picked={own.map((p) => p.refId).filter(Boolean)} onDone={pickDone} onClose={() => setPicking(false)} />}
      </div>,
      document.body,
    );
  const used = cards.filter((k) => ids.includes(k.id));
  const rest = cards.filter((k) => !ids.includes(k.id));
  const card = (k, on) => (
    <li key={k.id} className={"rounded-xl border p-2.5 " + (on ? "border-rose-200 bg-rose-50/40" : "border-stone-200")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-bold text-stone-900">{k.code}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-stone-600">{stripCode(k.title)}</span>
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
            {ownBlock}
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

const CIRCLE = "①②③④⑤⑥⑦⑧⑨";

/** 겹 영상 칸 안 작은 미리보기 — 그 겹 사진을 다 찍으면 소리 없이 그 구간만 반복, 아니면 썸네일 */
function MiniLoop({ clip, play }) {
  const ref = useRef(null);
  useSegmentLoop(ref, clip?.start || 0, clip?.end || 0, !!clip?.src && play);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.currentTime = clip?.start || 0;
    v.play().catch(() => {});
  }, [play, clip?.src, clip?.start]);
  if (clip?.src && play)
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video ref={ref} src={`${clip.src}#t=${clip.start || 0}`} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  if (clip?.poster) return <img src={clip.poster} alt="" className="h-full w-full object-cover" />;
  return (
    <span className="flex h-full w-full items-center justify-center text-stone-400">
      <Film size={14} />
    </span>
  );
}

/**
 * 촬영 날 화면 — 폰 먼저. 코디 하나씩, 포즈 사진 크게, 사진마다 찍음 ✓
 * 11/17 밤 찍는 순서(lib/shootOrder): 안쪽 옷부터 입으면서 — 겹(①②③) 칩 · 겹마다 사진(TOP → SELFIE → BTM / OUTER → FULL) → 그 겹 영상 ✓.
 *   한 겹 사진을 다 찍으면 다음 겹으로 넘어가지 않고 '영상' 단추가 깜빡인다 → 영상 찍음을 누르면 다음 겹 첫 사진으로.
 * 11/24 세원: "셀카랑 찍어주는 컷이랑 분리되게 — 보통 우리가 먼저 찍어주고 태은씨나 주현씨한테 셀카 찍으라고 주거든"
 *   → 겹마다 찍어주는 컷을 먼저, 그다음 셀카(lib/shootOrder shotKindOf). 겹 칩 아래 '찍어주는 컷 n/N · 셀카 n/N' 칸(누르면 그쪽 첫 안 찍은 사진으로),
 *   사진 위 '찍어주는 컷' / '셀카 · 모델이 찍어요' 표시, 아래 작은 사진 줄에 경계. 찍어주는 컷을 다 찍으면 '이제 셀카 — 폰을 모델에게' 알림이 뜬다.
 * 11/24 고침: 다음 코디로 넘어갈 때 앞 코디에서 넘기던 자리(jump)가 남아 새 코디가 첫 사진이 아니라 그 번째 사진으로 열리던 것.
 */
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
  const [pickStep, setPickStep] = useState(null); // 사진 없는 겹 칩을 눌렀을 때만 — 사진을 넘기면 풀린다
  const c = codis[ci];
  // 11/18 밤 "ERP 렉" — 코디 전부의 찍는 순서(+ 추천)는 촬영 줄·코디·카드가 바뀔 때만. 예전엔 사진을 넘길 때마다 처음부터 다시 셌다
  const aiv = poseAiVer(); // 11/24 사진 낱말이 새로 오면 추천도 다시(포즈 판과 같은 추천)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => codis.map((x) => runOrder(s, x, cards, d.items)), [s, codis, cards, d.items, aiv]);
  const { steps, shots } = all[ci] || { steps: [], shots: [] };
  const cur = shots[at];
  const si = pickStep ?? cur?.step ?? 1;
  const step = steps.find((x) => x.n === si) || steps[0];
  const { urlOf } = usePoseUrls(all.flatMap((r) => r.shots.map((x) => x.key)), online, d);
  // 11/18 정정 '찍을 영상' — 세원: "그날 코디에 영상 넣은거 있잖아? 룩북영상(공통)이랑 코디별로 영상 이거 다 넣어달라는 말이었엉"
  //   그날 룩북(공통) + 이 코디 참고 영상 장면 + 이 코디 글 줄(lib/lookbook shootVideoRows). 마지막 겹 사진을 다 찍으면 나온다 — 마지막 겹 '다 입은 영상' 대신.
  //   찍음은 스타일링 창과 같은 곳에(lookDone · clipDone · videos[].done) → 스타일링 '찍을 영상 n / N'과 같은 수
  const kit = useContext(ReelKitCtx);
  const reels = kit?.reels || [];
  const lb = useLookbook(online);
  const rowsOf = (cx) => (cx ? shootVideoRows(cx.styling, lookOf(lb.all, cx.shootDate), reels) : []);
  const vRows = rowsOf(c);
  const [stageOpen, setStageOpen] = useState(false);
  const [stageBig, setStageBig] = useState(null); // 크게 볼 장면 번호
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
  const [hand, setHand] = useState(false); // 11/24 '이제 셀카 — 폰을 모델에게' 알림
  useEffect(() => {
    if (!hand) return;
    const t = setTimeout(() => setHand(false), 4000);
    return () => clearTimeout(t);
  }, [hand]);
  const go = (i) => {
    setCi(i);
    setAt(0);
    setJump(null); // 11/24 앞 코디에서 넘기던 자리가 새 코디에 남지 않게
    setHand(false);
    setPickStep(null);
    setStageOpen(false);
  };
  const toStep = (n, stamp) => {
    setPickStep(n);
    const i = shots.findIndex((x) => x.step === n && !x.done);
    const j = i >= 0 ? i : shots.findIndex((x) => x.step === n);
    if (j >= 0) setJump({ i: j, n: stamp });
  };
  const onAt = (i) => {
    if (i !== at) setPickStep(null);
    setAt(i);
  };
  const flip = () => {
    if (!cur) return;
    const wasDone = cur.done;
    set(flipRun(s, c, cards, d.items, cur.doneKey));
    if (!wasDone) {
      // 11/24 그 겹 찍어주는 컷을 다 찍었고 셀카가 남았으면 — '이제 셀카' 알림
      if (cur.kind !== "selfie") {
        const leftPhoto = shots.some((x, i) => i !== at && x.step === cur.step && x.kind !== "selfie" && !x.done);
        const leftSelfie = shots.some((x) => x.step === cur.step && x.kind === "selfie" && !x.done);
        if (!leftPhoto && leftSelfie) setHand(true);
      }
      // 다음 안 찍은 사진으로 — 그 겹 영상을 아직 안 찍었으면 다음 겹으로는 안 넘어간다(영상 단추가 깜빡임)
      const next = shots.findIndex((x, i) => i > at && !x.done);
      const st = steps.find((x) => x.n === cur.step);
      if (next >= 0 && (shots[next].step === cur.step || st?.vidDone)) setTimeout(() => setJump({ i: next, n: Date.now() }), 250);
      // 마지막 겹 사진을 다 찍었으면 '찍을 영상'을 연다
      const left = shots.filter((x, i) => x.step === cur.step && !x.done && i !== at).length;
      if (st?.last && vRows.length && !left) setTimeout(() => setStageOpen(true), 300);
    }
  };
  const flipVid = () => {
    if (!step) return;
    const was = step.vidDone;
    set(flipRun(s, c, cards, d.items, step.vidKey));
    if (!was) {
      const nx = steps.find((x) => x.n > step.n);
      if (nx) setTimeout(() => toStep(nx.n, Date.now()), 250);
    }
  };
  const nDone = shots.filter((x) => x.done).length;
  // 겹 끝 = 사진 다 + 그 겹 영상. 마지막 겹에 '찍을 영상'이 있으면 그 줄을 다 찍어야 끝
  const stepDone = (x, cx = c) => {
    const rs = x.last ? rowsOf(cx) : [];
    return (rs.length ? rs.every((r) => r.done) : x.vidDone) && x.shots.every((y) => y.done);
  };
  const flipRow = (row) =>
    d.saveCodis((v) => ({ ...v, items: (v.items || []).map((x) => (x.id === c.id ? { ...x, styling: flipShootVideo(x.styling, row) } : x)) })).catch(() => {});
  const allDone = steps.length > 0 && steps.every(stepDone);
  const last = ci === codis.length - 1;
  const stepPhotosDone = step && step.shots.every((x) => x.done);
  const names = (list) => list.map((x) => x.name).join(" · ");
  // 11/24 이 겹 찍어주는 컷 · 셀카 — 칸을 누르면 그쪽 첫 안 찍은 사진으로
  const stepIdx = step ? shots.map((x, i) => ({ x, i })).filter((o) => o.x.step === step.n) : [];
  const kinds = { photo: stepIdx.filter((o) => o.x.kind !== "selfie"), selfie: stepIdx.filter((o) => o.x.kind === "selfie") };
  const jumpKind = (kd) => {
    const l = kinds[kd];
    const o = l.find((y) => !y.x.done) || l[0];
    setHand(false);
    if (!o) return;
    setPickStep(null);
    setJump({ i: o.i, n: Date.now() });
  };

  // 11/18 겹 영상 참고 영상 — 코디 참고 영상(겹) → (그 코디·그날 영상이 하나도 없을 때만) 영상 종류마다 추천 참고 영상(lib/shootVideoRefs)
  const { refs: vrefs, change: changeVrefs } = useVideoRefs(online);
  const [vBig, setVBig] = useState(false);
  const [vPick, setVPick] = useState(null); // 고를 영상 종류
  const [vurls, setVurls] = useState({});
  const sc = step ? stepClips(c, step, vrefs, vRows.length > 0) : { clips: [], from: "", kind: "" };
  // 모든 코디·겹 영상 + 찍을 영상 장면을 한 번에 서명 — 겹·코디를 넘겨도 바로 나오게
  const clipIds = [
    ...new Set(
      all.flatMap((r, i) => {
        const rs = rowsOf(codis[i]);
        return [...r.steps.flatMap((st) => stepClips(codis[i], st, vrefs, rs.length > 0).clips.map((cl) => cl.reelId)), ...rs.filter((x) => x.clip).map((x) => x.clip.reelId)];
      }),
    ),
  ]
    .sort()
    .join(",");
  useEffect(() => {
    const ids = clipIds.split(",").filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    const get = () =>
      signedUrls(ids.flatMap((id) => [videoKey(id), thumbKey(id)]), online)
        .then((m) => alive && setVurls((u) => ({ ...u, ...m })))
        .catch(() => {});
    get();
    // 서명 주소는 4시간 — 촬영이 길어져도 안 끊기게 20분마다 확인(3시간 반이 지난 것만 새로 받는다)
    const t = setInterval(get, 20 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [clipIds, online]);
  const full = (cl) => ({
    ...cl,
    src: vurls[videoKey(cl.reelId)] || "",
    poster: vurls[thumbKey(cl.reelId)] || "",
    title: reelTitle(reels.find((r) => r.id === cl.reelId)),
  });
  const vClips = sc.clips.map(full);
  const hasClips = vClips.length > 0;
  const lastStep = step && !steps.some((x) => x.n > step.n);
  const isStage = !!step?.last && vRows.length > 0;
  const stageClips = vRows.filter((r) => r.clip); // 크게 보기는 장면만(글 줄 · 인스타 주소는 볼 영상이 없다)
  const stageN = vRows.filter((r) => r.done).length;
  const stageAll = stageN === vRows.length;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-3 py-2">
        <button type="button" onClick={onClose} aria-label="촬영 화면 닫기" className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center text-stone-500 hover:text-stone-800">
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-stone-900">
            코디 {ci + 1} <span className="font-normal text-stone-400">/ {codis.length}</span>
          </div>
          <div className="flex gap-1">
            {all.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`코디 ${i + 1}로`}
                className="group flex-1 py-2"
              >
                {/* 11/18 막대는 그대로 얇게, 누르는 칸만 위아래로 넓게 */}
                <span className={"block h-1.5 rounded-full " + (i === ci ? "bg-rose-700" : r.steps.length && r.steps.every((x) => stepDone(x, codis[i])) ? "bg-emerald-500" : "bg-stone-200")} />
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => onCodi(c)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300">
          <Pencil size={12} /> 포즈 고치기
        </button>
      </header>
      <div className="shrink-0 px-3 pt-2">
        <CodiHead c={c} d={d} />
      </div>
      {/* 겹 칩 — 안쪽 옷부터 입으면서 */}
      {steps.length > 0 && (
        <div className="shrink-0 px-3 pt-2 pb-1.5">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {steps.map((x) => {
              const ok = stepDone(x);
              const on = x.n === step?.n;
              return (
                <button
                  key={x.n}
                  type="button"
                  onClick={(e) => toStep(x.n, e.timeStamp + Math.random())}
                  aria-pressed={on}
                  className={
                    "flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap " +
                    (on ? "bg-rose-700 text-white" : ok ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600")
                  }
                >
                  {ok && !on ? <Check size={12} strokeWidth={3} /> : <span>{CIRCLE[x.n - 1] || x.n}</span>}
                  {stepLabel(x)}
                </button>
              );
            })}
          </div>
          {step && (
            <p className="mt-1 line-clamp-2 text-[11px] text-stone-500">
              {step.n === 1 ? "입기" : "더 입기"}: {names(step.add) || "—"} · 한 번 입은 옷은 벗지 않아요
            </p>
          )}
        </div>
      )}
      {/* 11/24 찍어주는 컷 → 셀카(폰을 모델에게) — 이 겹 것만 센다 */}
      {stepIdx.length > 0 && (
        <div className="flex shrink-0 gap-1.5 px-3 pb-1.5">
          {["photo", "selfie"].map((kd) => {
            const l = kinds[kd];
            if (!l.length) return null;
            const n = l.filter((o) => o.x.done).length;
            const on = !!cur && cur.step === step.n && (cur.kind === "selfie") === (kd === "selfie");
            const fin = n === l.length;
            const self = kd === "selfie";
            return (
              <button
                key={kd}
                type="button"
                onClick={() => jumpKind(kd)}
                aria-pressed={on}
                className={
                  "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold " +
                  (on ? (self ? "border-violet-600 bg-violet-600 text-white" : "border-stone-800 bg-stone-800 text-white") : fin ? "border-emerald-200 bg-emerald-50 text-emerald-700" : self ? "border-violet-200 bg-violet-50 text-violet-800" : "border-stone-200 bg-white text-stone-700")
                }
              >
                {fin && !on ? <Check size={14} strokeWidth={3} /> : self ? <Smartphone size={14} /> : <Camera size={14} />}
                {self ? "셀카 · 모델이 찍어요" : "찍어주는 컷"}
                <span className="font-semibold tabular-nums opacity-80">
                  {n}/{l.length}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {shots.length ? (
        <>
          <div className="relative min-h-0 flex-1 bg-stone-100">
            <SlideViewer key={c.id} urls={shots.map((x) => urlOf(x.key))} onAt={onAt} jump={jump} expandable className="h-full w-full" />
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
              {CIRCLE[(cur?.step || 1) - 1]} {GROUP_NAME[cur?.group] || cur?.code} · {at + 1}/{shots.length}
            </span>
            {cur?.done && (
              <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                <Check size={13} strokeWidth={3} /> 찍음
              </span>
            )}
            {cur && (
              <span className={"pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow " + (cur.kind === "selfie" ? "bg-violet-600 text-white" : "bg-white/90 text-stone-800")}>
                {cur.kind === "selfie" ? <Smartphone size={13} /> : <Camera size={13} />}
                {cur.kind === "selfie" ? "셀카 · 모델이 찍어요" : "찍어주는 컷"}
                {!cur.own && isFaceCard(cards.find((k) => k.id === cur.cardId)) && <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950">얼굴</span>}
              </span>
            )}
            {hand && (
              <div role="status" className="absolute inset-x-3 top-11 z-10 flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white shadow-lg">
                <Smartphone size={18} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  이제 셀카 차례예요
                  <span className="block text-xs font-medium opacity-90">찍어주는 컷 다 찍었어요 · 폰을 모델에게 넘겨 주세요</span>
                </span>
                <button type="button" onClick={() => setHand(false)} aria-label="알림 닫기" className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/15">
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="shrink-0 space-y-1.5 px-3 pt-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-stone-900">
                {cur?.code && !cur.own && <span className="mr-1 text-rose-700">{cur.code}</span>}
                {cur?.title}
                {cur && !cur.ok && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">확인 전</span>}
              </div>
              {(cur?.text || cur?.cap) && <p className="line-clamp-2 text-xs text-stone-500">{[cur.text, cur.own ? "" : cur.cap].filter(Boolean).join(" · ")}</p>}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {shots.map((x, i) => (
                <span key={x.doneKey + i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && x.step !== shots[i - 1].step && <span className="mx-0.5 h-8 w-px bg-stone-300" aria-hidden />}
                  {i > 0 && x.step === shots[i - 1].step && x.kind !== shots[i - 1].kind && (
                    <span className="flex h-8 items-center px-0.5 text-violet-600" title="여기부터 셀카" aria-hidden>
                      <Smartphone size={13} />
                    </span>
                  )}
                  <button type="button" onClick={() => setJump({ i, n: Date.now() })} aria-label={`${i + 1}번째 포즈`} className={"relative w-10 overflow-hidden rounded-md " + (i === at ? "ring-2 ring-rose-700" : "")}>
                    <Photo url={urlOf(x.key)} className="aspect-[3/4] w-full" />
                    {x.kind === "selfie" && <span className="absolute inset-x-0 bottom-0 h-1 bg-violet-500" aria-hidden />}
                    {x.done && (
                      <span className="absolute inset-0 flex items-center justify-center bg-emerald-600/55 text-white">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-stone-50 px-6 text-center text-sm text-stone-500">
          이 코디에 고른 포즈가 없어요{steps.length ? " — 겹마다 영상만 찍어요" : ""}.
          <button type="button" onClick={() => onCodi(c)} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">
            포즈 고르기
          </button>
        </div>
      )}
      {/* 마지막 겹 '찍을 영상' (11/18 정정) — 그날 룩북 + 이 코디 영상. 누르면 목록 */}
      {isStage && (
        <div className="shrink-0 px-3 pt-1.5">
          <button
            type="button"
            onClick={() => setStageOpen(true)}
            className={
              "flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold " +
              (stageAll ? "bg-emerald-50 text-emerald-700" : stepPhotosDone ? "animate-pulse bg-amber-100 text-amber-900 ring-2 ring-amber-400" : "bg-stone-100 text-stone-700")
            }
          >
            {stageAll ? <Check size={15} strokeWidth={3} className="shrink-0" /> : <Video size={15} className="shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block">
                {CIRCLE[step.n - 1]} 찍을 영상 {stageN}/{vRows.length}
              </span>
              <span className="block text-[10px] font-normal opacity-75">
                {[vRows.some((r) => r.kind === "look") && `룩북 ${vRows.filter((r) => r.kind === "look").length}`, vRows.some((r) => r.kind !== "look") && `이 코디 ${vRows.filter((r) => r.kind !== "look").length}`].filter(Boolean).join(" · ")} · 눌러서 보기
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </button>
        </div>
      )}
      {/* 그 겹 영상 — 사진을 다 찍으면 깜빡여서 알려 준다. 칸을 누르면 참고 영상이 화면 가득 반복(11/18) */}
      {step && !isStage && (
        <div className="shrink-0 px-3 pt-1.5">
          <div
            className={
              "flex min-h-12 items-center gap-1.5 rounded-xl p-1.5 text-xs font-semibold " +
              (step.vidDone ? "bg-emerald-50 text-emerald-700" : stepPhotosDone ? "bg-amber-100 text-amber-900 ring-2 ring-amber-400" : "bg-stone-100 text-stone-600")
            }
          >
            {hasClips && (
              <button type="button" onClick={() => setVBig(true)} aria-label="참고 영상 크게 보기" className="relative aspect-[9/16] w-9 shrink-0 overflow-hidden rounded-lg bg-stone-800">
                <MiniLoop clip={vClips[0]} play={!!stepPhotosDone && !step.vidDone} />
              </button>
            )}
            <button
              type="button"
              onClick={() => (hasClips ? setVBig(true) : !vRows.length && setVPick(sc.kind))}
              className={"flex min-h-10 min-w-0 flex-1 items-center gap-1.5 px-1 text-left " + (stepPhotosDone && !step.vidDone ? "animate-pulse" : "")}
            >
              {!hasClips && (step.vidDone ? <Check size={15} strokeWidth={3} className="shrink-0" /> : <Video size={15} className="shrink-0" />)}
              <span className="min-w-0">
                <span className="line-clamp-2">
                  {CIRCLE[step.n - 1]} {step.video}
                </span>
                <span className="block text-[10px] font-normal opacity-75">
                  {hasClips
                    ? `참고 영상${vClips.length > 1 ? ` ${vClips.length}개` : ""} · 눌러서 크게${sc.from === "default" ? " · 추천(세원 확인 전)" : ""}`
                    : vRows.length
                      ? "이 겹은 참고 영상 없이"
                      : "참고 영상 고르기 ›"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={flipVid}
              aria-pressed={step.vidDone}
              className={"flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 font-bold " + (step.vidDone ? "bg-white text-emerald-700" : "bg-white/80 text-stone-800")}
            >
              {step.vidDone && <Check size={13} strokeWidth={3} />}
              {step.vidDone ? "찍음 · 풀기" : "영상 찍음"}
            </button>
          </div>
        </div>
      )}
      {stageOpen && isStage && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white">
          <header className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-3 py-2.5">
            <button type="button" onClick={() => setStageOpen(false)} className="-m-1.5 flex h-11 items-center gap-0.5 px-1.5 text-sm font-semibold text-stone-600">
              <ChevronLeft size={18} /> 사진
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-sm font-bold text-stone-900">
                코디 {ci + 1} · 찍을 영상 <span className="tabular-nums">{stageN}/{vRows.length}</span>
              </div>
              <div className="truncate text-[11px] text-stone-500">{codiName(c, d.items)}</div>
            </div>
            <span className="w-14" />
          </header>
          <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto px-3">
            {vRows.map((r) => {
              const k = stageClips.indexOf(r);
              const fc = r.clip ? full(r.clip) : null;
              return (
                <li key={r.id} className="flex items-center gap-2.5 py-2.5">
                  {fc ? (
                    <button type="button" onClick={() => setStageBig(k)} aria-label={`${r.text} 크게 보기`} className="relative aspect-[9/16] w-11 shrink-0 overflow-hidden rounded-lg bg-stone-800">
                      <MiniLoop clip={fc} play={r === stageClips.find((x) => !x.done)} />
                    </button>
                  ) : (
                    <span className="flex aspect-[9/16] w-11 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
                      <Video size={15} />
                    </span>
                  )}
                  <button type="button" onClick={() => (fc ? setStageBig(k) : undefined)} className={"min-w-0 flex-1 text-left " + (fc ? "" : "cursor-default")}>
                    <span className={"mb-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + (r.kind === "look" ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600")}>{r.tag}</span>
                    <span className={"line-clamp-2 text-sm " + (r.done ? "text-stone-400 line-through" : "font-semibold text-stone-900")}>{r.text}</span>
                    {fc && <span className="block text-[10px] text-stone-400">눌러서 크게 · 그 장면만 반복</span>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block text-[11px] text-sky-700 underline">
                        인스타에서 보기
                      </a>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => flipRow(r)}
                    aria-pressed={r.done}
                    className={"flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold " + (r.done ? "border-2 border-emerald-600 bg-white text-emerald-700" : "bg-emerald-600 text-white")}
                  >
                    <Check size={14} strokeWidth={3} /> {r.done ? "풀기" : "찍음"}
                  </button>
                </li>
              );
            })}
          </ul>
          <footer className="flex shrink-0 items-center gap-2 border-t border-stone-200 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => setStageOpen(false)} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-600">
              사진으로
            </button>
            <button
              type="button"
              onClick={() => (last ? onClose() : go(ci + 1))}
              className={"flex flex-1 items-center justify-center gap-1 rounded-xl py-3 text-sm font-bold " + (stageAll && stepPhotosDone ? "bg-rose-700 text-white" : "border border-stone-200 text-stone-700")}
            >
              {last ? "촬영 끝" : "다음 코디"} {!last && <ChevronRight size={17} />}
            </button>
          </footer>
        </div>
      )}
      {stageBig != null && stageClips[stageBig] && (
        <ClipBig
          clips={stageClips.map((r) => ({ ...full(r.clip), note: r.text }))}
          at={stageBig}
          onClose={() => setStageBig(null)}
          action={{
            head: (i) => `${stageClips[i]?.tag || ""} · 찍을 영상 ${stageN}/${vRows.length}`,
            done: (i) => !!stageClips[i]?.done,
            label: (i) => (stageClips[i]?.done ? "찍음 · 풀기" : "찍음 ✓ → 다음 영상"),
            onClick: (i) => {
              const r = stageClips[i];
              if (!r) return null;
              flipRow(r);
              if (r.done) return null;
              // 다음 안 찍은 장면으로, 없으면 닫기
              const nx = stageClips.findIndex((x, j) => j > i && !x.done);
              if (nx >= 0) return nx;
              setStageBig(null);
              return null;
            },
          }}
        />
      )}
      {vBig && hasClips && step && (
        <ClipBig
          clips={vClips}
          onClose={() => setVBig(false)}
          action={{
            head: `${CIRCLE[step.n - 1]} ${step.video}`,
            done: step.vidDone,
            label: step.vidDone ? "영상 찍음 · 풀기" : lastStep ? "영상 찍음 ✓" : "영상 찍음 ✓ → 다음 겹",
            onClick: () => {
              setVBig(false);
              flipVid();
            },
          }}
        />
      )}
      {vPick && (
        <ReelPick
          reels={reels}
          folders={kit?.folders?.length ? kit.folders : seedFolders(reels)}
          online={online}
          onClose={() => setVPick(null)}
          onPick={(clip) => {
            changeVrefs(vPick, [...(vrefs[vPick] || []), clip]).catch(() => {});
            setVPick(null);
          }}
        />
      )}
      <footer className="mt-1.5 flex shrink-0 items-center gap-2 border-t border-stone-200 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
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
