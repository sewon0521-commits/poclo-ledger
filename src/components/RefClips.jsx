import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, Clapperboard, Loader2, Pause, Play, Plus, Repeat, Scissors, Star, X } from "lucide-react";
import { FIELD } from "../lib/shoot";
import { newId } from "../lib/id";
import { folderIdOf, withChildren, seedFolders } from "../lib/reelFolders";
import { ReelKitCtx, signedUrls, videoKey, thumbKey, reelTitle, reelSeconds, reelVer, fmtT, rangeText, clipLen, sceneRange, r1 } from "../lib/refClips";
import { FolderBar } from "./FolderBits";
import LoopClip, { ClipBig } from "./LoopClip";
import { useSegmentLoop } from "../lib/useSegmentLoop";

/**
 * 참고 영상 장면 (10/29) — 스타일링 창 '참고 영상'. 콘텐츠 › 릴스 기획 라이브러리에서 영상을 고르고(폴더 · BEST · 찾기),
 * 볼 부분만 잘라(구간만 저장 — 파일은 그대로) 코디에 담는다. 담은 장면을 누르면 그 구간만 계속 반복. 촬영 때 우리가 보는 것(모델 시트엔 안 감 — 10/29 저녁 v4).
 * 자세한 규칙은 lib/refClips.js 머리말.
 */

const MIN = 0.3; // 가장 짧은 장면(초)

/** 볼 부분 자르기 — 손잡이 끌기 · ±0.1초 · '지금 장면으로' · 분석의 장면으로 고르기 */
function ClipEditor({ reel, online, init, onSave, onBack, backLabel }) {
  const vref = useRef(null);
  const bar = useRef(null);
  const [src, setSrc] = useState("");
  const [poster, setPoster] = useState("");
  const [state, setState] = useState("loading"); // loading · ok · none
  const [dur, setDur] = useState(reelSeconds(reel));
  const [range, setRange] = useState([init?.start || 0, init?.end || 0]); // 끝 0 = 아직 길이 모름 → 알면 끝까지
  const [cur, setCur] = useState(init?.start || 0);
  const [mode, setMode] = useState("sel"); // sel 고른 부분 반복 · all 처음부터 끝까지
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState(init?.note || "");
  useEffect(() => {
    let alive = true;
    signedUrls([videoKey(reel.id), thumbKey(reel.id)], online)
      .then((m) => {
        if (!alive) return;
        setSrc(m[videoKey(reel.id)] || "");
        setPoster(m[thumbKey(reel.id)] || "");
        setState(m[videoKey(reel.id)] ? "ok" : "none");
      })
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [reel.id, online]);
  const s = range[0];
  const e = range[1] > s ? range[1] : dur;
  useSegmentLoop(vref, s, e, mode === "sel" && !!src);

  const seek = (t) => {
    const v = vref.current;
    setCur(t);
    if (v) v.currentTime = t;
  };
  const setEdge = (i, t) => {
    const top = dur || Math.max(e, t);
    setRange(([a, b]) => {
      const bb = b > a ? b : top;
      const n = i === 0 ? [r1(Math.max(0, Math.min(t, bb - MIN))), bb] : [a, r1(Math.min(top, Math.max(t, a + MIN)))];
      seek(n[i]);
      return n;
    });
    vref.current?.pause();
  };
  const pct = (t) => (dur ? `${Math.min(100, Math.max(0, (t / dur) * 100))}%` : "0%");
  const tOf = (x) => {
    const box = bar.current.getBoundingClientRect();
    return Math.min(dur, Math.max(0, ((x - box.left) / box.width) * dur));
  };
  const dragEdge = (i) => (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!dur) return;
    const move = (m) => setEdge(i, tOf(m.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // 막대 빈 곳을 누르고 끌면 영상 훑어보기(처음부터 끝까지 모드)
  const scrub = (ev) => {
    if (!dur) return;
    setMode("all");
    vref.current?.pause();
    seek(tOf(ev.clientX));
    const move = (m) => seek(tOf(m.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const playSel = () => {
    const v = vref.current;
    if (!v) return;
    if (mode === "sel" && !v.paused) return v.pause();
    setMode("sel");
    if (v.currentTime < s || v.currentTime >= e - 0.05) v.currentTime = s;
    v.play().catch(() => {});
  };
  const playAll = () => {
    const v = vref.current;
    if (!v) return;
    if (mode === "all" && !v.paused) return v.pause();
    setMode("all");
    v.play().catch(() => {});
  };
  const scenes = (reel.reference?.scenes || [])
    .map((x) => ({ r: sceneRange(x.at), t: x.visual || x.text || "" }))
    .filter((x) => x.r && (!dur || x.r[0] < dur));
  const len = r1(e - s);
  const edge = (i) => (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-stone-50 px-2 py-1.5">
      <span className="w-[5.25rem] shrink-0 text-xs whitespace-nowrap text-stone-500">
        {i ? "끝" : "시작"} <b className="font-semibold text-stone-900 tabular-nums">{fmtT(i ? e : s)}</b>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {[-0.1, 0.1].map((d) => (
          <button key={d} type="button" disabled={!dur} onClick={() => setEdge(i, (i ? e : s) + d)} aria-label={`${i ? "끝" : "시작"} ${d < 0 ? "0.1초 앞으로" : "0.1초 뒤로"}`} className="h-7 w-7 rounded-md border border-stone-200 bg-white text-sm font-semibold text-stone-700 hover:border-rose-300 disabled:opacity-40">
            {d < 0 ? "−" : "+"}
          </button>
        ))}
        <button type="button" disabled={!dur} onClick={() => setEdge(i, cur)} className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800 disabled:opacity-40">
          지금 장면으로
        </button>
      </span>
    </div>
  );
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl bg-stone-900 max-md:max-w-[180px]">
            {src ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                ref={vref}
                src={src}
                poster={poster || undefined}
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(ev) => {
                  const d = ev.currentTarget.duration || 0;
                  if (d) setDur(d);
                  setRange(([a, b]) => [Math.min(a, Math.max(0, d - MIN)), b > a && b <= d + 0.05 ? b : r1(d)]);
                  ev.currentTarget.currentTime = s;
                }}
                onTimeUpdate={(ev) => setCur(ev.currentTarget.currentTime)}
                onSeeked={(ev) => setCur(ev.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={() => (vref.current?.paused ? vref.current.play().catch(() => {}) : vref.current?.pause())}
                className="h-full w-full cursor-pointer object-contain"
              />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-stone-400">
                {state === "loading" ? <Loader2 size={20} className="animate-spin" /> : <Clapperboard size={22} />}
                {state === "loading" ? "영상 불러오는 중" : online ? "보관된 영상을 못 불러왔어요" : "이 기기 저장 모드라 영상을 못 불러와요 — 구간만 정할 수 있어요"}
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <div className="line-clamp-2 text-sm font-semibold text-stone-900">{reelTitle(reel)}</div>
              <div className="mt-0.5 text-[11px] text-stone-400">{dur ? `전체 ${r1(dur)}초` : "길이 모름"} · 노란 칸이 모델이 볼 부분이에요</div>
            </div>
            <div
              ref={bar}
              onPointerDown={scrub}
              className={"relative h-12 touch-none rounded-lg bg-stone-200 select-none " + (dur ? "cursor-pointer" : "opacity-50")}
              aria-label="영상 길이 막대 — 눌러서 훑어보기"
            >
              <span className="absolute inset-y-0 rounded-md border-2 border-amber-500 bg-amber-200/80" style={{ left: pct(s), right: `calc(100% - ${pct(e)})` }} />
              <span className="pointer-events-none absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded bg-stone-900" style={{ left: pct(cur) }} />
              {[0, 1].map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={i ? "끝 손잡이" : "시작 손잡이"}
                  onPointerDown={dragEdge(i)}
                  className="absolute inset-y-0 flex w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-md bg-amber-500 shadow active:scale-100"
                  style={{ left: pct(i ? e : s) }}
                >
                  <span className="h-5 w-0.5 rounded bg-white/80" />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {edge(0)}
              {edge(1)}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={!src} onClick={playSel} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-40">
                {mode === "sel" && playing ? <Pause size={13} /> : <Repeat size={13} />} {mode === "sel" && playing ? "멈추기" : `고른 부분 반복 (${len.toFixed(1)}초)`}
              </button>
              <button type="button" disabled={!src} onClick={playAll} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:border-stone-300 disabled:opacity-40">
                {mode === "all" && playing ? <Pause size={13} /> : <Play size={13} />} {mode === "all" && playing ? "멈추기" : "전체 보기"}
              </button>
              <span className="text-[11px] text-stone-400 tabular-nums">지금 {fmtT(cur)}</span>
            </div>
            {scenes.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold text-stone-500">장면으로 고르기 (분석한 장면)</div>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {scenes.map((x, k) => {
                    const on = Math.abs(x.r[0] - s) < 0.05 && Math.abs(Math.min(x.r[1], dur || x.r[1]) - e) < 0.05;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          const b = r1(Math.min(x.r[1], dur || x.r[1]));
                          setRange([r1(x.r[0]), b]);
                          setMode("sel");
                          seek(x.r[0]);
                        }}
                        title={x.t}
                        className={"max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] " + (on ? "border-amber-500 bg-amber-100 font-semibold text-amber-950" : "border-stone-200 bg-white text-stone-600 hover:border-amber-400")}
                      >
                        <span className="tabular-nums">{fmtT(x.r[0])}</span> {x.t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-stone-600">이 장면 메모 (선택)</span>
              <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="예: 이렇게 거울 쪽으로 걸어오기" className={FIELD} />
            </label>
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-2.5">
        <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-600">
          <ChevronLeft size={15} /> {backLabel}
        </button>
        <button
          type="button"
          disabled={!dur && !range[1]}
          onClick={() => onSave({ start: r1(s), end: dur && e >= dur - 0.05 ? 0 : r1(e), note: note.trim(), ver: reelVer(reel) })}
          className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          <Scissors size={14} /> {init ? "이대로 고치기" : "이 장면 담기"}
        </button>
      </footer>
    </>
  );
}

/** 릴스 기획 라이브러리에서 고르기 → 자르기. edit = {clip, reel} 이면 바로 자르기(다시 자르기) */
function ReelPick({ reels, folders, online, edit, onPick, onClose }) {
  const [sel, setSel] = useState("all");
  const [q, setQ] = useState("");
  const [bestOnly, setBestOnly] = useState(false);
  const [more, setMore] = useState(false);
  const [thumbs, setThumbs] = useState({});
  const [open, setOpen] = useState(edit?.reel || null);
  const asked = useRef(new Set());
  useEffect(() => {
    const k = (ev) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  // 영상이 보관된 것만 — BEST 먼저(릴스 기획과 같게)
  const list = useMemo(() => {
    const has = reels.filter((it) => it.hasVideo);
    return [...has.filter((i) => i.best), ...has.filter((i) => !i.best)];
  }, [reels]);
  const shown = useMemo(() => {
    const n = q.replace(/\s+/g, "").toLowerCase();
    const ids = sel === "all" || sel === "none" ? null : new Set(withChildren(sel, folders));
    return list.filter((it) => {
      const f = folderIdOf(it, folders);
      if (sel === "none" ? f : ids && !ids.has(f)) return false;
      if (bestOnly && !it.best) return false;
      if (!n) return true;
      const r = it.reference || {};
      return JSON.stringify([it.title, r.title, r.hook, r.script, it.shop?.name, it.meta?.name, it.meta?.user]).replace(/\s+/g, "").toLowerCase().includes(n);
    });
  }, [list, q, sel, bestOnly, folders]);
  const page = shown.slice(0, more ? 300 : 60);
  const pageIds = page.map((it) => it.id).join(",");
  useEffect(() => {
    const want = pageIds.split(",").filter((id) => id && !asked.current.has(id));
    if (!want.length) return;
    for (const id of want) asked.current.add(id);
    // 찾는 말을 바꿔 목록이 바뀌어도 받은 썸네일은 버리지 않는다(한 번 물은 건 다시 안 물어서)
    signedUrls(want.map(thumbKey), online)
      .then((m) => setThumbs((t) => ({ ...t, ...Object.fromEntries(want.map((id) => [id, m[thumbKey(id)] || ""])) })))
      .catch(() => {});
  }, [pageIds, online]);
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <span className="min-w-0 truncate font-semibold text-stone-900">
            {open ? "볼 부분 자르기" : "릴스 기획에서 참고 영상 고르기"}
            {!open && <span className="ml-1.5 text-sm font-normal text-stone-400">영상 {list.length}개</span>}
          </span>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        {open ? (
          <ClipEditor
            key={open.id}
            reel={open}
            online={online}
            init={edit?.reel?.id === open.id ? edit.clip : null}
            backLabel={edit ? "그만두기" : "다른 영상"}
            onBack={() => (edit ? onClose() : setOpen(null))}
            onSave={(c) => onPick({ ...(edit?.clip || { id: newId("cl"), at: new Date().toISOString() }), reelId: open.id, ...c })}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <FolderBar
              items={list}
              folders={folders}
              sel={sel}
              onSel={(v) => (setSel(v), setMore(false))}
              q={q}
              setQ={setQ}
              bestOnly={bestOnly}
              setBestOnly={setBestOnly}
              bestCount={list.filter((i) => i.best).length}
              searchPlaceholder="제목·대본·쇼핑몰 찾기"
            />
            {page.length ? (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                {page.map((it) => (
                  <button key={it.id} type="button" onClick={() => setOpen(it)} className="group min-w-0 text-left">
                    <span className={"relative block aspect-[9/16] overflow-hidden rounded-xl bg-stone-100 ring-1 " + (it.best ? "ring-amber-400" : "ring-stone-200") + " group-hover:ring-2 group-hover:ring-rose-400"}>
                      {thumbs[it.id] ? (
                        <img src={thumbs[it.id]} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-stone-300">
                          <Clapperboard size={18} />
                        </span>
                      )}
                      {it.best && (
                        <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                          <Star size={9} className="fill-amber-950" /> BEST
                        </span>
                      )}
                      {reelSeconds(it) > 0 && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">{Math.round(reelSeconds(it))}초</span>}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-snug text-stone-700">{reelTitle(it)}</span>
                  </button>
                ))}
                {shown.length > page.length && (
                  <button type="button" onClick={() => setMore(true)} className="flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-stone-300 text-xs text-stone-500">
                    {shown.length - page.length}개 더 보기
                  </button>
                )}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-stone-400">{list.length ? "이 폴더·찾는 말에 맞는 영상이 없어요." : "콘텐츠 › 릴스 기획에 영상을 보관하면 여기서 골라요."}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 스타일링 창 '참고 영상' — 담은 장면들 + '릴스 기획에서 가져오기' */
export function RefClipsBox({ list = [], onChange, online }) {
  const kit = useContext(ReelKitCtx);
  const reels = useMemo(() => kit?.reels || [], [kit?.reels]);
  // 릴스 폴더를 한 번도 저장한 적 없으면 릴스 기획 화면처럼 기본 갈래로 (ReelsPage 와 같게)
  const seeded = useMemo(() => seedFolders(reels), [reels]);
  const folders = kit?.folders?.length ? kit.folders : seeded;
  const [pick, setPick] = useState(false);
  const [edit, setEdit] = useState(null); // {clip, reel}
  const [big, setBig] = useState(null);
  const [urls, setUrls] = useState({});
  const ids = [...new Set(list.map((c) => c.reelId))].join(",");
  useEffect(() => {
    const want = ids.split(",").filter(Boolean);
    if (!want.length) return;
    let alive = true;
    signedUrls(want.flatMap((id) => [videoKey(id), thumbKey(id)]), online)
      .then((m) => alive && setUrls((u) => ({ ...u, ...m })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ids, online]);
  const reelOf = (c) => reels.find((r) => r.id === c.reelId);
  const full = list.map((c) => ({ ...c, src: urls[videoKey(c.reelId)] || "", poster: urls[thumbKey(c.reelId)] || "", title: reelTitle(reelOf(c)) }));
  const move = (i, d) => {
    const n = [...list];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    onChange(n);
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {full.map((c, i) => {
          const reel = reelOf(c);
          const moved = reel && (c.ver || "") !== reelVer(reel);
          return (
            <div key={c.id} className="min-w-0">
              <LoopClip src={c.src} poster={c.poster} start={c.start} end={c.end} onBig={() => setBig(i)} label={c.note || c.title} className="aspect-[9/16] w-full rounded-xl" />
              <div className="mt-1 space-y-0.5">
                {c.note && <div className="line-clamp-2 text-xs font-semibold text-stone-900">{c.note}</div>}
                <div className="truncate text-[11px] text-stone-500" title={c.title}>
                  {reel ? c.title : "릴스 기획에서 지워진 영상"}
                </div>
                <div className="text-[11px] text-stone-400 tabular-nums">
                  {rangeText(c)}
                  {clipLen(c) > 0 && ` · ${clipLen(c).toFixed(1)}초`}
                </div>
                {moved && (
                  <div className="flex items-start gap-1 text-[11px] text-amber-700">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" /> 릴스 영상을 다시 잘라서 장면이 어긋났을 수 있어요
                  </div>
                )}
                <div className="flex items-center gap-0.5 pt-0.5">
                  <button type="button" disabled={!reel} onClick={() => setEdit({ clip: c, reel })} className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 hover:text-rose-800 disabled:opacity-40">
                    <Scissors size={11} /> 다시 자르기
                  </button>
                  {list.length > 1 && (
                    <>
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="앞으로" className="rounded-md px-1.5 py-1 text-[11px] text-stone-500 hover:bg-stone-100 disabled:opacity-30">
                        ←
                      </button>
                      <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="뒤로" className="rounded-md px-1.5 py-1 text-[11px] text-stone-500 hover:bg-stone-100 disabled:opacity-30">
                        →
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => onChange(list.filter((x) => x.id !== c.id))} aria-label="장면 빼기" className="ml-auto rounded-md p-1 text-stone-300 hover:bg-stone-100 hover:text-rose-700">
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setPick(true)} className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-2 text-center text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700">
          <Plus size={18} /> 릴스 기획에서 가져오기
          <span className="text-[10px] text-stone-400">고르고 볼 부분만 자르기</span>
        </button>
      </div>
      {(pick || edit) && (
        <ReelPick
          reels={reels}
          folders={folders}
          online={online}
          edit={edit}
          onClose={() => (setPick(false), setEdit(null))}
          onPick={(clip) => {
            onChange(list.some((x) => x.id === clip.id) ? list.map((x) => (x.id === clip.id ? clip : x)) : [...list, clip]);
            setPick(false);
            setEdit(null);
          }}
        />
      )}
      {big != null && <ClipBig clips={full} at={big} onClose={() => setBig(null)} />}
    </div>
  );
}
