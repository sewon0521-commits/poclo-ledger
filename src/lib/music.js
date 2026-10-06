// 음악 보관함 (10/6 세원: "릴스를 많이 만들다 보니 저작권 없는 음악이 많이 필요한데, 맨날 다운받거나 녹음하고 지우고가 반복돼서 저장하는 칸")
//
// 목록은 settings 'music' {items:[{id, title, key, type, size, seconds, folderId, source, memo, best, createdAt, from}]},
// 폴더는 'music_folders' (릴스·캐러셀과 같은 부품). 파일은 Storage 'reels' 버킷 music/<id>.<확장자>.
// ⚠ 공유 저장소(무료 1GB)가 10/6 에 940MB 였다 — 그래서 크게 오는 것(WAV·영상·녹화)은 소리만 AAC(m4a)로 줄여서 넣는다.
//   mp3·m4a·aac 는 이미 작아서 그대로. 줄이기는 브라우저 WebCodecs(AudioEncoder) — 안 되는 브라우저면 WAV 로.
// 이 기기 저장 모드(시험용)에서는 파일을 IndexedDB 에 둔다.

import { isRemote, supabase } from "./supabase";

const KEEP = /\.(mp3|m4a|aac)$/i;
const KEEP_TYPE = /^audio\/(mpeg|mp3|mp4|x-m4a|aac|m4a)$/i;
export const isMediaFile = (f) => /^(audio|video)\//.test(f.type || "") || /\.(mp3|m4a|aac|wav|flac|aiff?|ogg|opus|webm|mp4|mov|m4v)$/i.test(f.name || "");

const extOf = (f) => (f.name || "").match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "";
const TYPE_OF = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav" };

/** 영상·WAV 등 → 소리만 풀기 (AudioBuffer) */
async function decode(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`'${file.name}' 에서 소리를 못 풀었어요. 소리가 없는 영상이거나 브라우저가 못 여는 형식이에요.`);
  } finally {
    ctx.close?.();
  }
}

/** AudioBuffer → AAC m4a (WebCodecs). 안 되면 null */
async function toM4a(audio) {
  if (typeof window.AudioEncoder !== "function" || typeof window.AudioData !== "function") return null;
  const ch = Math.min(2, audio.numberOfChannels);
  const rate = audio.sampleRate;
  const cfg = { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: ch, bitrate: 160000 };
  try {
    if (!(await window.AudioEncoder.isConfigSupported(cfg)).supported) return null;
  } catch {
    return null;
  }
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, audio: { codec: "aac", numberOfChannels: ch, sampleRate: rate }, fastStart: "in-memory" });
  let failed = null;
  const enc = new window.AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failed = e) });
  enc.configure(cfg);
  const planes = Array.from({ length: ch }, (_, c) => audio.getChannelData(c));
  for (let i = 0; i < audio.length; i += rate) {
    const n = Math.min(rate, audio.length - i);
    const data = new Float32Array(n * ch);
    planes.forEach((p, c) => data.set(p.subarray(i, i + n), c * n));
    const frame = new window.AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((i / rate) * 1e6), data });
    enc.encode(frame);
    frame.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
  }
  await enc.flush();
  enc.close();
  if (failed) return null;
  muxer.finalize();
  return new Blob([target.buffer], { type: "audio/mp4" });
}

/** AudioBuffer → WAV (줄이기가 안 되는 브라우저용) */
function toWav(audio) {
  const ch = Math.min(2, audio.numberOfChannels);
  const n = audio.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, audio.sampleRate, true);
  out.setUint32(28, audio.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => audio.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/** 파일 길이(초) — 그대로 넣는 mp3·m4a 용 */
function lengthOf(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const u = URL.createObjectURL(blob);
    const done = (v) => {
      URL.revokeObjectURL(u);
      resolve(Number.isFinite(v) ? v : null);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    a.src = u;
  });
}

/**
 * 넣을 파일 → {blob, ext, type, seconds, note}
 *   mp3·m4a·aac 는 그대로, 나머지(WAV·영상·녹화·ogg…)는 소리만 m4a 로 줄인다.
 */
export async function prepareAudio(file, onStep = () => {}) {
  const ext = extOf(file);
  if (KEEP.test(file.name || "") || (!ext && KEEP_TYPE.test(file.type || ""))) {
    const e = ext || (/mpeg|mp3/.test(file.type) ? "mp3" : "m4a");
    return { blob: file, ext: e, type: TYPE_OF[e] || file.type, seconds: await lengthOf(file), note: "" };
  }
  const video = /^video\//.test(file.type || "") || /\.(mp4|mov|m4v|webm)$/i.test(file.name || "");
  onStep(video ? "영상에서 소리만 뽑는 중…" : "소리 푸는 중…");
  const audio = await decode(file);
  onStep("작게 줄이는 중…");
  const m4a = await toM4a(audio);
  const from = video ? "영상에서 소리만" : "";
  if (m4a) return { blob: m4a, ext: "m4a", type: "audio/mp4", seconds: audio.duration, note: [from, `${mb(file.size)} → ${mb(m4a.size)}`].filter(Boolean).join(" · ") };
  const wav = toWav(audio);
  return { blob: wav, ext: "wav", type: "audio/wav", seconds: audio.duration, note: from };
}

export const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round((n || 0) / 1e3))}KB`);
export const mmss = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

// ------------------------------------------------------------- 보관 (Storage · 이 기기 IndexedDB)

const remoteOn = (online) => isRemote && online;

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("poclo_music", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("files", mode);
    const req = fn(t.objectStore("files"));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function putMusic(key, blob, type, online) {
  if (!remoteOn(online)) {
    await idbDo("readwrite", (s) => s.put(blob, key));
    return;
  }
  const { error } = await supabase.storage.from("reels").upload(key, blob, { upsert: true, contentType: type });
  if (error) {
    const full = /quota|exceed|limit|too large|payload/i.test(error.message || "");
    throw new Error(full ? `저장 공간이 모자라서 못 넣었어요 (${error.message}). 공유 저장소 용량을 늘리거나 안 쓰는 영상을 지워야 해요.` : `음악을 보관하지 못했어요 (${error.message}).`);
  }
}

const URLS = new Map(); // key → {url, exp}
/** 들을 주소 (4시간) */
export async function musicUrl(key, online) {
  const hit = URLS.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  let url = "";
  if (!remoteOn(online)) {
    const blob = await idbDo("readonly", (s) => s.get(key));
    url = blob ? URL.createObjectURL(blob) : "";
  } else {
    const { data } = await supabase.storage.from("reels").createSignedUrl(key, 60 * 60 * 4);
    url = data?.signedUrl || "";
  }
  if (url) URLS.set(key, { url, exp: Date.now() + 3 * 3600 * 1000 });
  return url;
}

/** 내려받기 — 파일 이름은 '제목.확장자' */
export async function downloadMusic(item, online) {
  const name = `${(item.title || "음악").replace(/[\\/:*?"<>|]+/g, " ").trim()}.${item.key.split(".").pop()}`;
  let href = "";
  if (!remoteOn(online)) {
    const blob = await idbDo("readonly", (s) => s.get(item.key));
    if (!blob) throw new Error("이 기기에 파일이 없어요.");
    href = URL.createObjectURL(blob);
  } else {
    const { data, error } = await supabase.storage.from("reels").createSignedUrl(item.key, 600, { download: name });
    if (error || !data?.signedUrl) throw new Error("내려받을 주소를 못 만들었어요. 다시 해 보세요.");
    href = data.signedUrl;
  }
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function removeMusic(key, online) {
  URLS.delete(key);
  if (!remoteOn(online)) return idbDo("readwrite", (s) => s.delete(key));
  await supabase.storage.from("reels").remove([key]);
}
