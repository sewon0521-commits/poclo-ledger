import { useEffect, useState } from "react";
import { Check, ExternalLink, Footprints, RotateCcw, X } from "lucide-react";
import { md, codiItems, codiName } from "../lib/shoot";
import { dayKey } from "../lib/journal";
import { signedUrls } from "../lib/refClips";
import { isPoseSet, poseSetsFor, poseCards, picksOf, doneOf, setPoseOk, RECO_RULE } from "../lib/poses";
import { Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";

/**
 * 촬영 창 › 포즈 판 (11/16, lib/poses.js 머리말) — 줄 = 이 촬영 코디(찍는 순서), 칸 = 이 촬영 포즈 카드.
 *   고르기: 칸을 눌러 코디마다 찍을 포즈를 넣고 뺀다. 안 건드린 코디는 옷 종류로 고른 추천이 옅게 깔려 있다.
 *   촬영 날 체크: 고른 칸을 누르면 ✓(찍음) — 촬영 날(오늘 ≥ 촬영일)엔 이 모드로 열린다.
 *   칸 머리를 누르면 포즈 카드(사진 3장 · 모델에게 가는 설명 · 고른 이유 · 원본)와 세원 확인(OK · 확인 전 · 빼기).
 */

const cell = "flex h-11 w-full items-center justify-center rounded-lg text-xs font-bold transition";

/** 포즈 카드 크게 보기 + 세원 확인 */
function PoseCardSheet({ k, urlOf, onOk, onClose }) {
  const [big, setBig] = useState(null);
  const p = k.sec.pose || {};
  const photos = (k.sec.photos || []).map((x) => ({ u: urlOf(x.key), cap: x.cap }));
  const st = k.ok === true ? "ok" : "wait";
  const chip = "rounded-full px-3 py-1.5 text-xs font-semibold border";
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-rose-700">{k.code}</div>
            <div className="text-lg leading-snug font-bold text-stone-900">{k.title.replace(/^P\d+\s*/, "")}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            {photos.map((x, i) => (
              <figure key={i} className="min-w-0">
                <Photo url={x.u} className="aspect-[3/4] w-full rounded-xl" onClick={() => x.u && setBig(i)} />
                {x.cap && <figcaption className="mt-1 truncate text-center text-[11px] text-stone-500">{x.cap}</figcaption>}
              </figure>
            ))}
          </div>
          {(k.sec.text || "").trim() && (
            <div>
              <div className="mb-1 text-xs font-semibold text-stone-500">모델에게 가는 설명</div>
              <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm whitespace-pre-line text-rose-900">{k.sec.text.trim()}</p>
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
    </div>
  );
}

export default function PoseBoard({ s, set, codis, d, refs, online }) {
  const today = dayKey();
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(s.on && s.on <= today ? "check" : "pick");
  const [open, setOpen] = useState(null); // 포즈 카드 id
  const [urls, setUrls] = useState({});
  const allSets = refs.items.filter(isPoseSet);
  const sets = poseSetsFor(s, refs.items);
  const { cards, hidden } = poseCards(sets);
  const wantKey = cards
    .flatMap((k) => (k.sec.photos || []).map((p) => p.key))
    .filter((k) => k && !k.startsWith("data:") && !(k in urls))
    .join("|");
  useEffect(() => {
    if (!wantKey) return;
    const ks = wantKey.split("|");
    signedUrls(ks, online)
      .then((m) => setUrls((u) => ({ ...u, ...Object.fromEntries(ks.map((k) => [k, ""])), ...m })))
      .catch(() => {});
  }, [wantKey, online]);
  const urlOf = (k) => (k?.startsWith("data:") ? k : urls[k] || d.urls[k] || "");
  if (!allSets.length) return null;

  const setIds = sets.map((x) => x.id);
  const flipSet = (id) => set({ poseSetIds: setIds.includes(id) ? setIds.filter((x) => x !== id) : [...setIds, id] });
  const order = cards.map((k) => k.id);
  const putPicks = (c, ids, done) =>
    set({
      posePicks: { ...(s.posePicks || {}), [c.id]: order.filter((x) => ids.includes(x)) },
      poseDone: { ...(s.poseDone || {}), [c.id]: order.filter((x) => (done || doneOf(s, c)).includes(x) && ids.includes(x)) },
    });
  const tap = (c, k) => {
    const { ids } = picksOf(s, c, cards, d.items);
    const on = ids.includes(k.id);
    if (mode === "pick") return putPicks(c, on ? ids.filter((x) => x !== k.id) : [...ids, k.id]);
    if (!on) return; // 촬영 날 체크는 고른 칸만
    const done = doneOf(s, c);
    putPicks(c, ids, done.includes(k.id) ? done.filter((x) => x !== k.id) : [...done, k.id]);
  };
  const backToReco = (c) => {
    const p = { ...(s.posePicks || {}) };
    const dn = { ...(s.poseDone || {}) };
    delete p[c.id];
    delete dn[c.id];
    set({ posePicks: p, poseDone: dn });
  };
  const okChange = (id, ok) => {
    setErr("");
    refs.change(setPoseOk(id, ok)).catch((e) => setErr(e.message || "포즈 확인을 저장하지 못했어요."));
  };
  const rows = codis.map((c) => ({ c, ...picksOf(s, c, cards, d.items), done: doneOf(s, c) }));
  const total = rows.reduce((n, r) => n + r.ids.length, 0);
  const shot = rows.reduce((n, r) => n + r.done.filter((x) => r.ids.includes(x)).length, 0);
  const nOk = cards.filter((k) => k.ok === true).length;
  const openCard = open && [...cards, ...hidden].find((k) => k.id === open);
  const tab = (on) => "rounded-lg px-3 py-1.5 text-xs font-semibold " + (on ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800");

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Footprints size={15} className="text-rose-700" /> 포즈 판
          {cards.length > 0 && codis.length > 0 && (
            <span className="font-normal text-stone-400 tabular-nums">
              {total}컷{shot ? ` · 찍음 ${shot}` : ""}
            </span>
          )}
        </div>
        {cards.length > 0 && codis.length > 0 && (
          <div className="flex rounded-xl bg-stone-100 p-0.5">
            <button type="button" onClick={() => setMode("pick")} className={tab(mode === "pick")}>
              고르기
            </button>
            <button type="button" onClick={() => setMode("check")} className={tab(mode === "check")}>
              촬영 날 체크
            </button>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-stone-500">
        {mode === "pick" ? (
          <>
            칸을 눌러 코디마다 찍을 포즈를 넣고 빼요. 옅은 칸 = 추천({RECO_RULE}) — 한 칸이라도 누르면 그 코디는 고른 그대로예요.
          </>
        ) : (
          <>찍은 포즈를 눌러 ✓ 해요. 다시 누르면 풀려요.</>
        )}
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
                    <button type="button" onClick={() => setOpen(k.id)} className="flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-1 hover:bg-stone-50" title="포즈 카드 보기">
                      <Photo url={urlOf(k.sec.photos?.[0]?.key)} className="aspect-[3/4] w-10 rounded-md sm:w-11" />
                      <span className="text-xs font-bold text-stone-900">{k.code}</span>
                      <span className="line-clamp-2 text-[10px] leading-tight font-normal text-stone-500">{k.title.replace(/^P\d+\s*/, "")}</span>
                      <span className={"rounded-full px-1.5 text-[10px] font-semibold " + (k.ok === true ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{k.ok === true ? "OK" : "확인 전"}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, ids, auto, done }, i) => {
                const its = codiItems(c, d.items);
                return (
                  <tr key={c.id}>
                    <th className="sticky left-0 z-10 w-28 min-w-28 bg-white pr-1 text-left align-middle font-normal sm:w-48 sm:min-w-48">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 shrink-0 text-center text-xs font-bold text-rose-700 tabular-nums">{i + 1}</span>
                        <Photo url={its[0] && (d.urls[its[0].photo] || its[0].photoUrl)} className="aspect-[3/4] w-8 shrink-0 rounded max-sm:hidden" />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[11px] leading-tight font-semibold text-stone-800">{codiName(c, d.items)}</span>
                          {auto ? (
                            <span className="text-[10px] font-semibold text-rose-600">추천</span>
                          ) : (
                            <button type="button" onClick={() => backToReco(c)} className="flex items-center gap-0.5 text-[10px] text-stone-400 hover:text-rose-700" title="이 코디를 추천으로 되돌리기">
                              <RotateCcw size={9} /> 추천으로
                            </button>
                          )}
                          {mode === "check" && ids.length > 0 && (
                            <span className={"ml-1 text-[10px] font-semibold tabular-nums " + (done.length >= ids.length ? "text-emerald-700" : "text-stone-500")}>
                              {done.filter((x) => ids.includes(x)).length}/{ids.length}
                            </span>
                          )}
                        </span>
                      </div>
                    </th>
                    {cards.map((k) => {
                      const on = ids.includes(k.id);
                      const ok = on && done.includes(k.id);
                      const look = ok
                        ? "bg-emerald-600 text-white"
                        : on
                          ? auto
                            ? "border border-dashed border-rose-400 bg-rose-50 text-rose-600"
                            : "bg-rose-700 text-white"
                          : mode === "check"
                            ? "bg-stone-50 text-transparent"
                            : "border border-stone-200 bg-white text-transparent hover:border-rose-300 hover:text-rose-300";
                      return (
                        <td key={k.id} className="p-0">
                          <button
                            type="button"
                            disabled={mode === "check" && !on}
                            aria-pressed={on}
                            aria-label={`${i + 1}번 코디 ${k.code} ${on ? (ok ? "찍음" : "고름") : "안 고름"}`}
                            onClick={() => tap(c, k)}
                            className={cell + " " + look}
                          >
                            {ok ? <Check size={16} strokeWidth={3} /> : on ? (mode === "check" ? <span className="text-[11px]">{k.code}</span> : <Check size={15} strokeWidth={3} />) : <Check size={14} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cards.length > 0 && (
        <p className="mt-2 text-[11px] text-stone-400">
          모델 촬영 시트엔 OK 난 포즈만 가요 — 지금 OK {nOk}/{cards.length}. 칸 머리를 누르면 포즈 카드(사진 3장 · 고른 이유)를 보고 OK 해요.
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
      {openCard && <PoseCardSheet k={openCard} urlOf={urlOf} onOk={(ok) => okChange(openCard.id, ok)} onClose={() => setOpen(null)} />}
    </div>
  );
}
