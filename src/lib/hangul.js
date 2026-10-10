// 영문 자판으로 친 글자를 한글로 (두벌식) — 10/10 세원: "예금주 적을 때 그냥 처음에 한글로 나오게"
// 웹 페이지는 자판의 한/영을 바꿀 수 없어서, 영문으로 쳐도 한글로 바꿔 보여 준다. 'ghdrlfehd' → '홍길동'.

const KEY = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const V2 = { "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ" };
const C2 = { "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ" };
const SPLIT_V = Object.fromEntries(Object.entries(V2).map(([k, v]) => [v, k]));
const SPLIT_C = Object.fromEntries(Object.entries(C2).map(([k, v]) => [v, k]));
const BACK = Object.fromEntries(Object.entries(KEY).map(([k, v]) => [v, k]));
const isV = (j) => JUNG.includes(j);

const syl = (c, v, t = "") => String.fromCharCode(0xac00 + (CHO.indexOf(c) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(t));

/** 자모 줄 → 글자 */
function compose(jamo) {
  let out = "";
  let c = "", v = "", t = "";
  const flush = () => {
    if (c && v) out += syl(c, v, t);
    else out += c + v + t;
    c = v = t = "";
  };
  for (const j of jamo) {
    if (isV(j)) {
      if (c && !v) v = j;
      else if (c && v && !t && V2[v + j]) v = V2[v + j];
      else if (c && v && t) {
        // 받침이 다음 글자 첫소리로 넘어간다 (겹받침이면 뒤 하나만)
        const [a, b] = SPLIT_C[t] ? [...SPLIT_C[t]] : ["", t];
        t = a;
        const keep = b;
        flush();
        c = keep;
        v = j;
      } else if (!c && v && V2[v + j]) v = V2[v + j];
      else {
        flush();
        v = j;
      }
    } else {
      if (!c && !v) c = j;
      else if (c && !v) {
        flush();
        c = j;
      } else if (c && v && !t && JONG.includes(j)) t = j;
      else if (c && v && t && C2[t + j]) t = C2[t + j];
      else {
        flush();
        c = j;
      }
    }
  }
  flush();
  return out;
}

/** 한글 → 친 자판 글자 (다시 이어 치려고) */
function toKeys(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      const parts = [CHO[Math.floor(code / 588)], JUNG[Math.floor((code % 588) / 28)], JONG[code % 28]];
      for (const p of parts) for (const q of SPLIT_V[p] || SPLIT_C[p] || p) out += q ? BACK[q] || q : "";
    } else if (BACK[ch]) out += BACK[ch];
    else if (SPLIT_V[ch] || SPLIT_C[ch]) for (const q of SPLIT_V[ch] || SPLIT_C[ch]) out += BACK[q];
    else out += ch;
  }
  return out;
}

/** 영문 자판으로 친 글이 섞여 있으면 한글로. 영문이 없으면 그대로 */
export function engToKor(s) {
  if (!/[a-zA-Z]/.test(s)) return s;
  const keys = toKeys(s);
  let out = "";
  let run = [];
  for (const ch of keys) {
    const j = KEY[ch] || KEY[ch.toLowerCase()];
    if (j) run.push(j);
    else {
      out += compose(run) + ch;
      run = [];
    }
  }
  return out + compose(run);
}
