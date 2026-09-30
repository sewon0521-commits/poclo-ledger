import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Plus, X, Loader2, ImagePlus, Link2, Trash2, Pencil, Images, Check, CalendarDays, Shirt } from "lucide-react";
import { DEFAULT_TAGS, STATUSES, statusOf, loadKey, changeKey, upsert, remove, putPhoto, photoUrls } from "../lib/shoot";
import { newId } from "../lib/id";
import { SlideViewer } from "./ContentBits";
import { FolderBar, CategoryEditor, FolderPicker } from "./FolderBits";
import { folderIdOf, withChildren, pathName, ordered } from "../lib/reelFolders";

/**
 * 촬영 갈래 (2026-09-30) — lib/shoot.js 머리말 참고.
 *   촬영 목록: 상품 블록(신상마켓 링크 · 사진 · 이름 · 거래처 · 위치 · 가격 · 상태 · 촬영일) → 코디(상품 + 참고 사진) → 촬영 날 폰으로 넘겨 보기
 *   촬영 레퍼런스: 옷 종류 × 컷 종류 꼬리표로 모으고 칩 두 줄로 골라 본다 (폰에서 2열)
 * 폰에서 보기 쉬운 게 먼저 — 큰 사진, 누르면 전체 화면 넘겨 보기.
 */

const FIELD = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600";
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const won = (n) => (Number(n) ? Number(n).toLocaleString("ko-KR") + "원" : "");

// ---------------------------------------------------------------- 공통 조각

function useData(online) {
  const [items, setItems] = useState([]);
  const [codis, setCodis] = useState([]);
  const [refs, setRefs] = useState([]);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [folders, setFolders] = useState([]);
  const [urls, setUrls] = useState({});
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, c, t, f] = await Promise.all([
        loadKey("shoot_items", online),
        loadKey("shoot_codis", online),
        loadKey("shoot_refs", online),
        loadKey("shoot_tags", online, DEFAULT_TAGS),
        loadKey("shoot_folders", online),
      ]);
      let fs = f.items || [];
      if (!fs.length) {
        // 처음 — 옷 종류를 상위 목록으로 깔아 둔다(세원이 고치고 지운다)
        fs = DEFAULT_TAGS.clothes.map((name) => ({ id: newId("f"), name, parent: null }));
        await changeKey("shoot_folders", online, (v) => ((v.items || []).length ? v : { items: fs }));
      }
      setFolders(fs);
      setItems(a.items || []);
      setCodis(b.items || []);
      setRefs(c.items || []);
      setTags({ ...DEFAULT_TAGS, ...t });
    } catch {
      setMsg("촬영 목록을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [load]);

  // 사진 주소 — 없는 것만 한 번에
  const keys = useMemo(
    () => [...new Set([...items.map((x) => x.photo), ...refs.map((x) => x.photo)].filter(Boolean))],
    [items, refs],
  );
  useEffect(() => {
    const want = keys.filter((k) => !urls[k]);
    if (!want.length) return;
    let alive = true;
    photoUrls(want.slice(0, 300), online).then((m) => alive && setUrls((u) => ({ ...u, ...m })));
    return () => {
      alive = false;
    };
  }, [keys, urls, online]);

  const save = (key, set) => async (fn) => {
    try {
      const next = await changeKey(key, online, fn);
      set(next.items || []);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  const saveTags = async (fn) => {
    try {
      const next = await changeKey("shoot_tags", online, fn, DEFAULT_TAGS);
      setTags({ ...DEFAULT_TAGS, ...next });
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };

  return {
    items,
    codis,
    refs,
    tags,
    urls,
    msg,
    setMsg,
    loaded,
    saveItems: save("shoot_items", setItems),
    saveCodis: save("shoot_codis", setCodis),
    saveRefs: save("shoot_refs", setRefs),
    saveTags,
    folders,
    // 카테고리 편집이 op(list) 로 부른다 (릴스와 같은 부품)
    saveFolders: async (op) => {
      try {
        const next = await changeKey("shoot_folders", online, (v) => ({ ...v, items: op(v.items || []) }));
        setFolders(next.items || []);
      } catch (e) {
        setMsg(e.message || "목록을 저장하지 못했어요.");
      }
    },
  };
}

function Sheet({ onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={"sheet relative z-10 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl " + (wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        {children}
      </div>
    </div>
  );
}

function SheetHead({ title, onClose, right }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
      <h3 className="min-w-0 truncate font-semibold text-stone-900">{title}</h3>
      <span className="flex items-center gap-2">
        {right}
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </span>
    </header>
  );
}

/** 꼬리표 칩 줄 — multi 면 여러 개, 아니면 하나(다시 누르면 풀림) */
function Chips({ list, value, onChange, multi, all, onAdd }) {
  const has = (t) => (multi ? (value || []).includes(t) : value === t);
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {all && (
        <button
          type="button"
          onClick={() => onChange(multi ? [] : "")}
          className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + ((multi ? !value?.length : !value) ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}
        >
          {all}
        </button>
      )}
      {list.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(multi ? (has(t) ? value.filter((x) => x !== t) : [...(value || []), t]) : has(t) ? "" : t)}
          className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (has(t) ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
        >
          {t}
        </button>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={() => {
            const n = window.prompt("새 꼬리표 이름");
            if (n?.trim()) onAdd(n.trim());
          }}
          className="shrink-0 rounded-full border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-700"
        >
          + 꼬리표
        </button>
      )}
    </div>
  );
}

function Photo({ url, className = "", onClick }) {
  const inner = url ? (
    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-stone-300">
      <Camera size={18} />
    </span>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={"block overflow-hidden bg-stone-100 " + className}>
      {inner}
    </button>
  ) : (
    <span className={"block overflow-hidden bg-stone-100 " + className}>{inner}</span>
  );
}

/** 전체 화면 넘겨 보기 — 촬영 때 폰으로 */
function Viewer({ slides, start = 0, onClose, footer }) {
  const [at] = useState(start);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const ordered = [...slides.slice(at), ...slides.slice(0, at)];
  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-white">
        <span className="text-sm text-white/70">{slides.length}장</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <SlideViewer urls={ordered.map((s) => s.url)} className="min-h-0 w-full flex-1" />
      {footer && <div className="shrink-0 px-4 py-3 text-sm text-white/80">{footer}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- 촬영 레퍼런스

/** 폴더 고르기 칸 — 상위 › 하위 › 세부를 들여쓰기로 */
function FolderSelect({ folders, value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={FIELD}>
      <option value="">미분류</option>
      {ordered(folders).map((f) => (
        <option key={f.id} value={f.id}>
          {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
        </option>
      ))}
    </select>
  );
}

/** 예전(9/30 첫 판) 사진은 옷 종류 꼬리표만 있다 — 같은 이름의 상위 폴더로 보이게 */
const withFolder = (r) => (r.folderId || r.folder ? r : { ...r, folder: (r.clothes || [])[0] || "" });

function RefUpload({ tags, folders, online, initialFiles, initialFolder, onDone, onAddTag, onClose }) {
  const [files, setFiles] = useState(initialFiles || []);
  const [folderId, setFolderId] = useState(initialFolder || null);
  const [cuts, setCuts] = useState([]);
  const [place, setPlace] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState("");
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const go = async () => {
    const made = [];
    for (const [i, f] of files.entries()) {
      setBusy(`올리는 중 ${i + 1}/${files.length}`);
      const photo = await putPhoto(f, online);
      made.push({ id: newId("r"), photo, folderId, cuts, place, memo, createdAt: new Date().toISOString() });
    }
    await onDone(made);
    setBusy("");
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHead title="레퍼런스 사진 넣기" onClose={onClose} />
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles((p) => [...p, ...[...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))]);
        }}
      >
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 py-5 text-sm text-stone-500 hover:border-rose-300">
          <ImagePlus size={22} />
          {files.length ? `${files.length}장 · 더 고르거나 끌어다 놓기` : "사진 고르기 · 끌어다 놓기 (여러 장, 캡처도 돼요)"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files || [])])} />
        </label>
        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {previews.map((u, i) => (
              <div key={u} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} aria-label="빼기" className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-stone-500">어느 목록에 넣을까요?</span>
          <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
        </label>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-stone-500">컷 종류 (선택 · 여러 개 가능)</div>
          <Chips list={tags.cuts} value={cuts} onChange={setCuts} multi onAdd={(t) => onAddTag("cuts", t)} />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-stone-500">장소 (선택)</div>
          <Chips list={tags.places} value={place} onChange={setPlace} onAdd={(t) => onAddTag("places", t)} />
        </div>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 다리 꼬는 포즈, 가방 한쪽 어깨" className={FIELD} />
        <p className="text-[11px] text-stone-400">고른 목록·꼬리표는 이번에 넣는 사진 전부에 붙어요. 나중에 사진마다 옮기거나 고칠 수 있어요.</p>
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button type="button" disabled={!files.length || !!busy} onClick={go} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {busy || `${files.length || ""}장 넣기`}
        </button>
      </footer>
    </Sheet>
  );
}

function RefEdit({ refItem, tags, folders, url, onSave, onRemove, onClose, onAddTag }) {
  const [r, setR] = useState({ ...refItem, folderId: folderIdOf(refItem, folders) });
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="레퍼런스 고치기" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Photo url={url} className="mx-auto aspect-[3/4] w-40 rounded-xl" />
        <div className="text-xs font-semibold text-stone-500">목록</div>
        <FolderSelect folders={folders} value={r.folderId} onChange={(v) => setR({ ...r, folderId: v, folder: "" })} />
        <div className="text-xs font-semibold text-stone-500">컷 종류</div>
        <Chips list={tags.cuts} value={r.cuts} onChange={(v) => setR({ ...r, cuts: v })} multi onAdd={(t) => onAddTag("cuts", t)} />
        <div className="text-xs font-semibold text-stone-500">장소</div>
        <Chips list={tags.places} value={r.place} onChange={(v) => setR({ ...r, place: v })} onAdd={(t) => onAddTag("places", t)} />
        <input value={r.memo || ""} onChange={(e) => setR({ ...r, memo: e.target.value })} placeholder="메모" className={FIELD} />
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        <button type="button" onClick={() => window.confirm("이 사진을 지울까요?") && onRemove(r.id)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600">
          <Trash2 size={13} /> 지우기
        </button>
        <button type="button" onClick={() => onSave(r)} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white">
          저장
        </button>
      </footer>
    </Sheet>
  );
}

/**
 * 촬영 레퍼런스 — 목록(폴더)은 릴스 기획처럼 세원이 만든다 (9/30 세원: "콘텐츠처럼 목록을 만들고 편집,
 * 사진을 묶어서든 개별로든 드래그 앤 드롭으로 넣으면 그때 목록 선택"). 화면 어디에 끌어다 놔도 넣기 창이 열린다.
 * 컷 종류는 폴더와 따로 칩으로 — '하의 폴더 안에서 앉은 컷만'.
 */
function RefsView({ d, online }) {
  const [sel, setSel] = useState("all");
  const [cut, setCut] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(null); // {files, folder}
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [editCats, setEditCats] = useState(false);
  const [dropping, setDropping] = useState(false);

  const folders = d.folders;
  const refs = useMemo(() => d.refs.map(withFolder), [d.refs]);
  const shown = useMemo(() => {
    const ids = sel === "all" || sel === "none" ? null : new Set(withChildren(sel, folders));
    const n = q.trim().toLowerCase();
    return refs.filter((r) => {
      const f = folderIdOf(r, folders);
      if (sel === "none" && f) return false;
      if (ids && !ids.has(f)) return false;
      if (cut && !(r.cuts || []).includes(cut)) return false;
      return !n || `${r.memo || ""} ${(r.cuts || []).join(" ")} ${r.place || ""}`.toLowerCase().includes(n);
    });
  }, [refs, folders, sel, cut, q]);
  const addTag = (group, t) => d.saveTags((v) => ({ ...DEFAULT_TAGS, ...v, [group]: [...new Set([...(v[group] || DEFAULT_TAGS[group]), t])] }));
  const here = sel !== "all" && sel !== "none" ? sel : null;

  return (
    <div
      className="relative min-h-[70vh]"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return;
        e.preventDefault();
        setDropping(false);
        setAdding({ files, folder: here });
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">촬영 레퍼런스</h2>
          <p className="mt-0.5 text-sm text-stone-500">착용샷 참고 사진을 목록별로 모아요. 사진을 화면에 끌어다 놓으면 바로 넣을 수 있어요.</p>
        </div>
        <button type="button" onClick={() => setAdding({ files: [], folder: here })} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <ImagePlus size={16} /> 사진 넣기
        </button>
      </div>

      <FolderBar items={refs} folders={folders} sel={sel} onSel={setSel} onEdit={() => setEditCats(true)} q={q} setQ={setQ} searchPlaceholder="메모·컷 검색">
        <div className="mt-2 border-t border-stone-100 pt-2">
          <Chips list={d.tags.cuts} value={cut} onChange={setCut} all="컷 전체" />
        </div>
      </FolderBar>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          {d.refs.length ? "이 목록에 사진이 아직 없어요." : "사진을 여기로 끌어다 놓거나 '사진 넣기'로 참고 사진을 모아 보세요. 인스타 캡처도 돼요."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((r, i) => (
            <div key={r.id} className="group relative">
              <Photo url={d.urls[r.photo]} onClick={() => setView(i)} className="aspect-[3/4] w-full rounded-xl" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1 rounded-b-xl bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6">
                <span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-stone-800">{pathName(folderIdOf(r, folders), folders).split(" › ").pop()}</span>
                {(r.cuts || []).slice(0, 2).map((t) => (
                  <span key={t} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-stone-700">
                    {t}
                  </span>
                ))}
              </span>
              <span className="absolute top-1.5 right-1.5 flex gap-1">
                <span className="rounded-md bg-white/90 shadow-sm">
                  <FolderPicker item={r} folders={folders} onMove={(id) => d.saveRefs(upsert({ id: r.id, folderId: id, folder: "" }))} />
                </span>
                <button type="button" onClick={() => setEdit(r)} aria-label="고치기" className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-stone-600 shadow-sm">
                  <Pencil size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-4 border-dashed border-rose-400 bg-rose-50/80 text-lg font-semibold text-rose-800">
          여기에 놓으면 넣기 창이 열려요
        </div>
      )}

      {adding && (
        <RefUpload
          tags={d.tags}
          folders={folders}
          online={online}
          initialFiles={adding.files}
          initialFolder={adding.folder}
          onAddTag={addTag}
          onClose={() => setAdding(null)}
          onDone={async (made) => {
            await d.saveRefs((v) => ({ ...v, items: [...made, ...(v.items || [])] }));
            setAdding(null);
          }}
        />
      )}
      {edit && (
        <RefEdit
          refItem={edit}
          tags={d.tags}
          folders={folders}
          url={d.urls[edit.photo]}
          onAddTag={addTag}
          onClose={() => setEdit(null)}
          onSave={async (r) => {
            await d.saveRefs(upsert(r));
            setEdit(null);
          }}
          onRemove={async (id) => {
            await d.saveRefs(remove(id));
            setEdit(null);
          }}
        />
      )}
      {editCats && (
        <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setEditCats(false)} className="absolute inset-0 cursor-default" />
          <div className="sheet relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <CategoryEditor
              items={refs}
              folders={folders}
              onChange={d.saveFolders}
              onClose={() => setEditCats(false)}
              openKey="poclo_shoot_cats_open"
              noun="사진"
              topHint="상위 목록 이름 — 예: 하의"
            />
          </div>
        </div>
      )}
      {view != null && <Viewer slides={shown.map((r) => ({ url: d.urls[r.photo] }))} start={view} onClose={() => setView(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- 촬영 목록 — 상품

const EMPTY_ITEM = { name: "", vendor: "", place: "", kind: "", price: "", url: "", photo: "", status: "want", shootDate: "", options: "", size: "", memo: "" };

function ItemEdit({ item, d, online, vendors, onClose }) {
  const [x, setX] = useState({ ...EMPTY_ITEM, ...item });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const set = (patch) => setX((p) => ({ ...p, ...patch }));
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      set({ photo: await putPhoto(file, online) });
    } catch (e) {
      d.setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={item.id ? "상품 고치기" : "상품 넣기"} onClose={onClose} />
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        onPaste={(e) => {
          const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
          if (f) upload(f);
        }}
      >
        <label className="block text-xs font-semibold text-stone-500">
          신상마켓 링크
          <span className="relative mt-1 block">
            <Link2 size={14} className="absolute top-2.5 left-3 text-stone-400" />
            <input value={x.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://sinsangmarket.kr/…" className={FIELD + " pl-8"} />
          </span>
          <span className="mt-1 block text-[11px] font-normal text-stone-400">지금은 적어만 둬요. 신상마켓과 이으면 사진·이름·거래처·위치·가격이 여기서 저절로 채워져요.</span>
        </label>
        <div className="flex gap-3">
          <label className="relative block aspect-[3/4] w-28 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 hover:border-rose-300">
            {preview || d.urls[x.photo] ? (
              <img src={preview || d.urls[x.photo]} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-stone-400">
                <ImagePlus size={18} /> 사진 고르기 · 붙여넣기(Ctrl+V)
              </span>
            )}
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                <Loader2 size={18} className="animate-spin" />
              </span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <div className="min-w-0 flex-1 space-y-2">
            <input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="상품명 (거래처 상품명 그대로)" className={FIELD} />
            <input value={x.vendor} onChange={(e) => set({ vendor: e.target.value })} list="shoot-vendors" placeholder="거래처" className={FIELD} />
            <datalist id="shoot-vendors">
              {vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
            <input value={x.place} onChange={(e) => set({ place: e.target.value })} placeholder="위치 — 예: 디오트 3층 B25" className={FIELD} />
            <input value={x.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="도매가" className={FIELD} />
          </div>
        </div>
        <div className="text-xs font-semibold text-stone-500">종류</div>
        <Chips list={d.tags.clothes} value={x.kind} onChange={(v) => set({ kind: v })} />
        <div className="text-xs font-semibold text-stone-500">상태</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => set({ status: k })} className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (x.status === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 text-stone-600")}>
              {label}
            </button>
          ))}
        </div>
        <label className="block text-xs font-semibold text-stone-500">
          촬영 예정일
          <input type="date" value={x.shootDate} onChange={(e) => set({ shootDate: e.target.value })} className={FIELD + " mt-1"} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input value={x.options} onChange={(e) => set({ options: e.target.value })} placeholder="옵션 — 색상 등" className={FIELD} />
          <input value={x.size} onChange={(e) => set({ size: e.target.value })} placeholder="사이즈" className={FIELD} />
        </div>
        <textarea value={x.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="메모 — 소재·핏·샘플 요청 여부 등" className={FIELD + " min-h-[4rem] [field-sizing:content]"} />
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {item.id ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 상품을 지울까요?")) return;
              await d.saveItems(remove(item.id));
              onClose();
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
          >
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={busy || !(x.name.trim() || x.photo || x.url.trim())}
          onClick={async () => {
            await d.saveItems(upsert({ ...x, id: x.id || newId("i"), createdAt: x.createdAt || new Date().toISOString() }));
            onClose();
          }}
          className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}

function ItemCard({ x, url, onOpen, selectable, selected }) {
  const [, label, tone] = statusOf(x.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={"block w-full overflow-hidden rounded-xl border bg-white text-left " + (selected ? "border-rose-600 ring-2 ring-rose-600" : "border-stone-200 hover:border-stone-300")}
    >
      <span className="relative block">
        <Photo url={url} className="aspect-[3/4] w-full" />
        <span className={"absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold " + tone}>{label}</span>
        {selectable && (
          <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (selected ? "border-rose-700 bg-rose-700 text-white" : "border-white bg-black/20 text-transparent")}>
            <Check size={14} />
          </span>
        )}
      </span>
      <span className="block px-2.5 py-2">
        <span className="block truncate text-sm font-medium text-stone-900">{x.name || "이름 없음"}</span>
        <span className="block truncate text-[11px] text-stone-500">
          {[x.vendor, x.place].filter(Boolean).join(" · ") || "거래처 없음"}
        </span>
        <span className="mt-0.5 flex items-center justify-between text-[11px] text-stone-400">
          <span>{won(x.price)}</span>
          {x.shootDate && <span className="text-amber-700">{md(x.shootDate)} 촬영</span>}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- 촬영 목록 — 코디

function CodiEdit({ codi, d, onClose }) {
  const [c, setC] = useState({ name: "", itemIds: [], refIds: [], shootDate: "", memo: "", ...codi });
  const [tab, setTab] = useState("items");
  const [folder, setFolder] = useState(null);
  const [cut, setCut] = useState("");
  const toggle = (k, id) => setC((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));
  const items = d.items.filter((x) => x.status !== "back" && (x.status !== "shot" || c.itemIds.includes(x.id)));
  const inFolder = folder ? new Set(withChildren(folder, d.folders)) : null;
  const refs = d.refs.map(withFolder).filter((r) => (!inFolder || inFolder.has(folderIdOf(r, d.folders))) && (!cut || (r.cuts || []).includes(cut)));
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={codi.id ? "코디 고치기" : "코디 만들기"} onClose={onClose} />
      <div className="shrink-0 space-y-2 border-b border-stone-100 p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="코디 이름 — 예: 엘비 세트 + 카고" className={FIELD} />
          <input type="date" value={c.shootDate} onChange={(e) => setC({ ...c, shootDate: e.target.value })} className={FIELD} />
        </div>
        <input value={c.memo} onChange={(e) => setC({ ...c, memo: e.target.value })} placeholder="메모 — 장소·소품·찍을 컷" className={FIELD} />
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          {[
            ["items", `상품 ${c.itemIds.length}`],
            ["refs", `참고 사진 ${c.refIds.length}`],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={"flex-1 rounded-lg py-1.5 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "items" ? (
          items.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {items.map((x) => (
                <ItemCard key={x.id} x={x} url={d.urls[x.photo]} selectable selected={c.itemIds.includes(x.id)} onOpen={() => toggle("itemIds", x.id)} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-stone-400">먼저 '상품' 탭에서 상품을 넣어 주세요.</p>
          )
        ) : (
          <div className="space-y-2">
            <FolderSelect folders={d.folders} value={folder} onChange={setFolder} />
            <Chips list={d.tags.cuts} value={cut} onChange={setCut} all="컷 전체" />
            {refs.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {refs.map((r) => {
                  const on = c.refIds.includes(r.id);
                  return (
                    <button key={r.id} type="button" onClick={() => toggle("refIds", r.id)} className={"relative block overflow-hidden rounded-xl " + (on ? "ring-2 ring-rose-600" : "")}>
                      <Photo url={d.urls[r.photo]} className="aspect-[3/4] w-full" />
                      <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-white bg-black/20 text-transparent")}>
                        <Check size={14} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">촬영 레퍼런스에 사진을 넣으면 여기서 골라요.</p>
            )}
          </div>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {codi.id ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 코디를 지울까요? (상품·사진은 그대로)")) return;
              await d.saveCodis(remove(codi.id));
              onClose();
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
          >
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!c.itemIds.length}
          onClick={async () => {
            const saved = { ...c, name: c.name.trim() || "이름 없는 코디", id: c.id || newId("c"), createdAt: c.createdAt || new Date().toISOString() };
            await d.saveCodis(upsert(saved));
            // 코디에 넣은 상품은 '코디 픽', 촬영일이 있으면 '촬영 예정'
            await d.saveItems((v) => ({
              ...v,
              items: (v.items || []).map((x) =>
                saved.itemIds.includes(x.id) && !["shot", "back"].includes(x.status)
                  ? { ...x, status: saved.shootDate ? "planned" : "pick", shootDate: saved.shootDate || x.shootDate }
                  : x,
              ),
            }));
            onClose();
          }}
          className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}

function CodiCard({ c, d, onEdit, onShow, onDone }) {
  const its = c.itemIds.map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
  const rs = c.refIds.map((id) => d.refs.find((x) => x.id === id)).filter(Boolean);
  return (
    <div className={"overflow-hidden rounded-2xl border bg-white " + (c.done ? "border-stone-200 opacity-60" : "border-stone-200")}>
      <button type="button" onClick={onShow} className="flex w-full gap-1 overflow-x-auto p-2 [scrollbar-width:none]">
        {its.map((x) => (
          <Photo key={x.id} url={d.urls[x.photo]} className="aspect-[3/4] w-20 shrink-0 rounded-lg" />
        ))}
        {rs.length > 0 && <span className="mx-0.5 w-px shrink-0 self-stretch bg-stone-200" />}
        {rs.map((r) => (
          <Photo key={r.id} url={d.urls[r.photo]} className="aspect-[3/4] w-16 shrink-0 rounded-lg opacity-90" />
        ))}
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-3 py-2">
        <button type="button" onClick={onShow} className="min-w-0 text-left">
          <span className="block truncate text-sm font-semibold text-stone-900">{c.name}</span>
          <span className="block truncate text-[11px] text-stone-500">
            상품 {its.length} · 참고 사진 {rs.length}
            {c.shootDate && ` · ${md(c.shootDate)} 촬영`}
            {c.memo && ` · ${c.memo}`}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onDone} className={"rounded-lg border px-2 py-1 text-[11px] font-medium " + (c.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-emerald-300")}>
            {c.done ? "촬영 완료" : "촬영 끝"}
          </button>
          <button type="button" onClick={onEdit} aria-label="코디 고치기" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <Pencil size={14} />
          </button>
        </span>
      </div>
    </div>
  );
}

function ListView({ d, online, vendors }) {
  const [tab, setTab] = useState("items");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [edit, setEdit] = useState(null);
  const [codiEdit, setCodiEdit] = useState(null);
  const [show, setShow] = useState(null);

  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, d.items.filter((x) => x.status === k).length]));
  const items = d.items.filter((x) => (!status ? x.status !== "back" : x.status === status) && (!kind || x.kind === kind));
  // 코디 — 촬영 날짜가 가까운 것부터, 끝난 건 아래로
  const codis = [...d.codis].sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.shootDate || "9").localeCompare(b.shootDate || "9"));
  const days = [...new Set(d.codis.filter((c) => c.shootDate && !c.done).map((c) => c.shootDate))].sort();

  const showCodi = (c) => {
    const its = c.itemIds.map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
    const rs = c.refIds.map((id) => d.refs.find((x) => x.id === id)).filter(Boolean);
    setShow({ slides: [...its.map((x) => ({ url: d.urls[x.photo] })), ...rs.map((r) => ({ url: d.urls[r.photo] }))], footer: `${c.name} — 상품 ${its.length}장 다음에 참고 사진 ${rs.length}장${c.memo ? ` · ${c.memo}` : ""}` });
  };

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">촬영 목록</h2>
          <p className="mt-0.5 text-sm text-stone-500">샘플 요청부터 촬영 완료까지 상품을 모으고, 상품 + 참고 사진으로 코디를 짜요.</p>
        </div>
        <button
          type="button"
          onClick={() => (tab === "items" ? setEdit({}) : setCodiEdit({}))}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> {tab === "items" ? "상품 넣기" : "코디 만들기"}
        </button>
      </div>

      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["items", `상품 ${d.items.length}`, Shirt],
          ["codis", `코디 ${d.codis.filter((c) => !c.done).length}`, Images],
        ].map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "items" ? (
        <>
          <div className="mb-3 space-y-1.5">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              <button type="button" onClick={() => setStatus("")} className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (!status ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}>
                진행 중 {d.items.filter((x) => x.status !== "back").length}
              </button>
              {STATUSES.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setStatus(status === k ? "" : k)} className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (status === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}>
                  {label} <span className={status === k ? "text-rose-200" : "text-stone-400"}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <Chips list={d.tags.clothes} value={kind} onChange={setKind} all="종류 전체" />
          </div>
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
              {d.items.length ? "이 조건의 상품이 없어요." : "'상품 넣기'로 신상마켓에서 고른 상품을 모아 보세요. 사진은 캡처를 붙여넣어도 돼요."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((x) => (
                <ItemCard key={x.id} x={x} url={d.urls[x.photo]} onOpen={() => setEdit(x)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {days.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
              <CalendarDays size={14} /> 다가오는 촬영:
              {days.map((dt) => (
                <span key={dt} className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                  {md(dt)} · 코디 {d.codis.filter((c) => c.shootDate === dt && !c.done).length}
                </span>
              ))}
            </div>
          )}
          {codis.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
              '코디 만들기'로 상의 + 하의 같은 상품 묶음에 참고 사진을 붙여 두면, 촬영 때 폰으로 한 장씩 넘겨 봐요.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {codis.map((c) => (
                <CodiCard
                  key={c.id}
                  c={c}
                  d={d}
                  onShow={() => showCodi(c)}
                  onEdit={() => setCodiEdit(c)}
                  onDone={async () => {
                    const done = !c.done;
                    await d.saveCodis(upsert({ ...c, done }));
                    if (done) await d.saveItems((v) => ({ ...v, items: (v.items || []).map((x) => (c.itemIds.includes(x.id) ? { ...x, status: "shot" } : x)) }));
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {edit && <ItemEdit item={edit} d={d} online={online} vendors={vendors} onClose={() => setEdit(null)} />}
      {codiEdit && <CodiEdit codi={codiEdit} d={d} onClose={() => setCodiEdit(null)} />}
      {show && <Viewer slides={show.slides} footer={show.footer} onClose={() => setShow(null)} />}
    </div>
  );
}

export default function ShootPage({ view, online, vendors = [] }) {
  const d = useData(online);
  return (
    <div>
      {d.msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {d.msg}
          <button type="button" onClick={() => d.setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      {!d.loaded ? (
        <div className="flex h-60 items-center justify-center text-stone-300">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : view === "refs" ? (
        <RefsView d={d} online={online} />
      ) : (
        <ListView d={d} online={online} vendors={vendors} />
      )}
    </div>
  );
}

