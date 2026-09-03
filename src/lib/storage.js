// M1은 브라우저 로컬 저장. M2에서 Supabase로 갈아끼울 수 있도록
// 읽기/쓰기 지점을 이 파일 하나로 모아둔다.

const KEY = "poclo_purchases_v1";

const isTx = (t) =>
  t &&
  typeof t.id === "string" &&
  typeof t.date === "string" &&
  typeof t.vendor === "string" &&
  Number.isFinite(t.supply) &&
  (t.method === "transfer" || t.method === "samchon");

export function loadTx() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTx).map((t) => ({ ...t, invoice: !!t.invoice, memo: t.memo || "" }));
  } catch {
    return [];
  }
}

/** 저장 실패(사파리 프라이빗 모드 등)를 호출부가 알 수 있도록 boolean 반환 */
export function saveTx(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
