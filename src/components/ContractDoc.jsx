import { blocksOf, dateText } from "../lib/contract";

// 계약서 한 장 그리기 — ERP(보기·인쇄)와 모델 서명 화면이 같이 쓴다.

export function ContractText({ terms }) {
  return (
    <article className="text-[15px] leading-relaxed text-stone-800">
      <h2 className="mb-4 text-center text-lg font-bold tracking-tight text-stone-900">{terms.title}</h2>
      {blocksOf(terms.text).map((b, i) =>
        b.kind === "gap" ? (
          <div key={i} className="h-2" />
        ) : b.kind === "h" ? (
          <h3 key={i} className="mt-2 mb-1 font-semibold text-stone-900">
            {b.text}
          </h3>
        ) : b.kind === "li" ? (
          <p key={i} className="flex gap-1.5 pl-1">
            <span className="text-stone-400">·</span>
            <span className="min-w-0">{b.text}</span>
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </article>
  );
}

// 주민등록번호는 가린 것(rrnMask)만 — 전체 번호는 ERP '신고용 보기'에서만(lib/contract.js 머리말). 예전(주민번호 없이) 서명은 줄을 안 그린다.
export const signedRows = (s) => [
  ["이름", s.name],
  ["생년월일", s.birth],
  ...(s.rrnMask ? [["주민등록번호", s.rrnMask]] : []),
  ["연락처", s.phone],
  ["은행", s.bank],
  ["계좌번호", s.account],
  ["예금주", s.holder],
];

const at = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${dateText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const signedAtText = at;

export function SignedBlock({ signed, signedAt }) {
  if (!signed) return null;
  return (
    <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-stone-900">서명한 사람</h3>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-sm">
        {signedRows(signed).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone-500">{k}</dt>
            <dd className="min-w-0 break-all text-stone-900">{v || "-"}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-3 space-y-0.5 text-xs text-emerald-800">
        <li>✓ 계약 내용을 확인했어요</li>
        <li>✓ 촬영물 이용에 동의해요</li>
        <li>✓ 개인정보 수집·이용에 동의해요</li>
      </ul>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-xs text-stone-500">{at(signedAt || signed.at)} 서명</span>
        {signed.sign && <img src={signed.sign} alt="서명" className="h-20 max-w-[60%] rounded-lg border border-stone-200 bg-white object-contain" />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ 이미지로 저장 · 인쇄

const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function wrap(ctx, text, maxW) {
  const out = [];
  let line = "";
  for (const ch of String(text)) {
    const next = line + ch;
    if (ctx.measureText(next).width <= maxW || !line) {
      line = next;
      continue;
    }
    // 띄어쓰기에서 끊기 — 줄의 절반보다 뒤에 띄어쓰기가 있으면 거기서
    const sp = line.lastIndexOf(" ");
    if (sp > line.length / 2) {
      out.push(line.slice(0, sp));
      line = line.slice(sp + 1) + ch;
    } else {
      out.push(line);
      line = ch;
    }
  }
  if (line) out.push(line);
  return out;
}

const loadImg = (src) =>
  new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = src;
  });

/** 계약서 + 서명 → png data URL (가로 1000) */
export async function drawContractImage({ terms, signed, signedAt }) {
  try {
    await document.fonts?.ready;
  } catch {
    /* 글꼴 없이도 그린다 */
  }
  const W = 1000;
  const P = 64;
  const MW = W - P * 2;
  const meas = document.createElement("canvas").getContext("2d");
  const ops = []; // [y, draw(ctx)]
  let y = P;
  const text = (s, { size = 24, weight = 400, color = "#292524", align = "left", indent = 0, lh = 1.6 } = {}) => {
    meas.font = `${weight} ${size}px ${FONT}`;
    for (const l of wrap(meas, s, MW - indent)) {
      const yy = y + size;
      ops.push((c) => {
        c.font = `${weight} ${size}px ${FONT}`;
        c.fillStyle = color;
        c.textAlign = align;
        c.fillText(l, align === "center" ? W / 2 : P + indent, yy);
      });
      y += size * lh;
    }
  };
  text(terms.title, { size: 34, weight: 700, align: "center", color: "#1c1917" });
  y += 18;
  for (const b of blocksOf(terms.text)) {
    if (b.kind === "gap") y += 12;
    else if (b.kind === "h") {
      y += 6;
      text(b.text, { size: 25, weight: 700, color: "#1c1917" });
    } else if (b.kind === "li") {
      const y0 = y;
      ops.push((c) => {
        c.font = `400 24px ${FONT}`;
        c.fillStyle = "#a8a29e";
        c.textAlign = "left";
        c.fillText("·", P + 6, y0 + 24);
      });
      text(b.text, { indent: 26 });
    } else text(b.text);
  }
  let signImg = null;
  if (signed) {
    y += 30;
    const boxTop = y;
    y += 26;
    text("서명한 사람", { size: 25, weight: 700, color: "#1c1917", indent: 24 });
    y += 4;
    for (const [k, v] of signedRows(signed)) {
      const yy = y + 24;
      ops.push((c) => {
        c.font = `400 23px ${FONT}`;
        c.textAlign = "left";
        c.fillStyle = "#78716c";
        c.fillText(k, P + 24, yy);
        c.fillStyle = "#1c1917";
        c.fillText(String(v || "-"), P + 190, yy);
      });
      y += 38;
    }
    y += 8;
    text("✓ 계약 내용을 확인했어요   ✓ 촬영물 이용에 동의해요   ✓ 개인정보 수집·이용에 동의해요", { size: 20, color: "#047857", indent: 24 });
    y += 10;
    if (signed.sign) {
      try {
        signImg = await loadImg(signed.sign);
      } catch {
        signImg = null;
      }
    }
    const sh = 150;
    const sy = y;
    const when = `${at(signedAt || signed.at)} 서명`;
    ops.push((c) => {
      c.font = `400 21px ${FONT}`;
      c.fillStyle = "#78716c";
      c.textAlign = "left";
      c.fillText(when, P + 24, sy + sh - 12);
      if (signImg) {
        const r = Math.min(400 / signImg.width, sh / signImg.height);
        const w = signImg.width * r;
        const h = signImg.height * r;
        c.fillStyle = "#ffffff";
        c.strokeStyle = "#e7e5e4";
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(W - P - 24 - 420, sy - 4, 420, sh + 8, 14);
        c.fill();
        c.stroke();
        c.drawImage(signImg, W - P - 24 - 410 + (400 - w) / 2, sy + (sh - h) / 2, w, h);
      }
    });
    y += sh + 26;
    const boxBottom = y;
    ops.unshift((c) => {
      c.fillStyle = "#fafaf9";
      c.strokeStyle = "#e7e5e4";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(P, boxTop, MW, boxBottom - boxTop, 18);
      c.fill();
      c.stroke();
    });
  }
  y += P;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = Math.ceil(y);
  const c = cv.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, W, cv.height);
  for (const f of ops) f(c);
  return cv.toDataURL("image/png");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);

/** 새 창에 계약서만 그려 인쇄 */
export function printContract({ terms, signed, signedAt }) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const body = blocksOf(terms.text)
    .map((b) => (b.kind === "gap" ? '<div style="height:8px"></div>' : b.kind === "h" ? `<h3>${esc(b.text)}</h3>` : b.kind === "li" ? `<p class="li">· ${esc(b.text)}</p>` : `<p>${esc(b.text)}</p>`))
    .join("");
  const sig = signed
    ? `<section><h3>서명한 사람</h3><table>${signedRows(signed)
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || "-")}</td></tr>`)
        .join("")}</table><p class="ok">✓ 계약 내용 확인 · ✓ 촬영물 이용 동의 · ✓ 개인정보 수집·이용 동의</p><div class="row"><span>${esc(at(signedAt || signed.at))} 서명</span>${
        signed.sign ? `<img src="${signed.sign}" alt="서명">` : ""
      }</div></section>`
    : '<p class="ok" style="color:#a8a29e">아직 서명 전</p>';
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(terms.title)} — ${esc(terms.name)}</title>
<style>body{font-family:${FONT.replace(/"/g, "'")};color:#292524;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.7;font-size:14px}
h2{text-align:center;font-size:20px;margin:0 0 20px}h3{font-size:15px;margin:10px 0 2px}p{margin:0}p.li{padding-left:6px}
section{margin-top:24px;border:1px solid #e7e5e4;border-radius:12px;padding:16px}table{border-collapse:collapse}th{text-align:left;color:#78716c;font-weight:400;padding:2px 16px 2px 0}
.ok{color:#047857;font-size:12px;margin-top:8px}.row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;color:#78716c;font-size:12px}.row img{height:80px;border:1px solid #e7e5e4;border-radius:8px}
@media print{body{margin:0 auto}}</style></head><body><h2>${esc(terms.title)}</h2>${body}${sig}<script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`);
  w.document.close();
  return true;
}
