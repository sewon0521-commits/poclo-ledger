import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Loader2, ImagePlus, Trash2, Pencil, Images, Check, CalendarDays, Shirt, FolderInput, Store, Crop, Search } from "lucide-react";
import { DEFAULT_TAGS, FIELD, md, loadKey, changeKey, upsert, remove, putPhoto, photoUrls, shopsOf, hasCut, cutLabel, subsOf, CUT_SEP } from "../lib/shoot";
import { CutFilter, CutPicker, CutEditor } from "./CutBits";
import { newId } from "../lib/id";
import { Sheet, SheetHead, Chips, Photo, Viewer } from "./ShootBits";
import Pipeline, { ItemCard } from "./ShootItems";
import { normalize, moveTo, DEFAULT_MSGS } from "../lib/sinsang";
import { dayKey } from "../lib/journal";
import { FolderBar, CategoryEditor, FolderPicker } from "./FolderBits";
import ShootPlan from "./ShootPlan";
import { clipImages, filesOf } from "../lib/pasteImages";
import { folderIdOf, withChildren, pathName, ordered } from "../lib/reelFolders";

/**
 * 촬영 갈래 (2026-09-30) — lib/shoot.js 머리말 참고.
 *   촬영 목록: 상품 블록(신상마켓 링크 · 사진 · 이름 · 거래처 · 위치 · 가격 · 상태 · 촬영일) → 코디(상품 + 참고 사진) → 촬영 날 폰으로 넘겨 보기
 *   촬영 레퍼런스: 옷 종류 × 컷 종류 꼬리표로 모으고 칩 두 줄로 골라 본다 (폰에서 2열)
 * 폰에서 보기 쉬운 게 먼저 — 큰 사진, 누르면 전체 화면 넘겨 보기.
 */


// ---------------------------------------------------------------- 공통 조각

function useData(online) {
  const [items, setItems] = useState([]);
  const [codis, setCodis] = useState([]);
  const [refs, setRefs] = useState([]);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [msgs, setMsgs] = useState(DEFAULT_MSGS);
  const [refusals, setRefusals] = useState([]);
  const [folders, setFolders] = useState([]);
  const [urls, setUrls] = useState({});
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, c, t, f, m, r] = await Promise.all([
        loadKey("shoot_items", online),
        loadKey("shoot_codis", online),
        loadKey("shoot_refs", online),
        loadKey("shoot_tags", online, DEFAULT_TAGS),
        loadKey("shoot_folders", online),
        loadKey("shoot_msg", online, DEFAULT_MSGS),
        loadKey("sample_refusals", online),
      ]);
      setRefusals(r.items || []);
      setMsgs({ ...DEFAULT_MSGS, ...m });
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
    // 샘플 거절 기록 (lib/sinsang.js)
    refusals,
    saveRefusals: save("sample_refusals", setRefusals),
    msgs,
    // 샘플 요청 글 틀 {first, again}
    saveMsgs: async (next) => {
      try {
        setMsgs({ ...DEFAULT_MSGS, ...(await changeKey("shoot_msg", online, () => next, DEFAULT_MSGS)) });
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
      }
    },
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

/** 같은 사진인가 (같은 캡처를 두 번 붙여넣은 것) — 크기가 같을 때만 바이트를 맞대 본다 */
async function sameImage(a, b) {
  if (a.size !== b.size || a.type !== b.type) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

const LAST_SHOP = "poclo_ref_last_shop"; // 넣기 창에서 마지막에 고른 쇼핑몰 — 같은 쇼핑몰을 이어서 캡처하니까

/** 쇼핑몰 줄 — 누르면 그 쇼핑몰 사진만 (10/6 세원: "같은 경쟁사 쇼핑몰 사진들이 많이 겹칠 텐데, 클릭하면 각 쇼핑몰을 모으게") */
function ShopRow({ shops, counts, none, total, value, onChange }) {
  const chip = (key, label, n) => (
    <button
      key={key || "all"}
      type="button"
      onClick={() => onChange(value === key ? "" : key)}
      className={
        "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium " +
        (value === key ? "border-rose-700 bg-rose-700 text-white" : n ? "border-stone-200 bg-white text-stone-600 hover:border-stone-300" : "border-stone-100 bg-white text-stone-300")
      }
    >
      {label}
      <span className={value === key ? "text-rose-200" : "text-stone-400"}>{n}</span>
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      <span className="mr-1 flex w-14 shrink-0 items-center gap-1 text-xs text-stone-400">
        <Store size={12} /> 쇼핑몰
      </span>
      {shops.length ? (
        <>
          {chip("", "전체", total)}
          {shops.map((s) => chip(s, s, counts[s] || 0))}
          {none > 0 && chip("__none", "쇼핑몰 없음", none)}
        </>
      ) : (
        <span className="text-xs text-stone-400">사진을 넣을 때 쇼핑몰을 고르거나, 사진을 골라 아래 '쇼핑몰 지정'을 누르면 여기서 쇼핑몰별로 모아 봐요.</span>
      )}
    </div>
  );
}

function RefUpload({ tags, shops = [], folders, online, initialFiles, initialFolder, initialShop, onDone, onAddTag, onClose }) {
  const [files, setFiles] = useState(initialFiles || []);
  const [flash, setFlash] = useState("");
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  // 창이 열려 있는 동안 붙여넣기·끌어다 놓기를 계속하면 여기에 쌓인다 (10/6 세원: "하나씩 캡처·복사하면서 연속으로 붙여넣기 — 지금은 하나 붙이면 저장하고 또 해야 돼")
  const addFiles = async (list) => {
    const fresh = [];
    let dup = 0;
    for (const f of list.filter((x) => x.type.startsWith("image/"))) {
      let same = false;
      for (const g of [...filesRef.current, ...fresh]) if (await sameImage(f, g)) same = true;
      if (same) dup += 1;
      else fresh.push(f);
    }
    if (fresh.length) setFiles((p) => [...p, ...fresh]);
    setFlash(dup && !fresh.length ? "같은 사진이라 또 넣지 않았어요" : `${filesRef.current.length + fresh.length}장째 붙였어요${dup ? ` · 같은 사진 ${dup}장은 뺐어요` : ""}`);
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    const onPaste = (e) => {
      const clip = clipImages(e.clipboardData);
      // 메모·장소 칸에 글을 붙일 때는 그대로 — 사진 파일이 왔을 때만 가로챈다
      const inField = e.target.closest?.("input, textarea");
      if (inField ? !clip.files.length : !clip.files.length && !clip.urls.length) return;
      e.preventDefault();
      filesOf(clip).then(addFiles);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [folderId, setFolderId] = useState(initialFolder || null);
  const [shop, setShop] = useState(() => {
    if (initialShop) return initialShop;
    try {
      const last = localStorage.getItem(LAST_SHOP) || "";
      return shops.includes(last) ? last : "";
    } catch {
      return "";
    }
  });
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
      made.push({ id: newId("r"), photo, folderId, cuts, place, shop, memo, createdAt: new Date().toISOString() });
    }
    try {
      localStorage.setItem(LAST_SHOP, shop);
    } catch {
      /* 기억 못 해도 된다 */
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
          // 바깥 화면의 끌어다 놓기(새 창 열기)로 번지지 않게 여기서 끝낸다 — 다른 창 사진(주소)도 받는다
          const clip = clipImages(e.dataTransfer);
          e.preventDefault();
          e.stopPropagation();
          if (clip.files.length || clip.urls.length) filesOf(clip).then(addFiles);
        }}
      >
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 py-5 text-center text-sm text-stone-500 hover:border-rose-300">
          <ImagePlus size={22} />
          {files.length ? (
            <>
              <span className="font-semibold text-stone-800">{files.length}장 모였어요</span>
              <span className="text-xs">캡처하고 계속 Ctrl+V 하면 여기에 쌓여요 · 더 고르거나 끌어다 놓기도 돼요</span>
            </>
          ) : (
            "사진 고르기 · 끌어다 놓기 · Ctrl+V (여러 장, 캡처도 돼요)"
          )}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(Array.from(e.target.files || []))} />
        </label>
        {flash && <p className="-mt-2 text-center text-xs font-medium text-emerald-700">{flash}</p>}
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
          <div className="text-xs font-semibold text-stone-500">어느 쇼핑몰 사진이에요? (선택 — 마지막에 고른 쇼핑몰이 미리 골라져 있어요)</div>
          <Chips
            list={shops}
            value={shop}
            onChange={setShop}
            addLabel="+ 쇼핑몰"
            addPrompt="쇼핑몰 이름 — 예: 페트리코어"
            onAdd={(t) => {
              onAddTag("shops", t);
              setShop(t);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-stone-500">컷 종류 (선택 · 여러 개 가능)</div>
          <CutPicker
            tags={tags}
            value={cuts}
            onChange={setCuts}
            onAdd={(t) => {
              onAddTag("cuts", t);
              setCuts((c) => [...c, t]);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-stone-500">장소 (선택)</div>
          <Chips list={tags.places} value={place} onChange={setPlace} onAdd={(t) => onAddTag("places", t)} />
        </div>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 다리 꼬는 포즈, 가방 한쪽 어깨" className={FIELD} />
        <p className="text-[11px] text-stone-400">고른 목록·꼬리표는 이번에 넣는 사진 전부에 붙어요. 나중에 사진마다 옮기거나 고칠 수 있어요. 다 모은 뒤 아래 단추를 한 번만 누르면 돼요.</p>
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

function RefEdit({ refItem, tags, shops = [], folders, url, onSave, onRemove, onClose, onAddTag }) {
  const [r, setR] = useState({ ...refItem, folderId: folderIdOf(refItem, folders) });
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="레퍼런스 고치기" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Photo url={url} className="mx-auto aspect-[3/4] w-40 rounded-xl" />
        <div className="text-xs font-semibold text-stone-500">목록</div>
        <FolderSelect folders={folders} value={r.folderId} onChange={(v) => setR({ ...r, folderId: v, folder: "" })} />
        <div className="text-xs font-semibold text-stone-500">쇼핑몰</div>
        <Chips
          list={shops}
          value={r.shop || ""}
          onChange={(v) => setR({ ...r, shop: v })}
          addLabel="+ 쇼핑몰"
          addPrompt="쇼핑몰 이름 — 예: 페트리코어"
          onAdd={(t) => {
            onAddTag("shops", t);
            setR({ ...r, shop: t });
          }}
        />
        <div className="text-xs font-semibold text-stone-500">컷 종류</div>
        <CutPicker
          tags={tags}
          value={r.cuts || []}
          onChange={(v) => setR({ ...r, cuts: v })}
          onAdd={(t) => {
            onAddTag("cuts", t);
            setR({ ...r, cuts: [...(r.cuts || []), t] });
          }}
        />
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
/**
 * 여러 장 고르기 (10/3 세원: "체크박스 만들어서 한 번에 옮길 수 있게. 마우스 꾹 누르고 드래그, 쉬프트 누르고 한 번에, 컨트롤 누르고 각각")
 * 윈도우 탐색기처럼 — 빈 곳·사진 위 어디서든 눌러 끌면 네모 안 사진이 잡힌다(Ctrl 누른 채면 더하기).
 * 클릭: Ctrl = 하나씩 넣고 빼기 · Shift = 마지막에 누른 것부터 여기까지 · 고른 게 있으면 그냥 눌러도 넣고 빼기(없으면 크게 보기).
 * 폰: 사진을 꾹 누르면 고르기 시작. Esc = 해제, Ctrl+A = 보이는 것 전부.
 */
function useMarquee(gridRef, ids, picked, setPicked) {
  const [box, setBox] = useState(null); // {x, y, w, h} 화면 기준
  const drag = useRef(null);
  const moved = useRef(false);

  const onPointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest("button, a, input, select, label")) return;
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY + window.scrollY, add: e.ctrlKey || e.metaKey, base: new Set(picked) };
    const move = (ev) => {
      const g = drag.current;
      if (!g) return;
      const y = ev.clientY + window.scrollY;
      if (!moved.current && Math.hypot(ev.clientX - g.x, y - g.y) < 6) return;
      moved.current = true;
      ev.preventDefault();
      // 화면 끝에 닿으면 저절로 내려간다
      if (ev.clientY > window.innerHeight - 40) window.scrollBy(0, 18);
      else if (ev.clientY < 40) window.scrollBy(0, -18);
      const r = { x: Math.min(g.x, ev.clientX), y: Math.min(g.y, y), w: Math.abs(ev.clientX - g.x), h: Math.abs(y - g.y) };
      setBox({ ...r, y: r.y - window.scrollY });
      const hit = new Set(g.add ? g.base : []);
      for (const el of gridRef.current?.querySelectorAll("[data-ref]") || []) {
        const c = el.getBoundingClientRect();
        const top = c.top + window.scrollY;
        if (c.left < r.x + r.w && c.right > r.x && top < r.y + r.h && top + c.height > r.y) hit.add(el.dataset.ref);
      }
      setPicked(hit);
    };
    const up = () => {
      drag.current = null;
      setBox(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // 끌고 난 뒤 손을 떼면 click 이 한 번 더 온다 — 그건 무시
  const wasDrag = () => {
    const m = moved.current;
    moved.current = false;
    return m;
  };
  return { box, onPointerDown, wasDrag, ids };
}

function RefsView({ d, online }) {
  const [sel, setSel] = useState("all");
  const [cut, setCut] = useState("");
  const [shop, setShop] = useState(""); // "" 전체 · "__none" 쇼핑몰 없음 · 쇼핑몰 이름
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(null); // {files, folder}
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [editCats, setEditCats] = useState(false);
  const [editCuts, setEditCuts] = useState(false); // 컷 종류 편집 (10/7)
  const [dropping, setDropping] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const anchor = useRef(null);
  const grid = useRef(null);
  const press = useRef(null);

  const folders = d.folders;
  const refs = useMemo(() => d.refs.map(withFolder), [d.refs]);
  const shops = useMemo(() => shopsOf(d.tags, d.refs), [d.tags, d.refs]);
  // 쇼핑몰 빼고 거른 것 — 쇼핑몰 줄의 숫자는 지금 보는 목록·컷 안에서 센다
  const base = useMemo(() => {
    const ids = sel === "all" || sel === "none" ? null : new Set(withChildren(sel, folders));
    const n = q.trim().toLowerCase();
    return refs.filter((r) => {
      const f = folderIdOf(r, folders);
      if (sel === "none" && f) return false;
      if (ids && !ids.has(f)) return false;
      if (!hasCut(r, cut)) return false;
      return !n || `${r.memo || ""} ${(r.cuts || []).join(" ")} ${r.place || ""} ${r.shop || ""}`.toLowerCase().includes(n);
    });
  }, [refs, folders, sel, cut, q]);
  const shopCount = useMemo(() => {
    const m = {};
    for (const r of base) if (r.shop) m[r.shop] = (m[r.shop] || 0) + 1;
    return m;
  }, [base]);
  const shown = useMemo(() => (shop ? base.filter((r) => (shop === "__none" ? !r.shop : r.shop === shop)) : base), [base, shop]);
  const ids = useMemo(() => shown.map((r) => r.id), [shown]);
  const mq = useMarquee(grid, ids, picked, setPicked);
  // 목록을 바꾸면 안 보이게 된 것은 고른 데서 뺀다
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setPicked((p) => (p.size ? new Set([...p].filter((id) => ids.includes(id))) : p));
  }, [ids]);
  // 고른 게 있을 때 빈 곳(배경)을 누르면 풀린다 (10/8 세원: "드래그로 한 번에 잡고 배경 누르면 체크 풀리게")
  // 사진·단추·아래 막대·떠 있는 창을 누른 건 빼고, 눌러 끈 것(네모 잡기)도 뺀다
  useEffect(() => {
    if (!picked.size) return;
    let at = null;
    const down = (e) => {
      at = null;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest?.("[data-ref], button, a, input, select, textarea, label, [role=button], [data-keep], .sheet, .backdrop-in")) return;
      at = { x: e.clientX, y: e.clientY };
    };
    const up = (e) => {
      const a = at;
      at = null;
      if (a && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) setPicked(new Set());
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [picked.size]);
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "Escape" && picked.size) setPicked(new Set());
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyA" && ids.length) {
        e.preventDefault();
        setPicked(new Set(ids));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [picked, ids]);

  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickRange = (to, add) => {
    const a = ids.indexOf(anchor.current ?? to);
    const b = ids.indexOf(to);
    const [lo, hi] = a < 0 ? [b, b] : [Math.min(a, b), Math.max(a, b)];
    setPicked((p) => new Set([...(add ? p : []), ...ids.slice(lo, hi + 1)]));
  };
  const clickCard = (e, r, i) => {
    if (mq.wasDrag()) return;
    if (e.shiftKey) pickRange(r.id, e.ctrlKey || e.metaKey);
    else if (e.ctrlKey || e.metaKey || picked.size) {
      toggle(r.id);
      anchor.current = r.id;
    } else setView(i);
    if (!e.shiftKey) anchor.current = r.id;
  };
  // 폰 — 꾹 누르면 고르기 시작
  const touchStart = (e, r) => {
    if (e.pointerType === "mouse") return;
    clearTimeout(press.current?.t);
    press.current = {
      x: e.clientX,
      y: e.clientY,
      t: setTimeout(() => {
        press.current = { done: true };
        toggle(r.id);
        anchor.current = r.id;
        navigator.vibrate?.(15);
      }, 450),
    };
  };
  const touchMove = (e) => {
    const p = press.current;
    if (p?.t && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.t);
  };
  const touchEnd = () => clearTimeout(press.current?.t);

  const moveAll = async (folderId) => {
    const n = picked.size;
    setBusy("옮기는 중…");
    try {
      await d.saveRefs((v) => ({ ...v, items: (v.items || []).map((x) => (picked.has(x.id) ? { ...x, folderId, folder: "" } : x)) }));
      setPicked(new Set());
      setBusy(`${n}장을 '${folderId ? pathName(folderId, folders) : "미분류"}'(으)로 옮겼어요`);
      setTimeout(() => setBusy(""), 3000);
    } catch {
      setBusy("");
    }
  };
  // 고른 사진에 쇼핑몰 달기 · 빼기
  const shopAll = async (v) => {
    let name = v === "__none" ? "" : v;
    if (v === "__new") {
      const t = window.prompt("쇼핑몰 이름 — 예: 페트리코어");
      if (!t?.trim()) return;
      name = t.trim();
      addTag("shops", name);
    }
    const n = picked.size;
    setBusy("쇼핑몰 다는 중…");
    try {
      await d.saveRefs((x) => ({ ...x, items: (x.items || []).map((r) => (picked.has(r.id) ? { ...r, shop: name } : r)) }));
      setPicked(new Set());
      setBusy(name ? `${n}장에 '${name}'을(를) 달았어요` : `${n}장에서 쇼핑몰을 뺐어요`);
      setTimeout(() => setBusy(""), 3000);
    } catch {
      setBusy("");
    }
  };
  // 고른 사진의 컷을 한 번에 정하기 (10/8 세원: "사진들 선택해서 컷 종류도 한 번에") — 고른 컷 하나로 바꾼다, '컷 빼기'는 비우기
  const cutAll = async (v) => {
    let cut = v === "__none" ? "" : v;
    if (v === "__new") {
      const t = window.prompt("새 컷 이름 — 예: 뒤돌아보기");
      if (!t?.trim()) return;
      cut = t.trim();
      if (!(d.tags.cuts || []).includes(cut)) addTag("cuts", cut);
    }
    const n = picked.size;
    setBusy("컷 정하는 중…");
    try {
      await d.saveRefs((x) => ({ ...x, items: (x.items || []).map((r) => (picked.has(r.id) ? { ...r, cuts: cut ? [cut] : [] } : r)) }));
      setPicked(new Set());
      setBusy(cut ? `${n}장을 '${cutLabel(cut)}' 컷으로 정했어요` : `${n}장에서 컷을 뺐어요`);
      setTimeout(() => setBusy(""), 3000);
    } catch {
      setBusy("");
    }
  };
  const removeAll = async () => {
    if (!window.confirm(`고른 사진 ${picked.size}장을 지울까요?`)) return;
    await d.saveRefs((v) => ({ ...v, items: (v.items || []).filter((x) => !picked.has(x.id)) }));
    setPicked(new Set());
  };

  const addTag = (group, t) => d.saveTags((v) => ({ ...DEFAULT_TAGS, ...v, [group]: [...new Set([...(v[group] || DEFAULT_TAGS[group]), t])] }));
  const here = sel !== "all" && sel !== "none" ? sel : null;
  // 복사한 사진을 Ctrl+V 하면 바로 넣기 창 (10/4 세원: "레퍼런스에서 가져온 사진 복사 붙여넣기하면 넣어지게")
  useEffect(() => {
    const onPaste = (e) => {
      if (adding || e.target.closest?.("input, textarea")) return;
      const clip = clipImages(e.clipboardData);
      if (!clip.files.length && !clip.urls.length) return;
      e.preventDefault();
      filesOf(clip).then((files) => files.length && setAdding({ files, folder: here }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adding, here]);

  return (
    <div
      className="relative min-h-[70vh]"
      onDragOver={(e) => {
        const t = [...e.dataTransfer.types];
        if (!t.includes("Files") && !t.includes("text/uri-list") && !t.includes("text/html")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        // 다른 창의 사진을 바로 끌어 와도(주소로 온다) 들어가게
        const clip = clipImages(e.dataTransfer);
        setDropping(false);
        if (!clip.files.length && !clip.urls.length) return;
        e.preventDefault();
        filesOf(clip).then((files) => files.length && setAdding({ files, folder: here }));
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">촬영 레퍼런스</h2>
          <p className="mt-0.5 text-sm text-stone-500">착용샷 참고 사진을 목록별로 모아요. 사진을 복사해서 Ctrl+V 하거나 화면에 끌어다 놓으면 바로 넣을 수 있어요.</p>
          <p className="mt-0.5 hidden text-xs text-stone-400 sm:block">여러 장 고르기: 왼쪽 위 네모 · 빈 곳에서 눌러 끌어 네모로 잡기 · Ctrl(하나씩)·Shift(한 번에) 클릭 — 고른 뒤 빈 곳을 누르면 풀려요</p>
        </div>
        <button type="button" onClick={() => setAdding({ files: [], folder: here })} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <ImagePlus size={16} /> 사진 넣기
        </button>
      </div>

      <FolderBar items={refs} folders={folders} sel={sel} onSel={setSel} onEdit={() => setEditCats(true)} q={q} setQ={setQ} searchPlaceholder="메모·컷·쇼핑몰 검색">
        <div className="mt-2 border-t border-stone-100 pt-2">
          <CutFilter tags={d.tags} value={cut} onChange={setCut} onEdit={() => setEditCuts(true)} />
        </div>
        <div className="mt-2 border-t border-stone-100 pt-2">
          <ShopRow shops={shops} counts={shopCount} none={base.filter((r) => !r.shop).length} total={base.length} value={shop} onChange={setShop} />
        </div>
      </FolderBar>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          {d.refs.length ? (shop ? "이 목록·쇼핑몰에 맞는 사진이 없어요." : "이 목록에 사진이 아직 없어요.") : "사진을 여기로 끌어다 놓거나 '사진 넣기'로 참고 사진을 모아 보세요. 인스타 캡처도 돼요."}
        </p>
      ) : (
        <div ref={grid} onPointerDown={mq.onPointerDown} className="grid select-none grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((r, i) => (
            <div
              key={r.id}
              data-ref={r.id}
              onPointerDown={(e) => touchStart(e, r)}
              onPointerMove={touchMove}
              onPointerUp={touchEnd}
              onPointerCancel={touchEnd}
              onContextMenu={(e) => picked.size && e.preventDefault()}
              onClickCapture={(e) => {
                // 고르는 중이거나 Ctrl·Shift 를 누르면 사진을 크게 보지 않고 고르기
                if (e.target.closest("button, a")) return;
                if (press.current?.done) {
                  press.current = null;
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                clickCard(e, r, i);
              }}
              className={"group relative rounded-xl transition-shadow " + (picked.has(r.id) ? "ring-[3px] ring-rose-600 ring-offset-1" : "")}
            >
              <Photo url={d.urls[r.photo]} className={"aspect-[3/4] w-full rounded-xl [&_img]:pointer-events-none " + (picked.has(r.id) ? "opacity-85" : "")} />
              <button
                type="button"
                aria-label={picked.has(r.id) ? "고른 것에서 빼기" : "고르기"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) pickRange(r.id, true);
                  else toggle(r.id);
                  anchor.current = r.id;
                }}
                className={
                  "absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-sm transition-opacity " +
                  (picked.has(r.id)
                    ? "border-rose-600 bg-rose-600 text-white opacity-100"
                    : "border-white bg-black/20 text-transparent " + (picked.size ? "opacity-100" : "opacity-70 sm:opacity-0 sm:group-hover:opacity-100"))
                }
              >
                <Check size={14} strokeWidth={3} />
              </button>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1 rounded-b-xl bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6">
                {r.shop && <span className="rounded bg-rose-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">{r.shop}</span>}
                <span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-stone-800">{pathName(folderIdOf(r, folders), folders).split(" › ").pop()}</span>
                {(r.cuts || []).slice(0, 2).map((t) => (
                  <span key={t} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-stone-700">
                    {cutLabel(t)}
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

      {mq.box && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm border border-rose-500 bg-rose-500/10"
          style={{ left: mq.box.x, top: mq.box.y, width: mq.box.w, height: mq.box.h }}
        />
      )}

      {(picked.size > 0 || busy) && (
        <div data-keep className="fixed inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div className="sheet flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm shadow-xl">
            {busy && !picked.size ? (
              <span className="px-1 text-stone-700">{busy}</span>
            ) : (
              <>
                <span className="px-1 font-semibold text-stone-900">{picked.size}장 고름</span>
                <label className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 py-1.5 font-semibold text-white">
                  <FolderInput size={15} />
                  <select
                    value=""
                    disabled={!!busy}
                    onChange={(e) => e.target.value && moveAll(e.target.value === "__none" ? null : e.target.value)}
                    className="max-w-[11rem] cursor-pointer bg-transparent font-semibold text-white outline-none [&>option]:text-stone-800"
                  >
                    <option value="">목록으로 옮기기</option>
                    {ordered(folders).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                      </option>
                    ))}
                    <option value="__none">미분류</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 font-semibold text-stone-700">
                  <Store size={15} />
                  <select
                    value=""
                    disabled={!!busy}
                    onChange={(e) => e.target.value && shopAll(e.target.value)}
                    className="max-w-[9rem] cursor-pointer bg-transparent font-semibold outline-none"
                  >
                    <option value="">쇼핑몰 지정</option>
                    {shops.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__new">+ 새 쇼핑몰…</option>
                    <option value="__none">쇼핑몰 빼기</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 font-semibold text-stone-700">
                  <Crop size={15} />
                  <select value="" disabled={!!busy} onChange={(e) => e.target.value && cutAll(e.target.value)} className="max-w-[9rem] cursor-pointer bg-transparent font-semibold outline-none">
                    <option value="">컷 정하기</option>
                    {(d.tags.cuts || []).flatMap((c) => [
                      <option key={c} value={c}>
                        {c}
                      </option>,
                      ...subsOf(d.tags, c).map((x) => (
                        <option key={c + x} value={`${c}${CUT_SEP}${x}`}>
                          {`　└ ${x}`}
                        </option>
                      )),
                    ])}
                    <option value="__new">+ 새 컷…</option>
                    <option value="__none">컷 빼기</option>
                  </select>
                </label>
                <button type="button" onClick={() => setPicked(new Set(ids))} className="rounded-lg px-2 py-1.5 text-stone-600 hover:bg-stone-100">
                  전부 고르기
                </button>
                <button type="button" onClick={removeAll} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-stone-600 hover:bg-rose-50 hover:text-rose-700">
                  <Trash2 size={14} /> 지우기
                </button>
                <button type="button" onClick={() => setPicked(new Set())} aria-label="고르기 끝" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
                  <X size={16} />
                </button>
              </>
            )}
          </div>
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
          shops={shops}
          folders={folders}
          online={online}
          initialFiles={adding.files}
          initialFolder={adding.folder}
          initialShop={shop && shop !== "__none" ? shop : ""}
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
          shops={shops}
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
      {editCuts && (
        <CutEditor
          tags={d.tags}
          refs={d.refs}
          onSaveTags={d.saveTags}
          onSaveRefs={d.saveRefs}
          onClose={() => {
            setEditCuts(false);
            setCut("");
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

// ---------------------------------------------------------------- 촬영 목록 — 코디

function CodiEdit({ codi, d, onClose }) {
  const [c, setC] = useState({ name: "", itemIds: [], refIds: [], shootDate: "", memo: "", ...codi });
  const [tab, setTab] = useState("items");
  const [folder, setFolder] = useState(null);
  const [cut, setCut] = useState("");
  const [shop, setShop] = useState("");
  // 상품 찾기 (10/10 세원: "코디 만들기에서 상품을 검색하게") — 치면 입고·픽·촬영 말고 다른 단계(휴지통 빼고)까지 찾는다
  const [q, setQ] = useState("");
  const toggle = (k, id) => setC((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));
  const today = dayKey();
  const bare = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");
  const words = q.trim().split(/\s+/).filter(Boolean).map(bare);
  const items = d.items
    .map(normalize)
    .filter((x) =>
      words.length
        ? x.stage !== "trash" &&
          words.every((w) => bare([x.name, x.fullName, x.vendor, x.place, x.kind, x.colors, x.sizes, x.fabric, x.memo].join(" ")).includes(w))
        : ["arrived", "pick"].includes(x.stage) || c.itemIds.includes(x.id),
    );
  const inFolder = folder ? new Set(withChildren(folder, d.folders)) : null;
  const refs = d.refs
    .map(withFolder)
    .filter((r) => (!inFolder || inFolder.has(folderIdOf(r, d.folders))) && hasCut(r, cut) && (!shop || r.shop === shop));
  const shops = shopsOf(d.tags, d.refs);
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
        {tab === "items" && (
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && q && (e.stopPropagation(), setQ(""))}
              placeholder="상품 찾기 — 상품명 · 거래처 · 색상 (모든 단계에서)"
              className={FIELD + " pl-9 text-sm"}
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="지우기" className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700">
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {tab === "items" ? (
          items.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {items.map((x) => (
                <ItemCard key={x.id} x={x} url={d.urls[x.photo] || x.photoUrl} today={today} selectable selected={c.itemIds.includes(x.id)} onOpen={() => toggle("itemIds", x.id)} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-stone-400">
              {q ? `'${q}'에 맞는 상품이 없어요.` : "'입고·픽'이나 '촬영' 단계에 있는 상품이 여기 나와요. 다른 단계 상품은 위에서 찾아요."}
            </p>
          )
        ) : (
          <div className="space-y-2">
            <FolderSelect folders={d.folders} value={folder} onChange={setFolder} />
            <CutFilter tags={d.tags} value={cut} onChange={setCut} />
            {shops.length > 0 && <Chips list={shops} value={shop} onChange={setShop} all="쇼핑몰 전체" />}
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
            // 코디에 넣은 상품은 '촬영' 단계로(픽), 촬영일도 같이
            await d.saveItems((v) => ({
              ...v,
              items: (v.items || []).map((raw) => {
                const x = normalize(raw);
                if (!saved.itemIds.includes(x.id) || !["request", "arrived", "pick"].includes(x.stage)) return raw;
                return { ...moveTo(x, "pick", today), shootDate: saved.shootDate || x.shootDate || "" };
              }),
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
          <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-20 shrink-0 rounded-lg" />
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

function ListView({ d, online, vendors, onVendor, dealt }) {
  const [tab, setTab] = useState("items");
  const [codiEdit, setCodiEdit] = useState(null);
  const [show, setShow] = useState(null);
  const today = dayKey();

  // 코디 — 촬영 날짜가 가까운 것부터, 끝난 건 아래로
  const codis = [...d.codis].sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.shootDate || "9").localeCompare(b.shootDate || "9"));
  const days = [...new Set(d.codis.filter((c) => c.shootDate && !c.done).map((c) => c.shootDate))].sort();
  const src = (x) => d.urls[x.photo] || x.photoUrl;

  const showCodi = (c) => {
    const its = c.itemIds.map((id) => d.items.find((x) => x.id === id)).filter(Boolean);
    const rs = c.refIds.map((id) => d.refs.find((x) => x.id === id)).filter(Boolean);
    setShow({ slides: [...its.map((x) => ({ url: src(x) })), ...rs.map((r) => ({ url: d.urls[r.photo] }))], footer: `${c.name} — 상품 ${its.length}장 다음에 참고 사진 ${rs.length}장${c.memo ? ` · ${c.memo}` : ""}` });
  };

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">신상 관리</h2>
          <p className="mt-0.5 text-sm text-stone-500">샘플·사입 요청부터 입고, 픽, 촬영, 상품등록, 반납·결제까지 상품 한 장이 단계를 옮겨 다녀요.</p>
        </div>
        {tab === "codis" && (
          <button type="button" onClick={() => setCodiEdit({})} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
            <Plus size={16} /> 코디 만들기
          </button>
        )}
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
        <Pipeline d={d} online={online} vendors={vendors} onVendor={onVendor} dealt={dealt} />
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
                    // 코디 촬영이 끝나면 그 상품들은 '등록' 단계로
                    if (done)
                      await d.saveItems((v) => ({
                        ...v,
                        items: (v.items || []).map((raw) => {
                          const x = normalize(raw);
                          return c.itemIds.includes(x.id) && ["request", "arrived", "pick"].includes(x.stage) ? moveTo(x, "shot", today) : raw;
                        }),
                      }));
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {codiEdit && <CodiEdit codi={codiEdit} d={d} onClose={() => setCodiEdit(null)} />}
      {show && <Viewer slides={show.slides} footer={show.footer} onClose={() => setShow(null)} />}
    </div>
  );
}

export default function ShootPage({ view, online, vendors = [], onVendor, dealt }) {
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
      ) : view === "plan" ? (
        <ShootPlan d={d} online={online} />
      ) : (
        <ListView d={d} online={online} vendors={vendors} onVendor={onVendor} dealt={dealt} />
      )}
    </div>
  );
}

