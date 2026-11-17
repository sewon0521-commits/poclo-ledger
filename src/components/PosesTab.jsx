import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Footprints, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { newId } from "../lib/id";
import { FIELD, remove } from "../lib/shoot";
import { usePoseUrls } from "../lib/usePoseUrls";
import { poseFoldersOf, shotsOfLib, placeOfFolder, IN_ID, FITS, OUTER_TYPES, byCode, codeOfTitle, stripCode, GROUP_ORDER } from "../lib/poses";
import { withChildren, ordered, pathOf, pathName } from "../lib/reelFolders";
import { guidePhoto } from "../lib/modelGuide";
import { clipImages, filesOf } from "../lib/pasteImages";
import { Photo } from "./ShootBits";
import { SectionEdit } from "./ModelGuideEditor";
import { FolderBar, CategoryEditor } from "./FolderBits";

/**
 * 촬영 관리 › 포즈 (11/17) — 세원(방향성 창): "촬영 관리 안에 소싱관리처럼 '포즈' 버튼 만들어서 포즈 카테고리 모델 레퍼런스처럼 나누고
 *   거기서 제대로 만들어서 포즈판에서 고를 수 있게 — 해당 코디는 어떤 포즈를 쓰면 되는지". 모델 레퍼런스는 그대로 둔다(나중에 안 쓰면 칸째 없앰).
 * 11/17 저녁 세원: "실내 - 아우터, 상의, 하의, 전신, 앉은컷 / 야외 - 같은 것, 그 안에 상의면 반팔, 긴팔티, 니트 … 거울셀카, 찍어주는 컷"
 *   → 폴더 세 단계(릴스·촬영 레퍼런스와 같은 FolderBar · CategoryEditor) + 찍는 방식 칩(카드마다 하나 — 폴더 말고).
 * 저장 = settings shoot_poses {folders, items} (lib/poses '포즈 칸'). 카드 = 사진 여러 장 + 이름(P번호) + 모델에게 가는 설명 + 폴더 + 찍는 방식 + 추천 자리(fits) + 확인(OK).
 * 넣기: '+ 포즈 추가' · 화면 어디서든 Ctrl+V · 끌어다 놓기(붙인 사진으로 새 카드, 보고 있는 폴더에). 카드를 누르면 고치기(사진은 모델 레퍼런스와 같은 SectionEdit).
 */

const FIT_CHOICES = [...FITS, ...OUTER_TYPES.map((o) => "아우터:" + o.t)];
const codeOf = (x) => x.pose?.code || codeOfTitle(x.title);
const nameOf = (x) => stripCode(x.title).trim() || "이름 없는 포즈";
/** 이 폴더의 묶음(TOP·SELFIE·BTM·FULL·OUTER) — 없으면 "" */
const groupOfFolder = (folderId, folders) => pathOf(folderId, folders).map((f) => f.name.toUpperCase()).find((n) => GROUP_ORDER.includes(n)) || "";
/** 다음 번호 — 묶음 폴더면 'TOP·4'(예비·패딩 같은 이름 번호는 안 셈), 아니면 예전처럼 P번호 */
function nextCode(items, folderId, folders) {
  const g = groupOfFolder(folderId, folders);
  if (g) return `${g}·${Math.max(0, ...items.map((x) => Number(codeOf(x).match(new RegExp(`^${g}·(\\d+)$`))?.[1]) || 0)) + 1}`;
  return "P" + (Math.max(0, ...items.map((x) => Number(codeOf(x).match(/^P(\d+)$/)?.[1]) || 0)) + 1);
}
/** 폴더로 처음 추천 자리 — 포즈판 추천(lib/poses recommend)에 쓰인다. OUTER › 코트 같은 세부면 그 종류도 */
function fitsFor(folderId, folders) {
  const names = pathOf(folderId, folders).map((f) => f.name);
  const up = names.map((n) => n.toUpperCase());
  if (names.includes("아우터") || up.includes("OUTER")) {
    const t = OUTER_TYPES.find((o) => names.some((n) => o.re.test(n)));
    return t ? ["아우터:" + t.t] : ["아우터"];
  }
  if (names.includes("상의") || up.includes("TOP") || up.includes("SELFIE")) return ["상의"];
  if (names.includes("하의") || names.includes("앉은컷") || up.includes("BTM")) return ["하의"];
  return ["전신"];
}
/** 폴더로 처음 찍는 방식 — SELFIE·FULL 은 거울 셀카, TOP·BTM 은 찍어주는 컷 */
const shotFor = (folderId, folders) => ({ SELFIE: "거울 셀카", FULL: "거울 셀카", TOP: "찍어주는 컷", BTM: "찍어주는 컷" })[groupOfFolder(folderId, folders)] || "";
const okTone = (ok) => (ok === true ? "bg-emerald-50 text-emerald-700" : ok === false ? "bg-stone-100 text-stone-500" : "bg-amber-50 text-amber-700");
const okText = (ok) => (ok === true ? "OK" : ok === false ? "뺌" : "확인 전");
const remember = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 시크릿 창 */
  }
};
const recall = (k, fb) => {
  try {
    return localStorage.getItem(k) ?? fb;
  } catch {
    return fb;
  }
};

/** 포즈 카드 고치기 — 0.7초 뒤 저절로 저장, 닫으면 바로 */
function PoseEditSheet({ card, folders, shots, d, online, onSave, onRemove, onClose }) {
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
    // 이름 앞 번호(P17 · TOP·4)가 바뀌면 카드 번호도
    const code = codeOfTitle(n.title);
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
  const fid = folders.some((f) => f.id === x.folderId) ? x.folderId : "";
  const outdoor = fid && placeOfFolder(fid, folders) === "out";
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-stone-500">
              폴더
              <select
                value={fid}
                onChange={(e) => change({ ...latest.current, folderId: e.target.value, ...(latest.current.pose?.fits?.length ? {} : { pose: { ...(latest.current.pose || {}), fits: fitsFor(e.target.value, folders) } }) })}
                aria-label="폴더"
                className={FIELD + " mt-1 " + (outdoor ? "border-sky-300 bg-sky-50" : "")}
              >
                <option value="">미분류</option>
                {ordered(folders).map((f) => (
                  <option key={f.id} value={f.id}>
                    {"　".repeat(f.depth)}
                    {f.depth ? "└ " : ""}
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="text-xs font-medium text-stone-500">찍는 방식</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[...shots, ""].map((s) => (
                  <button key={s || "none"} type="button" aria-pressed={(x.shot || "") === s} onClick={() => change({ ...latest.current, shot: s })} className={chip + " " + ((x.shot || "") === s ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-rose-300")}>
                    {s || "안 정함"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SectionEdit x={x} i={0} n={1} online={online} urlOf={urls.urlOf} onChange={change} onFresh={urls.setFresh} d={d} bare titleHint="이름 — 앞에 번호 (예: TOP·4 창가에 기대 서기)" hint="모델에게 가는 설명 (예: 정면 전신 · 휴대폰으로 얼굴을 가려요)" />
          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">
              추천 자리 <span className="font-normal text-stone-400">— 포즈판이 이 옷이 든 코디에 먼저 골라 둬요</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FIT_CHOICES.map((f) => {
                const on = fits.includes(f);
                return (
                  <button key={f} type="button" aria-pressed={on} onClick={() => setPose({ fits: on ? fits.filter((y) => y !== f) : [...fits, f] })} className={chip + " " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>
                    {f.startsWith("아우터:") ? `아우터 · ${f.slice(4)}` : f}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 11/17 밤 예비 · 가방 있을 때만 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-medium text-stone-500">추천</span>
            <button type="button" aria-pressed={!!p.spare} onClick={() => setPose({ spare: !p.spare || undefined })} className={chip + " " + (p.spare ? "border-stone-700 bg-stone-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>
              예비로 접기 (추천 안 함)
            </button>
            <button type="button" aria-pressed={p.only === "가방"} onClick={() => setPose({ only: p.only === "가방" ? undefined : "가방" })} className={chip + " " + (p.only === "가방" ? "border-amber-600 bg-amber-500 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}>
              가방 있을 때만
            </button>
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

export default function PosesTab({ poses, d, online }) {
  const lib = poses.lib || {};
  const folders = poseFoldersOf(lib);
  const shots = shotsOfLib(lib);
  const items = [...(lib.items || [])].sort(byCode);
  const fidOf = (x) => (folders.some((f) => f.id === x.folderId) ? x.folderId : "");
  const [sel, setSelRaw] = useState(() => recall("poclo_poses_folder", "all"));
  const setSel = (v) => (setSelRaw(v), remember("poclo_poses_folder", v));
  const [shot, setShotRaw] = useState(() => recall("poclo_poses_shot", "*"));
  const setShot = (v) => (setShotRaw(v), remember("poclo_poses_shot", v));
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null); // 카드 id
  const [catOpen, setCatOpen] = useState(false);
  const [busy, setBusy] = useState(0); // 붙인 사진 올리는 중(장수)
  const [spareOpen, setSpareOpen] = useState(false);
  const [err, setErr] = useState("");
  const curSel = sel === "all" || sel === "none" || folders.some((f) => f.id === sel) ? sel : "all";
  const inSel = curSel === "all" ? null : curSel === "none" ? new Set([""]) : new Set(withChildren(curSel, folders));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter(
    (x) =>
      (!inSel || inSel.has(fidOf(x))) &&
      (shot === "*" || (shot === "" ? !x.shot : x.shot === shot)) &&
      words.every((w) => `${x.title} ${x.text} ${x.pose?.why || ""}`.toLowerCase().includes(w)),
  );
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
  // 새 카드 — 보고 있는 폴더(전체면 실내)로, 번호는 다음 P
  const add = async (photos = []) => {
    setErr("");
    const fid = curSel === "all" ? (folders.some((f) => f.id === IN_ID) ? IN_ID : "") : curSel === "none" ? "" : curSel;
    const code = nextCode(lib.items || [], fid, folders);
    const x = { id: newId("pz"), title: `${code} `, text: "", photos, folderId: fid, shot: shot === "*" ? shotFor(fid, folders) : shot, pose: { code, fits: fitsFor(fid, folders) }, createdAt: new Date().toISOString() };
    await save((v) => ({ ...v, folders: v.folders?.length ? v.folders : folders, items: [...(v.items || []), x] }));
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
  const where = curSel === "all" ? pathName(IN_ID, folders) : curSel === "none" ? "미분류" : pathName(curSel, folders);
  const chip = (on) => "rounded-full border px-2.5 py-1 text-xs font-medium " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400");

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
          포즈 카드를 실내 · 야외 › 옷 종류 › 세부로 모아 두는 곳이에요. 촬영 창 <b className="font-semibold text-stone-700">포즈 판</b>의 '+ 포즈'에서 코디마다 여기 카드를 골라요 — 바깥 촬영이면 야외, 아니면 실내 카드로 먼저 추천해요.
        </p>
        <button type="button" onClick={() => add().catch(() => {})} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 포즈 추가
        </button>
      </div>
      <FolderBar
        items={items}
        folders={folders}
        sel={curSel}
        onSel={setSel}
        onEdit={() => setCatOpen(true)}
        q={q}
        setQ={setQ}
        searchPlaceholder="포즈 이름·설명 찾기"
        extra={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400">찍는 방식</span>
            {["*", ...shots, ""].map((s) => (
              <button key={s || "none"} type="button" aria-pressed={shot === s} onClick={() => setShot(s)} className={chip(shot === s)}>
                {s === "*" ? "전부" : s || "안 정함"} <span className="opacity-60">{items.filter((x) => (!inSel || inSel.has(fidOf(x))) && (s === "*" || (s === "" ? !x.shot : x.shot === s))).length}</span>
              </button>
            ))}
          </div>
        }
      />
      <p className="mb-3 flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2 text-xs text-stone-500">
        <ImagePlus size={14} className="shrink-0 text-stone-400" />
        <span className="min-w-0">
          포즈 사진을 캡처해서 <b className="font-semibold text-stone-700">Ctrl+V</b> 하거나 끌어다 놓으면 '{where}'에 새 포즈가 생겨요. 카드를 누르면 이름·설명·사진·폴더·찍는 방식을 고쳐요.
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
          {items.length ? "여기엔 아직 포즈가 없어요 — '포즈 추가'나 Ctrl+V 로 넣어요." : "아직 포즈가 없어요 — '포즈 추가'나 사진 Ctrl+V 로 첫 포즈를 넣어요."}
        </div>
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.filter((x) => !x.pose?.spare || spareOpen).map((x) => {
            const fid = fidOf(x);
            const out = fid && placeOfFolder(fid, folders) === "out";
            const path = pathOf(fid, folders);
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
                    <span className={"rounded-full px-1.5 py-0.5 font-semibold " + (out ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-600")}>{path.length ? path.map((f) => f.name).join(" › ") : "미분류"}</span>
                    {x.shot && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">{x.shot}</span>}
                    <span className={"rounded-full px-1.5 py-0.5 font-semibold " + okTone(x.pose?.ok)}>{okText(x.pose?.ok)}</span>
                    {x.pose?.spare && <span className="rounded-full bg-stone-700 px-1.5 py-0.5 font-semibold text-white">예비</span>}
                    {x.pose?.only === "가방" && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">가방 있을 때만</span>}
                    {x.pose?.pair && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">{codeOf((lib.items || []).find((y) => y.id === x.pose.pair) || {}) || "셀카"} 짝</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {/* 11/17 밤 예비 — 지우지 않고 접어 둔다(추천 안 함) */}
        {shown.some((x) => x.pose?.spare) && (
          <button type="button" onClick={() => setSpareOpen((v) => !v)} className="mt-3 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-500 hover:border-stone-500">
            {spareOpen ? "예비 접기" : `예비 ${shown.filter((x) => x.pose?.spare).length}개 펴기`} <span className="font-normal text-stone-400">· 추천엔 안 써요</span>
          </button>
        )}
        </>
      )}
      {editing && (
        <PoseEditSheet
          key={editing.id}
          card={editing}
          folders={folders}
          shots={shots}
          d={d}
          online={online}
          onSave={(x) => save((v) => ({ ...v, items: (v.items || []).map((y) => (y.id === x.id ? x : y)) })).catch(() => {})}
          onRemove={(id) => save(remove(id)).catch(() => {})}
          onClose={() => setEdit(null)}
        />
      )}
      {catOpen &&
        createPortal(
          <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
            <button type="button" aria-label="닫기" onClick={() => setCatOpen(false)} className="absolute inset-0 cursor-default" />
            <div className="sheet relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
              <CategoryEditor
                items={items}
                folders={folders}
                onChange={(fn) => save((v) => ({ ...v, folders: fn(poseFoldersOf(v)) })).catch(() => {})}
                onClose={() => setCatOpen(false)}
                openKey="poclo_pose_cats_open"
                noun="포즈"
                topHint="상위 이름 — 예: 실내"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
