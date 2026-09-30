// 영상에서 소리만 뽑기 (9/30 세원: "BGM 만 따로 뽑아서 다운받을 수 있게").
// 서버·사무실 PC 없이 브라우저가 한다 — 영상을 받아 소리를 풀고(decodeAudioData) WAV 파일로 싼다. 폰에서도 된다.
// 영상에 들어 있는 소리 그대로다 — 목소리가 섞인 영상이면 목소리도 같이 나온다(음악만 가르는 건 못 한다).

/** 영상 주소 → WAV Blob. 소리가 없으면 오류 */
export async function extractWav(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("영상을 받지 못했어요. 다시 열어서 해 보세요.");
  const buf = await res.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let audio;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error("이 영상에는 소리가 없거나, 브라우저가 소리를 풀지 못했어요.");
  } finally {
    ctx.close?.();
  }
  const ch = Math.min(2, audio.numberOfChannels);
  const n = audio.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
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
  return { blob: new Blob([out], { type: "audio/wav" }), seconds: audio.duration };
}

/** Blob 을 파일로 내려받기 */
export function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
