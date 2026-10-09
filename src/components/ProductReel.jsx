import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X, Trash2, Camera, Clapperboard, RotateCw, Shirt, Pencil, Send, Undo2, MessageSquare, Play, ChevronDown, ExternalLink } from "lucide-react";
import { productReel, reviseReel, candidateOf, fillTemplate, hookKind, mixPayload, MIX_PARTS, readCloseness, saveCloseness, reelAngles, angleOf, chosenOf } from "../lib/reels";
import { extractFrames } from "../lib/video";
import { newId } from "../lib/id";
import { shortName as short, emptyLook } from "../lib/looks";
import LookPicker, { ProductSearch } from "./LookPicker";
import { CopyButton, EditableTitle } from "./ContentBits";
import { Empty } from "./ui";
import RefPicker, { RefSummary } from "./RefPicker";
import BaseScript, { ClosenessPick } from "./BaseScript";
import AngleBox from "./AngleBox";

/**
 * 우리 상품에서 시작하는 릴스 기획 (세원 2026-09-22):
 *   "우리 상품을 내가 말해주거나 링크를 삽입하거나 클릭을 하면 그 상품에 맞는 릴스로 기획하는 게 가능할까?"
 *
 * 상품 고르기 — 이름으로 찾기(판매 중 전체, 새벽 갱신의 product_stats.all) · 링크 붙여넣기 · 잘 팔리는/뜰 것 같은 상품 누르기
 * → 레퍼런스는 '알아서'(라이브러리에서 이 상품에 가장 맞는 구조를 Claude 가 고름) 또는 직접 하나
 * → 빈칸 틀 채운 대본 · 새 대본 · 촬영 순서 · 참고할 상품 사진 · 본문. settings 'reel_plans' 에 쌓인다.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

function FirstPick({ stats, onPick }) {
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-sm font-semibold text-stone-800">어떤 상품으로 릴스를 만들까요?</div>
      <ProductSearch stats={stats} onPick={onPick} />
      <p className="text-[11px] text-stone-400">고른 뒤에 룩을 더하거나 한 룩에 상의·하의를 같이 담을 수 있어요.</p>
    </div>
  );
}

// 만들던 기획 — 다른 화면에 갔다 와도 그대로 (9/29). 우리 영상 '파일'은 기억 못 한다(라이브러리 것만)
const DRAFT_KEY = "poclo_reel_draft";
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}
function writeDraft(d) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 기억 못 해도 된다 */
  }
}

function Make({ draft, stats, library, fileUrl, folders, onDone, onCancel }) {
  const done = library.filter((i) => i.reference?.structure);
  const [refId, setRefId] = useState(draft.refId || "auto");
  // 섞어 만들기 (9/29) — {hook, flow, shots, script}: 부분마다 빌려 올 레퍼런스 id
  const [mix, setMix] = useState(draft.mix || {});
  const mixing = refId === "mix";
  // 우리가 찍은 영상 소스 (9/29) — [{key, kind:"lib"|"file", id?, title, file?}]. 파일은 이 화면에서만 들고 있다
  const [own, setOwn] = useState(() => (draft.own || []).filter((o) => o.kind === "lib"));
  const [step, setStep] = useState("");
  const [looks, setLooks] = useState(draft.looks);
  const [memo, setMemo] = useState(draft.memo || "");
  // 레퍼런스를 얼마나 가져올지 (10/9) — 마지막에 고른 것을 기기마다 기억
  const [closeness, setCloseness] = useState(draft.closeness || readCloseness());
  // 맞춰갈 방향 (10/9) — 레퍼 핵심 · 방향 3개 중 고른 것. 상품·레퍼런스가 바뀌면 지난 방향은 안 보낸다(angleKey)
  const [angleSt, setAngleSt] = useState(draft.angle || { pick: "auto", custom: "" });
  const angleKey = JSON.stringify([looks.map((l) => l.products.map((p) => p.url || p.no || "")), refId, mixing ? mix : null]);
  const ordered = (pool) => [...pool.filter((i) => i.best), ...pool.filter((i) => !i.best)].slice(0, 12).map(candidateOf);
  const fetchAngles = () =>
    reelAngles({
      looks,
      candidates: ordered(refId === "auto" ? done : mixing ? [] : done.filter((i) => i.id === refId)),
      mix: mixing ? mixPayload(library, mix) : undefined,
      memo,
    });
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const again = !!draft.prev;
  const waiting = !!draft.running;
  // 고르는 대로 기억해 둔다 — 화면을 떠났다 와도 이어서
  useEffect(() => {
    const prev = readDraft() || {};
    writeDraft({ ...prev, ...draft, looks, memo, refId, mix, closeness, angle: angleSt, own: own.filter((o) => o.kind === "lib").map((o) => ({ key: o.key, kind: o.kind, id: o.id, title: o.title })) });
  }, [draft, looks, memo, refId, mix, own, closeness, angleSt]);
  const first = looks[0]?.products?.[0] || {};

  const run = async () => {
    setMsg("");
    setBusy(true);
    // 만드는 중에 다른 화면으로 가도 요청은 계속되고, 끝나면 목록에 들어온다 — 돌아왔을 때 '만드는 중' 으로 보이게
    writeDraft({ ...(readDraft() || {}), running: Date.now() });
    try {
      // 우리 영상 소스 → 소스마다 장면 8장쯤 (Claude 는 영상을 못 받는다 — 사진으로)
      const ownPayload = [];
      if (mixing) {
        for (const [i, o] of own.entries()) {
          setStep(`우리 영상 ${i + 1}/${own.length} 장면 뜨는 중…`);
          let blob = o.file;
          if (!blob) {
            const u = await fileUrl(o.id);
            if (!u) throw new Error(`'${o.title}' 영상을 보관함에서 못 찾았어요.`);
            blob = await (await fetch(u)).blob();
          }
          const { frames, seconds } = await extractFrames(blob, { longEdge: 560, quality: 0.65 });
          const pick = frames.length > 8 ? frames.filter((_, k) => k % Math.ceil(frames.length / 8) === 0) : frames;
          ownPayload.push({ title: o.title, seconds, frames: pick });
        }
      }
      setStep("");
      // 방향을 먼저 뽑을 때 레퍼런스를 골랐으면(알아서 고르기) 그 레퍼런스로
      const picked = refId === "auto" ? chosenOf(angleSt, angleKey) : "";
      const pool = refId === "auto" ? (done.some((i) => i.id === picked) ? done.filter((i) => i.id === picked) : done) : mixing ? [] : done.filter((i) => i.id === refId);
      const r = await productReel({
        looks,
        stats: first.reason ? { reason: first.reason } : {},
        // BEST(우리가 고른 좋은 레퍼런스)를 먼저 후보로 (9/29)
        candidates: ordered(pool),
        memo,
        // 갈아엎기 — 앞서 만든 훅·대본은 피한다
        avoid: again ? `${draft.prev.hook || ""}\n${draft.prev.script || ""}` : "",
        direction: again ? direction : "",
        mix: mixing ? { ...mixPayload(library, mix), own: ownPayload } : undefined,
        closeness,
        angle: angleOf(angleSt, angleKey),
      });
      if (!r.ok) {
        setMsg(r.message);
        const d = readDraft();
        if (d) writeDraft({ ...d, running: null });
        return;
      }
      const ref = done.find((i) => i.id === r.data.chosen) || null;
      const names = (r.data.productTitles || []).map(short);
      await onDone({
        id: draft.id || newId("rp"),
        title: draft.title || (names.length > 1 ? `${names[0]} 외 ${names.length - 1} · 룩 ${looks.length}` : short(names[0] || first.name)),
        product: { no: first.no || null, name: r.data.productTitle || first.name, url: first.url, image: first.image || r.data.images?.[0] || "", reason: first.reason || "" },
        looks,
        refId: ref?.id || "",
        refTitle: ref ? ref.reference?.title || ref.title : "",
        auto: refId === "auto",
        mix: mixing ? mix : null,
        own: mixing ? own.map((o) => ({ key: o.key, kind: o.kind, id: o.id, title: o.title })) : [],
        angleSt,
        memo,
        plan: r.data,
        filled: r.data.filled || [],
        createdAt: draft.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      setMsg(err?.message || "기획을 만들지 못했어요.");
      const d = readDraft();
      if (d) writeDraft({ ...d, running: null });
    } finally {
      setStep("");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-900">
          <Shirt size={14} /> {again ? "다시 만들기" : "릴스 기획 만들기"}
        </span>
        <button type="button" onClick={onCancel} aria-label="닫기" className="p-1 text-stone-400 hover:text-stone-700">
          <X size={18} />
        </button>
      </div>
      <LookPicker stats={stats} looks={looks} onChange={setLooks} label="이 릴스에 나올 우리 상품" />
      <RefPicker library={library} value={refId} onChange={setRefId} mix={mix} onMix={setMix} own={own} onOwn={setOwn} fileUrl={fileUrl} folders={folders} />
      <AngleBox state={angleSt} onChange={setAngleSt} fetcher={fetchAngles} keyNow={angleKey} disabled={!looks.some((l) => l.products.length)} />
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
        placeholder="메모 · 후킹 아이디어 (여기 적은 건 훅·대본에 최우선으로 반영해요) — 예: '이 가격에 이 원단?' 으로 시작, 셀카 정적 움직임"
        className={FIELD + " h-16 resize-y text-sm"}
      />
      {again && (
        <input
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="다른 방향으로 — 예: 정보형으로, 가격 빼고, 더 짧게 (비우면 완전히 다른 각도)"
          className={FIELD + " text-sm"}
        />
      )}
      {msg && <p className="text-sm text-rose-700">{msg}</p>}
      <button
        type="button"
        disabled={busy || waiting || !looks.some((l) => l.products.length)}
        onClick={run}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {busy ? step || "상품 사진·레퍼런스 보고 기획하는 중… (1분쯤)" : again ? "갈아엎어서 다시 만들기" : "이 상품으로 릴스 기획"}
      </button>
    </div>
  );
}

/** 글 한 덩어리 — '고치기' 누르면 바로 고친다 (9/29 세원: "AI가 새로 쓴 대본을 내가 수정할 수 있게") */
function EditableText({ label, value, onSave, strong, copy, tone = "border" }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value || "");
  const box = tone === "soft" ? "rounded-xl bg-stone-50 px-3 py-2.5" : "rounded-xl border border-stone-200 px-3 py-2.5";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-500">{label}</span>
        <span className="flex items-center gap-2">
          {!edit && (
            <button
              type="button"
              onClick={() => {
                setV(value || "");
                setEdit(true);
              }}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              <Pencil size={12} /> 고치기
            </button>
          )}
          {copy && !edit && <CopyButton text={value || ""} />}
        </span>
      </div>
      {edit ? (
        <div className="space-y-1.5">
          <textarea
            value={v}
            autoFocus
            onChange={(e) => setV(e.target.value)}
            className="block min-h-[6rem] w-full rounded-xl border border-rose-400 px-3 py-2.5 leading-relaxed text-stone-800 outline-none [field-sizing:content]"
          />
          <span className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEdit(false)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600">
              그만두기
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(v);
                setEdit(false);
              }}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              저장
            </button>
          </span>
        </div>
      ) : (
        <p className={box + " leading-relaxed whitespace-pre-wrap " + (strong ? "font-semibold text-stone-900" : "text-stone-800")}>{value}</p>
      )}
    </div>
  );
}

/**
 * 채팅으로 고치기 (9/29 세원: "채팅으로 제안하면 AI가 알아듣고 세부적인 부분 변경").
 * 요청 → 훅·대본·촬영 순서·본문 중 요청한 곳만 고쳐서 바로 기획안에 반영. 고치기 전 것은 5번까지 되돌릴 수 있다.
 */
function PlanChat({ item, onSave }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const end = useRef(null);
  const chat = item.chat || [];
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length, busy]);

  const send = async () => {
    const m = text.trim();
    if (!m || busy) return;
    setBusy(true);
    setMsg("");
    const p = item.plan || {};
    const r = await reviseReel({
      plan: { product: item.product?.name, hook: p.hook, script: p.script, scenes: p.scenes, caption: p.caption, hashtags: p.hashtags },
      history: chat.map((c) => ({ role: c.role, text: c.text })),
      message: m,
    });
    setBusy(false);
    if (!r.ok) {
      setMsg(r.message);
      return;
    }
    setText("");
    const { reply, hook, script, scenes, caption, hashtags, _cost } = r.data;
    const now = new Date().toISOString();
    onSave({
      ...item,
      plan: { ...p, hook, script, scenes, caption, hashtags },
      undo: [{ hook: p.hook, script: p.script, scenes: p.scenes, caption: p.caption, hashtags: p.hashtags }, ...(item.undo || [])].slice(0, 5),
      chat: [...chat, { role: "me", text: m, at: now }, { role: "ai", text: reply, at: now, won: _cost?.won }],
    });
  };

  const undo = () => {
    const [last, ...rest] = item.undo || [];
    if (!last) return;
    onSave({
      ...item,
      plan: { ...item.plan, ...last },
      undo: rest,
      chat: [...chat, { role: "ai", text: "방금 고친 것을 되돌렸어요.", at: new Date().toISOString() }],
    });
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40">
      <div className="flex items-center justify-between border-b border-sky-100 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
          <MessageSquare size={13} /> AI에게 고쳐 달라고 하기
        </span>
        {(item.undo || []).length > 0 && (
          <button type="button" onClick={undo} className="flex items-center gap-1 text-xs font-medium text-sky-800 hover:underline">
            <Undo2 size={12} /> 방금 고친 것 되돌리기
          </button>
        )}
      </div>
      {chat.length > 0 && (
        <ul className="max-h-60 space-y-2 overflow-y-auto px-3 py-2.5">
          {chat.map((c, i) => (
            <li key={i} className={"flex " + (c.role === "me" ? "justify-end" : "justify-start")}>
              <span
                className={
                  "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap " +
                  (c.role === "me" ? "rounded-br-md bg-rose-700 text-white" : "rounded-bl-md bg-white text-stone-800 ring-1 ring-sky-100")
                }
              >
                {c.text}
                {c.won > 0 && <span className="ml-1.5 text-[10px] text-stone-400">약 {c.won}원</span>}
              </span>
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-1.5 text-xs text-sky-800">
              <Loader2 size={12} className="animate-spin" /> 고치는 중… (20~40초)
            </li>
          )}
          <li ref={end} />
        </ul>
      )}
      <div className="flex items-end gap-2 px-3 py-2.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="예: 훅을 더 짧게 / 3번째 장면은 거울 셀카로 / 가격 얘기 빼줘 / 말투를 존댓말로"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none [field-sizing:content] focus:border-sky-500"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={send}
          aria-label="보내기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white disabled:bg-stone-300"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      {msg && <p className="px-3 pb-2 text-xs text-rose-700">{msg}</p>}
      {chat.length === 0 && <p className="px-3 pb-2.5 text-[11px] text-stone-400">요청한 부분만 고쳐서 바로 위 기획에 반영해요. 한 번에 약 100원 안팎.</p>}
    </div>
  );
}

/**
 * 기획안 안에서 레퍼런스 영상 보기 (10/2 세원: "대본 볼 때 나가서 레퍼런스를 보고 다시 들어와서 대본 보고… 너무 귀찮고 일이 분산돼.
 * 그냥 대본 보면서 레퍼 볼 수 있게") — 넓은 화면은 대본 왼쪽에 세로 영상, 좁은 화면은 대본 위에 작은 영상(접기 가능).
 * 섞어 만들기면 부분(훅·흐름·구도·말투)과 우리 영상 소스마다 골라 본다. 같은 영상을 여러 부분에 썼으면 한 칸으로 묶는다.
 */
function refClips(item, library) {
  const find = (id) => (id ? library.find((i) => i.id === id) : null);
  const out = [];
  const add = (it, label, own) => {
    const have = out.find((c) => c.id === it.id);
    if (have) have.label += ` · ${label}`;
    else out.push({ id: it.id, label, item: it, own });
  };
  if (!item.mix) {
    const ref = find(item.refId);
    if (ref) add(ref, "레퍼런스");
    return out;
  }
  for (const [k, label] of MIX_PARTS) {
    const it = find(item.mix[k]);
    if (it) add(it, label);
  }
  (item.own || []).forEach((o, i) => {
    const it = o.kind === "lib" && find(o.id);
    if (it) add(it, `소스 ${i + 1}`, true);
  });
  return out;
}

const WIDE = "(min-width: 1024px)";
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

// '[0:03]' 처럼 줄 앞에 붙은 레퍼런스 시각 → 초
const STAMP = /^\s*\[(\d{1,2}):(\d{2}(?:\.\d+)?)(?:\s*[-~–]\s*[\d:.]+)?\]\s*/;

function RefPlayer({ clips, cur, onPick, fileUrl, seek, wide, fold, onFold, onOpenRef }) {
  const clip = clips[cur] || clips[0];
  const it = clip.item;
  const [src, setSrc] = useState({}); // 영상 id → {video, thumb}
  const [script, setScript] = useState(false);
  const got = src[it.id];
  const video = useRef(null);
  useEffect(() => {
    if (got || !fileUrl) return;
    let alive = true;
    Promise.all([it.hasVideo ? fileUrl(it.id) : null, fileUrl(`${it.id}-thumb.jpg`)]).then(([v, t]) => {
      if (!alive) return;
      // 앞뒤를 자른 영상은 같은 이름으로 덮였으니 예전 것이 안 나오게
      const at = it.trim?.status === "done" && it.trim.at;
      setSrc((p) => ({ ...p, [it.id]: { video: v && at ? `${v}${v.includes("?") ? "&" : "?"}v=${encodeURIComponent(at)}` : v, thumb: t } }));
    });
    return () => {
      alive = false;
    };
  }, [it, got, fileUrl]);
  // 대본의 시각을 누르면 그 장면부터
  useEffect(() => {
    const v = video.current;
    if (!seek || !v) return;
    v.currentTime = seek.t;
    v.play().catch(() => {});
  }, [seek]);
  // 접으면 멈춘다
  useEffect(() => {
    if (fold && !wide) video.current?.pause();
  }, [fold, wide]);

  const r = it.reference || {};
  const kind = hookKind(r.structure?.hookType).name;
  const media = got?.video ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={video}
      key={got.video}
      src={got.video}
      poster={got.thumb || undefined}
      controls
      playsInline
      muted
      loop
      autoPlay
      onLoadedData={(e) => e.currentTarget.play().catch(() => {})}
      className="h-full w-full bg-black object-contain"
    />
  ) : got?.thumb ? (
    <img src={got.thumb} alt="" className="h-full w-full object-contain" />
  ) : (
    <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-stone-500">
      {got ? (
        <>
          <Clapperboard size={18} /> 영상이 보관되지 않았어요
        </>
      ) : (
        <Loader2 size={16} className="animate-spin" />
      )}
    </span>
  );
  const tabs =
    clips.length > 1 ? (
      <div className="flex flex-wrap gap-1">
        {clips.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(i)}
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-medium " +
              (c.id === clip.id ? "bg-white text-stone-900" : c.own ? "bg-sky-900/60 text-sky-100 hover:bg-sky-900" : "bg-stone-700 text-stone-200 hover:bg-stone-600")
            }
          >
            {c.label}
          </button>
        ))}
      </div>
    ) : null;
  const info = (
    <div className="min-w-0 space-y-0.5">
      <div className="truncate text-xs font-semibold text-white">{it.title || r.title || "레퍼런스"}</div>
      {kind && <div className="truncate text-[11px] text-stone-400">{kind}</div>}
    </div>
  );
  const links = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {r.script && (
        <button type="button" onClick={() => setScript(!script)} className="flex items-center gap-0.5 font-medium text-stone-300 hover:text-white">
          레퍼 대본 <ChevronDown size={12} className={script ? "rotate-180" : ""} />
        </button>
      )}
      {onOpenRef && (
        <button type="button" onClick={() => onOpenRef(it)} className="flex items-center gap-0.5 text-stone-400 hover:text-white">
          자세히 <ExternalLink size={11} />
        </button>
      )}
    </div>
  );
  const refScript = script && r.script && (
    <p className={"overflow-y-auto rounded-lg bg-stone-800 px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-stone-200 " + (wide ? "" : "max-h-28")}>{r.script}</p>
  );

  if (wide)
    return (
      <aside className="flex w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto bg-stone-900 p-3">
        {tabs}
        <div className="aspect-[9/16] max-h-[60vh] w-full overflow-hidden rounded-lg bg-stone-950">{media}</div>
        {info}
        {links}
        {refScript}
      </aside>
    );
  return (
    <div className="shrink-0 bg-stone-900 px-3 py-2">
      {fold && (
        <button type="button" onClick={() => onFold(false)} className="flex w-full items-center gap-2 py-0.5 text-left text-xs font-medium text-stone-200">
          <Play size={13} className="fill-current" />
          <span className="min-w-0 flex-1 truncate">
            레퍼런스 영상 보기 <span className="text-stone-400">· {clip.label}</span>
          </span>
          <ChevronDown size={14} />
        </button>
      )}
      <div className={fold ? "hidden" : "flex gap-3"}>
        <div className="h-[200px] w-[113px] shrink-0 overflow-hidden rounded-lg bg-stone-950 sm:h-[260px] sm:w-[146px]">{media}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {tabs}
          {info}
          {links}
          {refScript}
          <button type="button" onClick={() => onFold(true)} className="mt-auto flex items-center gap-0.5 self-start text-[11px] text-stone-400 hover:text-white">
            접기 <ChevronDown size={12} className="rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}

const FOLD_KEY = "poclo_refplayer_fold";

function PlanView({ item, library, fileUrl, onRemove, onOpenRef, onSave, onAgain, onClose }) {
  const p = item.plan || {};
  const ref = library.find((i) => i.id === item.refId);
  const [refThumb, setRefThumb] = useState(null);
  useEffect(() => {
    let alive = true;
    if (ref && fileUrl) fileUrl(`${ref.id}-thumb.jpg`).then((u) => alive && setRefThumb(u));
    return () => {
      alive = false;
    };
  }, [ref, fileUrl]);
  const tpl = ref?.reference?.template;
  const filledScript = tpl ? fillTemplate(tpl, item.filled) : "";
  const clips = refClips(item, library);
  const wide = useWide();
  const [cur, setCur] = useState(0);
  const [seek, setSeek] = useState(null);
  const [fold, setFoldState] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setFold = (f) => {
    setFoldState(f);
    try {
      localStorage.setItem(FOLD_KEY, f ? "1" : "0");
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  const show = (id) => {
    const i = clips.findIndex((c) => c.id === id);
    if (i >= 0) setCur(i);
    setFold(false);
  };
  const seekTo = (t) => {
    show(ref?.id);
    setSeek((x) => ({ t, n: (x?.n || 0) + 1 }));
  };
  const canSeek = !item.mix && clips.length > 0 && clips[0].item.hasVideo;
  // 바탕 대본의 시각은 바탕이 된 레퍼런스 것 — 섞어 만들기면 '대본 말투'(없으면 '내용 흐름') 레퍼런스
  const baseId = item.mix ? item.mix.script || item.mix.flow : ref?.id;
  const baseClip = clips.find((c) => c.id === baseId);
  const seekBase = baseClip?.item.hasVideo
    ? (t) => {
        show(baseId);
        setSeek((x) => ({ t, n: (x?.n || 0) + 1 }));
      }
    : undefined;
  return (
    <div className="flex max-h-[92vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <EditableTitle
            value={item.title || `릴스 · ${short(item.product?.name)}`}
            onChange={(t) => onSave({ ...item, title: t })}
          />
          <div className="mt-0.5 text-xs text-stone-500">
            {item.mix ? "틀: 섞어서 만듦" : ref ? `틀: ${hookKind(ref.reference?.structure?.hookType).name || item.refTitle}${item.auto ? " (알아서 고름)" : ""}` : item.refTitle ? `틀: ${item.refTitle}` : "레퍼런스 없이 기본 판매형 구조"}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>
      {clips.length > 0 && !wide && (
        <RefPlayer key={item.id} clips={clips} cur={cur} onPick={setCur} fileUrl={fileUrl} seek={seek} wide={false} fold={fold} onFold={setFold} onOpenRef={onOpenRef} />
      )}
      <div className="flex min-h-0 flex-1">
      {clips.length > 0 && wide && <RefPlayer key={item.id} clips={clips} cur={cur} onPick={setCur} fileUrl={fileUrl} seek={seek} wide fold={false} onFold={setFold} onOpenRef={onOpenRef} />}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {p.looks?.filter((l) => l.n > 0).length > 1 && (
          <div className="rounded-xl border border-stone-200 px-3 py-2">
            <div className="text-xs font-semibold text-stone-500">룩 {p.looks.filter((l) => l.n > 0).length}개</div>
            <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
              {p.looks.filter((l) => l.n > 0).map((l) => (
                <li key={l.n}>
                  <b className="font-semibold text-stone-800">룩 {l.n}</b> {l.name} — {l.point}
                </li>
              ))}
            </ul>
          </div>
        )}
        {item.mix && (
          <div className="rounded-xl border border-stone-200 px-3 py-2.5">
            <div className="mb-1.5 text-xs font-semibold text-stone-500">섞어서 만들었어요</div>
            <ul className="space-y-1 text-xs">
              {MIX_PARTS.map(([k, label]) => {
                const it = library.find((i) => i.id === item.mix[k]);
                return (
                  <li key={k} className="flex items-baseline gap-2">
                    <span className="w-20 shrink-0 font-semibold text-stone-700">{label}</span>
                    {it ? (
                      <button type="button" onClick={() => show(it.id)} title="이 영상을 위(옆) 화면에서 보기" className="min-w-0 truncate text-left text-rose-700 hover:underline">
                        {hookKind(it.reference?.structure?.hookType).name || it.title} · {it.title}
                      </button>
                    ) : (
                      <span className="text-stone-400">알아서</span>
                    )}
                  </li>
                );
              })}
              {(item.own || []).map((o, i) => (
                <li key={o.key} className="flex items-baseline gap-2">
                  <span className="w-20 shrink-0 font-semibold text-sky-800">소스 {i + 1}</span>
                  {o.kind === "lib" && clips.some((c) => c.id === o.id) ? (
                    <button type="button" onClick={() => show(o.id)} className="min-w-0 truncate text-left text-sky-800 hover:underline">
                      우리 영상 · {o.title}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-stone-600">우리 영상 · {o.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ref && !item.mix && (
          <div className="rounded-xl border border-stone-200 px-3 py-2.5">
            <div className="mb-2 text-xs font-semibold text-stone-500">이 틀로 찍어요{item.auto ? " · 알아서 고름" : ""}</div>
            <RefSummary item={ref} thumb={refThumb} />
          </div>
        )}
        {p.chosenWhy && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950">
            <div className="text-xs font-semibold text-rose-800">{item.mix ? "어떻게 섞었나" : "왜 이 틀"}</div>
            <p className="mt-0.5 leading-relaxed">{p.chosenWhy}</p>
          </div>
        )}
        <EditableText key={`h${p.hook}`} label="첫 1~3초 훅" value={p.hook} strong tone="soft" onSave={(v) => onSave({ ...item, plan: { ...p, hook: v } })} />
        {filledScript && !p.baseLines?.length && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500">
                레퍼런스 틀에 채운 대본{canSeek && <span className="ml-1.5 font-normal text-stone-400">시각을 누르면 레퍼런스가 그 장면부터 나와요</span>}
              </span>
              <CopyButton text={filledScript} />
            </div>
            <div className="rounded-xl border border-stone-200 px-3 py-2.5 leading-relaxed whitespace-pre-wrap text-stone-800">
              {filledScript.split("\n").map((ln, i) => {
                const m = canSeek && ln.match(STAMP);
                if (!m) return <div key={i}>{ln || "\u00a0"}</div>;
                return (
                  <div key={i}>
                    <button
                      type="button"
                      onClick={() => seekTo(Number(m[1]) * 60 + Number(m[2]))}
                      className="mr-1 rounded bg-rose-50 px-1 text-xs font-medium text-rose-700 tabular-nums hover:bg-rose-100"
                    >
                      ▶ {m[0].trim()}
                    </button>
                    {ln.slice(m[0].length)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <BaseScript key={`s${p.script}`} plan={p} onSeek={seekBase} onSave={(v) => onSave({ ...item, plan: { ...p, script: v } })} />
        {p.scenes?.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">촬영 순서</div>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
              {p.scenes.map((s, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="w-14 shrink-0 text-xs text-stone-400">
                    {s.at}
                    {s.look > 0 && <span className="block text-[10px] text-rose-600">룩 {s.look}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-stone-700">{s.shot}</span>
                    {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.shots?.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-stone-500">
              <Camera size={12} /> 이런 컷처럼 찍기 (상품 사진)
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {p.shots.map((s, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-stone-200">
                  {s.photo > 0 && p.images?.[s.photo - 1] ? (
                    <img src={p.images[s.photo - 1]} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-stone-100 text-stone-300">
                      <Camera size={18} />
                    </div>
                  )}
                  <p className="px-2 py-1.5 text-[11px] leading-snug text-stone-600">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <EditableText key={`c${p.caption}`} label="인스타 본문" value={p.caption} tone="soft" copy onSave={(v) => onSave({ ...item, plan: { ...p, caption: v } })} />
        <p className="-mt-1.5 px-1 text-xs text-stone-500">{(p.hashtags || []).join(" ")}</p>
        <PlanChat item={item} onSave={onSave} />
      </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 릴스 기획안을 지울까요?")) {
              onRemove(item.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
        >
          <Trash2 size={13} /> 지우기
        </button>
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => onAgain(item)} className="flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline">
            <RotateCw size={12} /> 다시 만들기 (갈아엎기)
          </button>
          <a href={item.product?.url} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline">
            상품 페이지 열기
          </a>
        </span>
      </footer>
    </div>
  );
}

export default function ProductReelTab({ stats, library, plans, fileUrl, folders, onSavePlan, onRemovePlan, onOpenRef }) {
  // draft = {looks, memo, prev?, id?, title?} — 새로 만들거나, 기존 기획을 갈아엎을 때
  const [draft, setDraftState] = useState(() => {
    const d = readDraft();
    // 5분 넘게 '만드는 중' 이면 끊긴 것으로 본다
    return d && d.running && Date.now() - d.running > 5 * 60 * 1000 ? { ...d, running: null } : d;
  });
  const setDraft = (d) => {
    setDraftState(d);
    writeDraft(d);
  };
  const [view, setView] = useState(null);
  // 떠나 있는 동안 맡긴 기획이 끝났으면(목록에 새로 들어왔으면) 만들던 칸을 닫는다
  const runningSince = draft?.running;
  const landed = runningSince && plans.some((x) => x.createdAt && new Date(x.createdAt).getTime() >= runningSince - 1000);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    if (landed) setDraft(null);
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {draft?.running && !landed && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 size={15} className="animate-spin" /> 아까 맡긴 기획을 만드는 중이에요. 끝나면 아래 목록에 들어와요.
        </div>
      )}
      {draft ? (
        <Make
          draft={draft}
          stats={stats}
          library={library}
          fileUrl={fileUrl}
          folders={folders}
          onCancel={() => setDraft(null)}
          onDone={async (item) => {
            await onSavePlan(item);
            setDraft(null);
            setView(item);
          }}
        />
      ) : (
        <FirstPick stats={stats} onPick={(p) => setDraft({ looks: [emptyLook([p])], memo: "" })} />
      )}

      {plans.length === 0 ? (
        <Empty title="아직 만든 상품 릴스 기획이 없어요." hint="위에서 상품을 고르면 라이브러리의 잘 된 릴스 구조로 기획해요." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <button key={p.id} type="button" onClick={() => setView(p)} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-rose-300 hover:shadow-sm">
              {p.product?.image ? (
                <img src={p.product.image} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
                  <Clapperboard size={20} />
                </span>
              )}
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium text-stone-900">{p.title || short(p.product?.name)}</span>
                <span className="mt-1 line-clamp-2 block text-xs font-semibold text-rose-700">{p.plan?.hook}</span>
                <span className="mt-1 block truncate text-[11px] text-stone-400">
                  {hookKind(library.find((i) => i.id === p.refId)?.reference?.structure?.hookType).name || p.refTitle || "기본 구조"} ·{" "}
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {view && (
        <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setView(null)} className="absolute inset-0 cursor-default" />
          <div
            className={
              "sheet relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl " +
              (refClips(plans.find((x) => x.id === view.id) || view, library).length ? "lg:max-w-5xl" : "")
            }
          >
            <PlanView
              key={view.id}
              item={plans.find((x) => x.id === view.id) || view}
              library={library}
              fileUrl={fileUrl}
              onRemove={onRemovePlan}
              onSave={onSavePlan}
              onAgain={(item) => {
                setView(null);
                setDraft({
                  id: item.id,
                  title: item.title,
                  createdAt: item.createdAt,
                  looks: item.looks?.length ? item.looks : [emptyLook([item.product])],
                  memo: item.memo || "",
                  refId: item.mix ? "mix" : item.auto ? "auto" : item.refId,
                  mix: item.mix || {},
                  own: item.own || [],
                  closeness: item.plan?.closeness,
                  angle: item.angleSt,
                  prev: item.plan,
                });
              }}
              onOpenRef={(ref) => {
                setView(null);
                onOpenRef(ref);
              }}
              onClose={() => setView(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
