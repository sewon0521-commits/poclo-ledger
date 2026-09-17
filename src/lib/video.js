// 영상에서 장면 사진을 떠낸다.
//
// **Claude는 영상 파일을 못 읽는다** (글자·이미지·PDF만 받는다). 그래서 릴스 레퍼런스를
// 읽히려면 브라우저가 먼저 영상을 장면 사진으로 바꿔야 한다. 소리는 어차피 못 들으므로
// 자막이 박힌 릴스가 잘 읽히고, 목소리만 있는 릴스는 사람이 받아쓴 말을 같이 보낸다.
//
// 영상 파일 자체는 어디에도 올라가지 않는다 — 사진 몇 장만 서버 함수로 간다.

/** 영상 길이에 맞춰 몇 장을 뜰지. 짧은 릴스는 촘촘히, 긴 영상은 듬성듬성. */
const frameCount = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 8;
  if (seconds <= 10) return 8;
  if (seconds <= 20) return 10;
  if (seconds <= 40) return 12;
  return 14;
};

/**
 * @returns {Promise<{frames: {at: number, data: string}[], seconds: number, width: number, height: number}>}
 *   data 는 base64 JPEG (data: 접두어 없음)
 */
export async function extractFrames(file, { longEdge = 900, quality = 0.7, onStep } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("이 영상을 브라우저가 못 열어요. mp4(H.264)로 저장해서 넣어보세요."));
      setTimeout(() => reject(new Error("영상을 여는 데 너무 오래 걸려요.")), 30000);
    });

    const seconds = Number.isFinite(video.duration) ? video.duration : 0;
    const count = frameCount(seconds);
    // 맨 앞·맨 끝은 검은 화면인 경우가 많아 살짝 안쪽에서 뜬다
    const from = seconds > 2 ? 0.2 : 0;
    const to = seconds > 2 ? seconds - 0.2 : seconds;
    const step = count > 1 ? (to - from) / (count - 1) : 0;

    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    const scale = Math.min(1, longEdge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");

    const frames = [];
    for (let i = 0; i < count; i++) {
      const at = seconds ? from + step * i : 0;
      await new Promise((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("장면을 뜨지 못했어요."));
        video.currentTime = at;
        setTimeout(resolve, 5000); // 어쩌다 seeked 가 안 오면 그냥 지금 화면을 쓴다
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        at: Math.round(at * 10) / 10,
        data: canvas.toDataURL("image/jpeg", quality).split(",")[1],
      });
      onStep?.(i + 1, count);
    }
    return { frames, seconds: Math.round(seconds * 10) / 10, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
