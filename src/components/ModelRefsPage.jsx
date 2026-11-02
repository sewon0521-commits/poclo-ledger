import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Film, Image as ImageIcon, Link2, Loader2, Lock, Plus, RefreshCw, Trash2, Unlock, X } from "lucide-react";
import { FIELD, md, loadKey, changeKey, upsert, remove } from "../lib/shoot";
import { dayKey } from "../lib/journal";
import { signedUrls, videoKey, thumbKey } from "../lib/refClips";
import { REFS_KEY, REF_SUGGEST, CLOTHS, blankSet, newSection, countsOf, refSig, clothKey, clothGroups, clothLabel, clothSummary, withClothSet } from "../lib/modelRefs";
import { filledItems } from "../lib/modelGuide";
import { buildRefSheet, createSheet, updateSheet, sheetLink, refSheetDm, REF_SHEET_DAYS, SheetError } from "../lib/shootSheet";
import { Sheet, SheetHead } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import { ClipBig } from "./LoopClip";
import { ClothTabs, GuideSections, RefSetHead } from "./BaseGuide";
import { SectionEdit } from "./ModelGuideEditor";
import { CopyBtn, Models } from "./ShootDays";

/**
 * 촬영 › 모델 레퍼런스 (11/1) — 세원: "우리 모델들한테 보낼 사진 레퍼런스랑 영상 레퍼런스 같은 거 모아서 보내 주고 싶은데, 모델 기본 가이드 외에 만들 수 있는 걸."
 * 모음을 주제·모델마다 만들고(의류 탭 → 컷마다 사진·영상), 로그인 없는 링크로 보낸다. 규칙은 lib/modelRefs.js 머리말.
 * 고치면 0.8초 뒤 저절로 저장, 닫을 때 남은 것 바로. 보낸 링크는 스냅숏이라 '내용 새로 보내기'를 눌러야 바뀐다.
 */

const stopped = (e) => (e instanceof SheetError && e.code === "missing" ? "촬영 시트 표가 아직 없어요 — poclo-ledger/supabase/shoot_sheets.sql 을 먼저 실행해 주세요." : e.message || "하지 못했어요.");

/** model_refs 읽고 쓰기 (서버 최신을 읽어 한 벌만 바꿔 쓰기 — lib/shoot changeKey) */
function useRefSets(online) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + REFS_KEY) || "null")?.items || [];
    } catch {
      return [];
    }
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    loadKey(REFS_KEY, online)
      .then((v) => alive && setItems(v.items || []))
      .catch(() => alive && setMsg("모음을 불러오지 못했어요. 인터넷을 확인해 주세요."));
    return () => {
      alive = false;
    };
  }, [online]);
  const change = useCallback(
    async (fn) => {
      const next = await changeKey(REFS_KEY, online, fn);
      setItems(next.items || []);
    },
    [online],
  );
  return { items, msg, setMsg, save: (it) => change(upsert(it)), drop: (id) => change(remove(id)) };
}

/** 모델에게 보낼 링크 칸 — 촬영 창 SheetLink 와 같은 모양, 기한만 30일 */
function RefLink({ x, d, online, onSent, flush }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const filled = filledItems(x.sections).length > 0;
  const run = async (what) => {
    setBusy(what);
    setErr("");
    try {
      if (what === "make" || what === "refresh") {
        const data = await buildRefSheet(x, d, online);
        const token = what === "make" ? await createSheet(online, data) : x.sheetToken;
        if (what === "refresh") await updateSheet(online, token, { data, closed: false });
        onSent({ sheetToken: token, sheetAt: new Date().toISOString(), sheetSig: refSig(x), sheetClosed: false });
      } else {
        await updateSheet(online, x.sheetToken, { closed: what === "close" });
        onSent({ sheetClosed: what === "close" });
      }
      flush();
    } catch (e) {
      setErr(stopped(e));
    } finally {
      setBusy("");
    }
  };
  const until = x.sheetAt ? new Date(new Date(x.sheetAt).getTime() + REF_SHEET_DAYS * 86400000) : null;
  const left = until ? Math.ceil((until - new Date()) / 86400000) : 0;
  const changed = x.sheetToken && !x.sheetClosed && refSig(x) !== x.sheetSig;
  const people = (x.models || []).filter(Boolean);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <Link2 size={15} className="text-rose-700" /> 모델에게 보낼 링크
      </div>
      <p className="mb-2 text-xs text-stone-500">모델은 로그인 없이 제목 · 전할 말 · 담은 사진과 영상만 봐요. 쇼핑몰 이름 · 메모 · 릴스 제목은 안 들어가요.</p>
      {err && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
      {!x.sheetToken ? (
        <>
          <button type="button" disabled={!!busy || !filled} onClick={() => run("make")} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
            {busy === "make" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} 링크 만들기
          </button>
          {!filled && <p className="mt-1.5 text-xs text-stone-500">사진이나 영상을 하나 담으면 만들 수 있어요.</p>}
        </>
      ) : (
        <div className="space-y-2">
          <div className={"flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 " + (x.sheetClosed ? "opacity-60" : "")}>
            <input readOnly value={sheetLink(x.sheetToken)} onFocus={(e) => e.target.select()} aria-label="모델 링크" className="min-w-0 flex-1 bg-transparent text-xs text-stone-700 outline-none" />
            {x.sheetClosed ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                <Lock size={11} /> 닫힘
              </span>
            ) : (
              <a href={sheetLink(x.sheetToken)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-700">
                열어 보기 <ExternalLink size={11} />
              </a>
            )}
          </div>
          {!x.sheetClosed && (
            <div className="flex flex-wrap gap-1.5">
              <CopyBtn text={sheetLink(x.sheetToken)}>링크 복사</CopyBtn>
              {people.length > 1 ? (
                people.map((m) => (
                  <CopyBtn key={m} primary text={refSheetDm(m, x.sheetToken)}>
                    {m} DM 문구 복사
                  </CopyBtn>
                ))
              ) : (
                <CopyBtn primary text={refSheetDm(people[0], x.sheetToken)}>
                  DM 문구 복사
                </CopyBtn>
              )}
            </div>
          )}
          {changed && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">담은 걸 바꿨어요. '내용 새로 보내기'를 눌러야 모델 화면에 반영돼요.</p>}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" disabled={!!busy || !filled} onClick={() => run("refresh")} className={"flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-medium disabled:opacity-50 " + (changed ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-rose-300")}>
              {busy === "refresh" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 내용 새로 보내기
            </button>
            {x.sheetClosed ? (
              <button type="button" disabled={!!busy} onClick={() => run("open")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 disabled:opacity-50">
                <Unlock size={12} /> 다시 열기
              </button>
            ) : (
              <button type="button" disabled={!!busy} onClick={() => window.confirm("링크를 닫을까요? 모델이 더 이상 못 열어요.") && run("close")} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-stone-500 hover:text-rose-700 disabled:opacity-50">
                <Lock size={12} /> 링크 닫기
              </button>
            )}
          </div>
          {until && (
            <p className={"text-[11px] " + (left <= 3 ? "font-semibold text-amber-700" : "text-stone-400")}>
              사진·영상은 {md(dayKey(until))}까지 보여요{left <= 3 ? " — 곧 안 보여요, 새로 보내 주세요" : ""}. 인스타 주소는 기한이 없어요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 모음 하나 고치기 — 왼쪽 고치기, 오른쪽(폰은 탭) 모델이 보는 모양 */
function RefSetSheet({ init, isNew, d, online, sets, onClose }) {
  const [x, setX] = useState(init);
  const [saveSt, setSaveSt] = useState("idle");
  const [msg, setMsg] = useState("");
  const [urls, setUrls] = useState({});
  const [big, setBig] = useState(null);
  const [clipBig, setClipBig] = useState(null);
  const [view, setView] = useState("edit");
  const [tabWant, setTab] = useState(() => clothGroups(init.sections || [])[0]?.cloth ?? CLOTHS[0]);
  const [cutName, setCutName] = useState("");
  const latest = useRef(init);
  const dirty = useRef(false);
  const timer = useRef(null);
  const flushRef = useRef(null);

  const secs = x.sections || [];
  // 의류 탭 — 공통은 의류를 안 정한 칸이 있을 때만(예전 모음)
  const tabs = secs.some((s) => !clothKey(s)) ? [...CLOTHS, ""] : CLOTHS;
  const tab = tabs.includes(tabWant) ? tabWant : CLOTHS[0];
  const shown = secs.filter((s) => clothKey(s) === tab);
  const want = secs
    .flatMap((s) => [...(s.photos || []).map((p) => p.key), ...(s.clips || []).flatMap((c) => [videoKey(c.reelId), thumbKey(c.reelId)])])
    .filter((k) => !k.startsWith("data:") && !(k in urls));
  const wantKey = want.join("|");
  useEffect(() => {
    if (!wantKey) return;
    const ks = wantKey.split("|");
    // 못 받은 건 빈 값으로 남겨 다시 안 묻는다(이 기기 저장 모드 · 지워진 영상)
    signedUrls(ks, online)
      .then((m) => setUrls((u) => ({ ...u, ...Object.fromEntries(ks.map((k) => [k, ""])), ...m })))
      .catch(() => {});
  }, [wantKey, online]);
  const urlOf = (k) => (k.startsWith("data:") ? k : urls[k] || d.urls[k] || "");

  useEffect(() => {
    flushRef.current = async () => {
      clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      setSaveSt("saving");
      try {
        await sets.save(latest.current);
        setSaveSt(dirty.current ? "wait" : "saved");
      } catch (e) {
        dirty.current = true;
        setSaveSt("error");
        setMsg(e.message || "저장하지 못했어요.");
      }
    };
  });
  const put = (patch) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setX(next);
    dirty.current = true;
    setSaveSt("wait");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current?.(), 800);
  };
  useEffect(() => () => dirty.current && flushRef.current?.(), []);
  const close = () => {
    flushRef.current?.();
    onClose();
  };
  const setSection = (id) => (sec) => put({ sections: (latest.current.sections || []).map((s) => (s.id === id ? sec : s)) });
  // 순서는 이 의류 안에서만 바꾼다
  const move = (i, dir) => {
    const a = shown[i];
    const b = shown[i + dir];
    put({ sections: secs.map((s) => (s.id === a.id ? b : s.id === b.id ? a : s)) });
  };
  const addCut = (raw) => {
    const title = raw.trim();
    if (!title) return;
    if (shown.some((s) => (s.title || "").trim() === title)) {
      setMsg(`${clothLabel(tab)}에 이미 '${title}'이 있어요.`);
      return;
    }
    setMsg("");
    put({ sections: [...secs, newSection(title, tab)] });
    setCutName("");
  };
  const dropSet = async () => {
    if (!window.confirm(`'${x.title || "이 모음"}'을 지울까요?${x.sheetToken ? " 보낸 링크도 닫혀요." : ""} 촬영 레퍼런스·릴스 기획의 원본은 그대로예요.`)) return;
    try {
      clearTimeout(timer.current);
      dirty.current = false;
      if (x.sheetToken) await updateSheet(online, x.sheetToken, { closed: true });
      await sets.drop(x.id);
      onClose();
    } catch (e) {
      setMsg(stopped(e));
    }
  };
  const preview = filledItems(secs).map((s) => ({
    cloth: clothKey(s),
    title: (s.title || "").trim(),
    text: s.text || "",
    photos: (s.photos || []).map((p) => ({ url: urlOf(p.key), cap: p.cap })),
    clips: (s.clips || []).map((c) => ({ src: urlOf(videoKey(c.reelId)), poster: urlOf(thumbKey(c.reelId)), start: c.start, end: c.end, note: c.note })),
    links: s.links || [],
  }));

  return (
    <Sheet onClose={close} xwide>
      <SheetHead
        title={isNew ? "새 레퍼런스 모음" : x.title || "레퍼런스 모음"}
        onClose={close}
        right={
          <span className="flex items-center gap-1 text-xs" aria-live="polite">
            {saveSt === "saving" || saveSt === "wait" ? (
              <>
                <Loader2 size={12} className="animate-spin text-stone-400" /> <span className="text-stone-500">저장하는 중…</span>
              </>
            ) : saveSt === "saved" ? (
              <>
                <Check size={12} className="text-emerald-600" /> <span className="text-emerald-700">저장됐어요</span>
              </>
            ) : saveSt === "error" ? (
              <button type="button" onClick={() => ((dirty.current = true), flushRef.current?.())} className="font-semibold text-rose-700 underline">
                저장 못 했어요 · 다시
              </button>
            ) : null}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50 p-4">
        <div className="mb-3 flex gap-1 rounded-xl bg-stone-200/60 p-1 text-sm lg:hidden">
          {[
            ["edit", "고치기"],
            ["see", "링크 · 모델이 보는 모양"],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={"flex-1 rounded-lg py-1.5 font-medium " + (view === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className={"min-w-0 space-y-3 " + (view === "see" ? "max-lg:hidden" : "")}>
            <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
              <input value={x.title || ""} onChange={(e) => put({ title: e.target.value })} placeholder="모음 이름 (예: 11월 촬영 레퍼런스)" aria-label="모음 이름" className={FIELD + " font-semibold"} />
              <textarea value={x.note || ""} onChange={(e) => put({ note: e.target.value })} rows={2} placeholder="모델에게 전할 말 (예: 이번 촬영은 이런 느낌으로 부탁드려요)" aria-label="모델에게 전할 말" className={FIELD + " resize-y leading-relaxed"} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-stone-500">받는 모델</span>
                <Models value={x.models || []} onChange={(models) => put({ models })} />
              </div>
            </div>
            <div className="flex gap-1 rounded-xl bg-stone-200 p-1 text-sm">
              {tabs.map((c) => {
                const count = secs.filter((s) => clothKey(s) === c).length;
                return (
                  <button key={c} type="button" aria-pressed={c === tab} onClick={() => (setTab(c), setMsg(""))} className={"flex-1 rounded-lg py-2 font-medium " + (c === tab ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}>
                    {clothLabel(c)}
                    {count > 0 && <span className="ml-1 text-xs font-normal text-stone-400 tabular-nums">{count}</span>}
                  </button>
                );
              })}
            </div>
            {shown.length === 0 && <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">{clothLabel(tab)}에 아직 컷이 없어요. 아래에서 만들어 주세요.</p>}
            {shown.map((s, i) => (
              <SectionEdit
                key={s.id}
                x={s}
                i={i}
                n={shown.length}
                titleHint="컷 이름 (예: 앉아서 찍는 컷)"
                extra={
                  <select
                    value={clothKey(s)}
                    onChange={(e) => setSection(s.id)({ ...s, cloth: e.target.value })}
                    aria-label={`${s.title || "이 컷"} 의류 옮기기`}
                    title="다른 의류로 옮기기"
                    className="shrink-0 rounded-lg border border-stone-200 bg-white px-1.5 py-2 text-xs text-stone-600 outline-none focus:border-rose-600"
                  >
                    {CLOTHS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {!clothKey(s) && <option value="">{clothLabel("")}</option>}
                  </select>
                }
                online={online}
                urlOf={urlOf}
                d={d}
                videoOpen={/영상/.test(s.title || "")}
                hint={REF_SUGGEST.find((g) => g.title === (s.title || "").trim())?.hint || "이 칸에 전할 말 (없어도 돼요)"}
                onFresh={(k, u) => setUrls((m) => ({ ...m, [k]: u }))}
                onChange={setSection(s.id)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => (!filledItems([s]).length || window.confirm(`'${s.title || "이 컷"}'을 지울까요?`)) && put({ sections: secs.filter((y) => y.id !== s.id) })}
              />
            ))}
            <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
              <div className="flex gap-1.5">
                {/* 한글은 엔터 keydown 이 조합 끝내기로 먹혀서 keyup 에서 넣는다 */}
                <input
                  value={cutName}
                  onChange={(e) => setCutName(e.target.value)}
                  onKeyUp={(e) => e.key === "Enter" && addCut(cutName)}
                  placeholder={`${clothLabel(tab)} 안에 만들 컷 이름`}
                  aria-label="만들 컷 이름"
                  className={FIELD + " min-w-0 flex-1"}
                />
                <button type="button" disabled={!cutName.trim()} onClick={() => addCut(cutName)} className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-700 px-3 text-sm font-semibold text-white disabled:bg-stone-300">
                  <Plus size={14} /> 컷 만들기
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REF_SUGGEST.filter((g) => !shown.some((s) => (s.title || "").trim() === g.title)).map((g) => (
                  <button key={g.title} type="button" onClick={() => addCut(g.title)} className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-rose-300 hover:text-rose-800">
                    <Plus size={12} /> {g.title}
                  </button>
                ))}
              </div>
            </div>
            {msg && <p className="text-xs text-rose-700">{msg}</p>}
            {!isNew && (
              <button type="button" onClick={dropSet} className="flex items-center gap-1 pt-1 text-xs font-medium text-stone-400 hover:text-rose-700">
                <Trash2 size={13} /> 이 모음 지우기
              </button>
            )}
          </div>
          <aside className={"min-w-0 " + (view === "edit" ? "max-lg:hidden" : "")}>
            <div className="sticky top-0 space-y-3">
              <RefLink x={x} d={d} online={online} onSent={put} flush={() => flushRef.current?.()} />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-stone-500">모델이 보는 모양</div>
                <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                  <RefSetHead title={(x.title || "").trim()} note={(x.note || "").trim()} models={x.models} />
                  {preview.length ? (
                    <div className="border-t border-stone-200 pt-4">
                      <ClothTabs items={preview} value={tab} onChange={setTab}>
                        {(g) => <GuideSections items={g.items} onBig={(u, k) => setBig({ u, k })} onClip={(clips, k) => setClipBig({ clips, k })} />}
                      </ClothTabs>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-stone-400">사진이나 영상을 담으면 여기 보여요.</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
      {big && <BigSlides urls={big.u} start={big.k} onClose={() => setBig(null)} />}
      {clipBig && <ClipBig clips={clipBig.clips} at={clipBig.k} onClose={() => setClipBig(null)} />}
    </Sheet>
  );
}

export default function ModelRefsPage({ d, online }) {
  const sets = useRefSets(online);
  const [open, setOpen] = useState(null); // {x, isNew}
  const [thumbs, setThumbs] = useState({});
  // 카드 작은 사진 — 모음마다 앞 4장 (사진 먼저, 모자라면 영상 썸네일)
  const peekOf = (x) => {
    const secs = x.sections || [];
    return [...secs.flatMap((s) => (s.photos || []).map((p) => p.key)), ...secs.flatMap((s) => (s.clips || []).map((c) => thumbKey(c.reelId)))].slice(0, 4);
  };
  const wantKey = sets.items.flatMap(peekOf).filter((k) => !k.startsWith("data:") && !(k in thumbs)).join("|");
  useEffect(() => {
    if (!wantKey) return;
    const ks = wantKey.split("|");
    signedUrls(ks, online)
      .then((m) => setThumbs((u) => ({ ...u, ...Object.fromEntries(ks.map((k) => [k, ""])), ...m })))
      .catch(() => {});
  }, [wantKey, online]);
  const thumb = (k) => (k.startsWith("data:") ? k : thumbs[k] || d.urls[k] || "");
  const live = open && (sets.items.find((y) => y.id === open.x.id) || open.x);
  const make = () => setOpen({ x: blankSet(), isNew: true });

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">모델 레퍼런스</h2>
          <p className="mt-0.5 text-sm text-stone-500">포즈 사진 · 영상 레퍼런스를 아우터 · 상의 · 하의로 나눠 모아 링크로 보내요. 모델은 로그인 없이 봐요.</p>
        </div>
        <button type="button" onClick={make} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 새 모음
        </button>
      </div>
      {sets.msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {sets.msg}
          <button type="button" onClick={() => sets.setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      {sets.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-12 text-center">
          <p className="text-base font-semibold text-stone-800">아직 모음이 없어요</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">촬영 레퍼런스의 사진과 릴스 기획에서 자른 장면을 골라 담으면, 모델에게 보낼 링크가 만들어져요.</p>
          <button type="button" onClick={make} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus size={16} /> 첫 모음 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.items.map((x) => {
            const n = countsOf(x);
            const peek = peekOf(x);
            const who = (x.models || []).filter(Boolean).join(", ");
            return (
              <button key={x.id} type="button" onClick={() => setOpen({ x })} className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-rose-300 hover:shadow-sm">
                <div className="text-base leading-snug font-bold text-stone-900">{x.title || "이름 없는 모음"}</div>
                {who && <div className="mt-0.5 truncate text-xs font-medium text-rose-800">{who}</div>}
                {clothSummary(x) && <div className="mt-0.5 text-xs text-stone-500 tabular-nums">{clothSummary(x)}</div>}
                {peek.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-4 gap-1">
                    {peek.map((k, i) => (
                      <span key={i} className="block aspect-[3/4] overflow-hidden rounded-md bg-stone-100">
                        {thumb(k) && <img src={thumb(k)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span className="flex items-center gap-1 tabular-nums">
                    <ImageIcon size={12} /> 사진 {n.photos}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Film size={12} /> 영상 {n.videos}
                  </span>
                  {x.sheetToken ? (
                    x.sheetClosed ? (
                      <span className="flex items-center gap-0.5 text-stone-400">
                        <Lock size={11} /> 링크 닫힘
                      </span>
                    ) : refSig(x) !== x.sheetSig ? (
                      <span className="flex items-center gap-0.5 font-medium text-amber-700">
                        <RefreshCw size={11} /> 새로 보내기 필요
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-rose-700">
                        <Link2 size={11} /> 링크 만듦
                      </span>
                    )
                  ) : (
                    <span className="text-stone-400">링크 아직 없음</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {live && <RefSetSheet key={live.id} init={withClothSet(live)} isNew={open.isNew && !sets.items.some((y) => y.id === live.id)} d={d} online={online} sets={sets} onClose={() => setOpen(null)} />}
    </div>
  );
}
