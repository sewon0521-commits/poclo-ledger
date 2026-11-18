import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Footprints, Pencil, Play, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { md, codiItems, codiName } from "../lib/shoot";
import { usePoseUrls } from "../lib/usePoseUrls";
import { poseDeck, poseFoldersOf, shotsOfLib, placeOfDay, codiFolder, recommend, shotsOf, setLibOk, stripCode, RECO_RULE, IN_ID, OUT_ID } from "../lib/poses";
import { wearSteps, stepLabel } from "../lib/shootOrder";
import { withChildren, childrenOf, pathName } from "../lib/reelFolders";
import { Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import { SectionEdit } from "./ModelGuideEditor";

/**
 * 촬영 창 › 포즈 판 (11/16, lib/poses.js 머리말) — PC 에서 미리 고르는 격자. 줄 = 이 촬영 코디(찍는 순서), 칸 = 포즈 카드 + '이 코디만'.
 *   칸을 눌러 카드째 넣고 뺀다. 안 건드린 코디는 옷 종류로 고른 추천이 점선으로 깔려 있다.
 *   코디 이름을 누르면 그 코디 포즈 창(PoseRun.CodiPoseSheet) — 카드에서 사진 한 장만 골라 쓰기 · 이 코디만 사진 넣기.
 *   촬영 날엔 '촬영 시작'(PoseRun.ShootRun) — 폰에서 코디 하나씩, 포즈 사진을 크게 넘기며 찍음 ✓. (11/16 밤 세원: "포즈판 개어려운데 이거 보면서 촬영할 수 있는 거 맞아?")
 *   칸 머리를 누르면 포즈 카드(사진 · 설명 · 고른 이유 · 원본) + 세원 확인(OK · 확인 전 · 빼기) + 사진 고치기(빼기 · 더하기 · 순서).
 *   11/17 포즈 카드는 촬영 관리 › 포즈(settings shoot_poses — lib/poses '포즈 칸')에서 온다.
 *   11/17 저녁 세원: "포즈판에서 고르기가 너무 어려운디 / 포즈판에서 바로 뺄 수 있게 UX 좋게 — 너무 눈에 안 띄어서"
 *     → '줄 × 모든 포즈 칸' 격자를 버리고, 코디 줄마다 고른 포즈만 카드(늘 보이는 ×) + 점선 '추천'(누르면 담김) + '+ 포즈'(그 코디 옷 종류 폴더부터 여는 고르기 창, 여러 장 체크해 담기).
 *     빼면 아래 '되돌리기'(5초 · Ctrl+Z). 찍음 표시가 있는 포즈를 뺄 때만 한 번 묻는다. 추천은 그 촬영 쪽(바깥 촬영이면 야외, 아니면 실내) 카드에서만.
 */

/** 포즈 카드 크게 보기 + 세원 확인 + 사진 고치기 (모델 레퍼런스 칸과 같은 SectionEdit) */
function PoseCardSheet({ k, urlOf, setFresh, onOk, onEdit, onClose, d, online }) {
  const [big, setBig] = useState(null);
  const [edit, setEdit] = useState(false);
  const [sec, setSec] = useState(k.sec);
  const timer = useRef(null);
  const latest = useRef(k.sec);
  const dirty = useRef(false);
  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onEdit(latest.current);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (s) => {
    latest.current = s;
    dirty.current = true;
    setSec(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const close = () => {
    flush();
    onClose();
  };
  const p = sec.pose || {};
  const photos = (sec.photos || []).map((x) => ({ u: urlOf(x.key), cap: x.cap }));
  const st = k.ok === true ? "ok" : "wait";
  const chip = "rounded-full px-3 py-1.5 text-xs font-semibold border";
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={close} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-rose-700">{k.code}</div>
            <div className="text-lg leading-snug font-bold text-stone-900">{stripCode(sec.title)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => (edit ? (flush(), setEdit(false)) : setEdit(true))}
              className={"flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold " + (edit ? "bg-rose-700 text-white" : "border border-stone-200 text-stone-700 hover:border-rose-300")}
            >
              {edit ? <Check size={13} /> : <Pencil size={13} />} {edit ? "다 고쳤어요" : "사진 고치기"}
            </button>
            <button type="button" onClick={close} aria-label="닫기" className="p-1 text-stone-400 hover:text-stone-700">
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {edit ? (
            <>
              <p className="text-xs text-stone-500">사진 위 × = 빼기 · ← → = 순서 · '새 사진'이나 칸 위에서 Ctrl+V · 끌어다 놓기 = 더하기. 고친 건 촬영 관리 › 포즈와 모든 촬영에 같이 바뀌어요.</p>
              <SectionEdit x={sec} i={0} n={1} online={online} urlOf={urlOf} onChange={change} onFresh={setFresh} d={d} bare titleHint="포즈 이름" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((x, i) => (
                  <figure key={i} className="min-w-0">
                    <Photo url={x.u} className="aspect-[3/4] w-full rounded-xl" onClick={() => x.u && setBig(i)} />
                    {x.cap && <figcaption className="mt-1 truncate text-center text-[11px] text-stone-500">{x.cap}</figcaption>}
                  </figure>
                ))}
              </div>
              {(sec.text || "").trim() && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-stone-500">모델에게 가는 설명</div>
                  <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm whitespace-pre-line text-rose-900">{sec.text.trim()}</p>
                </div>
              )}
              {p.why && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-stone-500">고른 이유 (우리만 봐요)</div>
                  <p className="text-sm text-stone-700">{p.why}</p>
                </div>
              )}
              {(p.src || []).length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-stone-500">원본 (우리만 봐요)</div>
                  <ul className="space-y-1">
                    {p.src.map((x, i) => (
                      <li key={i} className="flex min-w-0 items-center gap-1.5 text-xs text-stone-600">
                        <span className="w-4 shrink-0 text-stone-400 tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {[x.mall, x.cut].filter(Boolean).join(" · ")}
                          {x.face ? <span className="text-stone-400"> · {x.face}</span> : null}
                        </span>
                        {x.url && (
                          <a href={x.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 font-semibold text-rose-700 hover:underline">
                            열기 <ExternalLink size={11} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="space-y-2 border-t border-stone-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-stone-500">이 포즈</span>
            <button type="button" onClick={() => onOk(true)} aria-pressed={st === "ok"} className={chip + " " + (st === "ok" ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-200 text-stone-700 hover:border-emerald-400")}>
              OK
            </button>
            <button type="button" onClick={() => onOk(undefined)} aria-pressed={st === "wait"} className={chip + " " + (st === "wait" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-stone-200 text-stone-700 hover:border-amber-400")}>
              확인 전
            </button>
            <button
              type="button"
              onClick={() => {
                flush();
                onOk(false);
                onClose();
              }}
              className={chip + " border-stone-200 text-stone-500 hover:border-rose-300 hover:text-rose-700"}
            >
              빼기
            </button>
          </div>
          <p className="text-[11px] text-stone-400">OK 난 포즈만 모델 촬영 시트에 가요 · 빼면 판에서 숨겨요(아래 '뺀 포즈'에서 되살려요)</p>
        </footer>
      </div>
      {big !== null && <BigSlides urls={photos.map((x) => x.u).filter(Boolean)} start={big} onClose={() => setBig(null)} />}
    </div>,
    document.body,
  );
}

/** '+ 포즈' 고르기 창 — 그 코디 옷 종류 폴더부터, 다른 폴더 · 찍는 방식 칩, 여러 장 체크해 담기 */
function PosePicker({ c, n, name, s, cards, folders, shots, items, picked, online, d, onAdd, onClose }) {
  const place = placeOfDay(s);
  const [sel, setSel] = useState(() => codiFolder(c, items, folders, place, cards));
  const [shot, setShot] = useState("*");
  const [chk, setChk] = useState([]);
  const inSel = (k, id) => id === "all" || withChildren(id, folders).includes(k.folderId) || (id === IN_ID && !k.folderId);
  const shotOn = shot; // 11/18 모든 묶음에서 찍는 방식 칩
  const shown = cards.filter((k) => inSel(k, sel) && (shotOn === "*" || (shotOn === "" ? !k.shot : k.shot === shotOn)));
  const { urlOf } = usePoseUrls(
    shown.map((k) => k.sec.photos?.[0]?.key),
    online,
    d,
  );
  // 고른 폴더까지 [상위, 하위, 세부]
  const path = [];
  for (let f = folders.find((x) => x.id === sel); f && path.length < 4; f = f.parent && folders.find((x) => x.id === f.parent)) path.unshift(f);
  const tops = folders.filter((f) => !f.parent);
  const chip = (on, sky) =>
    "rounded-full border px-2.5 py-1 text-xs font-medium " + (on ? (sky ? "border-sky-600 bg-sky-600 text-white" : "border-rose-700 bg-rose-700 text-white") : "border-stone-200 bg-white text-stone-600 hover:border-rose-300");
  const count = (id) => cards.filter((k) => inSel(k, id)).length;
  const flip = (id) => setChk((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-rose-700">{n}번 코디 · 포즈 고르기</div>
            <div className="truncate text-base font-bold text-stone-900">{name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="hit relative -m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="space-y-1.5 border-b border-stone-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 shrink-0 text-[11px] text-stone-400">폴더</span>
            <button type="button" onClick={() => setSel("all")} className={chip(sel === "all")}>
              전체 <span className="opacity-70">{cards.length}</span>
            </button>
            {tops.map((f) => (
              <button key={f.id} type="button" onClick={() => setSel(f.id)} className={chip(path[0]?.id === f.id, f.id === OUT_ID)}>
                {f.name} <span className="opacity-70">{count(f.id)}</span>
              </button>
            ))}
          </div>
          {path.slice(0, 2).map((p, lv) =>
            childrenOf(p.id, folders).length ? (
              <div key={p.id} className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] text-stone-400">{lv ? "세부" : "종류"}</span>
                <button type="button" onClick={() => setSel(p.id)} className={chip(sel === p.id)}>
                  전부
                </button>
                {childrenOf(p.id, folders).map((k) => (
                  <button key={k.id} type="button" onClick={() => setSel(k.id)} className={chip(path[lv + 1]?.id === k.id)}>
                    {k.name} <span className="opacity-70">{count(k.id)}</span>
                  </button>
                ))}
              </div>
            ) : null,
          )}
          {/* 11/18 세원 "아우터처럼 전 카테고리에 찍는 방식" — 모든 묶음에서 칩(11/17 밤엔 OUTER 만) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 shrink-0 text-[11px] text-stone-400">찍는 방식</span>
              {["*", ...shots, ""].map((x) => (
                <button key={x || "none"} type="button" onClick={() => setShot(x)} className={chip(shot === x)}>
                  {x === "*" ? "전부" : x || "안 정함"}
                </button>
              ))}
            </div>

        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {!shown.length ? (
            <p className="py-8 text-center text-sm text-stone-400">이 폴더엔 포즈가 없어요 — 위에서 다른 폴더를 눌러 봐요.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {shown.map((k) => {
                const had = picked.includes(k.id);
                const on = had || chk.includes(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    disabled={had}
                    aria-pressed={on}
                    onClick={() => flip(k.id)}
                    className={"relative min-w-0 overflow-hidden rounded-xl border text-left " + (on ? "border-rose-600 ring-2 ring-rose-600" : "border-stone-200 hover:border-rose-300") + (had ? " opacity-60" : "")}
                  >
                    <Photo url={urlOf(k.sec.photos?.[0]?.key)} className="aspect-[3/4] w-full" />
                    <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (on ? "border-rose-600 bg-rose-600 text-white" : "border-white bg-black/20 text-transparent")}>
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="block p-1.5">
                      <span className="block text-xs font-bold text-stone-900">
                        {k.code} {had && <span className="font-semibold text-rose-700">담김</span>}
                      </span>
                      <span className="line-clamp-2 text-[11px] leading-tight text-stone-500">{stripCode(k.title)}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                        {k.shot && <span className="rounded bg-stone-100 px-1 text-stone-600">{k.shot}</span>}
                        <span className={"rounded px-1 font-semibold " + (k.ok === true ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{k.ok === true ? "OK" : "확인 전"}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
          <span className="min-w-0 truncate text-xs text-stone-500">
            {sel === "all" ? "전체" : pathName(sel, folders)} · {shown.length}장
          </span>
          <button type="button" disabled={!chk.length} onClick={() => onAdd(chk)} className="shrink-0 rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {chk.length ? `${chk.length}장 담기` : "포즈를 눌러 고르기"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** 줄 안 포즈 카드 — 고른 것(테두리 · 늘 보이는 ×) / 추천(점선 · 누르면 담김) */
function PoseTile({ k, mode, mine, url, onTap, onDrop }) {
  const done = mine.length > 0 && mine.every((x) => x.done);
  const part = mode !== "reco" && mine.length > 0 && mine.length < (k.sec.photos || []).length;
  return (
    <div className={"relative w-[4.5rem] shrink-0 sm:w-20 " + (mode === "reco" ? "opacity-80" : "")}>
      <button
        type="button"
        onClick={onTap}
        title={mode === "reco" ? `${k.code} 담기 (추천)` : mode === "auto" ? "추천 그대로 담기" : `${k.code} 포즈 카드 보기 · OK`}
        className={"block w-full overflow-hidden rounded-lg text-left " + (mode === "pick" ? (done ? "ring-2 ring-emerald-600" : "ring-1 ring-stone-300") : "border border-dashed border-rose-400 bg-rose-50/50")}
      >
        <Photo url={url} className="aspect-[3/4] w-full" />
        <span className="block px-1 py-0.5">
          <span className="flex items-center gap-0.5 text-[11px] font-bold text-stone-900">
            {k.code}
            {done && <Check size={11} className="text-emerald-600" strokeWidth={3} />}
            {part && <span className="text-[10px] font-normal text-stone-500 tabular-nums">{mine.length}장</span>}
          </span>
          <span className="line-clamp-2 text-[10px] leading-tight text-stone-500">{stripCode(k.title)}</span>
          {mode !== "pick" && <span className="text-[10px] font-semibold text-rose-600">{mode === "reco" ? "+ 추천" : "추천"}</span>}
        </span>
      </button>
      {mode !== "reco" && (
        <button
          type="button"
          onClick={onDrop}
          aria-label={`${k.code} 이 코디에서 빼기`}
          title="이 코디에서 빼기"
          className="hit absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm hover:border-rose-300 hover:text-rose-700"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

export default function PoseBoard({ s, set, codis, d, poses, online, onRun, onCodi }) {
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); // 포즈 카드 id
  const [pick, setPick] = useState(null); // '+ 포즈' 창 — 코디 id
  const [undo, setUndo] = useState(null); // {text, prev:{posePicks, posePhotoOff}}
  const lib = poses.lib;
  const folders = poseFoldersOf(lib);
  const { cards, hidden } = poseDeck(lib);
  const want = placeOfDay(s);
  const rows = codis.map((c) => {
    const { shots, auto, ids } = shotsOf(s, c, cards, d.items);
    const reco = recommend(
      cards.filter((k) => k.place === want),
      c,
      d.items,
    ).filter((id) => !ids.includes(id));
    return { c, shots, auto, ids, reco };
  });
  const { urlOf } = usePoseUrls(
    [...new Set(rows.flatMap((r) => [...r.ids, ...r.reco]))].map((id) => cards.find((k) => k.id === id)?.sec.photos?.[0]?.key),
    online,
    d,
  );
  const cardUrls = usePoseUrls(open ? ([...cards, ...hidden].find((k) => k.id === open)?.sec.photos || []).map((p) => p.key) : [], online, d);
  // 되돌리기 — 5초 · Ctrl+Z
  const undoRef = useRef(null);
  useEffect(() => {
    undoRef.current = undo;
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);
  useEffect(() => {
    const onKey = (e) => {
      if (!undoRef.current || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey || e.target?.closest?.("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      set(undoRef.current.prev);
      setUndo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);
  if (!(lib?.items || []).length)
    return (
      <div className="rounded-xl border border-stone-200 p-3 text-xs text-stone-500">
        <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Footprints size={15} className="text-rose-700" /> 포즈 판
        </div>
        포즈 카드가 아직 없어요 — 촬영 관리 위 '포즈' 탭에서 만들어요.
      </div>
    );

  const order = cards.map((k) => k.id);
  const snap = () => ({ posePicks: s.posePicks || {}, posePhotoOff: s.posePhotoOff || {} });
  const setPicks = (c, ids) => set({ posePicks: { ...(s.posePicks || {}), [c.id]: order.filter((x) => ids.includes(x)) } });
  const drop = (r, k) => {
    const mine = r.shots.filter((x) => x.cardId === k.id);
    if (mine.some((x) => x.done) && !window.confirm(`${k.code} 는 '찍음' 표시가 있어요. 그래도 이 코디에서 뺄까요?`)) return;
    const prev = snap();
    const keys = new Set((k.sec.photos || []).map((p) => p.key));
    set({
      posePicks: { ...(s.posePicks || {}), [r.c.id]: r.ids.filter((x) => x !== k.id) },
      posePhotoOff: { ...(s.posePhotoOff || {}), [r.c.id]: (s.posePhotoOff?.[r.c.id] || []).filter((x) => !keys.has(x)) },
    });
    setUndo({ text: `${k.code} 뺐어요`, prev });
  };
  const backToReco = (c) => {
    const prev = snap();
    const without = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id]) => id !== c.id));
    set({ posePicks: without(s.posePicks), posePhotoOff: without(s.posePhotoOff) });
    setUndo({ text: "추천으로 되돌렸어요", prev });
  };
  const okChange = (id, ok) => {
    setErr("");
    poses.change(setLibOk(id, ok)).catch((e) => setErr(e.message || "포즈 확인을 저장하지 못했어요."));
  };
  // 카드 사진 고치기 — 포즈 칸 그 카드를 통째로(사진·설명·이름), 서버 최신 위에서. pose(확인·고른 이유)는 서버 것 그대로
  const editCard = (sec) => {
    setErr("");
    poses
      .change((v) => ({ ...v, items: (v.items || []).map((y) => (y.id === sec.id ? { ...y, ...sec, pose: y.pose } : y)) }))
      .catch((e) => setErr(e.message || "포즈 사진을 저장하지 못했어요."));
  };
  const total = rows.reduce((n, r) => n + r.shots.length, 0);
  const shot = rows.reduce((n, r) => n + r.shots.filter((x) => x.done).length, 0);
  const openCard = open && [...cards, ...hidden].find((k) => k.id === open);
  const pickRow = pick && rows.find((r) => r.c.id === pick);
  const byId = (id) => cards.find((k) => k.id === id);
  const tile = (r, k, mode) => (
    <PoseTile
      key={k.id}
      k={k}
      mode={mode}
      mine={r.shots.filter((x) => x.cardId === k.id)}
      url={urlOf(k.sec.photos?.[0]?.key)}
      onTap={() => (mode === "reco" ? setPicks(r.c, [...r.ids, k.id]) : mode === "auto" ? setPicks(r.c, r.ids) : setOpen(k.id))}
      onDrop={() => drop(r, k)}
    />
  );

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Footprints size={15} className="text-rose-700" /> 포즈 판
          <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (want === "out" ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-600")}>{want === "out" ? "야외 추천" : "실내 추천"}</span>
          {codis.length > 0 && (
            <span className="font-normal text-stone-400 tabular-nums">
              사진 {total}장{shot ? ` · 찍음 ${shot}` : ""}
            </span>
          )}
        </div>
        {codis.length > 0 && total > 0 && (
          <button type="button" onClick={onRun} className="flex items-center gap-1 rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800">
            <Play size={13} /> 촬영 시작
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-stone-500">
        코디마다 찍을 포즈만 보여요 · <b className="font-semibold text-stone-700">×</b> 빼기 · 점선 = 추천({RECO_RULE}) — 누르면 담겨요 · <b className="font-semibold text-stone-700">+ 포즈</b>로 포즈 칸에서 더 골라요.
        카드를 누르면 사진 · OK, 코디 이름을 누르면 카드에서 사진 한 장만 쓰거나 이 코디만 사진을 넣어요.
      </p>
      {!codis.length ? (
        <p className="rounded-lg bg-stone-50 px-3 py-3 text-xs text-stone-500">
          이 촬영 코디가 아직 없어요 — 신상 관리 › 코디에서 촬영일을 {s.on ? md(s.on) : "이날"}로 넣으면 여기 줄이 생기고, 옷 종류로 포즈를 먼저 골라 둬요.
        </p>
      ) : (
        <div className="divide-y divide-stone-100">
          {rows.map((r, i) => {
            const its = codiItems(r.c, d.items);
            const own = r.shots.filter((x) => x.own);
            const nDone = r.shots.filter((x) => x.done).length;
            return (
              <div key={r.c.id} className="py-2.5">
                <div className="mb-1 flex min-w-0 items-center gap-1.5">
                  <span className="w-4 shrink-0 text-center text-xs font-bold text-rose-700 tabular-nums">{i + 1}</span>
                  <Photo url={its[0] && (d.urls[its[0].photo] || its[0].photoUrl)} className="aspect-[3/4] w-7 shrink-0 rounded" />
                  <button type="button" onClick={() => onCodi(r.c)} className="-my-3 min-w-0 truncate py-3 text-left text-xs font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-rose-800" title="이 코디 포즈 고치기(사진 한 장만 · 이 코디만 사진)">
                    {codiName(r.c, d.items)}
                  </button>
                  <span className={"shrink-0 text-[10px] tabular-nums " + (r.shots.length && nDone === r.shots.length ? "font-semibold text-emerald-700" : "text-stone-400")}>
                    {r.shots.length}장{nDone ? ` · 찍음 ${nDone}` : ""}
                  </span>
                  {r.auto ? (
                    <span className="shrink-0 text-[10px] font-semibold text-rose-600">추천 그대로</span>
                  ) : (
                    <button type="button" onClick={() => backToReco(r.c)} className="-my-3 flex shrink-0 items-center gap-0.5 py-3 text-[10px] text-stone-400 hover:text-rose-700" title="이 코디를 추천으로 되돌리기">
                      <RotateCcw size={9} /> 추천으로
                    </button>
                  )}
                </div>
                {/* 11/17 밤 찍는 순서 — 안쪽 옷부터 입으면서(lib/shootOrder). 촬영 시작 · 모델 시트도 이 순서 */}
                <p className="pl-5 text-[11px] break-words text-stone-500" title="안쪽 옷부터 하나씩 입으면서 찍어요 · 겹마다 사진 → 영상">
                  찍는 순서 {wearSteps(r.c, d.items).map((st) => `${"①②③④⑤⑥⑦⑧⑨"[st.n - 1] || st.n} ${stepLabel(st)}`).join(" → ")}
                </p>
                <div className="flex gap-2 overflow-x-auto pt-2 pr-2 pb-1 pl-5">
                  {r.ids
                    .map(byId)
                    .filter(Boolean)
                    .map((k) => tile(r, k, r.auto ? "auto" : "pick"))}
                  {!r.auto &&
                    r.reco
                      .map(byId)
                      .filter(Boolean)
                      .map((k) => tile(r, k, "reco"))}
                  {own.length > 0 && (
                    <button type="button" onClick={() => onCodi(r.c)} className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-stone-800 text-white sm:w-20">
                      <span className="text-sm font-bold tabular-nums">{own.length}장</span>
                      <span className="text-[10px]">이 코디만</span>
                    </button>
                  )}
                  <button
                    type="button"
                    // 11/18 PC(넓은 화면)는 코디 포즈 큰 창 하나로 — 고르는 곳을 하나로 맞춤. 폰은 예전 고르기 창
                    onClick={() => (window.matchMedia?.("(min-width: 1024px)").matches ? onCodi(r.c) : setPick(r.c.id))}
                    className="flex min-h-24 w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-xs font-semibold text-stone-500 hover:border-rose-400 hover:text-rose-700 sm:w-20"
                  >
                    <Plus size={18} /> 포즈
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] text-stone-400">모델 촬영 시트엔 OK 난 포즈 + 이 코디만 사진이 코디별로 가요. 포즈 카드는 촬영 관리 위 '포즈' 탭에서 만들고 고쳐요.</p>
      {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
      {hidden.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
          <span>포즈 칸에서 뺀 포즈</span>
          {hidden.map((k) => (
            <button key={k.id} type="button" onClick={() => okChange(k.id, undefined)} className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 hover:border-rose-300 hover:text-rose-700" title="되살리기">
              {k.code} 되살리기
            </button>
          ))}
        </div>
      )}
      {undo &&
        createPortal(
          <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
            <div className="flex items-center gap-3 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg">
              {undo.text}
              <button
                type="button"
                onClick={() => {
                  set(undo.prev);
                  setUndo(null);
                }}
                className="flex items-center gap-1 font-semibold text-rose-300 hover:text-rose-200"
              >
                <Undo2 size={14} /> 되돌리기 <span className="text-[11px] font-normal text-stone-400 max-sm:hidden">Ctrl+Z</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
      {pickRow && (
        <PosePicker
          c={pickRow.c}
          n={rows.indexOf(pickRow) + 1}
          name={codiName(pickRow.c, d.items)}
          s={s}
          cards={cards}
          folders={folders}
          shots={shotsOfLib(lib)}
          items={d.items}
          picked={pickRow.ids}
          online={online}
          d={d}
          onAdd={(ids) => {
            setPicks(pickRow.c, [...pickRow.ids, ...ids]);
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
      {openCard && (
        <PoseCardSheet
          key={openCard.id}
          k={openCard}
          urlOf={cardUrls.urlOf}
          setFresh={cardUrls.setFresh}
          d={d}
          online={online}
          onOk={(ok) => okChange(openCard.id, ok)}
          onEdit={editCard}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
