// 누를 때 나는 작은 소리 (세원 9/23: "클릭하면 귀에 거슬리지 않는 클릭 효과음").
// 파일을 받지 않고 브라우저가 그 자리에서 만든다(Web Audio) — 짧고 낮은 '톡' 한 번.
//  - 높은 '삑'은 거슬려서 800Hz 에서 480Hz 로 내려가는 사인파, 40ms, 아주 작게.
//  - 버튼·링크·체크 같은 '누르는 것'에만. 글자 칠 때·빈 곳 누를 때는 안 난다.
//  - 켜고 끄기는 기기마다(localStorage). 왼쪽 띠 아래 스피커 단추.

const KEY = "poclo_click_sound";
let ctx = null;
let last = 0;

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 사생활 보호 창 등 — 이번 화면에서만 */
  }
}

export function tick() {
  const now = performance.now();
  if (now - last < 40) return; // 한 번 누름에 두 번 울리지 않게
  last = now;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.04);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
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
      if (!soundOn()) return;
      const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      tick();
    },
    true,
  );
}
