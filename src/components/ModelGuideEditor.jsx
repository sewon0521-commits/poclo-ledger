import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ImagePlus, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { FIELD, loadKey, changeKey, fixUrl } from "../lib/shoot";
import { newId } from "../lib/id";
import { clipImages, filesOf } from "../lib/pasteImages";
import { signedUrls, videoKey, thumbKey } from "../lib/refClips";
import { RefClipsBox } from "./RefClips";
import { GUIDE_KEY, DEFAULT_GUIDE, SUGGEST, guidePhoto } from "../lib/modelGuide";
import { Sheet, SheetHead } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import { GuideSections } from "./BaseGuide";
import { ClipBig } from "./LoopClip";

/**
 * 모델 기본 가이드 고치기 (10/29) — 촬영 › 촬영 관리 '모델 기본 가이드' · 촬영 창 시트 칸 '고치기'.
 * 칸마다 제목 · 글 · 포즈 예시 사진(+ 한 줄 설명). 고치면 0.8초 뒤 저절로 저장(settings model_guide), 닫을 때 남은 것 바로.
 * 오른쪽(폰은 아래) = 모델이 시트에서 보는 모양. 모든 촬영 시트에 같이 간다 — 이미 보낸 링크는 '내용 새로 보내기'를 눌러야 바뀐다.
 */

const TIP = "한 줄에 하나 · 들여 쓰면 아래 단계 · '→' 로 이으면 순서(번호) · (사진)/(영상) 을 붙이면 표시";

function SectionEdit({ x, i, n, online, urlOf, onChange, onMove, onRemove, onFresh }) {
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState("");
  const hot = useRef(false);
  const fileRef = useRef(null);
  const latest = useRef(x);
  useEffect(() => {
    latest.current = x;
  }, [x]);
  const add = async (files) => {
    const imgs = [...files].filter((f) => f.type?.startsWith("image/"));
    if (!imgs.length) return;
    setErr("");
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews]);
    for (let k = 0; k < imgs.length; k++) {
      try {
        const key = await guidePhoto(imgs[k], online);
        if (!key.startsWith("data:")) onFresh(key, previews[k]); // 서명 주소 받기 전에도 바로 보이게
        latest.current = { ...latest.current, photos: [...(latest.current.photos || []), { key, cap: "" }] };
        onChange(latest.current);
      } catch (e) {
        setErr(e.message || "사진을 넣지 못했어요 — 공유 저장 공간이 꽉 찼을 수 있어요.");
      }
      setPending((p) => p.filter((u) => u !== previews[k]));
    }
  };
  // 캡처 Ctrl+V — 이 칸에 마우스를 올렸을 때만(글 칸 안 붙여넣기는 그대로)
  useEffect(() => {
    const onPaste = (e) => {
      if (!hot.current || e.target?.closest?.("input, textarea")) return;
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      e.stopPropagation();
      filesOf(c).then(add);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const photos = x.photos || [];
  const rows = Math.min(14, Math.max(3, String(x.text || "").split("\n").length + 1));
  return (
    <div
      onMouseEnter={() => (hot.current = true)}
      onMouseLeave={() => (hot.current = false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        filesOf(clipImages(e.dataTransfer)).then(add);
      }}
      className="rounded-2xl border border-stone-200 bg-white p-3"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <input value={x.title || ""} onChange={(e) => onChange({ ...x, title: e.target.value })} placeholder="칸 이름 (예: 셀카 포즈)" aria-label="칸 이름" className={FIELD + " font-semibold"} />
        <button type="button" disabled={i === 0} onClick={() => onMove(-1)} aria-label="위로" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
          <ArrowUp size={15} />
        </button>
        <button type="button" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="아래로" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
          <ArrowDown size={15} />
        </button>
        <button type="button" onClick={onRemove} aria-label="칸 지우기" className="rounded-lg p-2 text-stone-300 hover:bg-stone-100 hover:text-rose-700">
          <Trash2 size={15} />
        </button>
      </div>
      <textarea value={x.text || ""} onChange={(e) => onChange({ ...x, text: e.target.value })} rows={rows} placeholder={SUGGEST.find((s) => s.title === (x.title || "").trim())?.hint || "예: * 휴대폰을 든 반대 팔은 허리 뒤로"} aria-label={`${x.title || "칸"} 글`} className={FIELD + " resize-y leading-relaxed"} />
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {photos.map((p, k) => (
          <div key={p.key.slice(0, 80) + k} className="group relative w-24">
            <span className="block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">{urlOf(p.key) && <img src={urlOf(p.key)} alt="" className="h-full w-full object-cover" />}</span>
            <button
              type="button"
              onClick={() => onChange({ ...x, photos: photos.filter((_, j) => j !== k) })}
              aria-label="사진 빼기"
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
            >
              <X size={12} />
            </button>
            <input
              value={p.cap || ""}
              onChange={(e) => onChange({ ...x, photos: photos.map((q, j) => (j === k ? { ...q, cap: e.target.value } : q)) })}
              placeholder="설명 (예: 손은 이렇게)"
              aria-label="사진 설명"
              className="mt-1 w-full rounded-md border border-stone-200 px-1.5 py-1 text-[11px] outline-none focus:border-rose-400"
            />
          </div>
        ))}
        {pending.map((u) => (
          <span key={u} className="relative block aspect-[3/4] w-24 overflow-hidden rounded-lg bg-stone-100">
            <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
            <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-white drop-shadow" />
          </span>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-[3/4] w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 px-1 text-center text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
          <ImagePlus size={16} /> 포즈 사진
          <span className="text-[10px] text-stone-400">고르기 · Ctrl+V</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      </div>
      {err && <p className="mt-1.5 text-xs text-rose-700">{err}</p>}
      {/* 참고 영상 — 세원: "거울 셀카 다양한 포즈 및 구도는 내가 레퍼런스를 첨부해야 될 듯" */}
      <details className="group mt-3 rounded-xl border border-stone-200 px-3 py-2" open={(x.clips || []).length + (x.links || []).length > 0}>
        <summary className="cursor-pointer text-xs font-semibold text-stone-600 select-none group-open:mb-2">
          참고 영상 {(x.clips || []).length + (x.links || []).length > 0 && `· ${(x.clips || []).length + (x.links || []).length}개`}
          <span className="ml-1.5 font-normal text-stone-400">릴스 기획에서 잘라 오기 · 인스타 주소 — 모델 시트에서 바로 봐요</span>
        </summary>
        <RefClipsBox list={x.clips || []} onChange={(clips) => onChange({ ...latest.current, clips })} online={online} />
        <LinkRows list={x.links || []} onChange={(links) => onChange({ ...latest.current, links })} />
      </details>
    </div>
  );
}

/** 인스타 주소 레퍼런스 — 이름 + 주소, 주소 칸에 붙여넣으면 바로 들어간다 */
function LinkRows({ list, onChange }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const add = (raw = url) => {
    const u = fixUrl(raw);
    if (!u) return setErr("주소를 다시 확인해 주세요 (예: instagram.com/reel/…).");
    setErr("");
    if (!list.some((l) => l.url === u)) onChange([...list, { id: newId("ml"), name: name.trim(), url: u }]);
    setName("");
    setUrl("");
  };
  return (
    <div className="mt-2 space-y-1.5">
      {list.map((l) => (
        <div key={l.id} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
          <Link2 size={12} className="shrink-0 text-stone-400" />
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-stone-800 hover:text-rose-800">
            {l.name || l.url}
          </a>
          <button type="button" onClick={() => onChange(list.filter((x) => x.id !== l.id))} aria-label="링크 빼기" className="shrink-0 p-0.5 text-stone-400 hover:text-rose-700">
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 거울셀카 포즈)" className="min-w-0 flex-1 basis-32 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-rose-600" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
          onPaste={(e) => {
            const t = (e.clipboardData.getData("text/plain") || "").trim();
            if (/^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+\/\S*$/i.test(t)) {
              e.preventDefault();
              add(t);
            }
          }}
          placeholder="인스타 주소 붙여넣기"
          className="min-w-0 flex-[2] basis-44 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs outline-none focus:border-rose-600"
        />
        <button type="button" onClick={() => add()} disabled={!url.trim()} className="flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300">
          <Plus size={12} /> 링크
        </button>
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
    </div>
  );
}

export default function ModelGuideSheet({ online, onClose }) {
  const [items, setItems] = useState(null); // 읽는 중이면 null
  const [saveSt, setSaveSt] = useState("idle"); // idle · wait · saving · saved · error
  const [msg, setMsg] = useState("");
  const [urls, setUrls] = useState({});
  const [big, setBig] = useState(null);
  const [clipBig, setClipBig] = useState(null);
  const [view, setView] = useState("edit"); // 폰: 고치기 / 모델이 보는 모양
  const latest = useRef(null);
  const base = useRef("");
  const dirty = useRef(false);
  const timer = useRef(null);
  const flushRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadKey(GUIDE_KEY, online, null)
      .then((v) => {
        if (!alive) return;
        const list = v ? v.items || [] : DEFAULT_GUIDE.items;
        base.current = v ? JSON.stringify(list) : ""; // 한 번도 저장 안 했으면 처음 고칠 때 기본 동선째 저장
        latest.current = list;
        setItems(list);
      })
      .catch(() => alive && setMsg("가이드를 불러오지 못했어요. 인터넷을 확인해 주세요."));
    return () => {
      alive = false;
    };
  }, [online]);

  // 사진 서명 주소 — 없는 것만
  const want = (items || [])
    .flatMap((x) => [...(x.photos || []).map((p) => p.key), ...(x.clips || []).flatMap((c) => [videoKey(c.reelId), thumbKey(c.reelId)])])
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
  const urlOf = (k) => (k.startsWith("data:") ? k : urls[k] || "");

  useEffect(() => {
    flushRef.current = async () => {
      clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      const list = latest.current;
      setSaveSt("saving");
      try {
        await changeKey(GUIDE_KEY, online, (v) => ({ ...(v || {}), items: list }), { items: [] });
        base.current = JSON.stringify(list);
        setSaveSt(dirty.current ? "wait" : "saved");
      } catch (e) {
        dirty.current = true;
        setSaveSt("error");
        setMsg(e.message || "저장하지 못했어요.");
      }
    };
  });
  const put = (list) => {
    latest.current = list;
    setItems(list);
    if (JSON.stringify(list) === base.current) return;
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
  const list = items || [];
  const setAt = (i) => (x) => put(list.map((y, j) => (j === i ? x : y)));
  const move = (i, d) => {
    const n = [...list];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    put(n);
  };
  const addSection = (s) => put([...list, { id: newId("mg"), title: s?.title || "", text: "", photos: [] }]);
  const preview = list.map((x) => ({
    title: (x.title || "").trim(),
    text: x.text || "",
    photos: (x.photos || []).map((p) => ({ url: urlOf(p.key), cap: p.cap })),
    clips: (x.clips || []).map((c) => ({ src: urlOf(videoKey(c.reelId)), poster: urlOf(thumbKey(c.reelId)), start: c.start, end: c.end, note: c.note })),
    links: x.links || [],
  }));
  const hasAny = (x) => x.text.trim() || x.photos.length || x.clips.length || x.links.length;

  return (
    <Sheet onClose={close} xwide>
      <SheetHead
        title="모델 기본 가이드"
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
      {items === null ? (
        <div className="flex h-48 items-center justify-center text-stone-300">{msg ? <span className="text-sm text-rose-700">{msg}</span> : <Loader2 size={20} className="animate-spin" />}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50 p-4">
          <p className="mb-3 text-sm text-stone-600">
            모든 촬영 시트에 <b>'촬영 기본 가이드'</b>로 같이 가요(전할 말 다음, 영상 가이드 앞). 계속 쌓아 가요 — 이미 보낸 링크는 촬영 창에서 '내용 새로 보내기'를 눌러야 바뀌어요.
          </p>
          <div className="mb-3 flex gap-1 rounded-xl bg-stone-200/60 p-1 text-sm lg:hidden">
            {[
              ["edit", "고치기"],
              ["see", "모델이 보는 모양"],
            ].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setView(k)} className={"flex-1 rounded-lg py-1.5 font-medium " + (view === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className={"min-w-0 space-y-3 " + (view === "see" ? "max-lg:hidden" : "")}>
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">쓰는 법: {TIP}</p>
              {list.map((x, i) => (
                <SectionEdit
                  key={x.id}
                  x={x}
                  i={i}
                  n={list.length}
                  online={online}
                  urlOf={urlOf}
                  onFresh={(k, u) => setUrls((m) => ({ ...m, [k]: u }))}
                  onChange={setAt(i)}
                  onMove={(d) => move(i, d)}
                  onRemove={() => (!(x.text || "").trim() && !(x.photos || []).length) || window.confirm(`'${x.title || "이 칸"}'을 지울까요?`) ? put(list.filter((_, j) => j !== i)) : null}
                />
              ))}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-500">칸 더하기</span>
                {SUGGEST.filter((s) => !list.some((x) => (x.title || "").trim() === s.title)).map((s) => (
                  <button key={s.title} type="button" onClick={() => addSection(s)} className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-rose-300 hover:text-rose-800">
                    <Plus size={12} /> {s.title}
                  </button>
                ))}
                <button type="button" onClick={() => addSection()} className="flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:border-rose-300 hover:text-rose-800">
                  <Plus size={12} /> 직접 칸
                </button>
              </div>
              {msg && <p className="text-xs text-rose-700">{msg}</p>}
            </div>
            <aside className={"min-w-0 " + (view === "edit" ? "max-lg:hidden" : "")}>
              <div className="sticky top-0">
                <div className="mb-1.5 text-xs font-semibold text-stone-500">모델이 시트에서 보는 모양</div>
                <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
                  {preview.some(hasAny) ? (
                    <GuideSections items={preview.filter(hasAny)} onBig={(u, k) => setBig({ u, k })} onClip={(clips, k) => setClipBig({ clips, k })} />
                  ) : (
                    <p className="py-6 text-center text-sm text-stone-400">칸에 글을 쓰면 여기 보여요.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
      {big && <BigSlides urls={big.u} start={big.k} onClose={() => setBig(null)} />}
      {clipBig && <ClipBig clips={clipBig.clips} at={clipBig.k} onClose={() => setClipBig(null)} />}
    </Sheet>
  );
}
