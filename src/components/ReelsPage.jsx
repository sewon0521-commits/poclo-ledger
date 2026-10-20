import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Upload,
  MousePointerClick,
  Wand2,
  Trash2,
  Info,
  Loader2,
  Link2,
  Play,
  X,
  Sparkles,
  Heart,
  Zap,
  RotateCw,
  Video,
  ExternalLink,
  TrendingUp,
  Mic,
  Star,
  Pencil,
  Timer,
  Type,
  Eye,
  AudioLines,
} from "lucide-react";
import { extractFrames } from "../lib/video";
import { readScript, adaptScript, fillTemplate, splitTemplate, restructureReel, stampOf, readCloseness, saveCloseness, reelAngles, angleOf } from "../lib/reels";
import LookPicker from "./LookPicker";
import BaseScript, { ClosenessPick } from "./BaseScript";
import AngleBox from "./AngleBox";
import { emptyLook } from "../lib/looks";
import { newId } from "../lib/id";
import {
  seedFolders,
  folderIdOf,
  withChildren,
  pathName,
  ordered,
} from "../lib/reelFolders";
import { Empty } from "./ui";
import { FolderBar, CategoryEditor, FolderPicker } from "./FolderBits";
import ProductReelTab from "./ProductReel";
import TrimVideo from "./TrimVideo";
import ReelMusic from "./ReelMusic";
import { instaAudioUrl, queueInstaAudio } from "../lib/music";
import { CopyButton, WorkerStatus, EditableTitle, TrendBox } from "./ContentBits";
import { workerAlive, addedOn, musicOf, dupMapOf, dupKeyOf, keepScore } from "../lib/reels";
import { FROM_LABEL, useScriptFrom, ScriptFromPick } from "./ScriptFrom";
import InstaClipGuide from "./InstaClipGuide";

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

function AddBar({ worker, onLink, onFile, onBrowser, onKeep, onAudio, onInsta, notice }) {
  const [tab, setTab] = useState("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [memo, setMemo] = useState("");
  const [kind, setKind] = useState("자막형");
  const [transcript, setTranscript] = useState("");
  const [over, setOver] = useState(false);
  const [step, setStep] = useState("");
  const [from, setFrom] = useScriptFrom();
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

      {tab === "link" && instaAudioUrl(url) ? (
        // 10/15 음원 링크(게시물 위 '계정 • 오리지널 오디오'를 눌러 연 주소)면 릴스가 아니라 음원 전곡 → 음악 보관함
        <div>
          <div className="flex flex-wrap gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={FIELD + " min-w-0 flex-1 text-sm"} />
            <button
              type="button"
              disabled={busy}
              onClick={() => wrap("맡기는 중…", () => onAudio(url.trim()))}
              className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <AudioLines size={15} />}
              {busy ? step : "전곡 담기"}
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            인스타 음원 링크예요 — 사무실 PC 가 원곡 전체를 받아 <b className="font-semibold text-stone-700">콘텐츠 › 음악 보관함</b>에 넣어요(무료, 10~20초).
          </p>
        </div>
      ) : tab === "link" ? (
        <>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="릴스 링크 https://www.instagram.com/reel/… · 음원 링크 …/reels/audio/… 도 돼요"
            className={FIELD + " min-w-0 flex-1 text-sm"}
          />
          <button
            type="button"
            disabled={busy || !isLink(url)}
            onClick={() => wrap("담는 중…", () => onLink(url.trim(), memo, false))}
            className="rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-50"
            title="영상·썸네일만 보관해요. 돈이 들지 않아요. 나중에 눌러서 분석할 수 있어요"
          >
            보관만
          </button>
          <button
            type="button"
            disabled={busy || !isLink(url)}
            onClick={() => wrap("맡기는 중…", () => onLink(url.trim(), memo, true, from))}
            className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {busy ? step : "분석하기"}
          </button>
        </div>
        <ScriptFromPick value={from} onChange={setFrom} className="mt-2" />
        {/* 10/20 세원: "저장한 릴스 하나씩 클릭해서 링크 복붙하고 있는데 포클로 담기처럼 한 번에" */}
        <button
          type="button"
          onClick={onInsta}
          className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-rose-700 hover:text-rose-900"
        >
          <MousePointerClick size={13} /> 여러 개 한 번에 — 인스타 저장됨에서 골라 담기
        </button>
        </>
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
          {file && <ScriptFromPick value={from} onChange={setFrom} className="mt-3 border-t border-stone-100 pt-3" />}
          {file && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => wrap("보관하는 중…", () => onKeep(file, memo))}
                className="flex flex-1 flex-col items-center justify-center rounded-xl border border-stone-300 bg-white py-2 font-semibold text-stone-800 disabled:opacity-50"
              >
                {busy && step.startsWith("보관") ? step : "보관만"}
                <span className="text-[11px] font-normal text-stone-400">실루엣·참고용 · 돈 안 들어요</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => wrap("영상 올리는 중…", () => onFile(file, memo, from))}
                className="flex flex-1 flex-col items-center justify-center rounded-xl bg-rose-700 py-2 font-semibold text-white disabled:bg-stone-300"
              >
                <span className="flex items-center gap-1.5">
                  {busy && !step.startsWith("보관") ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
                  {busy && !step.startsWith("보관") ? step : "분석하기"}
                </span>
                <span className="text-[11px] font-normal text-rose-100">대본·구조까지 · 한 번 약 100~200원</span>
              </button>
              {!alive && (
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

function Card({ item, thumbUrl, onThumbError, folderName, status, onOpen, folders, onMove, onBest, onTag, dup = 0 }) {
  const r = item.reference || {};
  const pending = status.kind !== "done";
  const failed = status.kind === "error";
  return (
    <div
      className={
        "rounded-xl border bg-white transition hover:shadow-sm " +
        (failed ? "border-rose-300 ring-1 ring-rose-300" : item.best ? "border-amber-300 ring-1 ring-amber-300" : "border-stone-200 hover:border-stone-300")
      }
    >
      <button type="button" onClick={() => onOpen(item)} className="block w-full overflow-hidden rounded-t-xl text-left">
      <span className="relative block aspect-[3/4] bg-stone-100">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" onError={onThumbError} className="h-full w-full object-cover" />
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
          {failed ? (item.hasVideo ? "분석 실패" : "못 받음") : pending ? status.text : item.keepOnly ? "보관만" : item.plan ? "대본 완성" : "분석 완료"}
        </span>
        <span className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {item.best && (
            <span className="flex items-center gap-0.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
              <Star size={10} className="fill-amber-950" /> BEST
            </span>
          )}
          {TAGS.filter((t) => item[t.key]).map((t) => (
            <span key={t.key} className={"rounded px-1.5 py-0.5 text-[10px] font-bold text-white " + t.badge}>
              {t.label}
            </span>
          ))}
          {item.ours && <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">우리 영상</span>}
          {dup > 0 && (
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title={`같은 릴스가 ${dup}개 더 담겨 있어요`}>
              중복{dup > 1 ? ` ${dup + 1}` : ""}
            </span>
          )}
        </span>
        {item.hasVideo && !pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white">
              <Play size={16} />
            </span>
          </span>
        )}
        {failed ? (
          <span className="absolute inset-x-0 bottom-0 bg-rose-700/90 px-2 py-1.5 text-[11px] leading-snug font-semibold text-white">
            {item.hasVideo ? "분석이 안 됐어요" : "영상을 못 받았어요"} · 눌러서 확인
          </span>
        ) : (
          r.structure?.hookType && (
            <span className="absolute bottom-2 left-2 max-w-[90%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              {r.structure.hookType}
            </span>
          )
        )}
      </span>
      </button>
      {/* 좁은 카드(폰 2칸)면 단추들이 제목 아래 줄로 내려간다 — 제목이 안 짓눌리게 */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2">
        <button type="button" onClick={() => onOpen(item)} className="min-w-[7rem] flex-1 text-left">
          <span className="block truncate text-sm font-medium text-stone-900">{item.title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-stone-400">
            {folderName}
            {item.shop?.name ? ` · ${item.shop.name}` : item.meta?.uploader ? ` · @${item.meta.uploader}` : ""}
            {item.plan?.product?.name && ` · ${item.plan.product.name}`}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-stone-400">
            {[addedOn(item) && `${mdLabel(addedOn(item))} 가져옴`, musicOf(item.meta) && `♪ ${musicOf(item.meta).label}`].filter(Boolean).join(" · ")}
          </span>
        </button>
        <span className="ml-auto flex items-center gap-1">
          {TAGS.map((t) => (
            <TagToggle key={t.key} tag={t} on={!!item[t.key]} onChange={(b) => onTag(t.key, b)} />
          ))}
          <BestToggle on={!!item.best} onChange={onBest} />
          <FolderPicker item={item} folders={folders} onMove={onMove} />
        </span>
      </div>
    </div>
  );
}

/** BEST 표시 — 우리한테 더 맞고 좋은 레퍼런스 (9/29 세원). 누르면 켜고 끈다. 켜진 건 어느 폴더에서든 맨 앞 */
function BestToggle({ on, onChange, big }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={on ? "BEST 빼기" : "BEST로 올리기"}
      title={on ? "BEST 빼기" : "BEST로 올리기 — 이 폴더 맨 앞에 와요"}
      className={
        "flex shrink-0 items-center justify-center gap-1 rounded-md border " +
        (big ? "px-2 py-0.5 text-[11px] font-semibold " : "h-7 w-7 ") +
        (on ? "border-amber-300 bg-amber-50 text-amber-600" : "border-transparent text-stone-300 hover:border-stone-200 hover:bg-stone-50 hover:text-amber-500")
      }
    >
      <Star size={big ? 12 : 15} className={on ? "fill-amber-400 text-amber-500" : ""} />
      {big && (on ? "BEST" : "BEST로")}
    </button>
  );
}

/**
 * 표시 단추 둘 (켜고 끔, 켜진 건 썸네일 오른쪽 위 배지 + 폴더 막대 '…만'으로 모아 봄):
 * - 쇼만마 — 쇼만마(광고 대행)에서 준 레퍼런스 (10/15 세원: "영상 각각 쇼만마 버튼, 누르면 쇼만마에서 준 레퍼런스라는 걸 바로 알 수 있게").
 * - (10/16 '내 상품'도 넣었다가 같은 날 뺌 — 세원 "버튼 너무 많아 헷갈려, 그냥 카테고리 만들어야겠다". 예전 표시(mine)는 데이터에만 남음)
 */
const TAGS = [
  { key: "shomanma", label: "쇼만마", tip: "쇼만마에서 준 레퍼런스", on: "border-violet-300 bg-violet-600 text-white", off: "hover:border-violet-300 hover:text-violet-700", badge: "bg-violet-600", only: "border-violet-600 bg-violet-600 text-white", onlyOff: "hover:border-violet-300" },
];
const tagPatch = (key, on) => ({ [key]: on, [key + "At"]: on ? new Date().toISOString() : null });
function TagToggle({ tag, on, onChange, big }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? `${tag.label} 표시 빼기` : `${tag.tip}로 표시`}
      className={
        "flex shrink-0 items-center justify-center rounded-md border font-semibold whitespace-nowrap " +
        (big ? "px-2 py-0.5 text-[11px] " : "h-7 px-1.5 text-[10px] ") +
        (on ? tag.on : "border-stone-200 text-stone-400 " + tag.off)
      }
    >
      {tag.label}
    </button>
  );
}

// ------------------------------------------------------------- 상세 · 대본 만들기

/**
 * 영상 아래 — 어느 쇼핑몰 것인지, 그 상품 링크 (세원 9/23: "영상 아래 칸에 쇼핑몰 이름, 해당 상품의 링크로 바로 갈 수 있게").
 * 고치면 칸을 벗어날 때 저장된다.
 */
function ShopBox({ item, onSave }) {
  const shop = item.shop || {};
  const [name, setName] = useState(shop.name || item.meta?.name || "");
  const [url, setUrl] = useState(shop.url || "");
  const save = () => {
    const next = { name: name.trim(), url: url.trim() };
    if (next.name !== (shop.name || "") || next.url !== (shop.url || "")) onSave({ ...item, shop: next });
  };
  const ok = /^https?:\/\//.test(url.trim());
  const input = "w-full rounded-md border border-stone-600 bg-stone-900 px-2 py-1.5 text-xs text-white outline-none placeholder:text-stone-500 focus:border-rose-400";
  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-stone-800 p-2">
      <div className="text-[11px] font-semibold text-stone-300">어느 쇼핑몰 · 어떤 상품</div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder="쇼핑몰 이름 (예: 어반몬드)" className={input} />
      <div className="flex gap-1.5">
        <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={save} placeholder="상품 링크 붙여넣기" className={input + " min-w-0 flex-1"} />
        {ok && (
          <a href={url.trim()} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-md bg-rose-600 px-2 text-[11px] font-medium text-white hover:bg-rose-500">
            <ExternalLink size={11} /> 열기
          </a>
        )}
      </div>
    </div>
  );
}

const mdLabel = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");

function Meta({ meta, added }) {
  if (!meta && !added) return null;
  meta = meta || {};
  const cells = [
    ["좋아요", num(meta.likes)],
    ["댓글", num(meta.comments)],
    ["조회수", meta.views != null ? num(meta.views) : "못 가져옴"],
    ["게시일", meta.postedAt || "—"],
    ["가져온 날", added || "—"],
  ];
  return (
    <div className="mt-2 rounded-lg bg-stone-800 p-2 text-[11px] text-stone-300">
      {meta.uploader && <div className="mb-1 truncate font-medium text-white">@{meta.uploader}</div>}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {cells.map(([k, v], i) => (
          <span key={k} className={"flex justify-between gap-1" + (i === cells.length - 1 && cells.length % 2 ? " col-span-2" : "")}>
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

/**
 * 뽑은 대본 (10/2 세원: "분석할 때 틀린 대본들이 있어서 내가 편집할 수 있게")
 * 줄 앞 시각을 누르면 왼쪽 영상이 그 장면부터. '고치기'로 바로잡으면 구조·빈칸 틀은 예전 대본 기준이라
 * '고친 대본으로 다시 짜기'(글만 보내 싸다)를 띄운다. 예전 방식(장면 10~18장)으로 뽑은 건 '대본 다시 뽑기'.
 */
function ScriptBox({ item, canSeek, onSeek, onSave, onReExtract }) {
  const r = item.reference || {};
  const [redo, setRedo] = useState(false);
  const [from, setFrom] = useScriptFrom();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async () => {
    const script = v.replace(/\s+$/, "");
    setEdit(false);
    if (script === (r.script || "")) return;
    await onSave({ ...item, reference: { ...r, script, scriptEditedAt: new Date().toISOString(), stale: true } });
  };
  const rebuild = async () => {
    setBusy(true);
    setMsg("");
    const res = await restructureReel({ reference: r, script: r.script, meta: item.meta });
    setBusy(false);
    if (!res.ok) return setMsg(res.message);
    const { _cost, ...data } = res.data;
    await onSave({
      ...item,
      title: item.title,
      reference: { ...r, ...data, script: r.script, scriptEditedAt: r.scriptEditedAt, stale: false, dense: r.dense, seconds: r.seconds || data.seconds },
      rebuildCost: _cost || null,
    });
    setMsg(`고친 대본으로 다시 짰어요${_cost?.won ? ` · 약 ${_cost.won}원` : ""}`);
  };
  const lines = String(r.script || "").split("\n");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-500">
          뽑은 대본
          {FROM_LABEL[r.scriptFrom] && <span className="ml-1.5 rounded bg-stone-100 px-1 font-medium text-stone-600">{FROM_LABEL[r.scriptFrom]}</span>}
          {r.dense && <span className="ml-1.5 font-normal text-stone-400">자막 1초에 {r.dense.fps}번 확인</span>}
          {r.scriptEditedAt && <span className="ml-1.5 rounded bg-amber-100 px-1 font-medium text-amber-800">직접 고침</span>}
        </span>
        {!edit && (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setV(r.script || "");
                setEdit(true);
              }}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <Pencil size={12} /> 고치기
            </button>
            <CopyButton text={r.script || ""} />
          </span>
        )}
      </div>
      {edit ? (
        <div className="space-y-1.5">
          <textarea
            value={v}
            autoFocus
            onChange={(e) => setV(e.target.value)}
            className="block min-h-[12rem] w-full rounded-xl border border-rose-400 px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none [field-sizing:content]"
          />
          <p className="text-[11px] text-stone-400">
            줄 앞 [0:03.5] 은 시각이에요. 그대로 두고 글자만 고치면 돼요.{r.scriptFrom ? "" : " 목소리로만 한 말은 시각 뒤에 ‘말:’."}
          </p>
          <span className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEdit(false)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600">
              그만두기
            </button>
            <button type="button" onClick={save} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">
              저장
            </button>
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 px-3 py-2 text-sm leading-relaxed">
          {lines.map((ln, i) => {
            if (!ln.trim()) return <div key={i} className="h-2" />;
            const st = stampOf(ln);
            const body = st ? st.rest : ln;
            const said = /^말\s*[:：]/.test(body);
            return (
              <div key={i} className="flex items-start gap-2 py-0.5">
                {st &&
                  (canSeek ? (
                    <button
                      type="button"
                      onClick={() => onSeek(st.t)}
                      title="이 장면부터 영상 보기"
                      className="mt-0.5 shrink-0 rounded bg-rose-50 px-1 text-[11px] font-medium text-rose-700 tabular-nums hover:bg-rose-100"
                    >
                      ▶ {st.label}
                    </button>
                  ) : (
                    <span className="mt-0.5 shrink-0 text-[11px] text-stone-400 tabular-nums">{st.label}</span>
                  ))}
                <span className={said ? "text-stone-500" : "text-stone-900"}>
                  {said && <span className="mr-1 rounded bg-stone-100 px-1 text-[10px] text-stone-500">말</span>}
                  {said ? body.replace(/^말\s*[:：]\s*/, "") : body}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {r.stale && !edit && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          대본을 고쳤어요. 구조·문장별 분석·빈칸 틀은 아직 예전 대본 기준이에요.
          <button
            type="button"
            disabled={busy}
            onClick={rebuild}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
            {busy ? "다시 짜는 중… (30초쯤)" : "고친 대본으로 다시 짜기 · 약 100~150원"}
          </button>
        </div>
      )}
      {msg && <p className="mt-1.5 text-xs text-stone-500">{msg}</p>}
      {r.screenText && !edit && (
        <details className="mt-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-stone-500">화면 배경 글 — 대본에는 안 넣음 (레퍼 화제 참고)</summary>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-stone-600">{r.screenText}</p>
        </details>
      )}
      {r.dense && item.hasVideo && onReExtract && !edit && !redo && (
        <button
          type="button"
          onClick={() => setRedo(true)}
          className="mt-2 flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
        >
          <Wand2 size={11} /> 대본이 이상하면 다시 뽑기
        </button>
      )}
      {r.dense && item.hasVideo && onReExtract && !edit && redo && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
          <ScriptFromPick value={from} onChange={setFrom} />
          {r.scriptEditedAt && <p className="mt-1.5 text-[11px] text-amber-700">직접 고친 대본도 새로 뽑은 대본으로 바뀌어요.</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setRedo(false);
                onReExtract(item, from);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Wand2 size={13} /> {from === "voice" ? "목소리대로" : "자막대로"} 다시 뽑기 · 약 250~300원
            </button>
            <button type="button" onClick={() => setRedo(false)} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600">
              그만두기
            </button>
          </div>
        </div>
      )}
      {!r.dense && item.hasVideo && onReExtract && !edit && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600">
          예전 방식으로 뽑은 대본이에요(장면 사진 10~18장만 봄). 빨리 지나가는 자막을 놓쳤을 수 있어요.
          <ScriptFromPick value={from} onChange={setFrom} className="mt-2" />
          <button
            type="button"
            onClick={() => {
              if (r.scriptEditedAt && !window.confirm("직접 고친 대본도 새로 뽑은 대본으로 바뀌어요. 다시 뽑을까요?")) return;
              onReExtract(item, from);
            }}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:border-rose-300"
          >
            <Wand2 size={13} /> 대본 다시 뽑기 — 자막 0.33초마다 확인 · 약 150~300원
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ item, urls, folders, queue, onSave, onRemove, onClose, onRetry, onOurs, onTrim, stats, onAnalyze, onReExtract, online, dups = [], onOpenItem }) {
  const r = item.reference || {};
  const [from, setFrom] = useScriptFrom();
  const status = statusOf(item, queue);
  const [seek, setSeek] = useState(null);
  const [tab, setTab] = useState(item.plan ? "write" : "script");
  // 룩 단위로 상품을 담는다 (9/23). 예전에 주소 하나로 만든 기획은 그 주소를 룩 1 로 옮긴다.
  const [looks, setLooks] = useState(() =>
    item.looks?.length
      ? item.looks
      : [emptyLook(item.productUrl ? [{ url: item.productUrl, name: "예전에 넣은 상품" }] : [])],
  );
  const [memo, setMemo] = useState(item.planMemo || "");
  // 레퍼런스를 얼마나 가져올지 (10/9)
  const [closeness, setCloseness] = useState(item.plan?.closeness || readCloseness());
  // 맞춰갈 방향 (10/9)
  const [angleSt, setAngleSt] = useState(item.angleSt || { pick: "auto", custom: "" });
  const angleKey = JSON.stringify(looks.map((l) => l.products.map((p) => p.url || p.no || "")));
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
        closeness,
        angle: angleOf(angleSt, angleKey),
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
        angleSt,
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
          <div className="flex items-start gap-2">
            <EditableTitle value={item.title} onChange={(t) => onSave({ ...item, title: t })} />
            <BestToggle big on={!!item.best} onChange={(b) => onSave({ ...item, best: b, bestAt: b ? new Date().toISOString() : null })} />
            {TAGS.map((t) => (
              <TagToggle key={t.key} big tag={t} on={!!item[t.key]} onChange={(b) => onSave({ ...item, ...tagPatch(t.key, b) })} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {r.structure?.hookType && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{r.structure.hookType}</span>
            )}
            {r.kind && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{r.kind}</span>}
            {item.cost?.won > 0 && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500" title="이 영상 분석에 든 API 비용 (대략)">
                분석 약 {item.cost.won}원
              </span>
            )}
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
              {ordered(folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                </option>
              ))}
            </select>
          </div>
          {dups.length > 0 && (
            <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-900">
              <b>중복</b> — 같은 릴스가 {dups.length}개 더 담겨 있어요:
              {dups.map((d) => (
                <button key={d.id} type="button" onClick={() => onOpenItem(d)} className="ml-1.5 underline underline-offset-2 hover:text-orange-700">
                  {pathName(folderIdOf(d, folders), folders) || "미분류"} · {(d.title || "").slice(0, 16)}
                  {d.reference?.script ? " (분석됨)" : d.keepOnly ? " (보관만)" : ""}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const better = keepScore(item) > Math.max(...dups.map(keepScore));
                  if (window.confirm(better ? "이 복사본이 더 많이 채워져 있어요(분석·BEST·영상). 다른 쪽을 지우는 게 나아요.\n그래도 이걸 지울까요?" : "이 복사본을 지울까요? 같은 릴스는 남아 있어요.")) {
                    onRemove(item.id);
                    onClose();
                  }
                }}
                className="ml-2 rounded border border-orange-300 bg-white px-1.5 py-0.5 font-semibold text-orange-800 hover:bg-orange-100"
              >
                이 복사본 지우기
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto sm:grid-cols-[minmax(0,260px)_1fr]">
        <div className="bg-stone-900 p-2">
          {urls.video ? (
            <TrimVideo
              src={urls.video}
              name={item.title}
              trim={item.trim}
              hasOrig={item.hasOrig}
              seekTo={seek}
              step={queue.find((j) => j.id === item.id && j.target === "trim")?.step}
              className="w-full rounded-lg"
              onTrim={(s, e) => onTrim(item, "trim", s, e)}
              onRestore={() => onTrim(item, "trim", null)}
            />
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
          <Meta meta={item.meta} added={addedOn(item)} />
          <ReelMusic item={item} videoUrl={urls.video} online={online} onSave={onSave} />
          <ShopBox key={item.id} item={item} onSave={onSave} />
        </div>

        <div className="min-w-0 p-4">
          {status.kind === "done" && item.keepOnly ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-5 text-sm">
              <div className="font-semibold text-stone-800">보관만 한 영상이에요</div>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">
                대본·구조 분석은 아직 안 했어요. 필요할 때 누르면 사무실 PC 분석기가 소리까지 받아써서 분석해요 (한 번 약 100~200원).
              </p>
              <ScriptFromPick value={from} onChange={setFrom} className="mt-3" />
              <button
                type="button"
                onClick={() => onAnalyze(item, from)}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white"
              >
                <Wand2 size={14} /> 분석하기
              </button>
            </div>
          ) : status.kind !== "done" ? (
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
                <>
                  {(item.meta?.uploader || item.meta?.caption) && (
                    <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-700">
                      {item.meta?.uploader && (
                        <div className="font-semibold text-stone-900">
                          {item.meta.name ? `${item.meta.name} ` : ""}@{item.meta.uploader}
                        </div>
                      )}
                      {item.meta?.caption && <p className="mt-1 line-clamp-6 whitespace-pre-line">{item.meta.caption}</p>}
                    </div>
                  )}
                  <p className="mt-2 text-xs opacity-80">
                    {item.hasVideo
                      ? "영상은 보관돼 있어요. 다시 맡기면 분석만 다시 해요."
                      : "연령·나라 제한 게시물이면 로그인 없이는 영상을 못 받아요 — 인스타에서 열어 보고, 필요하면 폰에 저장해 '영상 파일'로 넣어 주세요."}
                  </p>
                  {!(item.wantKeep || item.keepOnly) && <ScriptFromPick value={from} onChange={setFrom} className="mt-3" />}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(item.source?.url || item.meta?.url) && (
                      <a
                        href={item.source?.url || item.meta?.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800"
                      >
                        <ExternalLink size={13} /> 인스타에서 열기
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onRetry(item, "ref", item.wantKeep || item.keepOnly ? { analyze: false } : { scriptFrom: from })}
                      className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white"
                    >
                      <RotateCw size={13} /> {item.wantKeep || item.keepOnly ? "다시 받아 보기 (보관만)" : "다시 분석 맡기기"}
                    </button>
                  </div>
                </>
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
                  <ScriptBox
                    item={item}
                    canSeek={!!urls.video}
                    onSeek={(t) => setSeek((x) => ({ t, n: (x?.n || 0) + 1 }))}
                    onSave={onSave}
                    onReExtract={onReExtract}
                  />
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
                  {(r.rhythm || r.captionStyle || r.retention?.length > 0) && (
                    <div className="mb-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                      {r.rhythm && (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                            <Timer size={13} /> 자막·컷 리듬
                          </div>
                          <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{r.rhythm}</p>
                        </div>
                      )}
                      {r.captionStyle && (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                            <Type size={13} /> 자막 모양
                          </div>
                          <p className="mt-0.5 text-sm leading-relaxed text-stone-800">{r.captionStyle}</p>
                        </div>
                      )}
                      {r.retention?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                            <Eye size={13} /> 끝까지 보게 만드는 장치
                          </div>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-sm leading-relaxed text-stone-800">
                            {r.retention.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      )}
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
                    <AngleBox
                      state={angleSt}
                      onChange={setAngleSt}
                      fetcher={() => reelAngles({ looks, reference: r, memo })}
                      keyNow={angleKey}
                      disabled={!looks.some((l) => l.products.length)}
                    />
                    <ClosenessPick
                      value={closeness}
                      onChange={(v) => {
                        setCloseness(v);
                        saveCloseness(v);
                      }}
                    />
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

                      <BaseScript
                        key={plan.script}
                        plan={plan}
                        onSeek={urls.video ? (t) => setSeek((x) => ({ t, n: (x?.n || 0) + 1 })) : undefined}
                        onSave={(v) => {
                          const next = { ...plan, script: v };
                          setPlan(next);
                          onSave({ ...item, plan: next });
                        }}
                      />

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
                <OursTab item={item} queue={queue} ourUrl={urls.ours} onUpload={onOurs} onRetry={onRetry} onTrim={onTrim} />
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
function OursTab({ item, queue, ourUrl, onUpload, onRetry, onTrim }) {
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
        <TrimVideo
          src={ourUrl}
          name={`${item.title} 우리영상`}
          trim={ours.trim}
          hasOrig={ours.hasOrig}
          step={queue.find((j) => j.id === item.id && j.target === "trim-ours")?.step}
          className="max-h-80 w-full rounded-lg bg-black"
          onTrim={(s, e) => onTrim(item, "trim-ours", s, e)}
          onRestore={() => onTrim(item, "trim-ours", null)}
        />
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

// 썸네일 서명 주소를 이 기기에 잠깐 남겨 둔다 (서명 4시간 → 3시간만 쓴다)
// 10/2 밤 세원: "릴스 기획 썸네일 다 터졌다" — 예전 캐시(poclo_reel_thumbs)는 꺼내 쓴 주소의 기한도 매번 3시간씩 늘려서
// 서명(4시간)이 끝난 주소를 계속 썼다. 이름을 바꿔 예전 것은 버리고, 기한은 처음 서명한 때부터만 센다.
const THUMB_CACHE = "poclo_reel_thumbs2";
try {
  localStorage.removeItem("poclo_reel_thumbs");
} catch {
  /* 없어도 된다 */
}
function readThumbCache() {
  try {
    return JSON.parse(localStorage.getItem(THUMB_CACHE) || "{}");
  } catch {
    return {};
  }
}
/** 새로 서명한 주소만 넣는다 (fresh). drop = 안 열려서 버릴 열쇠 */
function writeThumbCache(fresh, drop = []) {
  try {
    const now = Date.now();
    const old = readThumbCache();
    const next = Object.fromEntries(Object.entries(old).filter(([k, c]) => c.exp > now && !drop.includes(k)));
    for (const [k, url] of Object.entries(fresh)) if (url) next[k] = { url, exp: now + 3 * 3600 * 1000 };
    localStorage.setItem(THUMB_CACHE, JSON.stringify(next));
  } catch {
    /* 가득 차면 그냥 다음에 다시 받는다 */
  }
}

export default function ReelsPage({
  items,
  onSave,
  onRemove,
  putFile,
  fileUrl,
  fileUrls,
  online,
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
  // 다른 화면에 갔다 와도 보던 탭 그대로 (9/29 세원: "섞어서 만들래 하다가 딴 곳 갔더니 없어져서")
  const [mode, setModeState] = useState(() => {
    try {
      return localStorage.getItem("poclo_reels_mode") === "product" ? "product" : "library";
    } catch {
      return "library";
    }
  });
  const setMode = (m) => {
    setModeState(m);
    try {
      localStorage.setItem("poclo_reels_mode", m);
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [bestOnly, setBestOnly] = useState(false);
  const [tagOnly, setTagOnly] = useState(""); // "" | "shomanma"
  const [failOnly, setFailOnly] = useState(false); // 10/20 못 받은 릴스만
  const [dupOnly, setDupOnly] = useState(false); // 10/20 중복만
  const dupMap = useMemo(() => dupMapOf(items), [items]);
  const [instaGuide, setInstaGuide] = useState(false); // 10/20 인스타에서 한 번에 담기 안내
  const [sel, setSel] = useState("all");
  const [open, setOpen] = useState(null);
  const [editCats, setEditCats] = useState(false);
  const [thumbs, setThumbs] = useState({});
  const retried = useRef(new Set());
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
    const list = items.filter(
      (i) =>
        inSel(i) &&
        (!bestOnly || i.best) &&
        (!tagOnly || i[tagOnly]) &&
        (!failOnly || i.job?.status === "error") &&
        (!dupOnly || dupMap.has(i.id)) &&
        (!needle ||
          JSON.stringify([i.title, i.reference?.script, i.plan?.product?.name, i.meta?.uploader, i.memo, i.shop?.name, i.shomanma && "쇼만마"])
            .toLowerCase()
            .includes(needle)),
    );
    // BEST 는 보고 있는 폴더 안에서 맨 앞 (나중에 올린 BEST 가 더 앞). 나머지는 원래 순서
    const failed = (i) => i.job?.status === "error";
    // 중복만 볼 때는 같은 릴스끼리 붙여서
    if (dupOnly) return [...list].sort((a, b) => dupKeyOf(a).localeCompare(dupKeyOf(b)));
    const rest = list.filter((i) => !failed(i));
    return [...list.filter(failed), ...rest.filter((i) => i.best).sort((a, b) => (b.bestAt || "").localeCompare(a.bestAt || "")), ...rest.filter((i) => !i.best)];
  }, [items, q, sel, folders, bestOnly, tagOnly, failOnly, dupOnly, dupMap]);

  // 썸네일 주소는 서명이 붙어 있어 오래 못 쓴다. 화면에 보이는 것만 그때그때 받아 온다.
  // 분석기가 썸네일을 새로 만들면 thumbAt 이 바뀌므로 그걸 열쇠에 넣는다.
  const thumbKey = (it) => `${it.id}:${it.thumbAt || ""}:${it.job?.status || ""}`;
  // 10/2 세원: "레퍼런스를 많이 모았는지 썸네일이 잘 안 떠" — 예전엔 한 장씩 차례로·처음 40개만 받았다.
  // 이제 보이는 카드 전부를 100장씩 한 번에 서명하고, 받은 주소는 이 기기에 3시간 남겨 다시 열 때 바로 뜨게(서명은 4시간).
  useEffect(() => {
    const want = shown.filter((it) => thumbs[thumbKey(it)] === undefined);
    if (!want.length) return;
    let alive = true;
    (async () => {
      const got = {};
      const fresh = {};
      const cache = readThumbCache();
      const need = [];
      for (const it of want) {
        const c = cache[thumbKey(it)];
        if (c && c.exp > Date.now()) got[thumbKey(it)] = c.url;
        else need.push(it);
      }
      for (let i = 0; i < need.length; i += 100) {
        const part = need.slice(i, i + 100);
        const map = fileUrls ? await fileUrls(part.map((it) => `${it.id}-thumb.jpg`)) : {};
        for (const it of part) got[thumbKey(it)] = fresh[thumbKey(it)] = map[`${it.id}-thumb.jpg`] || null;
      }
      if (!alive) return;
      writeThumbCache(fresh);
      setThumbs((p) => ({ ...p, ...got }));
    })();
    return () => {
      alive = false;
    };
  }, [shown, fileUrls, thumbs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const queueLink = async (url, memo, analyze = true, scriptFrom = "") => {
    setNotice("");
    const id = newId("r");
    await onSave({
      id,
      addedAt: new Date().toISOString(),
      title: (analyze ? "분석 대기 — " : "보관 대기 — ") + url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40),
      source: { type: "link", url },
      meta: { url },
      memo,
      ...targetFolder(),
      hasVideo: false,
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref", analyze ? (scriptFrom ? { scriptFrom } : {}) : { analyze: false });
    // 10/20 이미 담긴 릴스면 알려 준다 (카드에는 '중복'이 붙는다)
    const k = dupKeyOf({ meta: { url } });
    const same = k && items.find((i) => dupKeyOf(i) === k);
    if (same) setNotice(`이미 담긴 릴스예요 (${pathName(folderIdOf(same, folders), folders) || "미분류"} · ${(same.title || "").slice(0, 20)}) — 카드에 '중복'이 붙어요. 필요 없으면 하나를 지워 주세요.`);
  };

  /** 대본 다시 뽑기 (10/2) — 예전 방식으로 뽑은 레퍼런스를 자막 띠로 다시. 분석기는 보관된 영상을 쓴다 */
  const reExtract = async (item, scriptFrom = "") => {
    await onSave({ ...item, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(item.id, "ref", scriptFrom ? { scriptFrom } : {});
  };

  /** 보관만 한 영상을 나중에 분석 (9/23 세원: "나중에 분석이 필요하면 영상 눌러서 따로 분석하기") */
  const analyzeLater = async (item, scriptFrom = "") => {
    await onSave({ ...item, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(item.id, "ref", scriptFrom ? { scriptFrom } : {});
  };

  const queueFile = async (file, memo, scriptFrom = "") => {
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
      addedAt: new Date().toISOString(),
      title: file.name.replace(/\.[^.]+$/, ""),
      source: { type: "file", name: file.name },
      memo,
      ...targetFolder(),
      hasVideo: true,
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref", scriptFrom ? { scriptFrom } : {});
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
        addedAt: new Date().toISOString(),
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
      addedAt: new Date().toISOString(),
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

  const retry = async (item, target, extra = {}) => {
    const job = { status: "queued", at: new Date().toISOString() };
    await onSave(target === "ours" ? { ...item, ours: { ...item.ours, job } } : { ...item, job });
    await onQueue(item.id, target, extra);
  };

  /** 앞뒤 자르기 맡기기 — start 가 null 이면 원래대로 (target "trim" | "trim-ours") */
  const trimVideo = async (item, target, start, end) => {
    const trim =
      start === null
        ? { status: "queued", restore: true, at: new Date().toISOString() }
        : { status: "queued", start, end, at: new Date().toISOString() };
    await onSave(target === "trim-ours" ? { ...item, ours: { ...item.ours, trim } } : { ...item, trim });
    await onQueue(item.id, target, start === null ? { restore: true } : {});
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

      <TrendBox online={online} />

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
          fileUrl={fileUrl}
          folders={folders}
          onSavePlan={onSavePlan}
          onRemovePlan={onRemovePlan}
          onOpenRef={openItem}
        />
      ) : (
      <>
      {instaGuide && <InstaClipGuide onClose={() => setInstaGuide(false)} />}
      <AddBar
        worker={worker}
        onInsta={() => setInstaGuide(true)}
        onLink={queueLink}
        onFile={queueFile}
        onBrowser={analyzeHere}
        onKeep={keepOnly}
        onAudio={async (u) => {
          setNotice("");
          try {
            const r = await queueInstaAudio({ url: u }, online);
            setNotice(r.exists ? "이 음원은 이미 음악 보관함에 있어요." : "전곡 받기를 맡겼어요 — 사무실 PC 가 받으면 콘텐츠 › 음악 보관함에 들어가요.");
            onPoll?.();
          } catch (e) {
            setNotice(e.message || "전곡 받기를 맡기지 못했어요.");
            return false;
          }
        }}
        notice={notice}
      />

      <FolderBar
        items={items}
        folders={folders}
        sel={sel}
        onSel={setSel}
        onEdit={() => setEditCats(true)}
        q={q}
        setQ={setQ}
        bestOnly={bestOnly}
        setBestOnly={setBestOnly}
        bestCount={items.filter((i) => i.best).length}
        extra={TAGS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTagOnly(tagOnly === t.key ? "" : t.key)}
            aria-pressed={tagOnly === t.key}
            className={
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold " +
              (tagOnly === t.key ? t.only : "border-stone-200 bg-white text-stone-600 " + t.onlyOff)
            }
          >
            {t.label}만 {items.filter((i) => i[t.key]).length}
          </button>
        ))}
      />

      {/* 10/20 세원: "실패한 릴스가 안 보이니까 그냥 넘어가게 돼. 중요한 릴스일 수도 있는데" — 늘 위에 알리고, 카드는 맨 앞에 빨갛게 */}
      {(() => {
        const n = items.filter((i) => i.job?.status === "error").length;
        if (!n && !failOnly) return null;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <Info size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {n ? (
                <>
                  <b>못 받은 릴스 {n}개</b> — 사진·계정을 보고 인스타에서 열어 확인해 주세요. 카드를 누르면 다시 받기·인스타 열기가 있어요.
                </>
              ) : (
                "못 받은 릴스가 이제 없어요."
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!failOnly) setSel("all");
                setFailOnly(!failOnly);
              }}
              className={"shrink-0 rounded-lg px-3 py-1 text-xs font-semibold " + (failOnly ? "bg-white text-rose-800 ring-1 ring-rose-300" : "bg-rose-700 text-white")}
            >
              {failOnly ? "전체 보기" : "모아 보기"}
            </button>
          </div>
        );
      })()}

      {(dupMap.size > 0 || dupOnly) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <Info size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {dupMap.size ? (
              <>
                <b>같은 릴스가 두 번 이상 담긴 게 {new Set([...dupMap.keys()].map((id) => dupKeyOf(items.find((i) => i.id === id)))).size}개</b> — 카드에 '중복'이 붙어 있어요. 눌러서 남길 것을 보고 하나는 지워 주세요.
              </>
            ) : (
              "중복된 릴스가 이제 없어요."
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!dupOnly) setSel("all");
              setDupOnly(!dupOnly);
            }}
            className={"shrink-0 rounded-lg px-3 py-1 text-xs font-semibold " + (dupOnly ? "bg-white text-orange-900 ring-1 ring-orange-300" : "bg-orange-600 text-white")}
          >
            {dupOnly ? "전체 보기" : "모아 보기"}
          </button>
        </div>
      )}

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
              onThumbError={() => {
                const k = thumbKey(it);
                if (retried.current.has(k)) return setThumbs((p) => ({ ...p, [k]: null }));
                retried.current.add(k);
                writeThumbCache({}, [k]);
                setThumbs((p) => {
                  const n = { ...p };
                  delete n[k];
                  return n;
                });
              }}
              folderName={pathName(folderIdOf(it, folders), folders)}
              dup={dupMap.get(it.id)?.length || 0}
              status={statusOf(it, queue)}
              onOpen={openItem}
              folders={folders}
              onMove={(id) => {
                const f = folders.find((x) => x.id === id);
                onSave({ ...it, folderId: id, folder: f && !f.parent ? f.name : "" });
              }}
              onBest={(b) => onSave({ ...it, best: b, bestAt: b ? new Date().toISOString() : null })}
              onTag={(key, b) => onSave({ ...it, ...tagPatch(key, b) })}
            />
          ))}
        </div>
      )}
      </>
      )}

      {open && (
        <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="absolute inset-0 cursor-default" />
          <div className="sheet relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
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
              onTrim={trimVideo}
              stats={stats}
              onAnalyze={analyzeLater}
              onReExtract={reExtract}
              online={online}
              dups={dupMap.get(open.id) || []}
              onOpenItem={(d) => setOpen(d)}
            />
          </div>
        </div>
      )}

      {editCats && (
        <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setEditCats(false)} className="absolute inset-0 cursor-default" />
          <div className="sheet relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
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
