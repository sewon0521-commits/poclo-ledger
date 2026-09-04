// 저장 계층. 읽기/쓰기가 전부 여기 있으므로 M2에서 Supabase로 갈아끼울 때
// 이 파일만 바꾸면 된다. (사진은 photos.js가 IndexedDB에 따로 둔다.)
//
// 거래처는 이름이 아니라 고유 id로 식별한다. 장끼마다 상호가 다르게 읽혀도
// ("ONE PICK" / "원픽") 같은 거래처로 남아야 하기 때문이다.

import { newId } from "./id";

const V1_KEY = "poclo_purchases_v1"; // 예전 구조 (거래만, 거래처는 이름 문자열)
const VENDORS_KEY = "poclo_vendors_v2";
const TX_KEY = "poclo_tx_v2";

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- 형태 맞추기

export function makeAccount(a = {}) {
  return {
    id: a.id || newId("a"),
    bank: a.bank || "",
    number: a.number || "",
    holder: a.holder || "",
  };
}

export function makeItem(i = {}) {
  // 빈 줄은 수량 0으로 시작한다. 장끼에서 읽어온 값은 그대로 쓴다.
  const qty = Number(i.qty) || 0;
  const unitPrice = Number(i.unitPrice) || 0;
  return {
    id: i.id || newId("i"),
    name: i.name || "",
    qty,
    unitPrice,
    amount: Number.isFinite(Number(i.amount)) && i.amount !== "" ? Number(i.amount) : unitPrice * qty,
    pending: !!i.pending, // 미송
  };
}

export function makeVendor(v = {}) {
  return {
    id: v.id || newId("v"),
    name: (v.name || "").trim(),
    address: v.address || "",
    phone: v.phone || "",
    bizNo: v.bizNo || "",
    memo: v.memo || "",
    accounts: (v.accounts || []).map(makeAccount),
    createdAt: v.createdAt || new Date().toISOString().slice(0, 10),
  };
}

export function makeTx(t = {}) {
  return {
    id: t.id || newId("t"),
    vendorId: t.vendorId || "",
    date: t.date || "",
    items: (t.items || []).map(makeItem),
    supply: Number(t.supply) || 0, // 당일합계 = 장부 금액
    method: t.method === "transfer" ? "transfer" : "samchon",
    invoice: !!t.invoice,
    accountId: t.accountId || "", // 실제 송금한 계좌
    memo: t.memo || "",
    hasPhoto: !!t.hasPhoto,
  };
}

const isTx = (t) => t && typeof t.id === "string" && typeof t.date === "string";

// ------------------------------------------------------------------ 옮겨심기

/**
 * 예전 구조(거래처가 이름 문자열)를 거래처 + 거래로 나눈다.
 * 예전 데이터는 지우지 않고 그대로 둔다 — 잘못 옮겨졌을 때 돌아갈 수 있어야 하므로.
 */
function migrateV1() {
  const old = readJson(V1_KEY, []);
  if (old.length === 0) return { vendors: [], tx: [] };

  const byName = new Map();
  const vendors = [];
  const tx = [];

  for (const o of old) {
    if (!isTx(o)) continue;
    const name = (o.vendor || "").trim();
    let vendor = byName.get(name);
    if (!vendor) {
      vendor = makeVendor({ name, address: o.address, phone: o.phone, bizNo: o.bizNo });
      byName.set(name, vendor);
      vendors.push(vendor);
    }
    // 비어 있던 거래처 정보는 나중 건에서 채운다
    for (const k of ["address", "phone", "bizNo"]) if (!vendor[k] && o[k]) vendor[k] = o[k];
    if (o.account && !vendor.accounts.some((a) => a.number === o.account)) {
      vendor.accounts.push(makeAccount({ number: o.account }));
    }

    tx.push(
      makeTx({
        id: o.id,
        vendorId: vendor.id,
        date: o.date,
        supply: o.supply,
        method: o.method,
        invoice: o.invoice,
        memo: o.memo,
        // 예전에는 품목이 문자열 하나였다. 한 줄짜리 품목으로 옮긴다.
        items: o.items ? [makeItem({ name: o.items, qty: 1, unitPrice: o.supply })] : [],
      }),
    );
  }
  return { vendors, tx };
}

// -------------------------------------------------------------------- 읽고 쓰기

export function loadAll() {
  const hasV2 = localStorage.getItem(TX_KEY) !== null || localStorage.getItem(VENDORS_KEY) !== null;
  if (!hasV2) {
    const moved = migrateV1();
    if (moved.tx.length) {
      writeJson(VENDORS_KEY, moved.vendors);
      writeJson(TX_KEY, moved.tx);
    }
    return moved;
  }
  return {
    vendors: readJson(VENDORS_KEY, []).map(makeVendor),
    tx: readJson(TX_KEY, []).filter(isTx).map(makeTx),
  };
}

export const saveVendors = (list) => writeJson(VENDORS_KEY, list);
export const saveTx = (list) => writeJson(TX_KEY, list);
