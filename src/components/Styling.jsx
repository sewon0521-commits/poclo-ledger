import { useContext, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Film, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { FIELD, md, codiName, codiItems, loadKey, changeKey, upsert, putPhoto, photoUrls, fixUrl } from "../lib/shoot";
import { normalize } from "../lib/sinsang";
import { newId } from "../lib/id";
import { clipImages, filesOf } from "../lib/pasteImages";
import { ReelKitCtx } from "../lib/refClips";
import { useLookbook, lookOf, lookItems, videoTally, renameLook } from "../lib/lookbook";
import { Sheet, SheetHead, Photo, CheckList, ItemText } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import { IgEmbed, igEmbedOf } from "./IgEmbed";
import RefPick from "./RefPick";
import { RefClipsBox } from "./RefClips";
import { RefCutsBox, RefCatEditor } from "./StylingRefs";
import { OPTS_KEY, DEFAULT_OPTS, EMPTY_STYLING, PARTS, partHas, refCutsOf, looseRefIds, withRefCuts, mapRefCloth } from "../lib/styling";
import { REFS_KEY, CLOTHS, clothsOf } from "../lib/modelRefs";

/**
 * 코디 스타일링 (10/25) — 세원: "이날 코디에 해당 칸이 뜨면 눌러서 이 코디에 헤어는 어떻게 할지, 신발, 악세서리(반지, 목걸이 등)는
 * 어떤 걸 할지 등등 고를 수 있게."
 * 코디에 styling {cuts, videos, hair:[..], shoes:[{itemId}|{text}], bag:[…], acc:[..], memo, codiPhotos, refIds:[촬영 레퍼런스 id], refVideos} (lib/styling EMPTY_STYLING).
 * 헤어·악세서리 칩 목록은 settings styling_opts {hair, acc} — 칩 줄 끝 '고치기'에서 더하고 뺀다.
 * 촬영 관리(그날 코디) · 소싱 관리(이날 코디) 둘 다 여기로 연다. 이 창 내용은 **모델 촬영 시트에 안 간다**(lib/shootSheet.js v4, 10/29 세원:
 * "참고 영상은 우리 보면서 찍으려고 한 거, 코디는 찍을 때 상품 특징 보고 우리가 디렉") — 촬영 때 우리가 ERP 에서 보는 것.
 *
 * (11/6 찍을 컷 · 찍을 영상 칸은 뺐다 — 세원 "없애도 될 듯")
 * 11/7 세원: "찍을 것, 찍을 영상 없앴잖아? 찍을 영상 칸만 다시 살려 줘" → 찍을 영상만 코디 바로 아래로(기본 영상 저절로 깔기 · 다른 코디 것 가져오기는 룩북이 대신해서 안 살림).
 *   + 참고 영상 맨 위 '룩북 영상'(lib/lookbook.js) — 넣으면 그날 촬영 코디 전부의 찍을 영상 맨 위에 '룩북 · 필수'로 뜬다(다 찍었는지는 코디마다 styling.lookDone).
 * 10/27 세원: "촬영 관리에 찍을 컷, 찍을 영상 그걸 이 촬영 코디 안에 각각 만들어 주고 스타일링 맨 위에. 참고 사진 말고 영상도 넣어 주고 그것도 위로 올려 주되
 *   찍을 컷, 찍을 영상 밑에. 헤어, 악세 선택하는 게 마지막으로." → 창 순서: 코디 → 찍을 컷 · 찍을 영상 → 참고 사진 → 참고 영상 → 코디 사진 → 메모 → 헤어 → 신발·가방·목걸이·반지·양말.
 */

/** 이 기기 저장 모드용 — 사진을 긴 변 600px JPEG 글자로 */
async function smallDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const s = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const chipCls = (on) =>
  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300");

/** 칩 여러 개 + 직접 적기 (목록에 없는 건 점선 칩) */
function ChipPick({ opts, value, onChange, placeholder, onEditOpts }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setTyped("");
  };
  const extra = value.filter((v) => !opts.includes(v));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((t) => (
        <button key={t} type="button" aria-pressed={value.includes(t)} onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])} className={chipCls(value.includes(t))}>
          {value.includes(t) && <Check size={11} className="mr-0.5 inline" />}
          {t}
        </button>
      ))}
      {extra.map((t) => (
        <button key={t} type="button" onClick={() => onChange(value.filter((x) => x !== t))} title="눌러서 빼기" className="flex items-center gap-1 rounded-full border border-dashed border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
          {t} <X size={11} />
        </button>
      ))}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={placeholder}
        className="w-32 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
      />
      {onEditOpts && (
        <button type="button" onClick={onEditOpts} className="flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-rose-700">
          <Pencil size={11} /> 칩 고치기
        </button>
      )}
    </div>
  );
}

/** 칩 목록 고치기 — 더하기(엔터) · × 빼기 */
function OptsEditor({ title, list, onSave, onClose }) {
  const [xs, setXs] = useState(list);
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !xs.includes(v)) setXs([...xs, v]);
    setTyped("");
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="mb-2 text-xs font-semibold text-stone-600">{title} 칩 고치기</div>
      <div className="flex flex-wrap gap-1.5">
        {xs.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700">
            {t}
            <button type="button" onClick={() => setXs(xs.filter((x) => x !== t))} aria-label={`${t} 빼기`} className="text-stone-400 hover:text-rose-700">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
          placeholder="+ 새 칩 (엔터)"
          className="w-28 rounded-full border border-dashed border-stone-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-rose-400"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-stone-500">
          그만두기
        </button>
        <button type="button" onClick={() => onSave(xs)} className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white">
          칩 저장
        </button>
      </div>
    </div>
  );
}

/** 신발·가방·목걸이·반지·양말 — 신상 관리 상품에서 고르기(큰 사진 칸, 10/25 세원 "썸네일이 너무 작아") + 직접 적기 */
function WearPick({ d, value, onChange, part, placeholder }) {
  const [typed, setTyped] = useState("");
  const [more, setMore] = useState(false);
  const pool = d.items.map(normalize).filter((x) => x.stage !== "trash" && partHas(part, x));
  const ids = value.map((s) => s.itemId).filter(Boolean);
  const shown = [...pool.filter((x) => ids.includes(x.id)), ...pool.filter((x) => !ids.includes(x.id))].slice(0, more ? 60 : 10);
  const flip = (id) => onChange(ids.includes(id) ? value.filter((s) => s.itemId !== id) : [...value, { itemId: id }]);
  const add = () => {
    const v = typed.trim();
    if (v && !value.some((s) => s.text === v)) onChange([...value, { text: v }]);
    setTyped("");
  };
  return (
    <div className="space-y-2">
      {pool.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {shown.map((x) => {
            const on = ids.includes(x.id);
            return (
              <button key={x.id} type="button" onClick={() => flip(x.id)} title={x.name} className="min-w-0 text-left">
                <span className={"relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "ring-1 ring-stone-200")}>
                  {d.urls[x.photo] || x.photoUrl ? <img src={d.urls[x.photo] || x.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                  {on && (
                    <span className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-700 text-white shadow">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={"mt-1 line-clamp-2 text-xs leading-snug " + (on ? "font-semibold text-rose-800" : "text-stone-600")}>{x.name}</span>
              </button>
            );
          })}
          {pool.length > 10 && !more && (
            <button type="button" onClick={() => setMore(true)} className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-stone-300 text-xs text-stone-500">
              {pool.length - 10}개 더 보기
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {value
          .filter((s) => s.text)
          .map((s) => (
            <button key={s.text} type="button" onClick={() => onChange(value.filter((v) => v !== s))} title="눌러서 빼기" className="flex items-center gap-1 rounded-full border border-dashed border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
              {s.text} <X size={11} />
            </button>
          ))}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
          onBlur={add}
          placeholder={placeholder}
          className="w-44 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
        />
      </div>
    </div>
  );
}

const hostOf = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/**
 * 참고 영상 링크 (10/27 세원: "참고 사진 말고 영상도 넣어 주고") — 영상 주소(인스타 릴스 등) + 이름, 영상 파일은 받지 않는다(저장소가 꽉 차서).
 * 10/29 부터는 릴스 기획에서 장면을 잘라 오는 칸(RefClipsBox)이 먼저고, 이건 그 아래 '인스타 주소로 넣기'.
 * 인스타 릴스·게시물은 '보기'를 누르면 이 창 안에서 바로 재생(공식 임베드), 다른 주소는 새 탭. 주소 칸에 붙여넣으면 바로 들어간다.
 */
function RefVideos({ list, onChange }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const add = (raw = url) => {
    const u = fixUrl(raw);
    if (!u) return setErr("주소를 다시 확인해 주세요 (예: instagram.com/reel/…).");
    setErr("");
    if (!list.some((x) => x.url === u)) {
      const id = newId("rv");
      onChange([...list, { id, name: name.trim(), url: u }]);
      if (igEmbedOf(u)) setOpen((s) => new Set(s).add(id)); // 방금 넣은 건 바로 보이게
    }
    setUrl("");
    setName("");
  };
  const flip = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="space-y-2">
      {list.map((v, i) => {
        const ig = igEmbedOf(v.url);
        const on = open.has(v.id);
        return (
          <div key={v.id} className="overflow-hidden rounded-xl border border-stone-200">
            <div className="flex items-center gap-2 px-3 py-2">
              <Film size={15} className="shrink-0 text-rose-700" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-stone-900">{v.name || `참고 영상 ${i + 1}`}</span>
                <span className="block truncate text-[11px] text-stone-400">{hostOf(v.url)}</span>
              </span>
              {ig && (
                <button type="button" onClick={() => flip(v.id)} aria-expanded={on} className={"shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold " + (on ? "border-stone-300 text-stone-600" : "border-rose-300 text-rose-700 hover:bg-rose-50")}>
                  {on ? "접기" : "보기"}
                </button>
              )}
              <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label="새 탭에서 열기" className="shrink-0 p-1 text-stone-400 hover:text-rose-700">
                <ExternalLink size={14} />
              </a>
              <button type="button" onClick={() => onChange(list.filter((x) => x.id !== v.id))} aria-label="영상 빼기" className="shrink-0 p-1 text-stone-300 hover:text-rose-700">
                <X size={14} />
              </button>
            </div>
            {ig && on && (
              <div className="border-t border-stone-200 bg-stone-50">
                <div className="mx-auto max-w-[360px]">
                  <IgEmbed src={ig} title={v.name} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 걸어오는 핏)" className={FIELD + " w-40 flex-none max-sm:w-full"} />
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
          placeholder="영상 주소 붙여넣기 (인스타 릴스 등)"
          className={FIELD + " min-w-0 flex-1"}
        />
        <button type="button" onClick={() => add()} className="shrink-0 rounded-lg bg-stone-800 px-3.5 text-xs font-semibold text-white">
          넣기
        </button>
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
    </div>
  );
}

function Section({ title, hint, children, ...rest }) {
  return (
    <section className="space-y-2" {...rest}>
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-stone-800">{title}</h4>
        {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** 스타일링 고르기 창 */
export default function StylingSheet({ codi, d, online, onClose }) {
  const [st, setSt] = useState(() => ({ ...EMPTY_STYLING, ...(codi.styling || {}) }));
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const [editOpts, setEditOpts] = useState(""); // "hair" | "acc"
  // 참고 사진 (11/6 카테고리 → 컷, components/StylingRefs) — pick = 고를 곳(컷 id · "" 공통 · null 닫힘), pending = [{u, where}]
  const [pick, setPick] = useState(null);
  const [big, setBig] = useState(null); // {urls, k}
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState([]);
  const [refTab, setRefTab] = useState(null);
  const [editCats, setEditCats] = useState(false);
  const [modelCats, setModelCats] = useState(null); // 스타일링 카테고리를 아직 안 고쳤으면 모델 레퍼런스 카테고리로 시작
  // 코디 사진(10/25 세원: "참고 사진 위에 코디 사진 — 우리가 직접 벽걸이에 걸은 사진") — 촬영 레퍼런스엔 안 담고 이 코디에만(st.codiPhotos = 보관 이름)
  const [codiPending, setCodiPending] = useState([]);
  const [fresh, setFresh] = useState({}); // 방금 올린 사진 → 이 기기 미리 보기 주소
  const [signed, setSigned] = useState({});
  const [bigCodi, setBigCodi] = useState(null);
  // Ctrl+V 가 갈 칸 — 마우스를 올리거나 누른 칸, 처음엔 코디 사진
  const target = useRef("codi");
  useEffect(() => {
    const want = (st.codiPhotos || []).filter((k) => !k.startsWith("data:") && !d.urls[k] && !fresh[k] && !signed[k]);
    if (!want.length) return;
    let alive = true;
    photoUrls(want, online)
      .then((m) => alive && setSigned((s) => ({ ...s, ...m })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [st.codiPhotos, d.urls, fresh, signed, online]);
  const codiUrl = (k) => (k.startsWith("data:") ? k : fresh[k] || d.urls[k] || signed[k] || "");
  const addCodiFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setCodiPending((p) => [...p, ...previews]);
    try {
      for (let i = 0; i < imgs.length; i++) {
        // 이 기기 저장 모드(시험)면 작은 사진 글자(data URL)로 코디에 바로 둔다
        const key = (await putPhoto(imgs[i], online)) || (await smallDataUrl(imgs[i]));
        setFresh((f) => ({ ...f, [key]: previews[i] }));
        setSt((x) => ({ ...x, codiPhotos: [...(x.codiPhotos || []), key] }));
      }
    } catch (e) {
      setMsg(e.message || "사진을 넣지 못했어요.");
    } finally {
      setCodiPending((p) => p.filter((u) => !previews.includes(u)));
    }
  };
  useEffect(() => {
    let alive = true;
    loadKey(OPTS_KEY, online, {})
      .then((v) => {
        if (!alive) return;
        setOpts({ hair: v.hair?.length ? v.hair : DEFAULT_OPTS.hair, acc: v.acc?.length ? v.acc : DEFAULT_OPTS.acc, videos: Array.isArray(v.videos) ? v.videos : DEFAULT_OPTS.videos, cloths: v.cloths?.length ? v.cloths : null });
        if (!v.cloths?.length)
          loadKey(REFS_KEY, online, {})
            .then((m) => alive && setModelCats(clothsOf(m)))
            .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [online]);
  // 11/6 찍을 영상 칸을 빼면서 기본 영상을 저절로 깔던 것(videosInit)도 뺐다
  const set = (k) => (v) => setSt((x) => ({ ...x, [k]: v }));
  const saveOpts = async (k, list) => {
    try {
      const next = await changeKey(OPTS_KEY, online, (v) => ({ ...DEFAULT_OPTS, ...v, [k]: list }), {});
      setOpts({ hair: next.hair, acc: next.acc, videos: next.videos || DEFAULT_OPTS.videos, cloths: next.cloths?.length ? next.cloths : null });
      setEditOpts("");
    } catch (e) {
      setMsg(e.message || "칩을 저장하지 못했어요.");
    }
  };
  // 참고 사진 카테고리 고치기(RefCatEditor) — 목록은 styling_opts.cloths. 이름 바꾸기·지우기(to "")는 모든 코디의 컷도 같이, 이 창 것은 화면 사본까지.
  // 먼저 이 창에서 고치던 걸 저장한다 — 안 그러면 다음 자동 저장이 예전 이름으로 덮는다
  const changeCats = async (fn, from, to) => {
    try {
      await flushRef.current?.();
      const next = await changeKey(OPTS_KEY, online, (v) => ({ ...DEFAULT_OPTS, ...v, cloths: fn(v.cloths?.length ? v.cloths : cats) }), {});
      setOpts((o) => ({ ...o, cloths: next.cloths }));
      if (from !== undefined) {
        await d.saveCodis((v) => ({ ...v, items: (v.items || []).map((c) => (c.styling ? { ...c, styling: mapRefCloth(c.styling, from, to) } : c)) }));
        setSt((x) => mapRefCloth(x, from, to));
        if (refTab === from) setRefTab(to);
      }
    } catch (e) {
      setMsg(e.message || "카테고리를 저장하지 못했어요.");
    }
  };
  const catCounts = {};
  for (const c of d.codis) for (const x of refCutsOf(c.id === codi.id ? st : c.styling)) if (x.cloth) catCounts[x.cloth] = (catCounts[x.cloth] || 0) + 1;
  // 참고 사진 카테고리 — 스타일링 것(styling_opts.cloths), 아직 안 고쳤으면 모델 레퍼런스 카테고리 목록으로 시작
  const cats = opts.cloths || modelCats || CLOTHS;
  // 참고 사진 붙여넣기 · 끌어다 놓기 → 촬영 레퍼런스에도 담기고(그 카테고리와 같은 이름 목록으로) 이 코디의 그 컷에 들어간다.
  // where = 컷 id · "" 공통 · "new:카테고리"(그 탭에 컷이 없으면 '참고 사진' 컷을 만들어 넣는다)
  const addFiles = async (files, where = "") => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews.map((u) => ({ u, where }))]);
    const cloth = where.startsWith("new:") ? where.slice(4) : refCutsOf(st).find((c) => c.id === where)?.cloth || "";
    const folderId = (cloth && d.folders.find((f) => f.name === cloth)?.id) || null;
    try {
      const made = [];
      for (const f of imgs) {
        const photo = await putPhoto(f, online);
        if (!photo) {
          setMsg("이 기기에만 저장하는 모드라 사진은 '레퍼런스에서 고르기'로 넣어 주세요.");
          break;
        }
        made.push({ id: newId("r"), photo, folderId, cuts: [], place: "", memo: "스타일링 참고", createdAt: new Date().toISOString() });
      }
      if (made.length) {
        await d.saveRefs((v) => ({ ...v, items: [...made, ...(v.items || [])] }));
        const ids = made.map((r) => r.id);
        setSt((x) => {
          const cuts = refCutsOf(x);
          // 그 사이 그 탭에 컷이 생겼으면(연달아 붙여넣기) 그 컷으로
          const to = where.startsWith("new:") ? cuts.find((c) => c.cloth === cloth)?.id : where;
          if (where.startsWith("new:") && !to) return withRefCuts(x, [...cuts, { id: newId("sc"), cloth, title: "참고 사진", refIds: ids }]);
          if (to && cuts.some((c) => c.id === to)) return withRefCuts(x, cuts.map((c) => (c.id === to ? { ...c, refIds: [...(c.refIds || []), ...ids] } : c)));
          return withRefCuts(x, cuts, [...looseRefIds(x), ...ids]);
        });
      }
    } catch (e) {
      setMsg(e.message || "사진을 넣지 못했어요.");
    } finally {
      setPending((p) => p.filter((x) => !previews.includes(x.u)));
    }
  };
  const addRef = useRef(null);
  useEffect(() => {
    addRef.current = (fs) => (target.current.startsWith("ref:") ? addFiles(fs, target.current.slice(4)) : addCodiFiles(fs));
  });
  useEffect(() => {
    const onPaste = (e) => {
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return; // 글은 칸에 그대로
      e.preventDefault();
      filesOf(c).then((fs) => addRef.current(fs));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  // 알아서 저장 (10/25 세원: "스타일링 저장 안 눌러도 알아서 저장되게") — 고르고 0.6초 뒤, 창을 닫을 때 남은 것은 바로.
  // 코디의 styling 칸만 고친다(다른 칸은 그사이 신상 관리에서 바뀌었을 수 있어서).
  const [saveSt, setSaveSt] = useState("idle"); // idle · wait · saving · saved · error
  const latest = useRef(st);
  const dirty = useRef(false);
  const base = useRef(JSON.stringify(st)); // 마지막으로 저장한(또는 연) 내용 — 같으면 안 저장
  const timer = useRef(null);
  const flushRef = useRef(null);
  useEffect(() => {
    flushRef.current = async () => {
      clearTimeout(timer.current);
      if (!dirty.current) return;
      dirty.current = false;
      const s = latest.current;
      setSaveSt("saving");
      try {
        await d.saveCodis(upsert({ id: codi.id, styling: { ...s, memo: (s.memo || "").trim() } }));
        base.current = JSON.stringify(s);
        setSaveSt(dirty.current ? "wait" : "saved");
      } catch (e) {
        dirty.current = true;
        setSaveSt("error");
        setMsg(e.message || "저장하지 못했어요.");
      }
    };
  });
  useEffect(() => {
    latest.current = st;
    if (JSON.stringify(st) === base.current) return;
    dirty.current = true;
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setSaveSt("wait");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current?.(), 600);
  }, [st]);
  // 창이 닫히면(다른 화면으로 가도) 남은 것 저장
  useEffect(() => () => dirty.current && flushRef.current?.(), []);
  const close = () => {
    flushRef.current?.();
    onClose();
  };
  const its = codiItems(codi, d.items);
  // 룩북 영상 (11/7) — 촬영일(shootDate)마다 하나, 그날 코디 전부 필수(lib/lookbook)
  const kit = useContext(ReelKitCtx);
  const lb = useLookbook(online);
  const day = codi.shootDate || "";
  const look = lookOf(lb.all, day);
  const lookList = lookItems(look, kit?.reels || []);
  const dayCodis = day ? d.codis.filter((c) => c.shootDate === day).length : 0;
  const lookRef = useRef(null);
  const changeLook = (k) => (v) => lb.change(day, (l) => ({ ...l, [k]: v })).catch((e) => setMsg(e.message || "룩북 영상을 저장하지 못했어요."));
  const lookDone = new Set(st.lookDone || []);
  const flipLook = (id) => setSt((x) => ({ ...x, lookDone: (x.lookDone || []).includes(id) ? x.lookDone.filter((y) => y !== id) : [...(x.lookDone || []), id] }));
  return (
    <>
    <Sheet onClose={editCats ? () => setEditCats(false) : close} wide>
      <SheetHead title="스타일링" onClose={close} />
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const c = clipImages(e.dataTransfer);
          if (c.files.length || c.urls.length) filesOf(c).then((fs) => addRef.current(fs));
        }}
      >
        <div className="flex gap-3">
          <div className="flex shrink-0 gap-1.5">
            {its.slice(0, 4).map((x) => (
              <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-20 rounded-xl max-sm:w-14" />
            ))}
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-semibold text-stone-900">{codiName(codi, d.items)}</div>
            <div className="mt-0.5 text-[11px] text-stone-500">{codi.shootDate ? `${md(codi.shootDate)} 촬영` : "촬영일 미정"}{codi.uploadOn ? ` · ${md(codi.uploadOn)} 업로드` : ""}</div>
          </div>
        </div>

        {/* 11/6 세원: "스타일링에 위에 있는 찍을 컷, 찍을 영상 없애도 될 듯" — 둘 다 뺐다가 11/7 "찍을 영상 칸만 다시 살려 줘"(찍을 컷 styling.cuts 데이터는 그대로 남음).
            맨 위 '룩북 · 필수' = 그날 룩북 영상(아래 참고 영상 › 룩북 영상에서 넣는다), 그 아래는 이 코디만 찍을 영상 */}
        <CheckList
          title="찍을 영상"
          list={st.videos || []}
          onChange={set("videos")}
          placeholder="+ 이 코디만 찍을 영상 (예: 거울셀카 걸어오기) 엔터"
          tally={videoTally(st, look)}
          top={
            lookList.length > 0 && (
              <ul className="mb-1.5 space-y-1 border-b border-stone-100 pb-1.5">
                {lookList.map((x) => {
                  const on = lookDone.has(x.id);
                  return (
                    <li key={x.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => flipLook(x.id)}
                        aria-pressed={on}
                        aria-label={on ? "끝낸 것 풀기" : "끝냄"}
                        className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-rose-300 bg-white")}
                      >
                        {on && <Check size={12} strokeWidth={3} />}
                      </button>
                      {/* 11/7 글을 누르면 고치기 — 룩북 이름이라 그날 코디 전부에 같이 바뀐다. 영상은 '룩북 · 필수'를 누르면 아래 룩북 칸으로 */}
                      <ItemText
                        text={x.text}
                        done={on}
                        onSave={(t) => lb.change(day, (l) => renameLook(l, x.id, t)).catch((e) => setMsg(e.message || "룩북 영상 이름을 저장하지 못했어요."))}
                      />
                      <button
                        type="button"
                        onClick={() => lookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        title="룩북 영상 보기"
                        className="mt-0.5 shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-200"
                      >
                        룩북 · 필수
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          }
        />
        {/* 11/6 카테고리 탭 → 컷 → 사진 (모델 레퍼런스처럼, components/StylingRefs) */}
        <Section title="참고 사진" hint="카테고리 안에 컷을 만들어 담기 · 레퍼런스에서 고르기 · 캡처 Ctrl+V · 끌어다 놓기">
          <RefCutsBox
            st={st}
            onChange={setSt}
            d={d}
            cats={cats}
            tab={refTab}
            onTab={setRefTab}
            pending={pending}
            onPick={setPick}
            onFiles={addFiles}
            onHot={(where) => (target.current = "ref:" + where)}
            onBig={(urls, k) => setBig({ urls, k })}
            onEditCats={() => (flushRef.current?.(), setEditCats(true))}
          />
        </Section>
        {/* 10/29 릴스 기획에서 장면 가져오기 — 볼 부분만 잘라(구간만 저장) 누르면 그 장면만 반복. 아래는 예전처럼 인스타 주소로 넣기 */}
        <Section title="참고 영상" hint="릴스 기획에서 가져와 볼 부분만 자르기 · 누르면 그 장면만 반복 · 촬영 때 우리가 보는 것">
          {/* 11/7 룩북 영상 — 그날 촬영 코디 전부 필수(lib/lookbook, settings shoot_lookbook). 어느 코디에서 넣어도 같은 칸 */}
          <div ref={lookRef} className="scroll-mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1 text-sm font-semibold text-rose-800">
                <Film size={14} /> 룩북 영상
              </span>
              <span className="text-[11px] text-stone-500">
                {day ? `여기 넣으면 ${md(day)} 촬영 코디 ${dayCodis}개 모두 '찍을 영상'에 필수로 들어가요` : "그날 촬영 코디 전부 필수로 찍을 영상"}
              </span>
            </div>
            {day ? (
              <>
                <RefClipsBox list={look.clips} onChange={changeLook("clips")} online={online} />
                <details className="group rounded-xl border border-rose-100 bg-white px-3 py-2" open={look.videos.length > 0}>
                  <summary className="cursor-pointer text-xs font-semibold text-stone-500 select-none group-open:mb-2">인스타 주소로 넣기 {look.videos.length > 0 && `· ${look.videos.length}개`}</summary>
                  <RefVideos list={look.videos} onChange={changeLook("videos")} />
                </details>
              </>
            ) : (
              <p className="text-xs text-amber-700">이 코디는 촬영일이 없어서 룩북을 못 넣어요 — 코디 고치기에서 촬영일을 정하면 그날 코디 전부에 들어가요.</p>
            )}
          </div>
          <div className="pt-1 text-xs font-semibold text-stone-500">이 코디만</div>
          <RefClipsBox list={st.clips || []} onChange={set("clips")} online={online} />
          <details className="group rounded-xl border border-stone-200 px-3 py-2" open={(st.refVideos || []).length > 0}>
            <summary className="cursor-pointer text-xs font-semibold text-stone-500 select-none group-open:mb-2">인스타 주소로 넣기 {(st.refVideos || []).length > 0 && `· ${st.refVideos.length}개`}</summary>
            <RefVideos list={st.refVideos || []} onChange={set("refVideos")} />
          </details>
        </Section>
        <Section
          title="코디 사진"
          hint="벽걸이에 걸어 둔 이 코디 사진 · 캡처 Ctrl+V · 끌어다 놓기"
          onMouseEnter={() => (target.current = "codi")}
          onPointerDown={() => (target.current = "codi")}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {(st.codiPhotos || []).map((k, i) => (
              <span key={k} className="group relative">
                <button type="button" onClick={() => setBigCodi(i)} className="block aspect-square w-full overflow-hidden rounded-xl bg-stone-100">
                  {codiUrl(k) && <img src={codiUrl(k)} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </button>
                <button
                  type="button"
                  onClick={() => set("codiPhotos")((st.codiPhotos || []).filter((x) => x !== k))}
                  aria-label="사진 빼기"
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
            {codiPending.map((u) => (
              <span key={u} className="relative block aspect-square overflow-hidden rounded-xl bg-stone-100">
                <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
                <Loader2 size={18} className="absolute inset-0 m-auto animate-spin text-white" />
              </span>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700">
              <ImagePlus size={20} /> 코디 사진 넣기
              <span className="text-[10px] text-stone-400">고르기 · Ctrl+V · 끌어다 놓기</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addCodiFiles(e.target.files), (e.target.value = ""))} />
            </label>
          </div>
        </Section>
        <Section title="메모" hint="촬영 때 디렉할 것 — 상품 특징·포인트">
          <textarea value={st.memo || ""} onChange={(e) => set("memo")(e.target.value)} placeholder="예: 셔츠 단추 두 개 풀기 · 소매 한 번 걷기" className={FIELD + " h-20 resize-y"} />
        </Section>
        <Section title="헤어" hint="여러 개 골라도 돼요">
          {editOpts === "hair" ? (
            <OptsEditor title="헤어" list={opts.hair} onSave={(l) => saveOpts("hair", l)} onClose={() => setEditOpts("")} />
          ) : (
            <ChipPick opts={opts.hair} value={st.hair || []} onChange={set("hair")} placeholder="직접 (예: 앞머리 내림)" onEditOpts={() => setEditOpts("hair")} />
          )}
        </Section>
        {PARTS.map((p) => (
          <Section key={p.key} title={p.label} hint={p.hint}>
            <WearPick d={d} part={p} value={st[p.key] || []} onChange={set(p.key)} placeholder={p.place} />
          </Section>
        ))}
        {(st.acc || []).length > 0 && (
          <Section title="예전에 고른 악세서리" hint="눌러서 빼기 — 이제는 위 칸으로 골라요">
            <div className="flex flex-wrap gap-1.5">
              {st.acc.map((t) => (
                <button key={t} type="button" onClick={() => set("acc")(st.acc.filter((x) => x !== t))} className="flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-600">
                  {t} <X size={11} />
                </button>
              ))}
            </div>
          </Section>
        )}
        {msg && (
          <p className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {msg}
            <button type="button" onClick={() => setMsg("")} aria-label="닫기">
              <X size={12} />
            </button>
          </p>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        <span className="flex items-center gap-1.5 text-xs" aria-live="polite">
          {saveSt === "saving" || saveSt === "wait" ? (
            <>
              <Loader2 size={13} className="animate-spin text-stone-400" /> <span className="text-stone-500">저장하는 중…</span>
            </>
          ) : saveSt === "saved" ? (
            <>
              <Check size={13} className="text-emerald-600" /> <span className="text-emerald-700">저장됐어요</span>
            </>
          ) : saveSt === "error" ? (
            <button type="button" onClick={() => ((dirty.current = true), flushRef.current?.())} className="font-semibold text-rose-700 underline">
              저장 못 했어요 · 다시 저장
            </button>
          ) : (
            <span className="text-stone-400">고르면 알아서 저장돼요</span>
          )}
        </span>
        <button type="button" onClick={close} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white">
          닫기
        </button>
      </footer>
      {pick !== null && (
        <RefPick
          d={d}
          picked={pick ? refCutsOf(st).find((c) => c.id === pick)?.refIds || [] : looseRefIds(st)}
          startFolder={(() => {
            const cloth = refCutsOf(st).find((c) => c.id === pick)?.cloth;
            return cloth ? d.folders.find((f) => f.name === cloth)?.id || "" : "";
          })()}
          onClose={() => setPick(null)}
          onDone={(ids) => {
            setSt((x) => (pick ? withRefCuts(x, refCutsOf(x).map((c) => (c.id === pick ? { ...c, refIds: ids } : c))) : withRefCuts(x, refCutsOf(x), ids)));
            setPick(null);
          }}
        />
      )}
      {big && <BigSlides urls={big.urls} start={big.k} onClose={() => setBig(null)} />}
      {bigCodi != null && <BigSlides urls={(st.codiPhotos || []).map(codiUrl)} start={bigCodi} onClose={() => setBigCodi(null)} />}
    </Sheet>
      {editCats && (
        <RefCatEditor
          cats={cats}
          counts={catCounts}
          onAdd={(n) => changeCats((l) => [...l, n])}
          onRename={(from, to) => changeCats((l) => l.map((c) => (c === from ? to : c)), from, to)}
          onMove={(n, dir) =>
            changeCats((l) => {
              const list = [...l];
              const i = list.indexOf(n);
              if (i < 0 || i + dir < 0 || i + dir >= list.length) return list;
              [list[i], list[i + dir]] = [list[i + dir], list[i]];
              return list;
            })
          }
          onDrop={(n) => changeCats((l) => l.filter((c) => c !== n), n, "")}
          onClose={() => setEditCats(false)}
        />
      )}
    </>
  );
}
