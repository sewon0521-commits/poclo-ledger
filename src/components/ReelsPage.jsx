import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Upload,
  Wand2,
  Trash2,
  Info,
  Loader2,
  Link2,
  Play,
  Search,
  X,
  Sparkles,
  Heart,
  Zap,
  Pencil,
  Plus,
  ChevronRight,
  RotateCw,
  Video,
  ExternalLink,
  TrendingUp,
  Mic,
  GripVertical,
  FolderInput,
  Check,
} from "lucide-react";
import { extractFrames } from "../lib/video";
import { readScript, adaptScript, fillTemplate, splitTemplate } from "../lib/reels";
import LookPicker from "./LookPicker";
import { emptyLook } from "../lib/looks";
import { newId } from "../lib/id";
import {
  seedFolders,
  folderIdOf,
  childrenOf,
  withChildren,
  pathName,
  folderCounts,
  moveFolder,
} from "../lib/reelFolders";
import { Empty } from "./ui";
import ProductReelTab from "./ProductReel";
import { CopyButton, WorkerStatus, EditableTitle } from "./ContentBits";
import { workerAlive } from "../lib/reels";

/**
 * 릴스 기획 — 레퍼런스를 모으고(라이브러리), 그 구조로 우리 상품 대본을 만든다.
 *
 * 2026-09-17: 영상 파일 → 장면 사진 → 대본·구조 → 빈칸 틀 → 우리 상품으로 채우기.
 * 2026-09-22 (세원: "인스타 링크만 넣으면 되게, 우리가 찍은 영상도 첨부, 폴더는 상위→하위"):
 *  - **인스타 링크**만 넣으면 사무실 PC 분석기(poclo-cafe24/reels_worker.py)가 영상을 받아
 *    장면을 뜨고 **소리까지 받아써서** 분석한다. 계정·좋아요·댓글·캡션으로 성과도 본다.
 *  - 영상 파일도 분석기로 보낸다(소리 받아쓰기 때문). 분석기가 꺼져 있으면 예전처럼
 *    브라우저에서 바로(소리 없이) 할 수 있다.
 *  - **우리 영상** 탭: 우리가 찍은 영상을 올리면 레퍼런스·기획과 비교해 고칠 점을 준다.
 *  - 폴더는 상위 → 하위 한 단계. '카테고리 편집'에서 만든다.
 *
 * 영상·썸네일은 Supabase Storage('reels' 버킷), 기획 내용은 settings 의 'reels' 키.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const KINDS = ["자막형", "목소리형", "자막+목소리"];
const MAX_VIDEO = 40 * 1024 * 1024;

const isLink = (s) => /^https?:\/\/(www\.)?(instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be)\//i.test(s.trim());
const num = (n) => (n == null ? "—" : new Intl.NumberFormat("ko-KR").format(n));

// ------------------------------------------------------------- 넣기 (링크 · 파일)

function AddBar({ worker, onLink, onFile, onBrowser, onKeep, notice }) {
  const [tab, setTab] = useState("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [memo, setMemo] = useState("");
  const [kind, setKind] = useState("자막형");
  const [transcript, setTranscript] = useState("");
  const [over, setOver] = useState(false);
  const [step, setStep] = useState("");
  // 실루엣 잘 나온 영상처럼 **보관만** 할 때 (세원 9/23: "저장 목적으로 저장하는 영상들이 있긴하거든")
  const [keepOnly, setKeepOnly] = useState(false);
  const busy = !!step;
  const alive = workerAlive(worker);

  const wrap = async (label, fn) => {
    setStep(label);
    try {
      const ok = await fn();
      if (ok !== false) {
        setUrl("");
        setFile(null);
        setMemo("");
        setTranscript("");
      }
    } finally {
      setStep("");
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) {
          setTab("file");
          setFile(f);
        }
      }}
      className={
        "mb-4 rounded-2xl border p-4 transition " +
        (over ? "border-rose-500 bg-rose-50" : "border-stone-200 bg-white")
      }
    >
      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["link", "인스타 링크", Link2],
          ["file", "영상 파일", Upload],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium " +
              (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")
            }
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "link" ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
            className={FIELD + " min-w-0 flex-1 text-sm"}
          />
          <button
            type="button"
            disabled={busy || !isLink(url)}
            onClick={() => wrap("맡기는 중…", () => onLink(url.trim(), memo))}
            className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {busy ? step : "분석 맡기기"}
          </button>
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <Upload size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-stone-800">
                {file ? file.name : "릴스 영상을 끌어다 놓거나 눌러서 고르기"}
              </span>
              <span className="block text-[11px] text-stone-400">
                mp4 · mov — 40MB까지 보관. 분석기가 소리까지 받아써요
              </span>
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setFile(f);
              }}
            />
          </label>
          {file && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
              <label className="flex w-full cursor-pointer items-center gap-2 text-xs text-stone-600">
                <input type="checkbox" checked={keepOnly} onChange={(e) => setKeepOnly(e.target.checked)} className="accent-rose-700" />
                분석 없이 보관만 — 실루엣·참고용으로 모아 두는 영상 (폴더에 담기고 대본은 안 뽑아요)
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  keepOnly
                    ? wrap("보관하는 중…", () => onKeep(file, memo))
                    : wrap("영상 올리는 중…", () => onFile(file, memo))
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 font-semibold text-white disabled:bg-stone-300"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
                {busy ? step : keepOnly ? "보관만 하기" : "올려서 분석 맡기기 (소리 포함)"}
              </button>
              {!alive && !keepOnly && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    wrap("브라우저에서 분석 중…", () =>
                      onBrowser(file, { memo, kind, transcript }, setStep),
                    )
                  }
                  className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-medium text-stone-600 disabled:opacity-50"
                  title="사무실 PC 분석기 없이 지금 바로 — 소리는 못 들어요"
                >
                  PC 없이 지금 (소리 제외)
                </button>
              )}
            </div>
          )}
          {file && !alive && (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-stone-400">'PC 없이'로 할 때 형태:</span>
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      "rounded-md border px-2 py-1 text-xs " +
                      (kind === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 text-stone-600")
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
              {kind !== "자막형" && (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="소리는 못 읽어요. 인스타 자동자막을 복사해 넣으면 합쳐서 정리해요 (선택)"
                  className={FIELD + " mt-2 h-16 resize-y text-sm"}
                />
              )}
            </div>
          )}
        </>
      )}

      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (선택) — 예: 어반몬드 · 조회수 80만"
        className={FIELD + " mt-2 text-sm"}
      />
      <WorkerStatus worker={worker} />
      {notice && <p className="mt-2 text-sm text-rose-700">{notice}</p>}
    </div>
  );
}

// ------------------------------------------------------------- 폴더 줄 · 카테고리 편집

function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium " +
        (active ? "bg-rose-700 text-white" : "border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100")
      }
    >
      {children}
      {count != null && <span className={active ? "text-rose-200" : "text-stone-400"}>{count}</span>}
    </button>
  );
}

function FolderBar({ items, folders, sel, onSel, onEdit, q, setQ }) {
  const { total, none } = useMemo(() => folderCounts(items, folders), [items, folders]);
  const tops = folders.filter((f) => !f.parent);
  const selFolder = folders.find((f) => f.id === sel);
  const openParent = selFolder ? selFolder.parent || selFolder.id : null;
  const kids = openParent ? childrenOf(openParent, folders) : [];

  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 w-8 shrink-0 text-xs text-stone-400">폴더</span>
          <Chip active={sel === "all"} onClick={() => onSel("all")} count={items.length}>
            전체
          </Chip>
          {none > 0 && (
            <Chip active={sel === "none"} onClick={() => onSel("none")} count={none}>
              미분류
            </Chip>
          )}
          {tops.map((f) => (
            <Chip
              key={f.id}
              active={sel === f.id || selFolder?.parent === f.id}
              onClick={() => onSel(f.id)}
              count={total.get(f.id) || 0}
            >
              {f.name}
              {childrenOf(f.id, folders).length > 0 && <ChevronRight size={12} className="opacity-60" />}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
        >
          <Pencil size={12} /> 카테고리 편집
        </button>
      </div>

      {kids.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2">
          <span className="mr-1 w-8 shrink-0 text-xs text-stone-400">하위</span>
          <Chip active={sel === openParent} onClick={() => onSel(openParent)}>
            전부
          </Chip>
          {kids.map((k) => (
            <Chip key={k.id} active={sel === k.id} onClick={() => onSel(k.id)} count={total.get(k.id) || 0}>
              {k.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="relative mt-2">
        <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="대본·계정·상품 검색"
          className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-8 text-sm sm:w-60"
        />
      </div>
    </div>
  );
}

/** 한 줄 이름 고치기 / 새로 만들기 칸 */
function NameInput({ initial = "", placeholder, onDone, onCancel }) {
  const [v, setV] = useState(initial);
  // 엔터로 끝내면 칸이 사라지면서 blur 가 한 번 더 올 수 있다 — 두 번 저장하지 않게
  const settled = useRef(false);
  const finish = (save) => {
    if (settled.current) return;
    settled.current = true;
    if (save && v.trim() && v.trim() !== initial) onDone(v.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 rounded-md border border-rose-500 px-2 py-1 text-sm outline-none"
    />
  );
}

function CategoryEditor({ items, folders, onChange, onClose }) {
  // editing: {id} 이름 고치기 | {parent} 하위 새로 | {top:true} 상위 새로
  const [editing, setEditing] = useState(null);
  const { total } = useMemo(() => folderCounts(items, folders), [items, folders]);
  const tops = folders.filter((f) => !f.parent);

  const rename = (id, name) =>
    onChange((list) =>
      list.map((f) =>
        f.id === id ? { ...f, name, aka: [...new Set([...(f.aka || []), f.name])] } : f,
      ),
    );
  const add = (name, parent = null) =>
    onChange((list) => [...list, { id: newId("f"), name, parent }]);
  const remove = (f) => {
    const n = total.get(f.id) || 0;
    const kids = childrenOf(f.id, folders).length;
    const msg =
      `'${f.name}' 폴더를 지울까요?` +
      (kids ? `\n하위 폴더 ${kids}개도 같이 지워져요.` : "") +
      (n ? `\n안에 든 릴스 ${n}개는 지워지지 않고 미분류로 가요.` : "");
    if (window.confirm(msg)) onChange((list) => list.filter((x) => x.id !== f.id && x.parent !== f.id));
  };
  const done = () => setEditing(null);

  // 끌어서 옮기기 — drag: 끄는 폴더 id, over: {id, pos} 놓일 자리(빨간 줄로 보여준다)
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const dragged = folders.find((f) => f.id === drag);
  const posOf = (e, f) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    // 하위를 상위 줄 위에 놓으면 그 상위 안으로
    if (dragged?.parent && !f.parent) return "inside";
    return y < 0.5 ? "before" : "after";
  };
  const drop = () => {
    if (drag && over) onChange((list) => moveFolder(list, drag, over.id, over.pos));
    setDrag(null);
    setOver(null);
  };

  const row = (f, child) => (
    <li
      key={f.id}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", f.id);
        setDrag(f.id);
      }}
      onDragOver={(e) => {
        if (!drag || drag === f.id) return;
        e.preventDefault();
        const pos = posOf(e, f);
        if (over?.id !== f.id || over?.pos !== pos) setOver({ id: f.id, pos });
      }}
      onDragLeave={() => over?.id === f.id && setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        drop();
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
      className={
        "group flex cursor-grab items-center gap-2 rounded-lg border-y-2 px-3 py-2 hover:bg-stone-50 active:cursor-grabbing " +
        (child ? "pl-8 " : "") +
        (drag === f.id ? "opacity-40 " : "") +
        (over?.id === f.id && over.pos === "before"
          ? "border-t-rose-500 border-b-transparent"
          : over?.id === f.id && over.pos === "after"
            ? "border-t-transparent border-b-rose-500"
            : over?.id === f.id && over.pos === "inside"
              ? "border-transparent bg-rose-50 ring-2 ring-rose-300"
              : "border-transparent")
      }
    >
      <GripVertical size={13} className="shrink-0 text-stone-300 group-hover:text-stone-500" />
      {child && <span className="text-stone-300">└</span>}
      {editing?.id === f.id ? (
        <NameInput
          initial={f.name}
          onDone={(v) => {
            rename(f.id, v);
            done();
          }}
          onCancel={done}
        />
      ) : (
        <span className={"min-w-0 flex-1 truncate text-sm " + (child ? "text-stone-700" : "font-semibold text-stone-900")}>
          {f.name}
        </span>
      )}
      <span className="w-6 text-right text-xs text-stone-400 tabular-nums">{total.get(f.id) || 0}</span>
      <span className="flex items-center gap-0.5 text-stone-400">
        <button type="button" onClick={() => setEditing({ id: f.id })} aria-label="이름 고치기" className="rounded p-1 hover:bg-stone-200 hover:text-stone-700">
          <Pencil size={13} />
        </button>
        {!child && (
          <button type="button" onClick={() => setEditing({ parent: f.id })} aria-label="하위 폴더 만들기" className="rounded p-1 hover:bg-stone-200 hover:text-stone-700">
            <Plus size={14} />
          </button>
        )}
        <button type="button" onClick={() => remove(f)} aria-label="지우기" className="rounded p-1 hover:bg-stone-200 hover:text-rose-600">
          <Trash2 size={13} />
        </button>
      </span>
    </li>
  );

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-stone-900">카테고리 편집</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            상위 폴더 아래에 하위 폴더를 둘 수 있어요 · 줄을 끌어서 순서를 바꾸고, 하위 폴더는 다른 상위로 옮겨요
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tops.map((f) => (
          <div key={f.id}>
            {row(f, false)}
            {childrenOf(f.id, folders).map((c) => row(c, true))}
            {editing?.parent === f.id && (
              <li className="flex items-center gap-2 py-1.5 pr-3 pl-8">
                <span className="text-stone-300">└</span>
                <NameInput
                  placeholder="하위 폴더 이름 — 예: [팬츠] 설명 영상"
                  onDone={(v) => {
                    add(v, f.id);
                    done();
                  }}
                  onCancel={done}
                />
              </li>
            )}
          </div>
        ))}
        {editing?.top && (
          <li className="flex items-center gap-2 px-3 py-1.5">
            <NameInput
              placeholder="상위 폴더 이름 — 예: 판매형 릴스 (메타광고)"
              onDone={(v) => {
                add(v);
                done();
              }}
              onCancel={done}
            />
          </li>
        )}
      </ul>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button
          type="button"
          onClick={() => setEditing({ top: true })}
          className="w-full rounded-xl border border-dashed border-rose-300 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          + 새 상위 폴더
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ 카드

/** 분석 진행 상황 — 분석기가 일감 목록에 적는 단계(step)가 있으면 그걸 보여준다 */
function statusOf(item, queue, target = "ref") {
  const q = queue.find((j) => j.id === item.id && j.target === target);
  const job = target === "ours" ? item.ours?.job : item.job;
  if (q?.status === "working") return { kind: "working", text: q.step || "분석 중" };
  if (q) return { kind: "queued", text: "분석 대기 중" };
  if (job?.status === "error") return { kind: "error", text: job.message || "분석 실패" };
  if (job?.status === "queued") return { kind: "queued", text: "분석 대기 중" };
  return { kind: "done" };
}

/**
 * 카드 밖에서 바로 폴더 옮기기 (세원 9/22: "얘네처럼 밖에서 폴더를 지정했으면") —
 * 카드 오른쪽 아래 폴더 아이콘 → 작은 목록 → 누르면 그 폴더로.
 */
function FolderPicker({ item, folders, onMove }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const current = folderIdOf(item, folders);
  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (id) => {
    setOpen(false);
    if (id !== current) onMove(id);
  };
  const tops = folders.filter((f) => !f.parent);
  return (
    <span ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="폴더 옮기기"
        title="폴더 옮기기"
        className={
          "flex h-7 w-7 items-center justify-center rounded-md border " +
          (open ? "border-rose-300 bg-rose-50 text-rose-700" : "border-transparent text-stone-400 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-700")
        }
      >
        <FolderInput size={15} />
      </button>
      {open && (
        <span className="absolute right-0 bottom-8 z-30 block max-h-72 w-56 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 text-left shadow-lg">
          <span className="block px-3 pt-1.5 pb-1 text-[11px] font-semibold text-stone-400">어느 폴더로?</span>
          {[{ id: null, name: "미분류" }, ...tops.flatMap((f) => [f, ...childrenOf(f.id, folders)])].map((f) => (
            <button
              key={f.id || "none"}
              type="button"
              onClick={() => pick(f.id)}
              className={
                "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-stone-50 " +
                (f.parent ? "pl-7 text-stone-600 " : "font-medium text-stone-800 ") +
                (f.id === current ? "bg-rose-50 text-rose-800" : "")
              }
            >
              {f.parent && <span className="text-stone-300">└</span>}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {f.id === current && <Check size={13} className="shrink-0 text-rose-700" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function Card({ item, thumbUrl, folderName, status, onOpen, folders, onMove }) {
  const r = item.reference || {};
  const pending = status.kind !== "done";
  return (
    <div className="rounded-xl border border-stone-200 bg-white transition hover:border-stone-300 hover:shadow-sm">
      <button type="button" onClick={() => onOpen(item)} className="block w-full overflow-hidden rounded-t-xl text-left">
      <span className="relative block aspect-[3/4] bg-stone-100">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-stone-300">
            {pending && status.kind !== "error" ? <Loader2 size={24} className="animate-spin" /> : <Clapperboard size={28} />}
          </span>
        )}
        <span
          className={
            "absolute top-2 left-2 max-w-[85%] truncate rounded px-1.5 py-0.5 text-[10px] font-medium " +
            (status.kind === "error"
              ? "bg-rose-600 text-white"
              : pending
                ? "bg-amber-400 text-amber-950"
                : "bg-white/90 text-stone-600")
          }
        >
          {pending ? status.text : item.keepOnly ? "보관만" : item.plan ? "대본 완성" : "분석 완료"}
        </span>
        {item.ours && (
          <span className="absolute top-2 right-2 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            우리 영상
          </span>
        )}
        {item.hasVideo && !pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white">
              <Play size={16} />
            </span>
          </span>
        )}
        {r.structure?.hookType && (
          <span className="absolute bottom-2 left-2 max-w-[90%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
            {r.structure.hookType}
          </span>
        )}
      </span>
      </button>
      <div className="flex items-center gap-1 px-3 py-2">
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-stone-900">{item.title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-stone-400">
            {folderName}
            {item.meta?.uploader && ` · @${item.meta.uploader}`}
            {item.plan?.product?.name && ` · ${item.plan.product.name}`}
          </span>
        </button>
        <FolderPicker item={item} folders={folders} onMove={onMove} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- 상세 · 대본 만들기

function Meta({ meta }) {
  if (!meta) return null;
  const cells = [
    ["좋아요", num(meta.likes)],
    ["댓글", num(meta.comments)],
    ["조회수", meta.views != null ? num(meta.views) : "못 가져옴"],
    ["게시일", meta.postedAt || "—"],
  ];
  return (
    <div className="mt-2 rounded-lg bg-stone-800 p-2 text-[11px] text-stone-300">
      {meta.uploader && <div className="mb-1 truncate font-medium text-white">@{meta.uploader}</div>}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {cells.map(([k, v]) => (
          <span key={k} className="flex justify-between gap-1">
            <span className="text-stone-400">{k}</span>
            <span className="tabular-nums">{v}</span>
          </span>
        ))}
      </div>
      {meta.url && (
        <a href={meta.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-sky-300 hover:underline">
          <ExternalLink size={11} /> 원본 릴스 열기
        </a>
      )}
    </div>
  );
}

function Detail({ item, urls, folders, queue, onSave, onRemove, onClose, onRetry, onOurs, stats }) {
  const r = item.reference || {};
  const status = statusOf(item, queue);
  const [tab, setTab] = useState(item.plan ? "write" : "script");
  // 룩 단위로 상품을 담는다 (9/23). 예전에 주소 하나로 만든 기획은 그 주소를 룩 1 로 옮긴다.
  const [looks, setLooks] = useState(() =>
    item.looks?.length
      ? item.looks
      : [emptyLook(item.productUrl ? [{ url: item.productUrl, name: "예전에 넣은 상품" }] : [])],
  );
  const [memo, setMemo] = useState(item.planMemo || "");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filled, setFilled] = useState(item.filled || item.plan?.filled || []);
  const [plan, setPlan] = useState(item.plan || null);

  const value = (key) => filled.find((f) => f.key === key)?.value || "";
  const setValue = (key, v) => {
    const next = filled.some((f) => f.key === key)
      ? filled.map((f) => (f.key === key ? { ...f, value: v } : f))
      : [...filled, { key, value: v }];
    setFilled(next);
    onSave({ ...item, filled: next });
  };

  const done = fillTemplate(r.template, filled);
  const folderId = folderIdOf(item, folders);

  const run = async (again = false) => {
    setMsg("");
    setBusy(true);
    try {
      const res = await adaptScript({
        reference: r,
        looks,
        memo,
        // 다시 만들 때는 앞서 나온 훅·대본을 피한다 (9/23 세원: "대본을 아예 갈아엎을 수 있게")
        avoid: again ? `${plan?.hook || ""}\n${plan?.script || ""}` : "",
        direction: again ? direction : "",
      });
      if (!res.ok) {
        setMsg(res.message);
        return;
      }
      setPlan(res.data);
      setFilled(res.data.filled || []);
      onSave({
        ...item,
        plan: res.data,
        filled: res.data.filled || [],
        looks,
        planMemo: memo,
        productUrl: looks[0]?.products?.[0]?.url || "",
      });
      setDirection("");
      setTab("write");
    } finally {
      setBusy(false);
    }
  };

  const TABS = [
    ["script", "원본 대본"],
    ["struct", "구조분석"],
    ["write", "대본 만들기"],
    ["ours", "우리 영상"],
  ];

  return (
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <EditableTitle value={item.title} onChange={(t) => onSave({ ...item, title: t })} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {r.structure?.hookType && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{r.structure.hookType}</span>
            )}
            {r.kind && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{r.kind}</span>}
            {r.seconds > 0 && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{r.seconds}초</span>
            )}
            <select
              value={folderId || ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const f = folders.find((x) => x.id === id);
                // 이름도 같이 적어 둔다 — 폴더를 처음 저장하기 전(기본 갈래)에도 이름으로 찾을 수 있게
                onSave({ ...item, folderId: id, folder: f && !f.parent ? f.name : "" });
              }}
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-stone-600"
            >
              <option value="">미분류</option>
              {folders
                .filter((f) => !f.parent)
                .flatMap((f) => [f, ...childrenOf(f.id, folders)])
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.parent ? `　└ ${f.name}` : f.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto sm:grid-cols-[minmax(0,260px)_1fr]">
        <div className="bg-stone-900 p-2">
          {urls.video ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={urls.video} controls playsInline className="w-full rounded-lg" />
          ) : urls.thumb ? (
            <img src={urls.thumb} alt="" className="w-full rounded-lg" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-1 px-3 text-center text-sm text-stone-500">
              {status.kind === "done" ? "영상이 보관되지 않았어요" : status.text}
              {status.kind === "done" && (
                <span className="text-[11px] text-stone-600">보관함(SQL)이 생긴 뒤 넣은 영상부터 보여요</span>
              )}
            </div>
          )}
          <Meta meta={item.meta} />
        </div>

        <div className="min-w-0 p-4">
          {status.kind !== "done" ? (
            <div
              className={
                "rounded-xl border px-4 py-5 text-sm " +
                (status.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900")
              }
            >
              <div className="flex items-center gap-2 font-semibold">
                {status.kind === "error" ? <Info size={15} /> : <Loader2 size={15} className="animate-spin" />}
                {status.text}
              </div>
              {status.kind === "error" ? (
                <button
                  type="button"
                  onClick={() => onRetry(item, "ref")}
                  className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white"
                >
                  <RotateCw size={13} /> 다시 분석 맡기기
                </button>
              ) : (
                <p className="mt-1 text-xs opacity-80">
                  링크 받기 → 장면 뜨기 → 소리 받아쓰기 → 대본·구조 분석 순서로 해요. 보통 1~2분. 창을 닫아도 계속돼요.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
                {TABS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={
                      "flex-1 rounded-lg py-2 font-medium " +
                      (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "script" && (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-stone-500">자동으로 뽑은 대본</span>
                    <CopyButton text={r.script || ""} />
                  </div>
                  <p className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
                    {r.script}
                  </p>
                  {item.transcript && (
                    <details className="mt-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-stone-500">
                        <Mic size={12} /> 자동 받아쓰기 원문 (기계가 들은 그대로)
                      </summary>
                      <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-stone-600">{item.transcript}</p>
                    </details>
                  )}
                  {item.meta?.caption && (
                    <details className="mt-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
                      <summary className="cursor-pointer text-xs font-semibold text-stone-500">원본 캡션(본문)</summary>
                      <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-stone-600">{item.meta.caption}</p>
                    </details>
                  )}
                  {r.scenes?.length > 0 && (
                    <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
                      {r.scenes.map((s, i) => (
                        <li key={i} className="flex gap-3 px-3 py-2">
                          <span className="w-14 shrink-0 text-xs text-stone-400">{s.at}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-stone-700">{s.visual}</span>
                            {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.note && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-800">
                      <Info size={13} className="mt-0.5 shrink-0" />
                      {r.note}
                    </p>
                  )}
                </>
              )}

              {tab === "struct" && (
                <>
                  {(r.performance?.summary || r.performance?.signals?.length > 0) && (
                    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                        <TrendingUp size={13} /> 성과 분석
                      </div>
                      {r.performance.summary && (
                        <p className="mt-1 text-sm leading-relaxed text-sky-950">{r.performance.summary}</p>
                      )}
                      {r.performance.signals?.length > 0 && (
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-sky-900">
                          {r.performance.signals.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {r.empathy && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                        <Heart size={13} /> 공감 포인트
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-amber-900">{r.empathy}</p>
                    </div>
                  )}
                  {r.hookFormula?.line && (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900">
                        <Zap size={13} /> 후킹 공식
                      </div>
                      <p className="mt-1 text-sm font-semibold text-rose-900">{r.hookFormula.line}</p>
                      <p className="mt-1 text-xs leading-relaxed text-rose-800">
                        A = {r.hookFormula.a} / B = {r.hookFormula.b}
                        <br />
                        {r.hookFormula.why}
                      </p>
                    </div>
                  )}
                  {r.lines?.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-stone-500">문장별 분석</div>
                      {r.lines.map((l, i) => (
                        <div key={i} className="rounded-xl border border-stone-200 px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                              {l.role}
                            </span>
                            <span className="text-sm font-medium text-stone-900">{l.text}</span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-stone-500">{l.why}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-relaxed text-stone-700">
                    {r.structure?.flow}
                    <span className="mt-1 block text-xs text-stone-500">
                      CTA: {r.structure?.cta} · {r.structure?.whyItWorks}
                    </span>
                  </p>
                </>
              )}

              {tab === "write" && (
                <>
                  <div className="space-y-2 rounded-xl border border-stone-200 p-3">
                    <LookPicker stats={stats} looks={looks} onChange={setLooks} label="이 릴스에 나올 우리 상품" />
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="메모 · 후킹 아이디어 (여기 적은 건 훅·대본에 최우선으로 반영해요) — 예: '이 가격에 이 원단?' 으로 시작"
                      className={FIELD + " h-16 resize-y text-sm"}
                    />
                    <button
                      type="button"
                      disabled={!looks.some((l) => l.products.length) || busy}
                      onClick={() => run(false)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-700 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      {busy ? "만드는 중… (1분쯤)" : plan ? "이 내용으로 다시 만들기" : "이 상품으로 대본 만들기"}
                    </button>
                    {plan && (
                      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2">
                        <input
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                          placeholder="다른 방향으로 — 예: 정보형으로, 가격 빼고, 더 짧게 (비우면 완전히 다른 각도)"
                          className={FIELD + " min-w-0 flex-1 text-sm"}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
                          title="앞서 만든 훅·대본은 피하고 새로 뽑아요"
                        >
                          <RotateCw size={14} /> 갈아엎기
                        </button>
                      </div>
                    )}
                    {msg && <p className="text-sm text-rose-700">{msg}</p>}
                  </div>

                  {r.template && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-500">틀 — 노란 칸을 눌러 고칠 수 있어요</span>
                        <CopyButton text={done} label="완성 대본 복사" />
                      </div>
                      <div className="space-y-1.5 rounded-xl border border-stone-200 p-3">
                        {r.template.split("\n").filter(Boolean).map((line, i) => {
                          const at = (line.match(/^\[([^\]]+)\]\s*/) || [])[1] || "";
                          const rest = line.replace(/^\[[^\]]+\]\s*/, "");
                          return (
                            <div key={i} className="flex gap-2 text-sm">
                              {at && <span className="w-12 shrink-0 pt-1 text-xs text-stone-400">{at}</span>}
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 leading-7">
                                {splitTemplate(rest).map((part, j) =>
                                  part.slot ? (
                                    <SlotChip
                                      key={j}
                                      slot={r.slots?.find((s) => s.key === part.slot) || { key: part.slot }}
                                      value={value(part.slot)}
                                      onChange={(v) => setValue(part.slot, v)}
                                    />
                                  ) : (
                                    <span key={j} className="text-stone-800">
                                      {part.text}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {plan && (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                        <div className="text-xs font-semibold text-stone-500">
                          {plan.product?.name} {plan.product?.price}
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-700">
                          {(plan.product?.points || []).map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                        {plan.product?.cautions && (
                          <p className="mt-1.5 text-xs text-amber-800">{plan.product.cautions}</p>
                        )}
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-500">AI가 새로 쓴 대본</span>
                          <CopyButton text={plan.script || ""} />
                        </div>
                        <p className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
                          {plan.script}
                        </p>
                      </div>

                      {plan.scenes?.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-xs font-semibold text-stone-500">촬영 코멘트</div>
                          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
                            {plan.scenes.map((s, i) => (
                              <li key={i} className="flex gap-3 px-3 py-2">
                                <span className="w-14 shrink-0 text-xs text-stone-400">{s.at}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-stone-700">{s.shot}</span>
                                  {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-500">인스타 본문</span>
                          <CopyButton text={`${plan.caption}\n\n${(plan.hashtags || []).join(" ")}`} label="본문 복사" />
                        </div>
                        <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">{plan.caption}</p>
                        <p className="mt-1.5 text-xs text-stone-500">{(plan.hashtags || []).join(" ")}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "ours" && (
                <OursTab item={item} queue={queue} ourUrl={urls.ours} onUpload={onOurs} onRetry={onRetry} />
              )}
            </>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`${item.title} 을(를) 라이브러리에서 지울까요?`)) {
              onRemove(item.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
        >
          <Trash2 size={13} /> 지우기
        </button>
        <span className="text-xs text-stone-400">고친 내용은 바로 저장돼요</span>
      </footer>
    </div>
  );
}

/** 우리가 찍은 영상 — 올리면 레퍼런스·기획과 비교해 고칠 점을 받는다 */
function OursTab({ item, queue, ourUrl, onUpload, onRetry }) {
  const ours = item.ours;
  const status = ours ? statusOf(item, queue, "ours") : null;
  const [file, setFile] = useState(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const rv = ours?.review;

  const picker = (
    <div className="rounded-xl border border-dashed border-stone-300 p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <Video size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-800">
            {file ? file.name : ours ? "다른 영상으로 바꾸기" : "우리가 찍은 영상 올리기"}
          </span>
          <span className="block text-[11px] text-stone-400">
            이 레퍼런스(와 만든 대본)에 비춰서 올리기 전에 고칠 점을 알려줘요 · 40MB까지
          </span>
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setFile(f);
          }}
        />
      </label>
      {file && (
        <>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 (선택) — 예: 1차 편집본, 자막 아직 없음"
            className={FIELD + " mt-2 text-sm"}
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await onUpload(item, file, memo)) setFile(null);
              } finally {
                setBusy(false);
              }
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {busy ? "올리는 중…" : "올려서 피드백 받기"}
          </button>
        </>
      )}
    </div>
  );

  if (!ours) return picker;

  return (
    <div className="space-y-3">
      {ourUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={ourUrl} controls playsInline className="max-h-80 w-full rounded-lg bg-black" />
      )}
      {status.kind !== "done" ? (
        <div
          className={
            "rounded-xl border px-3 py-3 text-sm " +
            (status.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900")
          }
        >
          <div className="flex items-center gap-2 font-semibold">
            {status.kind === "error" ? <Info size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {status.text}
          </div>
          {status.kind === "error" && (
            <button
              type="button"
              onClick={() => onRetry(item, "ours")}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <RotateCw size={12} /> 다시 맡기기
            </button>
          )}
        </div>
      ) : (
        rv && (
          <>
            <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-950">{rv.summary}</p>
            {rv.fixes?.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-stone-500">고칠 점</div>
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
                  {rv.fixes.map((f, i) => (
                    <li key={i} className="flex gap-3 px-3 py-2">
                      <span className="w-14 shrink-0 text-xs text-stone-400">{f.at}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-stone-800">{f.issue}</span>
                        <span className="block text-xs text-emerald-700">→ {f.suggestion}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rv.good?.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="text-xs font-semibold text-emerald-900">잘한 점</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-emerald-900">
                  {rv.good.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-relaxed text-stone-700">
              <b className="text-xs text-stone-500">훅</b> {rv.hook}
              <br />
              <b className="text-xs text-stone-500">레퍼런스 대비</b> {rv.vsReference}
            </div>
            {rv.caption && (
              <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-500">본문 제안</span>
                  <CopyButton text={rv.caption} label="본문 복사" />
                </div>
                <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">{rv.caption}</p>
              </div>
            )}
          </>
        )
      )}
      {picker}
    </div>
  );
}

/** 빈칸 하나 — 누르면 고칠 수 있다 */
function SlotChip({ slot, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="min-w-[8rem] rounded border border-rose-500 px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title={slot.hint ? `${slot.hint}${slot.original ? ` · 레퍼런스: ${slot.original}` : ""}` : slot.key}
      className={
        "rounded px-1.5 py-0.5 text-sm font-medium " +
        (value ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-200")
      }
    >
      {value || `[${slot.key}]`}
    </button>
  );
}

// ------------------------------------------------------------------- 화면

export default function ReelsPage({
  items,
  onSave,
  onRemove,
  putFile,
  fileUrl,
  folders: savedFolders,
  onFolders,
  queue,
  worker,
  onQueue,
  onPoll,
  stats,
  plans = [],
  onSavePlan,
  onRemovePlan,
}) {
  // 레퍼런스 라이브러리 | 우리 상품으로 기획 (9/22 세원: "우리 상품을 말하거나 링크·클릭하면 그 상품에 맞는 릴스로")
  const [mode, setMode] = useState("library");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("all");
  const [open, setOpen] = useState(null);
  const [editCats, setEditCats] = useState(false);
  const [thumbs, setThumbs] = useState({});
  const [urls, setUrls] = useState({});

  // 폴더를 한 번도 저장한 적 없으면 기본 갈래 + 예전 항목의 폴더 이름으로 보여준다.
  // 처음 편집할 때 이 목록이 그대로 저장된다.
  const seeded = useMemo(() => seedFolders(items), [items]);
  const folders = savedFolders?.length ? savedFolders : seeded;
  const changeFolders = (op) => onFolders((list) => op(list.length ? list : folders));

  // 분석기 일감·상태를 몇 초마다 가볍게 읽는다 (이 화면이 떠 있는 동안만)
  useEffect(() => {
    onPoll();
    const t = setInterval(onPoll, 4000);
    return () => clearInterval(t);
  }, [onPoll]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const inSel =
      sel === "all"
        ? () => true
        : sel === "none"
          ? (it) => !folderIdOf(it, folders)
          : (() => {
              const ids = new Set(withChildren(sel, folders));
              return (it) => ids.has(folderIdOf(it, folders));
            })();
    return items.filter(
      (i) =>
        inSel(i) &&
        (!needle ||
          JSON.stringify([i.title, i.reference?.script, i.plan?.product?.name, i.meta?.uploader, i.memo])
            .toLowerCase()
            .includes(needle)),
    );
  }, [items, q, sel, folders]);

  // 썸네일 주소는 서명이 붙어 있어 오래 못 쓴다. 화면에 보이는 것만 그때그때 받아 온다.
  // 분석기가 썸네일을 새로 만들면 thumbAt 이 바뀌므로 그걸 열쇠에 넣는다.
  const thumbKey = (it) => `${it.id}:${it.thumbAt || ""}:${it.job?.status || ""}`;
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const it of shown.slice(0, 40)) {
        const k = thumbKey(it);
        if (thumbs[k] !== undefined) continue;
        const u = await fileUrl(`${it.id}-thumb.jpg`);
        if (!alive) return;
        setThumbs((p) => ({ ...p, [k]: u }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [shown, fileUrl, thumbs]);

  const openItem = async (item) => {
    setOpen(item);
    setUrls({ thumb: thumbs[thumbKey(item)] || null, video: null, ours: null });
    const [v, o] = await Promise.all([
      item.hasVideo ? fileUrl(item.id) : null,
      item.ours ? fileUrl(`${item.id}-ours`) : null,
    ]);
    setUrls((p) => ({ ...p, video: v, ours: o }));
  };

  // 새로 담을 때 지금 보고 있는 폴더에 넣는다
  const targetFolder = () => {
    const f = folders.find((x) => x.id === sel);
    return f ? { folderId: f.id, folder: f.parent ? "" : f.name } : { folderId: null, folder: "" };
  };

  const queueLink = async (url, memo) => {
    setNotice("");
    const id = newId("r");
    await onSave({
      id,
      title: "분석 대기 — " + url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40),
      source: { type: "link", url },
      meta: { url },
      memo,
      ...targetFolder(),
      hasVideo: false,
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref");
  };

  const queueFile = async (file, memo) => {
    setNotice("");
    if (file.size > MAX_VIDEO) {
      setNotice("영상이 40MB를 넘어요. 짧게 자르거나 화질을 낮춰서 넣어 주세요.");
      return false;
    }
    const id = newId("r");
    const ok = await putFile(id, file, file.type || "video/mp4");
    if (!ok) {
      setNotice("영상을 보관함에 못 올렸어요. 위 안내를 확인하거나 'PC 없이 지금'으로 분석해 보세요.");
      return false;
    }
    await onSave({
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      source: { type: "file", name: file.name },
      memo,
      ...targetFolder(),
      hasVideo: true,
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref");
  };

  /** 예전 방식 — 브라우저에서 장면만 떠서 바로 분석 (소리 없음) */
  const analyzeHere = async (file, { memo, kind, transcript }, setStep) => {
    setNotice("");
    try {
      setStep("장면 뜨는 중…");
      const { frames, thumb, seconds } = await extractFrames(file, {
        onStep: (i, n) => setStep(`장면 뜨는 중… ${i}/${n}`),
      });
      setStep("대본 읽는 중… (30초~1분)");
      const r = await readScript({ frames, kind, transcript, memo });
      if (!r.ok) {
        setNotice(r.message);
        return false;
      }
      setStep("영상 보관하는 중…");
      const id = newId("r");
      if (thumb) await putFile(`${id}-thumb.jpg`, thumb, "image/jpeg");
      const hasVideo = file.size <= MAX_VIDEO ? await putFile(id, file, file.type || "video/mp4") : false;
      const item = {
        id,
        title: r.data.title || "릴스",
        kind: r.data.kind || "",
        source: { type: "file", name: file.name },
        memo,
        ...targetFolder(),
        hasVideo,
        reference: { ...r.data, seconds: r.data.seconds || seconds },
        job: { status: "done", at: new Date().toISOString() },
        thumbAt: new Date().toISOString(),
        filled: [],
      };
      await onSave(item);
      openItem(item);
    } catch (err) {
      setNotice(err?.message || "영상을 읽지 못했어요.");
      return false;
    }
  };

  /** 분석 없이 보관만 — 썸네일은 브라우저가 한 장 떠서 넣는다 */
  const keepOnly = async (file, memo) => {
    setNotice("");
    if (file.size > MAX_VIDEO) {
      setNotice("영상이 40MB를 넘어요. 짧게 자르거나 화질을 낮춰서 넣어 주세요.");
      return false;
    }
    const id = newId("r");
    try {
      const { thumb } = await extractFrames(file, { longEdge: 480 });
      if (thumb) await putFile(`${id}-thumb.jpg`, thumb, "image/jpeg");
    } catch {
      /* 썸네일은 없어도 보관은 된다 */
    }
    const hasVideo = await putFile(id, file, file.type || "video/mp4");
    if (!hasVideo) {
      setNotice("영상을 보관함에 못 올렸어요. 화면 위 안내를 확인해 주세요.");
      return false;
    }
    await onSave({
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      source: { type: "file", name: file.name },
      keepOnly: true,
      memo,
      ...targetFolder(),
      hasVideo,
      job: { status: "done", at: new Date().toISOString() },
      thumbAt: new Date().toISOString(),
      filled: [],
    });
  };

  const retry = async (item, target) => {
    const job = { status: "queued", at: new Date().toISOString() };
    await onSave(target === "ours" ? { ...item, ours: { ...item.ours, job } } : { ...item, job });
    await onQueue(item.id, target);
  };

  const uploadOurs = async (item, file, memo) => {
    if (file.size > MAX_VIDEO) {
      window.alert("영상이 40MB를 넘어요. 짧게 자르거나 화질을 낮춰서 넣어 주세요.");
      return false;
    }
    const ok = await putFile(`${item.id}-ours`, file, file.type || "video/mp4");
    if (!ok) {
      window.alert("영상을 보관함에 못 올렸어요. 화면 위 안내를 확인해 주세요.");
      return false;
    }
    await onSave({
      ...item,
      ours: { name: file.name, memo, hasVideo: true, job: { status: "queued", at: new Date().toISOString() } },
    });
    await onQueue(item.id, "ours");
    const u = await fileUrl(`${item.id}-ours`);
    setUrls((p) => ({ ...p, ours: u }));
    return true;
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Clapperboard size={20} /> 릴스 기획
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          잘 된 릴스를 모아 두고, 그 구조 그대로 우리 상품 대본을 만들고, 찍은 영상을 점검해요.
        </p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["library", `레퍼런스 라이브러리 ${items.length}`],
          ["product", `우리 상품으로 기획 ${plans.length}`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={"flex-1 rounded-lg py-2 font-medium " + (mode === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "product" ? (
        <ProductReelTab
          stats={stats}
          library={items}
          plans={plans}
          onSavePlan={onSavePlan}
          onRemovePlan={onRemovePlan}
          onOpenRef={openItem}
        />
      ) : (
      <>
      <AddBar worker={worker} onLink={queueLink} onFile={queueFile} onBrowser={analyzeHere} onKeep={keepOnly} notice={notice} />

      <FolderBar
        items={items}
        folders={folders}
        sel={sel}
        onSel={setSel}
        onEdit={() => setEditCats(true)}
        q={q}
        setQ={setQ}
      />

      {shown.length === 0 ? (
        <Empty
          title={items.length ? "이 폴더에는 아직 없어요." : "아직 모아 둔 릴스가 없어요."}
          hint="위에 인스타 링크를 넣거나 영상을 올리면 대본과 구조를 뽑아 여기에 담아요. 지원님도 같이 봐요."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((it) => (
            <Card
              key={it.id}
              item={it}
              thumbUrl={thumbs[thumbKey(it)]}
              folderName={pathName(folderIdOf(it, folders), folders)}
              status={statusOf(it, queue)}
              onOpen={openItem}
              folders={folders}
              onMove={(id) => {
                const f = folders.find((x) => x.id === id);
                onSave({ ...it, folderId: id, folder: f && !f.parent ? f.name : "" });
              }}
            />
          ))}
        </div>
      )}
      </>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="absolute inset-0 cursor-default" />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <Detail
              key={open.id}
              item={items.find((i) => i.id === open.id) || open}
              urls={urls}
              folders={folders}
              queue={queue}
              onSave={onSave}
              onRemove={onRemove}
              onClose={() => setOpen(null)}
              onRetry={retry}
              onOurs={uploadOurs}
              stats={stats}
            />
          </div>
        </div>
      )}

      {editCats && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setEditCats(false)} className="absolute inset-0 cursor-default" />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <CategoryEditor
              items={items}
              folders={folders}
              onChange={changeFolders}
              onClose={() => setEditCats(false)}
            />
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Claude는 영상을 직접 못 봐요. 사무실 PC 분석기가 영상을 <b className="font-semibold">장면 사진</b>으로 뜨고{" "}
          <b className="font-semibold">소리를 받아써서</b> 넘겨요. 조회수는 인스타가 로그인 없이는 안 알려줘서 좋아요·댓글·캡션으로 성과를 봐요.
        </span>
      </p>
    </div>
  );
}
