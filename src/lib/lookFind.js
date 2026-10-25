// 소싱 관리 › 코디로 찾기 (2026-10-26)
//
// 세원: "내가 코디 사진을 넣으면 해당 코디와 비슷한 릴스를 찾아주되 아무 릴스나 찾지 말고 괜찮은 릴스로 찾아주는 기능"
//       + "릴스 썸네일(표지) 보고 진행해도 되고, 괜찮은 릴스 — 너가 말한 거 괜찮네, 보여주기도 ㄱㄱ"
//
// 찾는 건 사무실 PC(poclo-cafe24/look_find.py — 머리말에 방법). 앱은 코디 사진을 보관하고 일감만 넣는다.
//   · 모아 둔 릴스 표지와 코디 사진을 FashionCLIP 으로 비교(닮은 정도) — 영상이 아니라 표지를 본다
//   · 괜찮은 릴스 = 최근 60일 · 조회 1만↑ · 경품·친구태그 이벤트 아님 → 점수 = 닮은 정도 × 댓글÷조회, 3%↑ 는 맨 위
//   · 위 10개는 Claude Code(사무실 PC · 맥스 구독, 추가 0원)가 '왜 닮았는지' 한 줄 · 엉뚱한 건 뺌
//
// settings look_finds {items:[{id, photos:[보관 키], note, createdAt, job:{status:'queued'|'working'|'done'|'error', step, message, at},
//                              look, results:[{code, url, handle, mall, views, comments, ratio, takenAt, thumb, sim, simN, score, why, caption}],
//                              poolSize, eligible, took, at, cc}]}  — 앱과 PC 모두 updated_at 조건부 쓰기(lib/shoot changeKey)
// reels_queue {id, target:'lookfind'} — 릴스 분석기(PocloReels)가 받는다
// 코디 사진은 Storage reels/shoot/<id>.jpg(putPhoto), 결과 표지는 reels/sourcing/<code>.jpg(뜨는 릴스와 같은 자리 — 지우지 않는다)

import { useCallback, useEffect, useState } from "react";
import { isRemote, supabase } from "./supabase";
import { newId } from "./id";
import { loadKey, changeKey, putPhoto, onSettingsChange, watchKeys } from "./shoot";
import { workerAlive } from "./reels";

export const KEY = "look_finds";
export const HOT = 0.03;
export const KEEP = 30; // 검색 기록은 최근 30번까지
export const MAX_PHOTOS = 3;

export const remoteOn = (online) => isRemote && online;

/** look_finds 를 읽고, PC 가 고치면(updated_at) 몇 초 안에 다시 읽는다. 분석기가 살아 있는지도 30초마다 */
export function useLookFinds(online) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + KEY) || "null")?.items || [];
    } catch {
      return [];
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [worker, setWorker] = useState(null);
  const load = useCallback(() => {
    loadKey(KEY, online)
      .then((v) => setItems(v.items || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const off = onSettingsChange((k) => k === KEY && load());
    const stop = watchKeys([KEY], load);
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => {
      off();
      stop();
      document.removeEventListener("visibilitychange", v);
    };
  }, [load]);
  useEffect(() => {
    if (!remoteOn(online)) return;
    const w = () =>
      supabase
        .from("settings")
        .select("value")
        .eq("key", "reels_worker")
        .maybeSingle()
        .then(({ data }) => setWorker(data?.value || null), () => {});
    w();
    const t = setInterval(() => document.visibilityState === "visible" && w(), 30000);
    return () => clearInterval(t);
  }, [online]);
  return { items, setItems, loaded, reload: load, worker, alive: workerAlive(worker) };
}

const addJob = (id, at) => (v) => ({
  ...v,
  items: [...(v.items || []).filter((j) => !(j.id === id && j.target === "lookfind")), { id, target: "lookfind", status: "queued", step: "", at }],
});

/** 코디 사진(최대 3장) 보관 → 일감. 새 항목 id */
export async function startFind(files, note, online) {
  if (!remoteOn(online)) throw new Error("코디로 찾기는 사무실 PC 가 해요 — 공유 장부에 로그인한 상태에서만 돼요.");
  const photos = [];
  for (const f of files.slice(0, MAX_PHOTOS)) {
    const k = await putPhoto(f, online);
    if (k) photos.push(k);
  }
  if (!photos.length) throw new Error("코디 사진을 보관하지 못했어요.");
  const id = newId("lf");
  const at = new Date().toISOString();
  let dropped = [];
  await changeKey(KEY, online, (v) => {
    const all = [{ id, photos, note: (note || "").trim(), createdAt: at, job: { status: "queued", at } }, ...(v.items || []).filter((x) => x.id !== id)];
    dropped = all.slice(KEEP);
    return { ...v, items: all.slice(0, KEEP) };
  });
  await changeKey("reels_queue", online, addJob(id, at));
  if (dropped.length) dropPhotos(dropped).catch(() => {});
  return id;
}

/** 다시 찾기 — 같은 사진으로 (풀이 자랐거나 실패했을 때) */
export async function retryFind(item, online) {
  const at = new Date().toISOString();
  await changeKey(KEY, online, (v) => ({ ...v, items: (v.items || []).map((x) => (x.id === item.id ? { ...x, job: { status: "queued", at } } : x)) }));
  await changeKey("reels_queue", online, addJob(item.id, at));
}

/** 검색 기록 지우기 — 코디 사진도(이 기능에서만 쓰는 사진). 결과 표지는 뜨는 릴스와 같이 쓰니 안 지운다 */
export async function removeFind(item, online) {
  await changeKey(KEY, online, (v) => ({ ...v, items: (v.items || []).filter((x) => x.id !== item.id) }));
  await changeKey("reels_queue", online, (v) => ({ ...v, items: (v.items || []).filter((j) => !(j.id === item.id && j.target === "lookfind")) }));
  await dropPhotos([item]);
}

async function dropPhotos(items) {
  const keys = items.flatMap((x) => x.photos || []).filter((k) => k?.startsWith("shoot/"));
  if (keys.length && isRemote) await supabase.storage.from("reels").remove(keys);
}

/** 진행 상태 → {kind:'wait'|'work'|'done'|'error', text} */
export function stateOf(item, alive) {
  const j = item?.job || {};
  if (j.status === "done") return { kind: "done", text: "" };
  if (j.status === "error") return { kind: "error", text: j.message || "찾지 못했어요." };
  if (j.status === "working") return { kind: "work", text: j.step || "찾는 중" };
  return { kind: "wait", text: alive ? "사무실 PC 가 곧 시작해요" : "사무실 PC 분석기가 꺼져 있어요 — 켜지면 바로 찾아요" };
}

/** 결과 한 줄 → 뜨는 릴스 카드 모양({r}) */
export const cardOf = (x) => ({ ...x, r: x.ratio ?? (x.views ? (x.comments || 0) / x.views : null) });

/** 결과 중 3%↑ 개수 */
export const hotOf = (item) => (item?.results || []).filter((x) => (x.ratio ?? 0) >= HOT).length;

/** ISO → '10/26 14:05' */
export function whenText(iso) {
  const t = new Date(iso || "");
  if (isNaN(t)) return "";
  return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
