import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ExternalLink, Footprints, ImagePlus, Loader2, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { newId } from "../lib/id";
import { FIELD, remove } from "../lib/shoot";
import { usePoseUrls } from "../lib/usePoseUrls";
import { poseCatsOf, OUTDOOR_CAT, FITS, OUTER_TYPES, byCode } from "../lib/poses";
import { guidePhoto } from "../lib/modelGuide";
import { clipImages, filesOf } from "../lib/pasteImages";
import { Photo } from "./ShootBits";
import { SectionEdit } from "./ModelGuideEditor";

/**
 * 촬영 관리 › 포즈 (11/17) — 세원(방향성 창): "촬영 관리 안에 소싱관리처럼 '포즈' 버튼 만들어서 포즈 카테고리 모델 레퍼런스처럼 나누고
 *   거기서 제대로 만들어서 포즈판에서 고를 수 있게 — 해당 코디는 어떤 포즈를 쓰면 되는지". 모델 레퍼런스는 그대로 둔다(나중에 안 쓰면 칸째 없앰).
 * 저장 = settings shoot_poses {cats, items} (lib/poses '포즈 칸'). 카드 = 사진 여러 장 + 이름(P번호) + 모델에게 가는 설명 + 카테고리 + 추천 자리(fits) + 확인(OK).
 * 넣기: '+ 포즈 추가' · 화면 어디서든 Ctrl+V · 끌어다 놓기(붙인 사진으로 새 카드). 카드를 누르면 고치기(사진은 모델 레퍼런스와 같은 SectionEdit).
 */

const ALL = "*";
const FIT_CHOICES = [...FITS, ...OUTER_TYPES.map((o) => "아우터:" + o.t)];
const fitLabel = (f) => (f.startsWith("아우터:") ? f.slice(4) : f);
const codeOf = (x) => x.pose?.code || String(x.title || "").match(/^P\d+/i)?.[0]?.toUpperCase() || "";
const nameOf = (x) => String(x.title || "").replace(/^P\d+\s*/i, "") || "이름 없는 포즈";
const nextCode = (items) => "P" + (Math.max(0, ...items.map((x) => Number(codeOf(x).slice(1)) || 0)) + 1);
/** 카테고리로 처음 추천 자리 — 포즈판 추천(lib/poses recommend)에 쓰인다 */
const fitsFor = (cat) => (cat === "아우터" ? ["아우터"] : cat === "상의" ? ["상의"] : cat === "하의" || cat === "앉은컷" ? ["하의"] : ["전신"]);
const okTone = (ok) => (ok === true ? "bg-emerald-50 text-emerald-700" : ok === false ? "bg-stone-100 text-stone-500" : "bg-amber-50 text-amber-700");
const okText = (ok) => (ok === true ? "OK" : ok === false ? "뺌" : "확인 전");
const readCat = () => {
  try {
    return localStorage.getItem("poclo_poses_cat") ?? ALL;
  } catch {
    return ALL;
  }
};

/** 포즈 카드 고치기 — 0.7초 뒤 저절로 저장, 닫으면 바로 */
function PoseEditSheet({ card, cats, d, online, onSave, onRemove, onClose }) {
  const [x, setX] = useState(card);
  const latest = useRef(card);
  const timer = useRef(null);
  const dirty = useRef(false);
  const urls = usePoseUrls((x.photos || []).map((p) => p.key), online, d);
  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onSave(latest.current);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (n) => {
    // 이름 앞 P번호가 바뀌면 카드 번호도
    const code = String(n.title || "").match(/^P\d+/i)?.[0]?.toUpperCase();
    const next = code && code !== n.pose?.code ? { ...n, pose: { ...(n.pose || {}), code } } : n;
    latest.current = next;
    dirty.current = true;
    setX(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const setPose = (p) => change({ ...latest.current, pose: { ...(latest.current.pose || {}), ...p } });
  const close = () => {
    flush();
    onClose();
  };
  const p = x.pose || {};
  const fits = p.fits || [];
  const chip = "rounded-full border px-2.5 py-1 text-xs font-medium";
  const cat = cats.includes(x.cloth) ? x.cloth : "";
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={close} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-rose-700">{codeOf(x) || "번호 없음"}</div>
            <div className="truncate text-lg leading-snug font-bold text-stone-900">{nameOf(x)}</div>
            <p className="text-xs text-stone-400">고치는 대로 저장돼요 · 고친 건 이 포즈를 고른 모든 촬영에 같이 바뀌어요</p>
          </div>
          <button type="button" onClick={close} aria-label="닫기" className="hit relative -m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">카테고리</div>
            <div className="flex flex-wrap gap-1.5">
              {[...cats, ""].map((c) => (
                <button
                  key={c || "none"}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => change({ ...latest.current, cloth: c })}
                  className={chip + " " + (cat === c ? (c === OUTDOOR_CAT ? "border-sky-600 bg-sky-600 text-white" : "border-rose-700 bg-rose-700 text-white") : "border-stone-200 bg-white text-stone-700 hover:border-rose-300")}
                >
                  {c || "미분류"}
                </button>
              ))}
            </div>
          </div>
          <SectionEdit x={x} i={0} n={1} online={online} urlOf={urls.urlOf} onChange={change} onFresh={urls.setFresh} d={d} bare titleHint="이름 — 앞에 P번호 (예: P17 밖 걷기)" hint="모델에게 가는 설명 (예: 정면 전신 · 휴대폰으로 얼굴을 가려요)" />
          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">
              추천 자리 <span className="font-normal text-stone-400">— 포즈판이 이 옷이 든 코디에 먼저 골라 둬요</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FIT_CHOICES.map((f) => {
                const on = fits.includes(f);
                return (
                  <button key={f} type="button" aria-pressed={on} onClick={() => setPose({ fits: on ? fits.filter((y) => y !== f) : [...fits, f] })} className={chip + " " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>
                    {f.startsWith("아우터:") ? `아우터 · ${fitLabel(f)}` : f}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-xs font-medium text-stone-500">
            고른 이유 <span className="font-normal text-stone-400">(우리만 봐요)</span>
            <textarea value={p.why || ""} onChange={(e) => setPose({ why: e.target.value })} rows={2} placeholder="예: 오브나인 상세에 가장 많이 나오는 컷" className={FIELD + " mt-1 resize-y"} />
          </label>
          {(p.src || []).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-stone-500">원본 (우리만 봐요)</div>
              <ul className="space-y-1">
                {p.src.map((s, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-1.5 text-xs text-stone-600">
                    <span className="min-w-0 flex-1 truncate">{[s.mall, s.cut].filter(Boolean).join(" · ")}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 font-semibold text-rose-700 hover:underline">
                        열기 <ExternalLink size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-semibold text-stone-500">확인</span>
            {[
              [true, "OK", "border-emerald-600 bg-emerald-600 text-white"],
              [undefined, "확인 전", "border-amber-500 bg-amber-50 text-amber-800"],
              [false, "빼기", "border-stone-500 bg-stone-500 text-white"],
            ].map(([v, label, on]) => (
              <button key={label} type="button" aria-pressed={p.ok === v} onClick={() => setPose({ ok: v })} className={chip + " " + (p.ok === v ? on : "border-stone-200 text-stone-700 hover:border-stone-400")}>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`'${codeOf(x)} ${nameOf(x)}' 포즈를 지울까요? 이 포즈를 고른 촬영 포즈판에서도 빠져요(사진 파일은 남아요).`)) return;
              clearTimeout(timer.current);
              dirty.current = false;
              onRemove(x.id);
              onClose();
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
          >
            <Trash2 size={13} /> 지우기
          </button>
          <p className="w-full text-[11px] text-stone-400">OK 난 포즈만 모델 촬영 시트에 가요 · 빼면 포즈판에서 숨겨요</p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** 카테고리 편집 — 이름 바꾸기 · 순서 · 빼기(그 안 카드는 미분류로) · 더하기 */
function CatEditor({ cats, items, onApply, onClose }) {
  const [rows, setRows] = useState(cats.map((c) => ({ was: c, name: c })));
  const [add, setAdd] = useState("");
  const count = (c) => items.filter((x) => x.cloth === c).length;
  const apply = () => {
    const clean = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
    const names = [...new Set(clean.map((r) => r.name))];
    const rename = Object.fromEntries(clean.filter((r) => r.was && r.was !== r.name).map((r) => [r.was, r.name]));
    const gone = cats.filter((c) => !clean.some((r) => r.was === c));
    onApply(names, rename, gone);
    onClose();
  };
  return createPortal(
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-stone-900">포즈 카테고리 편집</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="hit relative -m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <input value={r.name} onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label="카테고리 이름" className={FIELD + " min-w-0 flex-1"} />
              <span className="w-10 shrink-0 text-right text-xs text-stone-400 tabular-nums">{r.was ? `${count(r.was)}개` : "새"}</span>
              <button type="button" disabled={i === 0} onClick={() => setRows(rows.map((y, j) => (j === i - 1 ? rows[i] : j === i ? rows[i - 1] : y)))} aria-label="위로" className="hit relative rounded p-1.5 text-stone-400 hover:bg-stone-100 disabled:opacity-30">
                <ArrowUp size={15} />
              </button>
              <button type="button" onClick={() => (!r.was || !count(r.was) || window.confirm(`'${r.was}' 카테고리를 뺄까요? 안의 포즈 ${count(r.was)}개는 미분류로 가요(지워지지 않아요).`)) && setRows(rows.filter((_, j) => j !== i))} aria-label="빼기" className="hit relative rounded p-1.5 text-stone-300 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <input
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && add.trim() && !e.nativeEvent.isComposing) {
                setRows([...rows, { was: "", name: add.trim() }]);
                setAdd("");
              }
            }}
            placeholder="새 카테고리 (예: 소품)"
            aria-label="새 카테고리"
            className={FIELD + " min-w-0 flex-1"}
          />
          <button type="button" disabled={!add.trim()} onClick={() => (setRows([...rows, { was: "", name: add.trim() }]), setAdd(""))} className="shrink-0 rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-700 disabled:opacity-40">
            더하기
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-400">'{OUTDOOR_CAT}'은 바깥 촬영 포즈판에 처음부터 깔리는 카테고리예요. 이름을 바꾸면 그 역할은 빠져요.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600">
            취소
          </button>
          <button type="button" onClick={apply} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function PosesTab({ poses, d, online }) {
  const lib = poses.lib || {};
  const cats = poseCatsOf(lib);
  const items = [...(lib.items || [])].sort(byCode);
  const catOf = (x) => (cats.includes(x.cloth) ? x.cloth : "");
  const [cat, setCatRaw] = useState(readCat);
  const setCat = (c) => {
    setCatRaw(c);
    try {
      localStorage.setItem("poclo_poses_cat", c);
    } catch {
      /* 시크릿 창 */
    }
  };
  const [edit, setEdit] = useState(null); // 카드 id
  const [catOpen, setCatOpen] = useState(false);
  const [busy, setBusy] = useState(0); // 붙인 사진 올리는 중(장수)
  const [err, setErr] = useState("");
  const curCat = cat === ALL || cat === "" || cats.includes(cat) ? cat : ALL;
  const shown = items.filter((x) => curCat === ALL || catOf(x) === curCat);
  const { urlOf } = usePoseUrls(
    shown.map((x) => x.photos?.[0]?.key),
    online,
    d,
  );
  const save = (fn) =>
    poses.change(fn).catch((e) => {
      setErr(e.message || "포즈를 저장하지 못했어요.");
      throw e;
    });
  // 새 카드 — 보고 있는 카테고리(전체면 첫 카테고리)로, 번호는 다음 P
  const add = async (photos = []) => {
    setErr("");
    const c = curCat === ALL ? cats[0] || "" : curCat;
    const code = nextCode(lib.items || []);
    const x = { id: newId("pz"), title: `${code} `, text: "", photos, cloth: c, pose: { code, fits: fitsFor(c) }, createdAt: new Date().toISOString() };
    await save((v) => ({ ...v, cats: v.cats?.length ? v.cats : cats, items: [...(v.items || []), x] }));
    setEdit(x.id);
  };
  const addFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type?.startsWith("image/"));
    if (!imgs.length) return;
    setBusy(imgs.length);
    const photos = [];
    try {
      for (const f of imgs) photos.push({ key: await guidePhoto(f, online), cap: "" });
      await add(photos);
    } catch (e) {
      setErr(e.message || "사진을 넣지 못했어요 — 공유 저장 공간이 꽉 찼을 수 있어요.");
    }
    setBusy(0);
  };
  // 화면 어디서든 Ctrl+V — 고치기 창이 떠 있으면 그 창(SectionEdit)이 받는다
  const ref = useRef({});
  useEffect(() => {
    ref.current = { edit, catOpen, addFiles };
  });
  useEffect(() => {
    const onPaste = (e) => {
      const r = ref.current;
      if (r.edit || r.catOpen || e.target?.closest?.("input, textarea, [contenteditable=true]")) return;
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      filesOf(c).then(r.addFiles);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const editing = edit && (lib.items || []).find((x) => x.id === edit);
  const applyCats = (names, rename, gone) =>
    save((v) => ({
      ...v,
      cats: names,
      items: (v.items || []).map((x) => (rename[x.cloth] ? { ...x, cloth: rename[x.cloth] } : gone.includes(x.cloth) ? { ...x, cloth: "" } : x)),
    })).catch(() => {});
  const nOf = (c) => items.filter((x) => (c === ALL ? true : catOf(x) === c)).length;
  const chip = (on, outdoor) =>
    "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium " +
    (on ? (outdoor ? "border-sky-600 bg-sky-600 text-white" : "border-rose-700 bg-rose-700 text-white") : "border-stone-200 bg-white text-stone-600 hover:border-rose-300");

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (edit || catOpen) return;
        e.preventDefault();
        filesOf(clipImages(e.dataTransfer)).then(addFiles);
      }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-xl text-sm text-stone-500">
          포즈 카드를 카테고리별로 모아 두는 곳이에요. 촬영 창 <b className="font-semibold text-stone-700">포즈 판</b>에서 코디마다 여기 카드를 골라요 — 바깥 촬영은 '{OUTDOOR_CAT}', 스튜디오는 나머지가 처음부터 깔려요.
        </p>
        <button type="button" onClick={() => add().catch(() => {})} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 포즈 추가
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[ALL, ...cats, ...(nOf("") ? [""] : [])].map((c) => (
          <button key={c || "none"} type="button" aria-pressed={curCat === c} onClick={() => setCat(c)} className={chip(curCat === c, c === OUTDOOR_CAT)}>
            {c === ALL ? "전체" : c || "미분류"} <span className={curCat === c ? "opacity-70" : "text-stone-400"}>{nOf(c)}</span>
          </button>
        ))}
        <button type="button" onClick={() => setCatOpen(true)} className="flex items-center gap-1 px-1.5 py-1 text-xs text-stone-500 hover:text-rose-800">
          <SlidersHorizontal size={13} /> 카테고리 편집
        </button>
      </div>
      <p className="mb-3 flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2 text-xs text-stone-500">
        <ImagePlus size={14} className="shrink-0 text-stone-400" />
        <span className="min-w-0">
          포즈 사진을 캡처해서 <b className="font-semibold text-stone-700">Ctrl+V</b> 하거나 끌어다 놓으면 {curCat === ALL ? `'${cats[0] || "미분류"}'` : `'${curCat || "미분류"}'`}에 새 포즈가 생겨요. 카드를 누르면 이름·설명·사진·카테고리를 고쳐요.
        </span>
      </p>
      {busy > 0 && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <Loader2 size={13} className="animate-spin" /> 사진 {busy}장으로 새 포즈를 만드는 중…
        </p>
      )}
      {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
      {!poses.loaded && !items.length ? (
        <p className="py-10 text-center text-sm text-stone-400">
          <Loader2 size={16} className="mx-auto mb-1 animate-spin" /> 불러오는 중
        </p>
      ) : !shown.length ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          <Footprints size={20} className="mx-auto mb-2 text-stone-300" />
          {items.length ? "이 카테고리엔 아직 포즈가 없어요 — '포즈 추가'나 Ctrl+V 로 넣어요." : "아직 포즈가 없어요 — '포즈 추가'나 사진 Ctrl+V 로 첫 포즈를 넣어요."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((x) => {
            const c = catOf(x);
            return (
              <button key={x.id} type="button" onClick={() => setEdit(x.id)} className={"min-w-0 overflow-hidden rounded-2xl border bg-white text-left transition hover:border-rose-300 hover:shadow-sm " + (x.pose?.ok === false ? "border-stone-200 opacity-60" : "border-stone-200")}>
                <span className="relative block">
                  <Photo url={urlOf(x.photos?.[0]?.key)} className="aspect-[3/4] w-full" />
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-rose-700">{codeOf(x) || "—"}</span>
                  {(x.photos || []).length > 1 && <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/55 px-1.5 text-[10px] text-white tabular-nums">{x.photos.length}장</span>}
                </span>
                <span className="block p-2.5">
                  <span className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900">{nameOf(x)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className={"rounded-full px-1.5 py-0.5 font-semibold " + (c === OUTDOOR_CAT ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-600")}>{c || "미분류"}</span>
                    <span className={"rounded-full px-1.5 py-0.5 font-semibold " + okTone(x.pose?.ok)}>{okText(x.pose?.ok)}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {editing && (
        <PoseEditSheet
          key={editing.id}
          card={editing}
          cats={cats}
          d={d}
          online={online}
          onSave={(x) => save((v) => ({ ...v, items: (v.items || []).map((y) => (y.id === x.id ? x : y)) })).catch(() => {})}
          onRemove={(id) => save(remove(id)).catch(() => {})}
          onClose={() => setEdit(null)}
        />
      )}
      {catOpen && <CatEditor cats={cats} items={items} onApply={applyCats} onClose={() => setCatOpen(false)} />}
    </div>
  );
}

