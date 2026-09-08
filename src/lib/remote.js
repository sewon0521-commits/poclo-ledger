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

export async function upsertTx(tx) {
  const { error } = await supabase.from("transactions").upsert(txToRow(tx));
  if (error) throw error;
}

export async function upsertTxs(list) {
  if (!list.length) return;
  const { error } = await supabase.from("transactions").upsert(list.map(txToRow));
  if (error) throw error;
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
