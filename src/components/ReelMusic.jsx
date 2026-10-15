import { useState } from "react";
import { Music, Download, Library, Loader2, ExternalLink, Check, Copy, AudioLines } from "lucide-react";
import { musicOf } from "../lib/reels";
import { prepareAudio, putMusic, queueInstaAudio } from "../lib/music";
import { changeKey, upsert } from "../lib/shoot";
import { newId } from "../lib/id";
import { saveBlob } from "../lib/audio";

/**
 * 릴스 음원 (10/13 세원: "인스타 링크 붙일 때 음원도 가져와 줘. 음원에 제목이 있으면 그것도 같이")
 * 제목·가수는 분석기가 인스타에서 받아 meta.music 에 둔다. 소리 파일은 보관된 영상에서 그때그때 뽑는다
 * (저장소가 거의 차서 미리 따로 보관하지 않는다) — '영상 소리 받기' = m4a 내려받기, '영상 소리 담기' = 콘텐츠 › 음악 보관함으로.
 * 10/15 '전곡 담기' — 인스타 음원 페이지의 원곡 전체(목소리 없음)를 사무실 PC 가 받아 음악 보관함에 넣는다(lib/music queueInstaAudio).
 *   상태는 item.musicFull {id, status: queued|done|error, message} — 분석기가 다 받으면 done 으로 고친다.
 */
export default function ReelMusic({ item, videoUrl, online, onSave }) {
  const m = musicOf(item.meta);
  const [busy, setBusy] = useState(""); // "" | "get" | "keep"
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  if (!m && !videoUrl) return null;

  const pull = async () => {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error("영상을 못 받았어요. 잠시 뒤 다시 해 보세요.");
    const file = new File([await res.blob()], "reel.mp4", { type: "video/mp4" });
    return prepareAudio(file);
  };
  const name = m?.fileName || `${String(item.title || "릴스").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 40)}_소리`;

  const get = async () => {
    setBusy("get");
    setMsg("");
    try {
      const a = await pull();
      saveBlob(a.blob, `${name}.${a.ext}`);
    } catch (e) {
      setMsg(e.message || "소리를 뽑지 못했어요.");
    } finally {
      setBusy("");
    }
  };
  const keep = async () => {
    setBusy("keep");
    setMsg("");
    try {
      const a = await pull();
      const id = newId("m");
      const key = `music/${id}.${a.ext}`;
      await putMusic(key, a.blob, a.type, online);
      await changeKey("music", online, upsert({
        id,
        title: name,
        key,
        type: a.type,
        size: a.blob.size,
        seconds: a.seconds,
        folderId: null,
        source: [m ? (m.original ? `인스타 원본 오디오${m.artist ? ` @${m.artist}` : ""}` : `인스타 음원 ${m.label}`) : "", item.meta?.url || ""].filter(Boolean).join(" · "),
        memo: "릴스 영상에서 뽑은 소리 — 목소리가 섞여 있을 수 있어요",
        note: a.note,
        best: false,
        createdAt: new Date().toISOString(),
      }));
      await onSave({ ...item, musicSaved: { id, at: new Date().toISOString() } });
    } catch (e) {
      setMsg(e.message || "음악 보관함에 담지 못했어요.");
    } finally {
      setBusy("");
    }
  };

  const full = item.musicFull || null;
  const takeFull = async () => {
    setBusy("full");
    setMsg("");
    try {
      const r = await queueInstaAudio({ url: m.url, title: m.label || m.title, reelId: item.id, source: item.meta?.url || "" }, online);
      await onSave({ ...item, musicFull: { id: r.id, status: r.exists ? "done" : "queued", at: new Date().toISOString() } });
      if (r.exists) setMsg("이 음원은 이미 음악 보관함에 있어요.");
    } catch (e) {
      setMsg(e.message || "전곡 받기를 맡기지 못했어요.");
    } finally {
      setBusy("");
    }
  };

  const btn = "flex items-center gap-1 rounded-md bg-stone-700 px-2 py-1 text-[11px] font-medium text-stone-100 hover:bg-stone-600 disabled:opacity-40";
  return (
    <div className="mt-2 rounded-lg bg-stone-800 p-2 text-[11px] text-stone-300">
      <div className="flex items-center gap-1 text-stone-400">
        <Music size={11} /> 음원
        {m?.trending && <span className="rounded bg-rose-600/80 px-1 text-[10px] text-white">인기 음원</span>}
      </div>
      {m ? (
        <div className="mt-1 flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <div className="font-medium break-words text-white">{m.original ? m.title : m.title || "제목 없음"}</div>
            {m.artist && <div className="break-words text-stone-400">{m.original ? `@${m.artist}` : m.artist}</div>}
          </div>
        </div>
      ) : (
        <div className="mt-1 text-stone-500">음원 정보가 없어요 (파일로 넣었거나 예전에 받은 릴스)</div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {m && !m.original && m.title && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(m.label);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                window.prompt("복사해서 쓰세요", m.label);
              }
            }}
            className={btn}
          >
            {copied ? <Check size={11} className="text-emerald-300" /> : <Copy size={11} />} {copied ? "복사됨" : "제목 복사"}
          </button>
        )}
        {m?.url && (
          <a href={m.url} target="_blank" rel="noreferrer" className={btn} title="인스타에서 이 음원 페이지 — 우리 릴스에 같은 음원 쓰기">
            <ExternalLink size={11} /> 인스타 음원
          </a>
        )}
        {m?.url &&
          (full?.status === "done" ? (
            <span className="flex items-center gap-1 px-1 py-1 text-emerald-300" title="콘텐츠 › 음악 보관함">
              <Check size={11} /> 전곡이 음악 보관함에 있어요
            </span>
          ) : full?.status === "queued" ? (
            <span className="flex items-center gap-1 px-1 py-1 text-amber-200" title="사무실 PC 분석기가 받아요 — 보통 10~20초">
              <Loader2 size={11} className="animate-spin" /> 전곡 받는 중 (사무실 PC)
            </span>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              onClick={takeFull}
              className="flex items-center gap-1 rounded-md bg-rose-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-600 disabled:opacity-40"
              title="인스타 음원 페이지에서 원곡 전체를 받아 음악 보관함에 넣어요 (사무실 PC, 무료)"
            >
              {busy === "full" ? <Loader2 size={11} className="animate-spin" /> : <AudioLines size={11} />} {full?.status === "error" ? "전곡 다시 담기" : "전곡 담기"}
            </button>
          ))}
        {videoUrl && (
          <button type="button" disabled={!!busy} onClick={get} className={btn} title="영상의 소리를 m4a 파일로 내려받아요">
            {busy === "get" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} 영상 소리 받기
          </button>
        )}
        {videoUrl &&
          (item.musicSaved ? (
            <span className="flex items-center gap-1 px-1 py-1 text-emerald-300">
              <Check size={11} /> 영상 소리 담김
            </span>
          ) : (
            <button type="button" disabled={!!busy} onClick={keep} className={btn} title="콘텐츠 › 음악 보관함에 넣어 둬요">
              {busy === "keep" ? <Loader2 size={11} className="animate-spin" /> : <Library size={11} />} 영상 소리 담기
            </button>
          ))}
      </div>
      {full?.status === "error" && full.message && <div className="mt-1 text-rose-300">전곡 받기 실패 — {full.message}</div>}
      {msg && <div className="mt-1 text-rose-300">{msg}</div>}
      <div className="mt-1 text-[10px] text-stone-500">
        {m?.url && "전곡 = 인스타 음원 원곡 전체(목소리 없음)" + (m.original ? "" : " · 저작권 음원이라 올릴 땐 인스타에서 같은 음원을 고르세요")}
        {m?.url && videoUrl && <br />}
        {videoUrl && "영상 소리 = 영상 속 소리 그대로라 목소리가 섞일 수 있어요"}
      </div>
    </div>
  );
}
