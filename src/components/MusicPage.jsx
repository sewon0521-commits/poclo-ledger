import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Music, Play, Pause, Download, Star, Trash2, Loader2, X, ChevronDown, Upload } from "lucide-react";
import { loadKey, changeKey, upsert, remove, FIELD } from "../lib/shoot";
import { newId } from "../lib/id";
import { folderIdOf, withChildren } from "../lib/reelFolders";
import { FolderBar, CategoryEditor, FolderPicker } from "./FolderBits";
import { prepareAudio, putMusic, musicUrl, downloadMusic, removeMusic, isMediaFile, mb, mmss } from "../lib/music";

/**
 * 콘텐츠 › 음악 보관함 (lib/music.js 머리말).
 * 넣어 두면 폰·PC 어디서든 들어 보고 내려받는다. 폴더는 릴스·캐러셀과 같은 부품.
 */

const KEY = "music";
const FOLDERS_KEY = "music_folders";
const DEFAULT_FOLDERS = ["잔잔·감성", "신나는·트렌디", "효과음", "녹음"];

function Track({ item, folders, now, onPlay, onSeek, onPatch, onMove, onDelete, onDownload }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item);
  const on = now.id === item.id;
  const keep = (k) => () => draft[k] !== item[k] && onPatch({ id: item.id, [k]: draft[k] });
  const sub = [mmss(item.seconds), item.source, item.memo].filter(Boolean).join(" · ");
  return (
    <li className={"rounded-xl border bg-white " + (on ? "border-rose-300" : "border-stone-200")}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onPlay(item)}
          aria-label={on && now.playing ? "멈춤" : "듣기"}
          className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (on ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200")}
        >
          {on && now.loading ? <Loader2 size={16} className="animate-spin" /> : on && now.playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="truncate font-medium text-stone-900">{item.title || "이름 없는 음악"}</div>
          {sub && <div className="truncate text-xs text-stone-400">{sub}</div>}
        </button>
        <button
          type="button"
          onClick={() => onPatch({ id: item.id, best: !item.best })}
          aria-label="자주 쓰는 음악"
          aria-pressed={!!item.best}
          title="자주 쓰는 음악 — 맨 위로"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-stone-50"
        >
          <Star size={15} className={item.best ? "fill-amber-400 text-amber-400" : "text-stone-300"} />
        </button>
        <FolderPicker item={item} folders={folders} onMove={(id) => onMove(item.id, id)} />
        <button type="button" onClick={() => onDownload(item)} aria-label="내려받기" title="내려받기" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-50 hover:text-stone-900">
          <Download size={15} />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="자세히" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-50">
          <ChevronDown size={15} className={"transition-transform " + (open ? "rotate-180" : "")} />
        </button>
      </div>
      {on && (
        <div className="flex items-center gap-2 px-3 pb-2.5 text-[11px] text-stone-500 tabular-nums">
          <span className="w-9 text-right">{mmss(now.t) || "0:00"}</span>
          <input
            type="range"
            min={0}
            max={now.d || item.seconds || 0}
            step={0.1}
            value={now.t || 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="재생 위치"
            className="h-1 flex-1 accent-rose-700"
          />
          <span className="w-9">{mmss(now.d || item.seconds)}</span>
        </div>
      )}
      {open && (
        <div className="space-y-2 border-t border-stone-100 px-3 py-3">
          <label className="block text-xs font-medium text-stone-500">
            제목
            <input value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={keep("title")} className={FIELD + " mt-1"} />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            출처 · 저작권
            <input
              value={draft.source || ""}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              onBlur={keep("source")}
              placeholder="예: 유튜브 오디오 보관함 · 출처 표기 필요 없음"
              className={FIELD + " mt-1"}
            />
          </label>
          <label className="block text-xs font-medium text-stone-500">
            메모
            <input value={draft.memo || ""} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} onBlur={keep("memo")} placeholder="예: 니트 룩북 릴스에 씀 · 0:12부터가 좋음" className={FIELD + " mt-1"} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-stone-400">
            <span>
              {[item.key.split(".").pop().toUpperCase(), mb(item.size), item.note, item.createdAt && `${item.createdAt.slice(5, 7) * 1}/${item.createdAt.slice(8, 10) * 1} 넣음`].filter(Boolean).join(" · ")}
            </span>
            <button type="button" onClick={() => onDelete(item)} className="flex items-center gap-1 text-stone-400 hover:text-rose-700">
              <Trash2 size={12} /> 지우기
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function MusicPage({ online }) {
  const [list, setList] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState("all");
  const [q, setQ] = useState("");
  const [bestOnly, setBestOnly] = useState(false);
  const [editCats, setEditCats] = useState(false);
  const [pending, setPending] = useState([]);
  const [drag, setDrag] = useState(false);
  const [now, setNow] = useState({ id: null, playing: false, loading: false, t: 0, d: 0 });
  const audio = useRef(null);
  const file = useRef(null);
  const pendingRef = useRef(0); // 넣는 중이면 탭을 다시 봐도 목록을 새로 읽지 않는다

  const load = useCallback(async () => {
    try {
      setList((await loadKey(KEY, online)).items || []);
      let fs = (await loadKey(FOLDERS_KEY, online)).items || [];
      if (!fs.length) {
        fs = DEFAULT_FOLDERS.map((name) => ({ id: newId("f"), name, parent: null }));
        fs = (await changeKey(FOLDERS_KEY, online, (v) => ((v.items || []).length ? v : { items: fs }))).items || fs;
      }
      setFolders(fs);
    } catch {
      setMsg("음악 목록을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const v = () => document.visibilityState === "visible" && !pendingRef.current && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [load]);

  const save = async (fn) => {
    try {
      setList((await changeKey(KEY, online, fn)).items || []);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };
  const saveFolders = async (op) => {
    const next = await changeKey(FOLDERS_KEY, online, (v) => ({ ...v, items: op(v.items || []) }));
    setFolders(next.items || []);
  };

  const shown = useMemo(() => {
    const ids = sel === "all" || sel === "none" ? null : new Set(withChildren(sel, folders));
    const n = q.trim().toLowerCase();
    return list
      .filter((m) => {
        const f = folderIdOf(m, folders);
        if (sel === "none" && f) return false;
        if (ids && !ids.has(f)) return false;
        if (bestOnly && !m.best) return false;
        return !n || [m.title, m.source, m.memo].join(" ").toLowerCase().includes(n);
      })
      .sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [list, folders, sel, q, bestOnly]);
  const total = list.reduce((s, m) => s + (m.size || 0), 0);

  // 넣기 — 하나씩 차례로 (큰 영상은 소리만 뽑아 줄이느라 메모리를 쓴다)
  const add = async (files) => {
    const media = [...files].filter(isMediaFile);
    if (!media.length) {
      setMsg("음악·녹음·영상 파일만 넣을 수 있어요 (mp3 · m4a · wav · mp4 …).");
      return;
    }
    const folderId = sel !== "all" && sel !== "none" ? sel : null;
    const jobs = media.map((f) => ({ id: newId("p"), name: f.name, step: "기다리는 중…", f }));
    setPending((p) => [...p, ...jobs.map((j) => ({ id: j.id, name: j.name, step: j.step }))]);
    pendingRef.current += jobs.length;
    for (const j of jobs) {
      const step = (s) => setPending((p) => p.map((x) => (x.id === j.id ? { ...x, step: s } : x)));
      try {
        step("준비 중…");
        const a = await prepareAudio(j.f, step);
        if (a.blob.size > 50e6) throw new Error(`'${j.name}' 이 너무 커요 (${mb(a.blob.size)}). 50MB 아래로 잘라서 넣어 주세요.`);
        step(`올리는 중… ${mb(a.blob.size)}`);
        const id = newId("m");
        const key = `music/${id}.${a.ext}`;
        await putMusic(key, a.blob, a.type, online);
        await save(
          upsert({
            id,
            title: j.name.replace(/\.[^.]+$/, ""),
            key,
            type: a.type,
            size: a.blob.size,
            seconds: a.seconds,
            folderId,
            source: "",
            memo: "",
            note: a.note,
            best: false,
            createdAt: new Date().toISOString(),
          }),
        );
      } catch (e) {
        setMsg(e.message || `'${j.name}' 을 넣지 못했어요.`);
      } finally {
        pendingRef.current -= 1;
        setPending((p) => p.filter((x) => x.id !== j.id));
      }
    }
  };

  // 탐색기에서 파일 복사 → Ctrl+V 도
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable=true]")) return;
      const fs = [...(e.clipboardData?.files || [])].filter(isMediaFile);
      if (!fs.length) return;
      e.preventDefault();
      add(fs);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async (item) => {
    const a = audio.current;
    if (!a) return;
    if (now.id === item.id) {
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    setNow({ id: item.id, playing: false, loading: true, t: 0, d: item.seconds || 0 });
    try {
      const url = await musicUrl(item.key, online);
      if (!url) throw new Error("파일을 못 찾았어요. 지워졌을 수 있어요.");
      a.src = url;
      await a.play();
    } catch (e) {
      setNow({ id: null, playing: false, loading: false, t: 0, d: 0 });
      if (e?.name !== "AbortError") setMsg(e.message?.includes("파일") ? e.message : "이 음악을 틀지 못했어요. 내려받아서 들어 보세요.");
    }
  };

  const del = async (item) => {
    if (!window.confirm(`'${item.title}' 을 지울까요? 보관함에서 파일까지 지워져요.`)) return;
    if (now.id === item.id) {
      audio.current?.pause();
      setNow({ id: null, playing: false, loading: false, t: 0, d: 0 });
    }
    try {
      await removeMusic(item.key, online);
    } catch {
      /* 파일이 이미 없어도 목록은 지운다 */
    }
    await save(remove(item.id));
  };

  return (
    <div
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
      className="relative"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">음악 보관함</h2>
          <p className="mt-0.5 text-sm text-stone-500">릴스에 쓸 저작권 없는 음악·녹음을 모아 두는 곳. 넣어 두면 폰·PC 어디서든 들어 보고 내려받아요.</p>
        </div>
        <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">
          <Upload size={15} /> 음악 넣기
        </button>
      </div>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      )}

      <FolderBar
        items={list}
        folders={folders}
        sel={sel}
        onSel={setSel}
        onEdit={() => setEditCats(true)}
        q={q}
        setQ={setQ}
        bestOnly={bestOnly}
        setBestOnly={setBestOnly}
        bestCount={list.filter((m) => m.best).length}
        searchPlaceholder="제목·출처·메모 검색"
      />

      {pending.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-rose-200 bg-rose-50/40 px-3 py-2.5 text-sm">
              <Loader2 size={16} className="shrink-0 animate-spin text-rose-700" />
              <span className="min-w-0 flex-1 truncate text-stone-800">{p.name}</span>
              <span className="shrink-0 text-xs text-stone-500">{p.step}</span>
            </li>
          ))}
        </ul>
      )}

      {!loaded ? (
        <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>
      ) : shown.length ? (
        <ul className="space-y-1.5">
          {shown.map((m) => (
            <Track
              key={m.id}
              item={m}
              folders={folders}
              now={now}
              onPlay={play}
              onSeek={(t) => {
                if (audio.current) audio.current.currentTime = t;
              }}
              onPatch={(p) => save(upsert(p))}
              onMove={(id, folderId) => save(upsert({ id, folderId, folder: "" }))}
              onDelete={del}
              onDownload={(item) => downloadMusic(item, online).catch((e) => setMsg(e.message))}
            />
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-4 py-12 text-center hover:border-rose-300"
        >
          <Music size={28} className="text-rose-700" />
          <span className="font-semibold text-stone-900">{list.length ? "이 폴더·검색에 맞는 음악이 없어요" : "음악을 넣어 보세요"}</span>
          <span className="text-sm text-stone-500">끌어다 놓기 · 눌러서 고르기 · 탐색기에서 복사해 Ctrl+V — mp3·m4a 는 그대로, 녹음·영상·WAV 는 소리만 작게 줄여서 넣어요</span>
        </button>
      )}

      {list.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-stone-400">
          {list.length}곡 · 합계 {mb(total)} · 끌어다 놓거나 Ctrl+V 로 더 넣을 수 있어요. 보고 있는 폴더로 들어가요.
        </p>
      )}

      {drag && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-rose-700/10">
          <div className="rounded-2xl border-2 border-dashed border-rose-400 bg-white px-8 py-6 text-center font-semibold text-rose-800 shadow-lg">여기에 놓으면 음악 보관함에 넣어요</div>
        </div>
      )}

      {editCats && (
        <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setEditCats(false)} className="absolute inset-0 cursor-default" />
          <div className="sheet relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <CategoryEditor items={list} folders={folders} onChange={saveFolders} onClose={() => setEditCats(false)} openKey="poclo_music_cats_open" noun="음악" topHint="상위 폴더 이름 — 예: 잔잔·감성" />
          </div>
        </div>
      )}

      <audio
        ref={audio}
        onPlay={() => setNow((n) => ({ ...n, playing: true, loading: false }))}
        onPause={() => setNow((n) => ({ ...n, playing: false }))}
        onEnded={() => setNow((n) => ({ ...n, playing: false, t: 0 }))}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime; // 이벤트는 바로 비워지므로 먼저 읽는다
          setNow((n) => ({ ...n, t }));
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setNow((n) => ({ ...n, d: Number.isFinite(d) ? d : n.d }));
        }}
        className="hidden"
      />
      <input
        ref={file}
        type="file"
        accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.mp4,.mov"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          if (fs.length) add(fs);
        }}
      />
    </div>
  );
}
