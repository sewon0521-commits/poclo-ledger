import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Footprints, Pencil, Play, Plus, RotateCcw, X } from "lucide-react";
import { md, codiItems, codiName } from "../lib/shoot";
import { usePoseUrls } from "../lib/usePoseUrls";
import { isPoseSet, poseSetsFor, poseCards, picksOf, shotsOf, setPoseOk, RECO_RULE } from "../lib/poses";
import { Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import { SectionEdit } from "./ModelGuideEditor";

/**
 * 촬영 창 › 포즈 판 (11/16, lib/poses.js 머리말) — PC 에서 미리 고르는 격자. 줄 = 이 촬영 코디(찍는 순서), 칸 = 포즈 카드 + '이 코디만'.
 *   칸을 눌러 카드째 넣고 뺀다. 안 건드린 코디는 옷 종류로 고른 추천이 점선으로 깔려 있다.
 *   코디 이름을 누르면 그 코디 포즈 창(PoseRun.CodiPoseSheet) — 카드에서 사진 한 장만 골라 쓰기 · 이 코디만 사진 넣기.
 *   촬영 날엔 '촬영 시작'(PoseRun.ShootRun) — 폰에서 코디 하나씩, 포즈 사진을 크게 넘기며 찍음 ✓. (11/16 밤 세원: "포즈판 개어려운데 이거 보면서 촬영할 수 있는 거 맞아?")
 *   칸 머리를 누르면 포즈 카드(사진 · 설명 · 고른 이유 · 원본) + 세원 확인(OK · 확인 전 · 빼기) + 사진 고치기(빼기 · 더하기 · 순서).
 */

const cell = "flex h-11 w-full items-center justify-center rounded-lg text-xs font-bold transition";

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
            <div className="text-lg leading-snug font-bold text-stone-900">{(sec.title || "").replace(/^P\d+\s*/, "")}</div>
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
              <p className="text-xs text-stone-500">사진 위 × = 빼기 · ← → = 순서 · '새 사진'이나 칸 위에서 Ctrl+V · 끌어다 놓기 = 더하기. 고친 건 모든 코디·모델 레퍼런스에 같이 바뀌어요.</p>
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

export default function PoseBoard({ s, set, codis, d, refs, online, onRun, onCodi }) {
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); // 포즈 카드 id
  const allSets = refs.items.filter(isPoseSet);
  const sets = poseSetsFor(s, refs.items);
  const { cards, hidden } = poseCards(sets);
  const { urlOf } = usePoseUrls(
    cards.map((k) => k.sec.photos?.[0]?.key),
    online,
    d,
  );
  const cardUrls = usePoseUrls(open ? ([...cards, ...hidden].find((k) => k.id === open)?.sec.photos || []).map((p) => p.key) : [], online, d);
  if (!allSets.length) return null;

  const setIds = sets.map((x) => x.id);
  const flipSet = (id) => set({ poseSetIds: setIds.includes(id) ? setIds.filter((x) => x !== id) : [...setIds, id] });
  const order = cards.map((k) => k.id);
  const tap = (c, k) => {
    const { ids } = picksOf(s, c, cards, d.items);
    const next = ids.includes(k.id) ? ids.filter((x) => x !== k.id) : [...ids, k.id];
    set({ posePicks: { ...(s.posePicks || {}), [c.id]: order.filter((x) => next.includes(x)) } });
  };
  const backToReco = (c) => {
    const drop = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id]) => id !== c.id));
    set({ posePicks: drop(s.posePicks), posePhotoOff: drop(s.posePhotoOff) });
  };
  const okChange = (id, ok) => {
    setErr("");
    refs.change(setPoseOk(id, ok)).catch((e) => setErr(e.message || "포즈 확인을 저장하지 못했어요."));
  };
  // 카드 사진 고치기 — 모델 레퍼런스 그 칸을 통째로(사진·설명·이름), 서버 최신 위에서. pose(확인·고른 이유)는 서버 것 그대로
  const editCard = (sec) => {
    setErr("");
    refs
      .change((v) => ({
        ...v,
        items: (v.items || []).map((x) => ((x.sections || []).some((y) => y.id === sec.id) ? { ...x, sections: x.sections.map((y) => (y.id === sec.id ? { ...y, ...sec, pose: y.pose } : y)) } : x)),
      }))
      .catch((e) => setErr(e.message || "포즈 사진을 저장하지 못했어요."));
  };
  const rows = codis.map((c) => ({ c, ...shotsOf(s, c, cards, d.items) }));
  const total = rows.reduce((n, r) => n + r.shots.length, 0);
  const shot = rows.reduce((n, r) => n + r.shots.filter((x) => x.done).length, 0);
  const nOk = cards.filter((k) => k.ok === true).length;
  const openCard = open && [...cards, ...hidden].find((k) => k.id === open);

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Footprints size={15} className="text-rose-700" /> 포즈 판
          {cards.length > 0 && codis.length > 0 && (
            <span className="font-normal text-stone-400 tabular-nums">
              사진 {total}장{shot ? ` · 찍음 ${shot}` : ""}
            </span>
          )}
        </div>
        {cards.length > 0 && codis.length > 0 && (
          <button type="button" onClick={onRun} className="flex items-center gap-1 rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800">
            <Play size={13} /> 촬영 시작
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-stone-500">
        PC에서 미리 골라 두는 판이에요. 칸을 눌러 카드째 넣고 빼요 · 점선 칸 = 추천({RECO_RULE}). <b className="font-semibold text-stone-700">코디 이름</b>이나 '이 코디만'을 누르면 카드에서 사진 한 장만 고르거나 이 코디만 쓰는 사진을 넣어요.
        촬영 날엔 '촬영 시작'으로 폰에서 코디 하나씩 넘겨 봐요.
      </p>
      {/* 어느 포즈 모음을 쓸지 — 처음엔 촬영일과 같은 날짜로 만든 모음 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-stone-400">포즈 모음</span>
        {allSets.map((x) => {
          const on = setIds.includes(x.id);
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              onClick={() => flipSet(x.id)}
              className={"flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300")}
            >
              {on && <Check size={11} />} {x.title || "이름 없는 모음"}
            </button>
          );
        })}
      </div>
      {!cards.length ? (
        <p className="rounded-lg bg-stone-50 px-3 py-3 text-xs text-stone-500">위에서 이 촬영에 쓸 포즈 모음을 골라요. 포즈 카드는 촬영 › 모델 레퍼런스에 있어요.</p>
      ) : !codis.length ? (
        <p className="rounded-lg bg-stone-50 px-3 py-3 text-xs text-stone-500">
          이 촬영 코디가 아직 없어요 — 신상 관리 › 코디에서 촬영일을 {s.on ? md(s.on) : "이날"}로 넣으면 여기 줄이 생기고, 옷 종류로 포즈를 먼저 골라 둬요.
        </p>
      ) : (
        <div className="-mx-3 overflow-x-auto px-3 pb-1">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white" />
                {cards.map((k) => (
                  <th key={k.id} className="w-[4.25rem] min-w-[4.25rem] align-bottom sm:w-[4.75rem] sm:min-w-[4.75rem]">
                    <button type="button" onClick={() => setOpen(k.id)} className="flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-1 hover:bg-stone-50" title="포즈 카드 보기 · 사진 고치기">
                      <Photo url={urlOf(k.sec.photos?.[0]?.key)} className="aspect-[3/4] w-10 rounded-md sm:w-11" />
                      <span className="text-xs font-bold text-stone-900">{k.code}</span>
                      <span className="line-clamp-2 text-[10px] leading-tight font-normal text-stone-500">{k.title.replace(/^P\d+\s*/, "")}</span>
                      <span className={"rounded-full px-1.5 text-[10px] font-semibold " + (k.ok === true ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{k.ok === true ? "OK" : "확인 전"}</span>
                    </button>
                  </th>
                ))}
                <th className="w-[4.25rem] min-w-[4.25rem] align-bottom pb-1 text-[11px] font-semibold text-stone-600">이 코디만</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, ids, auto, shots }, i) => {
                const its = codiItems(c, d.items);
                const own = shots.filter((x) => x.own);
                const nDone = shots.filter((x) => x.done).length;
                return (
                  <tr key={c.id}>
                    <th className="sticky left-0 z-10 w-28 min-w-28 bg-white pr-1 text-left align-middle font-normal sm:w-48 sm:min-w-48">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 shrink-0 text-center text-xs font-bold text-rose-700 tabular-nums">{i + 1}</span>
                        <Photo url={its[0] && (d.urls[its[0].photo] || its[0].photoUrl)} className="aspect-[3/4] w-8 shrink-0 rounded max-sm:hidden" />
                        <span className="min-w-0">
                          <button type="button" onClick={() => onCodi(c)} className="line-clamp-2 text-left text-[11px] leading-tight font-semibold text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-rose-800" title="이 코디 포즈 고치기">
                            {codiName(c, d.items)}
                          </button>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-[10px]">
                            {auto ? (
                              <span className="font-semibold text-rose-600">추천</span>
                            ) : (
                              <button type="button" onClick={() => backToReco(c)} className="flex items-center gap-0.5 text-stone-400 hover:text-rose-700" title="이 코디를 추천으로 되돌리기">
                                <RotateCcw size={9} /> 추천으로
                              </button>
                            )}
                            <span className={"tabular-nums " + (shots.length && nDone === shots.length ? "font-semibold text-emerald-700" : "text-stone-400")}>
                              {shots.length}장{nDone ? ` · 찍음 ${nDone}` : ""}
                            </span>
                          </span>
                        </span>
                      </div>
                    </th>
                    {cards.map((k) => {
                      const on = ids.includes(k.id);
                      const mine = shots.filter((x) => x.cardId === k.id);
                      const all = on && mine.length > 0 && mine.every((x) => x.done);
                      const part = on && mine.length < (k.sec.photos || []).length;
                      const look = all
                        ? "bg-emerald-600 text-white"
                        : on
                          ? auto
                            ? "border border-dashed border-rose-400 bg-rose-50 text-rose-600"
                            : "bg-rose-700 text-white"
                          : "border border-stone-200 bg-white text-transparent hover:border-rose-300 hover:text-rose-300";
                      return (
                        <td key={k.id} className="p-0">
                          <button type="button" aria-pressed={on} aria-label={`${i + 1}번 코디 ${k.code} ${on ? "고름" : "안 고름"}`} onClick={() => tap(c, k)} className={cell + " " + look}>
                            {on && part ? <span className="text-[11px] tabular-nums">{mine.length}장</span> : <Check size={on ? 15 : 14} strokeWidth={on ? 3 : 2} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="p-0">
                      <button
                        type="button"
                        onClick={() => onCodi(c)}
                        aria-label={`${i + 1}번 코디 이 코디만 포즈`}
                        className={cell + " " + (own.length ? "bg-stone-800 text-white" : "border border-dashed border-stone-300 text-stone-400 hover:border-rose-300 hover:text-rose-700")}
                      >
                        {own.length ? <span className="tabular-nums">{own.length}장</span> : <Plus size={15} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cards.length > 0 && (
        <p className="mt-2 text-[11px] text-stone-400">
          모델 촬영 시트엔 OK 난 포즈 + 이 코디만 사진이 코디별로 가요 — 지금 OK {nOk}/{cards.length}. 칸 머리를 누르면 포즈 카드 · OK · 사진 고치기.
        </p>
      )}
      {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
      {hidden.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
          <span>뺀 포즈</span>
          {hidden.map((k) => (
            <button key={k.id} type="button" onClick={() => okChange(k.id, undefined)} className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 hover:border-rose-300 hover:text-rose-700" title="되살리기">
              {k.code} 되살리기
            </button>
          ))}
        </div>
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
