// 파일에서 표를 꺼낸다. 카페24·메타에서 받은 파일을 그대로 던져도 읽히게.
//
// 여기 있는 이유가 두 개다.
//
//  1. 카페24가 내려주는 CSV는 UTF-8이 아니라 EUC-KR(CP949)이다. 그냥 읽으면
//     머리글이 깨져서 '결제합계'를 못 찾고, 화면에는 "CSV를 못 읽었어요"만 뜬다.
//     실제로 이것 때문에 파일이 안 들어갔다.
//  2. '엑셀 파일'을 그대로 받는 일이 잦다(.xlsx / .xls). 그건 텍스트가 아니라
//     압축된 덩어리라 글자로 읽으면 아무것도 안 나온다.
//
// 그래서 파일을 바이트로 받아서 무엇인지 먼저 보고, 어느 쪽이든 CSV 텍스트로
// 바꿔서 돌려준다. 위쪽(parseCafe/parseDaily/parseAds)은 아무것도 안 바뀐다.

const looksLikeZip = (b) => b[0] === 0x50 && b[1] === 0x4b; // PK — xlsx
const looksLikeOle = (b) => b[0] === 0xd0 && b[1] === 0xcf; // 옛 .xls

/** UTF-8로 읽어보고 깨지면 EUC-KR로 읽는다. */
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes); // 그래도 안 되면 되는 대로
    }
  }
}

/** 엑셀 파일 → CSV 텍스트. 시트가 여럿이면 줄이 제일 많은 것을 고른다. */
async function excelToCsv(buffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  let best = "";
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.length > best.length) best = csv;
  }
  return best;
}

/**
 * 파일 하나를 CSV 텍스트로. CSV·TSV·엑셀 다 받는다.
 * 못 읽으면 빈 문자열을 준다 — 부르는 쪽이 이미 "못 읽었어요"를 띄운다.
 */
export async function fileToCsv(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));
  const name = (file.name || "").toLowerCase();
  if (looksLikeZip(head) || looksLikeOle(head) || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    try {
      return await excelToCsv(buffer);
    } catch {
      return "";
    }
  }
  return decodeText(buffer);
}

/** 끌어다 놓은 것에서 파일 하나를 꺼낸다 (폴더째 놓은 경우는 무시). */
export function fileFromDrop(dataTransfer) {
  const items = dataTransfer?.items;
  if (items) {
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
  }
  return dataTransfer?.files?.[0] || null;
}
