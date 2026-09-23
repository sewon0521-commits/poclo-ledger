// 누를 때 나는 작은 소리 (세원 9/23: "클릭하면 귀에 거슬리지 않는 클릭 효과음").
// 9/24 "살짝 거슬려, 다른 걸로" → 음이 있는 '톡'(사인파 800→480Hz)을 빼고, 음이 거의 없는 소리 셋 중에 고르게 했다.
// 파일을 받지 않고 브라우저가 그 자리에서 만든다(Web Audio). 버튼·링크·체크에만, 글자 칠 때는 안 난다.
// 고른 것은 기기마다(localStorage). 왼쪽 띠 아래 스피커 단추에서 고른다.

const KEY = "poclo_click_sound";
export const SOUNDS = [
  ["soft", "사각", "종이를 살짝 스치는 소리 · 가장 조용함"],
  ["wood", "나무 톡", "낮고 짧게 두드리는 소리"],
  ["key", "딸깍", "키보드처럼 가볍게"],
  ["off", "끄기", "소리 없음"],
];

let ctx = null;
let noise = null;
let last = 0;

export function soundKind() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "on" || !v) return "soft"; // 예전 '켬' → 새 기본
    return SOUNDS.some(([k]) => k === v) ? v : "soft";
  } catch {
    return "soft";
  }
}

export function setSoundKind(k) {
  try {
    localStorage.setItem(KEY, k);
  } catch {
    /* 사생활 보호 창 등 — 이번 화면에서만 */
  }
}

function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  if (!noise) {
    // 짧은 잡음 한 조각을 만들어 두고 돌려 쓴다
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** 잡음 → 거르개 → 짧게 사라지는 소리 */
function burst(a, { type, freq, q = 0.7, peak, len }) {
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + len + 0.01);
}

export function tick(kind = soundKind()) {
  if (kind === "off") return;
  const now = performance.now();
  if (now - last < 40) return; // 한 번 누름에 두 번 울리지 않게
  last = now;
  try {
    const a = audio();
    if (kind === "soft") {
      burst(a, { type: "lowpass", freq: 1400, peak: 0.09, len: 0.018 });
    } else if (kind === "key") {
      burst(a, { type: "bandpass", freq: 3200, q: 1.2, peak: 0.12, len: 0.012 });
    } else {
      // 나무 톡 — 낮은 사인 아주 짧게 + 두드림 잡음
      const t = a.currentTime;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 0.045);
      burst(a, { type: "bandpass", freq: 900, q: 1, peak: 0.04, len: 0.01 });
    }
  } catch {
    /* 소리를 못 내는 브라우저 — 조용히 넘어간다 */
  }
}

const PRESSABLE = 'button, a[href], summary, [role="button"], input[type="checkbox"], input[type="radio"], select';

/** 앱 전체에 한 번 건다 */
export function installClickSound() {
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      if (el.closest("[data-sound-menu]")) return; // 고르는 칸은 고른 소리를 직접 들려준다
      tick();
    },
    true,
  );
}
