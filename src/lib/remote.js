// Supabase에 저장하는 데이터 계층.
//
// 사장님과 지원님이 같은 장부를 본다. 한 쪽이 고치면 realtime으로 다른 쪽 화면이
// 바로 따라 바뀐다.
//
// DB는 snake_case, 앱은 camelCase를 쓴다. 그 변환을 여기서만 한다.

import { supabase } from "./supabase";
import { makeVendor, makeTx } from "./store";

const vendorFromRow = (r) =>
  makeVendor({
    id: r.id,
    name: r.name,
    address: r.address,
    phone: r.phone,
    bizNo: r.biz_no,
    memo: r.memo,
    accounts: r.accounts,
    createdAt: r.created_at,
  });

const vendorToRow = (v) => ({
  id: v.id,
  name: v.name,
  address: v.address,
  phone: v.phone,
  biz_no: v.bizNo,
  memo: v.memo,
  accounts: v.accounts,
  created_at: v.createdAt,
});

const txFromRow = (r) =>
  makeTx({
    id: r.id,
    vendorId: r.vendor_id,
    date: r.date,
    items: r.items,
    supply: Number(r.supply),
    method: r.method,
    vatPaid: r.vat_paid,
    invoice: r.invoice,
    accountId: r.account_id,
    // 예전 행에는 이 칸이 없다. null 이면 makeTx가 '안 적음'으로 읽는다.
    cashPaid: r.cash_paid === null || r.cash_paid === undefined ? null : Number(r.cash_paid),
    prevBalance: r.prev_balance === null || r.prev_balance === undefined ? null : Number(r.prev_balance),
    balance: r.balance === null || r.balance === undefined ? null : Number(r.balance),
    creditAdd: Number(r.credit_add) || 0,
    creditUse: Number(r.credit_use) || 0,
    creditExpiry: r.credit_expiry || "",
    creditNote: r.credit_note || "",
    memo: r.memo,
    hasPhoto: r.has_photo,
  });

const txToRow = (t) => ({
  id: t.id,
  vendor_id: t.vendorId,
  date: t.date,
  items: t.items,
  supply: t.supply,
  method: t.method,
  vat_paid: t.vatPaid,
  invoice: t.invoice,
  account_id: t.accountId,
  cash_paid: t.cashPaid === null || t.cashPaid === undefined ? null : t.cashPaid,
  prev_balance: t.prevBalance === null || t.prevBalance === undefined ? null : t.prevBalance,
  balance: t.balance === null || t.balance === undefined ? null : t.balance,
  credit_add: t.creditAdd || 0,
  credit_use: t.creditUse || 0,
  credit_expiry: t.creditExpiry || null,
  credit_note: t.creditNote || "",
  memo: t.memo,
  has_photo: t.hasPhoto,
});

// ------------------------------------------------------------------- 읽고 쓰기

export async function fetchAll() {
  const [v, t] = await Promise.all([
    supabase.from("vendors").select("*"),
    supabase.from("transactions").select("*"),
  ]);
  if (v.error) throw v.error;
  if (t.error) throw t.error;
  return {
    vendors: v.data.map(vendorFromRow),
    tx: t.data.map(txFromRow),
  };
}

export async function upsertVendor(vendor) {
  const { error } = await supabase.from("vendors").upsert(vendorToRow(vendor));
  if (error) throw error;
}

export async function upsertVendors(list) {
  if (!list.length) return;
  const { error } = await supabase.from("vendors").upsert(list.map(vendorToRow));
  if (error) throw error;
}

export async function deleteVendor(id) {
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 나중에 더한 칸들. 표에 아직 없을 수 있다.
 *
 * 스키마를 안 올린 상태에서 이 칸을 같이 보내면 **거래 전체가 거절된다.**
 * 실제로 그래서 장끼가 하루 동안 저장이 안 됐다. 새 칸 때문에 예전부터 되던
 * 일이 막히면 안 된다 — 표가 거절하면 이 칸만 빼고 다시 보내고, 무엇이 빠졌는지
 * 화면에 알린다. 스키마를 올리면 그때부터 저절로 같이 저장된다.
 *
 * 품목의 성격(매입/미송/출고/불량)은 items jsonb 안이라 여기 없다 —
 * 미송·불량은 스키마를 안 올려도 그대로 저장된다.
 */
const LATER_COLUMNS = [
  "cash_paid",
  "credit_add",
  "credit_use",
  "credit_expiry",
  "credit_note",
  "prev_balance", // 2026-09-15 장끼 전잔
  "balance", // 2026-09-15 장끼 당잔
];

// 표에 없다고 확인된 칸. 한 번 확인되면 그 세션 동안 빼고 보낸다.
// 칸마다 따로 기억한다 — 새 칸 하나가 없다고 이미 있는 칸(현금입금 등)까지 빼면 안 된다.
const missing = new Set();

const withoutMissing = (row) => {
  const r = { ...row };
  for (const k of missing) delete r[k];
  return r;
};

/** 오류가 '이 칸이 표에 없다'는 뜻이면 그 칸 이름을, 아니면 null */
const missingColumnOf = (e) => {
  if (!(e?.code === "PGRST204" || e?.code === "42703")) return null;
  const msg = String(e?.message || "");
  return LATER_COLUMNS.find((k) => msg.includes(`'${k}'`) || msg.includes(`"${k}"`)) ||
    LATER_COLUMNS.find((k) => !missing.has(k) && msg.includes(k)) ||
    null;
};

/** @returns {Promise<{degraded: boolean}>} degraded=true 면 새 칸 일부를 못 담고 저장됐다 */
async function upsertTxRows(rows) {
  for (let i = 0; i <= LATER_COLUMNS.length; i++) {
    const { error } = await supabase.from("transactions").upsert(rows.map(withoutMissing));
    if (!error) return { degraded: missing.size > 0, missing: [...missing] };
    const col = missingColumnOf(error);
    if (!col || missing.has(col)) throw error;
    missing.add(col);
  }
  throw new Error("transactions 표에 없는 칸이 너무 많아요.");
}

export const upsertTx = (tx) => upsertTxRows([txToRow(tx)]);

export async function upsertTxs(list) {
  if (!list.length) return { degraded: false };
  return upsertTxRows(list.map(txToRow));
}

export async function deleteTx(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

/** 거래처 합치기 — 거래를 통째로 옮겨야 해서 한 번에 처리한다 */
export async function moveTxVendor(fromId, toId) {
  const { error } = await supabase
    .from("transactions")
    .update({ vendor_id: toId })
    .eq("vendor_id", fromId);
  if (error) throw error;
}

// ----------------------------------------------------------------- 실시간

/**
 * 다른 사람이 고친 내용을 받아 화면을 갱신한다.
 * 어느 행이 바뀌었는지 따지지 않고 통째로 다시 읽는다 — 장부 규모가 작아
 * 그게 더 단순하고 틀릴 일이 없다.
 */
export function subscribe(onChange, onStatus) {
  const channel = supabase
    .channel("poclo-ledger")
    .on("postgres_changes", { event: "*", schema: "public", table: "vendors" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, onChange)
    .subscribe((status) => onStatus?.(status));

  // 실시간이 조용히 끊겨도 화면에는 아무 표시가 없다. 그러면 상대가 고친 게 안 보이는데
  // 이유를 알 수가 없다. 그래서 (1) 상태를 밖으로 알리고 (2) 탭을 다시 볼 때 한 번 읽는다.
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- 장끼 사진

const BUCKET = "receipts";
const pathOf = (txId) => `${txId}.jpg`;

async function dataUrlToBlob(dataUrl) {
  return await (await fetch(dataUrl)).blob();
}

export async function putPhoto(txId, dataUrl) {
  const blob = await dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pathOf(txId), blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
}

export async function getPhotoUrl(txId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOf(txId), 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function deletePhoto(txId) {
  await supabase.storage.from(BUCKET).remove([pathOf(txId)]);
}
