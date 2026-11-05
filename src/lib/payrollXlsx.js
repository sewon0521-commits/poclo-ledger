// 사업소득 지급대장 엑셀 (11/5) — 세원: "우리 항상 여기에 정리해서 회계사한테 보내거든? 세무사에게 보낼 글 복사 하지 말고 그냥 엑셀파일로. 내가 바로 보낼 수 있게."
//
// 세원이 쓰던 양식(바탕화면 01_세무·회계/인건비_사업소득·계약서/사업소득지급대장양식.xlsx)을 public/forms/payroll-form.xlsx 로 그대로 두고,
// 그 파일 안의 글(XML)만 바꿔 채운다 — 글꼴(HY견고딕 제목)·테두리·칸 너비·합친 칸이 양식 그대로 남는다.
// (SheetJS 무료판은 서식을 못 쓴다. 대신 그 안의 zip 읽기·쓰기(XLSX.CFB)만 쓴다.)
//
// 칸: A1 '(  11  )월 사업소득' · D3 회사명 · 6~15행 = 구분 · 성명 · 주민등록번호 · 총지급액 · 사업소득세 · 지방소득세 · 공제계 · 차인지급액 · 16행 합계.
// 양식 계산식은 사업소득세 = TRUNC(총지급액×3%, -1), 지방소득세 = TRUNC(사업소득세×10%, -1). 앱은 근무마다 떼서(partTime.payOf)
// 한 달 합으로 계산하면 10원씩 다를 수 있다 → 같으면 양식 계산식 그대로, 다르면 **실제로 뗀 금액**을 숫자로 적는다(차인지급액 = 실제 보낸 돈).
// 계산식 칸에도 값을 미리 넣어 둔다(카톡 미리 보기처럼 다시 계산 안 하는 곳에서도 숫자가 보이게) + 열 때 다시 계산(fullCalcOnLoad).
// 양식 줄은 10줄 — 넘으면 앞 10명만 넣고 화면이 알린다.

export const FORM_URL = "/forms/payroll-form.xlsx";
export const FORM_ROWS = 10;
const FIRST = 6;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const trunc10 = (n) => Math.floor(n / 10) * 10;

/** 양식 계산식 그대로 했을 때 */
export const formTax = (gross) => {
  const income = trunc10(gross * 0.03);
  return { income, local: trunc10(income * 0.1) };
};

/** 파일 이름 — 예전 파일과 같은 꼴 '26년_8월_포클로 사업소득지급대장.xlsx' */
export const payrollFileName = (ym, bizName = "포클로") => `${ym.slice(2, 4)}년_${Number(ym.slice(5, 7))}월_${bizName} 사업소득지급대장.xlsx`;

/** 칸 하나 갈아 끼우기 — 양식의 서식(s)은 그대로 */
function putCell(xml, ref, body, type) {
  const re = new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)\\s*(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (_, attrs) => {
    const s = (attrs.match(/ s="\d+"/) || [""])[0];
    return `<c r="${ref}"${s}${type ? ` t="${type}"` : ""}>${body}</c>`;
  });
}
const text = (xml, ref, v) => (v ? putCell(xml, ref, `<is><t xml:space="preserve">${esc(v)}</t></is>`, "inlineStr") : putCell(xml, ref, "", ""));
const num = (xml, ref, v) => putCell(xml, ref, `<v>${v}</v>`);
const formula = (xml, ref, f, v) => putCell(xml, ref, `<f>${f}</f><v>${v}</v>`);

/**
 * rows: [{name, rrn, gross, incomeTax, localTax}] (3.3% 뗀 사람만) → Uint8Array(xlsx)
 * 양식 계산과 실제 뗀 금액이 다른 줄은 diff 에 남긴다 — 화면이 알린다.
 */
export async function buildPayroll({ ym, bizName, rows }) {
  const XLSX = await import("xlsx");
  const CFB = XLSX.CFB || XLSX.default?.CFB;
  const res = await fetch(FORM_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("양식 파일을 못 받았어요");
  const zip = CFB.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
  const read = (p) => new TextDecoder().decode(CFB.find(zip, p).content);
  const write = (p, s) => {
    const e = CFB.find(zip, p);
    e.content = new TextEncoder().encode(s);
    e.size = e.content.length;
  };

  // 제목 '(  8  )월 사업소득' → 이번 달
  write("/xl/sharedStrings.xml", read("/xl/sharedStrings.xml").replace(/\(\s*\d*\s*\)월 사업소득/, `(  ${Number(ym.slice(5, 7))}  )월 사업소득`));

  let x = read("/xl/worksheets/sheet1.xml");
  x = text(x, "D3", bizName);
  const list = rows.slice(0, FORM_ROWS);
  const sum = { gross: 0, income: 0, local: 0 };
  const diff = [];
  for (let i = 0; i < FORM_ROWS; i++) {
    const r = FIRST + i;
    const p = list[i];
    const gross = p ? Math.round(p.gross) : 0;
    const form = formTax(gross);
    const income = p ? p.incomeTax : 0;
    const local = p ? p.localTax : 0;
    x = text(x, `B${r}`, p?.name || "");
    x = text(x, `C${r}`, p?.rrn || "");
    x = p ? num(x, `D${r}`, gross) : putCell(x, `D${r}`, "", "");
    if (income === form.income && local === form.local) {
      x = formula(x, `E${r}`, `TRUNC(D${r}*0.03,-1)`, income);
      x = formula(x, `F${r}`, `TRUNC(E${r}*0.1,-1)`, local);
    } else {
      diff.push({ name: p.name, form: form.income + form.local, actual: income + local });
      x = num(x, `E${r}`, income);
      x = num(x, `F${r}`, local);
    }
    x = formula(x, `G${r}`, `SUM(E${r}:F${r})`, income + local);
    x = formula(x, `H${r}`, `D${r}-G${r}`, gross - income - local);
    sum.gross += gross;
    sum.income += income;
    sum.local += local;
  }
  const L = FIRST + FORM_ROWS - 1;
  x = formula(x, "D16", `SUM(D${FIRST}:D${L})`, sum.gross);
  x = formula(x, "E16", `SUM(E${FIRST}:E${L})`, sum.income);
  x = formula(x, "F16", `SUM(F${FIRST}:F${L})`, sum.local);
  x = formula(x, "G16", `SUM(G${FIRST}:G${L})`, sum.income + sum.local);
  x = formula(x, "H16", `SUM(H${FIRST}:H${L})`, sum.gross - sum.income - sum.local);
  x = x.replace(/<selection [^>]*\/>/, '<selection activeCell="B6" sqref="B6"/>');
  write("/xl/worksheets/sheet1.xml", x);

  // 계산식 칸을 바꿨으니 계산 순서표(calcChain)는 빼고, 열 때 다시 계산하게 — 엑셀이 '복구' 창을 안 띄운다
  CFB.utils.cfb_del(zip, "/xl/calcChain.xml");
  write("/xl/_rels/workbook.xml.rels", read("/xl/_rels/workbook.xml.rels").replace(/<Relationship [^>]*Target="calcChain\.xml"\/>/, ""));
  write("/[Content_Types].xml", read("/[Content_Types].xml").replace(/<Override [^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
  write("/xl/workbook.xml", read("/xl/workbook.xml").replace(/<calcPr([^>]*?)\/>/, (m, a) => (a.includes("fullCalcOnLoad") ? m : `<calcPr${a} fullCalcOnLoad="1"/>`)));

  const out = CFB.write(zip, { fileType: "zip", type: "array", compression: true });
  return { bytes: out instanceof Uint8Array ? out : new Uint8Array(out), diff, cut: Math.max(0, rows.length - FORM_ROWS), total: sum };
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
