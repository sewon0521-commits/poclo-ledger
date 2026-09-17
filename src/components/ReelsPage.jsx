import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  Upload,
  Wand2,
  Copy,
  Check,
  Trash2,
  Info,
  Loader2,
  Link2,
  Play,
  Folder,
  Search,
  X,
  Sparkles,
  Heart,
  Zap,
} from "lucide-react";
import { extractFrames } from "../lib/video";
import { readScript, adaptScript, fillTemplate, splitTemplate } from "../lib/reels";
import { newId } from "../lib/id";
import { Empty } from "./ui";

/**
 * 릴스 기획 — 레퍼런스를 모으고(라이브러리), 그 구조로 우리 상품 대본을 만든다.
 *
 * 세 가지가 핵심 (세원 2026-09-17, 레퍼런스랩 참고):
 *  1. **영상을 모아 두는 곳** — 썸네일이 보이고 눌러서 다시 볼 수 있어야 한다.
 *  2. **폴더** — 판매형/정보성/코디릴스처럼 갈래로 묶는다.
 *  3. **반자동 기획** — 레퍼런스 대본을 빈칸 있는 틀로 만들어 두고(`template`/`slots`),
 *     우리 상품을 넣으면 빈칸이 자동으로 채워진다. 채워진 말은 손으로 고칠 수 있다.
 *
 * 영상·썸네일은 Supabase Storage('reels' 버킷), 기획 내용은 settings 의 'reels' 키.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const KINDS = ["자막형", "목소리형", "자막+목소리"];
const BASE_FOLDERS = ["미분류", "판매형", "정보성", "코디릴스", "관심끌기용"];

function CopyButton({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("복사해서 쓰세요", text);
        }
      }}
      className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

// ------------------------------------------------------------- 영상 넣고 분석

function AddBar({ onAnalyzed, notice, setNotice }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("자막형");
  const [transcript, setTranscript] = useState("");
  const [memo, setMemo] = useState("");
  const [over, setOver] = useState(false);
  const [step, setStep] = useState("");
  const busy = !!step;

  const run = async () => {
    setNotice("");
    try {
      setStep("장면 뜨는 중…");
      const { frames, thumb, seconds } = await extractFrames(file, {
        onStep: (i, n) => setStep(`장면 뜨는 중… ${i}/${n}`),
      });
      setStep("대본 읽는 중… (30초쯤 걸려요)");
      const r = await readScript({ frames, kind, transcript, memo });
      if (!r.ok) {
        setNotice(r.message);
        return;
      }
      setStep("영상 보관하는 중…");
      await onAnalyzed({ reference: { ...r.data, seconds: r.data.seconds || seconds }, file, thumb });
      setFile(null);
      setTranscript("");
      setMemo("");
    } catch (err) {
      setNotice(err?.message || "영상을 읽지 못했어요.");
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
        if (f) setFile(f);
      }}
      className={
        "mb-4 rounded-2xl border p-4 transition " +
        (over ? "border-rose-500 bg-rose-50" : "border-stone-200 bg-white")
      }
    >
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
          <Upload size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-stone-800">
            {file ? file.name : "릴스 영상을 끌어다 놓거나 눌러서 고르기"}
          </span>
          <span className="block text-[11px] text-stone-400">
            mp4 · mov · webm — 넣으면 대본과 구조를 뽑아 라이브러리에 담아요
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
        <div className="mt-3 border-t border-stone-100 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  "rounded-lg border px-3 py-1.5 text-sm font-medium " +
                  (kind === k
                    ? "border-rose-700 bg-rose-700 text-white"
                    : "border-stone-300 bg-white text-stone-600")
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
              className={FIELD + " mt-2 h-20 resize-y text-sm"}
            />
          )}
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 (선택) — 예: 어반몬드 · 조회수 80만"
            className={FIELD + " mt-2 text-sm"}
          />
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 font-semibold text-white disabled:bg-stone-300"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {busy ? step : "대본 뽑고 담기"}
          </button>
        </div>
      )}
      {notice && <p className="mt-2 text-sm text-rose-700">{notice}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ 카드

function Card({ item, thumbUrl, onOpen }) {
  const r = item.reference || {};
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-stone-300 hover:shadow-sm"
    >
      <span className="relative block aspect-[3/4] bg-stone-100">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-stone-300">
            <Clapperboard size={28} />
          </span>
        )}
        <span className="absolute top-2 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
          {item.plan ? "대본 완성" : "분석 완료"}
        </span>
        {item.hasVideo && (
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
      <span className="block px-3 py-2">
        <span className="block truncate text-sm font-medium text-stone-900">{item.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-stone-400">
          {item.folder || "미분류"}
          {item.plan?.product?.name && ` · ${item.plan.product.name}`}
        </span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------- 상세 · 대본 만들기

function Detail({ item, urls, folders, onSave, onRemove, onClose }) {
  const r = item.reference || {};
  const [tab, setTab] = useState(item.plan ? "write" : "script");
  const [url, setUrl] = useState(item.plan ? item.productUrl || "" : "");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filled, setFilled] = useState(item.filled || item.plan?.filled || []);
  const [plan, setPlan] = useState(item.plan || null);
  const [folder, setFolder] = useState(item.folder || "미분류");
  const [newFolder, setNewFolder] = useState("");

  const value = (key) => filled.find((f) => f.key === key)?.value || "";
  const setValue = (key, v) => {
    const next = filled.some((f) => f.key === key)
      ? filled.map((f) => (f.key === key ? { ...f, value: v } : f))
      : [...filled, { key, value: v }];
    setFilled(next);
    onSave({ ...item, filled: next, folder });
  };

  const done = fillTemplate(r.template, filled);

  const run = async () => {
    setMsg("");
    setBusy(true);
    try {
      const res = await adaptScript({ reference: r, url: url.trim(), memo });
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
        productUrl: url.trim(),
        folder,
      });
      setTab("write");
    } finally {
      setBusy(false);
    }
  };

  const TABS = [
    ["script", "원본 대본"],
    ["struct", "구조분석"],
    ["write", "대본 만들기"],
  ];

  return (
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id="reel-title" className="truncate font-semibold text-stone-900">
            {item.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {r.structure?.hookType && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">
                {r.structure.hookType}
              </span>
            )}
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{r.kind}</span>
            {r.seconds > 0 && (
              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">{r.seconds}초</span>
            )}
            <select
              value={folder}
              onChange={(e) => {
                setFolder(e.target.value);
                onSave({ ...item, folder: e.target.value, filled });
              }}
              className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-stone-600"
            >
              {[...new Set([...BASE_FOLDERS, ...folders, folder])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolder.trim()) {
                  setFolder(newFolder.trim());
                  onSave({ ...item, folder: newFolder.trim(), filled });
                  setNewFolder("");
                }
              }}
              placeholder="새 폴더 + Enter"
              className="w-28 rounded border border-stone-300 px-1.5 py-0.5"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700"
        >
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
            <div className="flex h-40 items-center justify-center text-sm text-stone-500">
              영상이 저장되지 않았어요
            </div>
          )}
        </div>

        <div className="min-w-0 p-4">
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
              <div className="rounded-xl border border-stone-200 p-3">
                <div className="mb-1.5 text-xs font-semibold text-stone-500">
                  우리 상품 주소를 넣으면 아래 빈칸이 자동으로 채워져요
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="relative min-w-0 flex-1">
                    <Link2 size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://ppoclo.cafe24.com/product/..."
                      className={FIELD + " pl-8 text-sm"}
                    />
                  </span>
                  <button
                    type="button"
                    disabled={!url.trim() || busy}
                    onClick={run}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {busy ? "채우는 중…" : plan ? "다시 채우기" : "빈칸 채우기"}
                  </button>
                </div>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모 (선택) — 예: 가을 신상으로 밀 것"
                  className={FIELD + " mt-2 text-sm"}
                />
                {msg && <p className="mt-2 text-sm text-rose-700">{msg}</p>}
              </div>

              {r.template && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-stone-500">
                      틀 — 노란 칸을 눌러 고칠 수 있어요
                    </span>
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
                      <CopyButton
                        text={`${plan.caption}\n\n${(plan.hashtags || []).join(" ")}`}
                        label="본문 복사"
                      />
                    </div>
                    <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">
                      {plan.caption}
                    </p>
                    <p className="mt-1.5 text-xs text-stone-500">{(plan.hashtags || []).join(" ")}</p>
                  </div>
                </div>
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
        (value
          ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "bg-amber-100 text-amber-900 hover:bg-amber-200")
      }
    >
      {value || `[${slot.key}]`}
    </button>
  );
}

// ------------------------------------------------------------------- 화면

export default function ReelsPage({ items, onSave, onRemove, putFile, fileUrl }) {
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("전체");
  const [open, setOpen] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [urls, setUrls] = useState({});

  const folders = useMemo(
    () => [...new Set(items.map((i) => i.folder || "미분류"))],
    [items],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (folder === "전체" || (i.folder || "미분류") === folder) &&
        (!needle ||
          JSON.stringify([i.title, i.reference?.script, i.plan?.product?.name])
            .toLowerCase()
            .includes(needle)),
    );
  }, [items, q, folder]);

  // 썸네일 주소는 서명이 붙어 있어 오래 못 쓴다. 화면에 보이는 것만 그때그때 받아 온다.
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const it of shown.slice(0, 24)) {
        if (thumbs[it.id] !== undefined) continue;
        const u = await fileUrl(`${it.id}-thumb.jpg`);
        if (!alive) return;
        setThumbs((p) => ({ ...p, [it.id]: u }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [shown, fileUrl, thumbs]);

  const openItem = async (item) => {
    setOpen(item);
    setUrls({ thumb: thumbs[item.id] || null, video: null });
    if (item.hasVideo) {
      const v = await fileUrl(item.id);
      setUrls((p) => ({ ...p, video: v }));
    }
  };

  const analyzed = async ({ reference, file, thumb }) => {
    const id = newId("r");
    let hasVideo = false;
    if (thumb) await putFile(`${id}-thumb.jpg`, thumb, "image/jpeg");
    // 영상이 너무 크면 보관함이 금방 찬다 — 40MB 넘으면 썸네일만 남긴다
    if (file.size <= 40 * 1024 * 1024) {
      hasVideo = await putFile(id, file, file.type || "video/mp4");
    } else {
      setNotice("영상이 40MB를 넘어 썸네일만 보관했어요. 기획 내용은 그대로 저장됩니다.");
    }
    const item = {
      id,
      title: reference.title || "릴스",
      kind: reference.kind || "",
      folder: "미분류",
      hasVideo,
      reference,
      filled: [],
    };
    await onSave(item);
    setThumbs((p) => ({ ...p, [id]: undefined }));
    openItem(item);
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Clapperboard size={20} /> 릴스 기획
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          잘 된 릴스를 모아 두고, 그 구조 그대로 우리 상품 대본을 만들어요.
        </p>
      </div>

      <AddBar onAnalyzed={analyzed} notice={notice} setNotice={setNotice} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {["전체", ...new Set([...BASE_FOLDERS, ...folders])].map((f) => {
            const n =
              f === "전체" ? items.length : items.filter((i) => (i.folder || "미분류") === f).length;
            if (f !== "전체" && n === 0 && !BASE_FOLDERS.includes(f)) return null;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFolder(f)}
                className={
                  "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium " +
                  (folder === f
                    ? "bg-rose-700 text-white"
                    : "border border-stone-300 bg-white text-stone-600")
                }
              >
                {f !== "전체" && <Folder size={12} />}
                {f}
                <span className={folder === f ? "text-rose-200" : "text-stone-400"}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="대본·상품 검색"
            className="w-44 rounded-lg border border-stone-300 bg-white py-1.5 pr-2 pl-8 text-sm"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty
          title="아직 모아 둔 릴스가 없어요."
          hint="위에 영상을 넣으면 대본과 구조를 뽑아 여기에 담아요. 지원님도 같이 봐요."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((it) => (
            <Card key={it.id} item={it} thumbUrl={thumbs[it.id]} onOpen={openItem} />
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <Detail
              key={open.id}
              item={items.find((i) => i.id === open.id) || open}
              urls={urls}
              folders={folders}
              onSave={onSave}
              onRemove={onRemove}
              onClose={() => setOpen(null)}
            />
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          영상에서 <b className="font-semibold">장면 사진 8~14장</b>을 떠서 읽어요.{" "}
          <b className="font-semibold">소리는 못 들어요</b> — 목소리형은 인스타 자동자막을 붙여넣으면
          합쳐서 정리합니다. 영상은 라이브러리에 보관되고(40MB까지), 빈칸은 눌러서 직접 고칠 수 있어요.
        </span>
      </p>
    </div>
  );
}
