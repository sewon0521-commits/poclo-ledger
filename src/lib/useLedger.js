// 장부 데이터 한 곳.
//
// 두 가지 모드로 돈다:
//  - remote: Supabase에 저장. 사장님과 지원님이 같은 장부를 보고, 한 쪽이 고치면
//            realtime으로 다른 쪽이 바로 따라 바뀐다.
//  - local : Supabase 설정이 없으면 이 기기에만 저장. 예전처럼 그대로 동작한다.
//
// 화면(App)은 어느 쪽인지 신경 쓰지 않는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isRemote, supabase } from "./supabase";
import * as remote from "./remote";
import { loadAll, saveVendors, saveTx, makeVendor, makeTx } from "./store";
import * as localPhotos from "./photos";

export function useLedger() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isRemote);
  // 로컬 모드는 첫 렌더에 이 기기 저장분을 그대로 들고 시작한다
  const [vendors, setVendors] = useState(() => (isRemote ? [] : loadAll().vendors));
  const [tx, setTx] = useState(() => (isRemote ? [] : loadAll().tx));
  const [loading, setLoading] = useState(isRemote);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState("connecting"); // 실시간 연결 상태

  const localRef = useRef({ vendors: [], tx: [] });
  const online = isRemote && !!session;

  // ------------------------------------------------------------ 로그인 상태

  useEffect(() => {
    if (!isRemote) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ------------------------------------------------------- 데이터 읽기 + 실시간

  // 실시간 갱신 때마다 화면을 통째로 "불러오는 중"으로 바꾸면, 보고 있던 거래처
  // 상세 화면이 사라졌다 다시 그려지면서 목록으로 튕긴다. 그래서 스피너는 맨 처음
  // 한 번만 띄우고, 그다음 갱신은 조용히 갈아끼운다.
  const loadedOnce = useRef(false);

  const reload = useCallback(async () => {
    try {
      if (!loadedOnce.current) setLoading(true);
      const data = await remote.fetchAll();
      setVendors(data.vendors);
      setTx(data.tx);
      loadedOnce.current = true;
    } catch (err) {
      setNotice("장부를 불러오지 못했어요. 인터넷을 확인하고 새로고침해 주세요.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    // 서버에서 받아오는 동안 로딩 표시 — 바깥 시스템과 맞추는 일이라 여기가 맞다
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
    return remote.subscribe(reload, (status) =>
      setLive(status === "SUBSCRIBED" ? "on" : status === "CLOSED" ? "connecting" : "off"),
    );
  }, [online, reload]);

  // -------------------------------------------------------------- 저장 도우미

  const persistLocal = (nextVendors, nextTx) => {
    localRef.current = { vendors: nextVendors, tx: nextTx };
    if (!saveVendors(nextVendors) || !saveTx(nextTx)) {
      setNotice("이 브라우저에 저장하지 못했어요. 시크릿 창이면 일반 창에서 열어주세요.");
    }
  };

  /**
   * 저장 실패를 왜 실패했는지 알 수 있게 옮긴다.
   * "인터넷을 확인해 주세요"로 뭉뚱그리면 엉뚱한 곳을 보게 된다 —
   * 실제로는 DB에 칸이 없거나 권한이 없어서인 경우가 많다.
   */
  const explain = (err) => {
    const code = err?.code || "";
    const msg = err?.message || "";
    if (code === "42703" || code === "PGRST204") {
      return `장부 표에 칸이 없어요. Supabase SQL Editor에서 supabase/schema.sql을 다시 실행해 주세요. (${msg})`;
    }
    if (code === "42501" || code === "PGRST301") {
      return "저장 권한이 없어요. 로그아웃했다가 다시 로그인해 주세요.";
    }
    if (code === "23503") {
      return "거래처가 먼저 저장되지 않았어요. 새로고침 후 다시 시도해 주세요.";
    }
    if (!navigator.onLine) return "인터넷이 끊겼어요. 연결되면 다시 저장해 주세요.";
    return `저장하지 못했어요. ${msg || "잠시 뒤 다시 시도해 주세요."}`;
  };

  /** 화면은 먼저 바꾸고(기다리지 않게) 저장은 뒤따른다. 실패하면 알려준다. */
  const apply = async (nextVendors, nextTx, remoteWrite) => {
    setVendors(nextVendors);
    setTx(nextTx);
    if (!online) return persistLocal(nextVendors, nextTx);
    try {
      await remoteWrite();
    } catch (err) {
      setNotice(explain(err));
      console.error(err);
      reload();
    }
  };

  // ---------------------------------------------------------------- 거래처

  const saveVendor = (data) => {
    const exists = data.id && vendors.some((v) => v.id === data.id);
    const record = exists
      ? makeVendor({ ...vendors.find((v) => v.id === data.id), ...data })
      : makeVendor(data);
    const next = exists
      ? vendors.map((v) => (v.id === record.id ? record : v))
      : [...vendors, record];
    apply(next, tx, () => remote.upsertVendor(record));
    return record;
  };

  const removeVendor = (v) =>
    apply(
      vendors.filter((x) => x.id !== v.id),
      tx,
      () => remote.deleteVendor(v.id),
    );

  const mergeVendors = (from, target, merged) => {
    const nextVendors = vendors
      .filter((v) => v.id !== from.id)
      .map((v) => (v.id === target.id ? merged : v));
    const nextTx = tx.map((t) => (t.vendorId === from.id ? { ...t, vendorId: target.id } : t));
    apply(nextVendors, nextTx, async () => {
      await remote.upsertVendor(merged);
      await remote.moveTxVendor(from.id, target.id);
      await remote.deleteVendor(from.id);
    });
  };

  // ------------------------------------------------------------------ 거래

  const saveTxRecord = (record, nextVendors) => {
    const exists = tx.some((t) => t.id === record.id);
    const nextTx = exists ? tx.map((t) => (t.id === record.id ? record : t)) : [...tx, record];
    const vs = nextVendors || vendors;
    apply(vs, nextTx, async () => {
      // 거래처가 먼저 있어야 거래를 붙일 수 있다
      const changed = vs.filter((v) => !vendors.some((o) => o === v));
      await remote.upsertVendors(changed);
      await remote.upsertTx(record);
    });
  };

  const removeTx = async (t) => {
    apply(
      vendors,
      tx.filter((x) => x.id !== t.id),
      () => remote.deleteTx(t.id),
    );
    if (t.hasPhoto) {
      if (online) remote.deletePhoto(t.id).catch(() => {});
      else localPhotos.deletePhoto(t.id);
    }
  };

  const patchTx = (id, patch) => {
    const record = makeTx({ ...tx.find((t) => t.id === id), ...patch });
    apply(
      vendors,
      tx.map((t) => (t.id === id ? record : t)),
      () => remote.upsertTx(record),
    );
  };

  // ---------------------------------------------------------------- 사진

  const putPhoto = async (txId, file) => {
    try {
      if (online) {
        await remote.putPhoto(txId, await localPhotos.shrink(file));
        return true;
      }
      return await localPhotos.putPhoto(txId, file);
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const getPhoto = async (txId) =>
    online ? await remote.getPhotoUrl(txId) : await localPhotos.getPhoto(txId);

  // ------------------------------------------- 이 기기에만 있던 장부 올리기

  const localOnly = useMemo(() => (online ? loadAll() : { vendors: [], tx: [] }), [online]);
  const canUpload = online && !loading && localOnly.tx.length > 0 && tx.length === 0;

  const uploadLocal = async () => {
    try {
      await remote.upsertVendors(localOnly.vendors);
      await remote.upsertTxs(localOnly.tx.map((t) => ({ ...t, hasPhoto: false })));
      setNotice(`이 기기에 있던 거래 ${localOnly.tx.length}건을 공유 장부로 옮겼어요.`);
      reload();
    } catch (err) {
      setNotice("옮기지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      console.error(err);
    }
  };

  return {
    mode: isRemote ? "remote" : "local",
    live: online ? live : "local",
    reload,
    authReady,
    session,
    loading,
    vendors,
    tx,
    notice,
    setNotice,
    saveVendor,
    removeVendor,
    mergeVendors,
    saveTxRecord,
    removeTx,
    patchTx,
    putPhoto,
    getPhoto,
    canUpload,
    uploadLocalCount: localOnly.tx.length,
    uploadLocal,
    signOut: () => supabase?.auth.signOut(),
  };
}
