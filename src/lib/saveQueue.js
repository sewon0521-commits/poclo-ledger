// 키마다 저장 줄 (2026-10-27)
//
// 세원: "새로고침을 하거나 나갔다 들어오면 서버가 렉이 좀 많고, 신상 관리가 예전에 진행했던 게 갑자기 뜨고 그러네."
// 원인 셋:
//   ① 저장은 뒤에서 1~2초(shoot_items 1.2MB 를 읽고 다시 쓰는 조건부 쓰기). 그사이 화면이 서버를 새로 읽으면(4초 확인·화면 다시 보기)
//      아직 저장 전 값이 와서 예전 상태가 잠깐 떴다가 저장이 끝나면 돌아왔다.
//   ② 단추를 빨리 여러 번 누르면 저장이 동시에 여러 개 — 저마다 1.2MB 를 읽고 쓰며 서로 부딪혀(updated_at 이 달라) 다시 시도하느라 더 느렸다.
//   ③ 저장이 끝나기 전에 새로고침·창 닫기를 하면 그 저장이 끊길 수 있다.
// 그래서:
//   · queueChange — 키마다 줄을 세워, 기다리는 변경을 **모아 한 번에** changeKey 로 쓴다(앞 저장이 끝나면 그동안 쌓인 것 전부를 한 번).
//   · withPending — 서버에서 새로 읽은 값 위에 아직 서버에 안 들어간 변경을 다시 얹는다(예전 상태가 안 뜨게).
//   · 저장 중이면 창을 닫거나 새로고침할 때 브라우저가 한 번 묻는다(beforeunload) + usePending 으로 '저장 중' 표시.
// ⚠ 변경 함수(fn)는 여러 번 불린다(화면에 바로 · 서버 쓰기 · 다시 시도 · 새로 읽은 값 위에) — 밖의 값을 바꾸지 않는 순수 함수로 둘 것.
import { useEffect, useState } from "react";
import { changeKey } from "./shoot";

const Q = {}; // key → { waiting: [{fn, done, fail}], inflight: [...], run: Promise|null }
const listeners = new Set();

// 저장 표시 (10/27 세원: "반납·결제 예정도 계속 되돌아와") — 변경을 넣을 때·저장이 끝날 때마다 하나씩 올린다.
// 서버를 다시 읽기 시작할 때 이 값을 기억해 두고, 답이 왔을 때 값이 바뀌었으면 그 답은 버린다:
// 읽기를 보낸 뒤에 내가 누르고 저장까지 끝났으면, 늦게 온 답은 누르기 전 값이라 화면을 되돌린다(화면은 저장이 끝난 값으로 이미 맞춰져 있다).
const marks = {};
const bump = (key) => (marks[key] = (marks[key] || 0) + 1);
export const saveMark = (key) => marks[key] || 0;

export const pendingCount = () => Object.values(Q).reduce((n, q) => n + q.waiting.length + q.inflight.length, 0);
const notify = () => {
  const n = pendingCount();
  listeners.forEach((f) => f(n));
};

const applyAll = (fns, v) =>
  fns.reduce((acc, f) => {
    try {
      return f(acc) || acc;
    } catch {
      return acc;
    }
  }, v);

/** 서버에서 읽은 값({items…}) 위에 아직 서버에 안 들어간 변경을 다시 얹는다 */
export function withPending(key, value) {
  const q = Q[key];
  if (!q || (!q.inflight.length && !q.waiting.length)) return value;
  return applyAll([...q.inflight, ...q.waiting].map((x) => x.fn), value);
}

/** 변경을 줄에 넣는다 → 서버에 쓰고 난 값으로 끝난다(실패하면 그 오류로) */
export function queueChange(key, online, fn, fallback) {
  const q = (Q[key] ||= { waiting: [], inflight: [], run: null });
  const p = new Promise((done, fail) => q.waiting.push({ fn, done, fail }));
  bump(key);
  notify();
  if (!q.run) q.run = drain(key, online, fallback);
  return p;
}

async function drain(key, online, fallback) {
  const q = Q[key];
  try {
    while (q.waiting.length) {
      q.inflight = q.waiting;
      q.waiting = [];
      const batch = q.inflight;
      try {
        const next = await changeKey(key, online, (v) => applyAll(batch.map((x) => x.fn), v), fallback);
        q.inflight = [];
        bump(key);
        notify();
        batch.forEach((x) => x.done(next));
      } catch (e) {
        q.inflight = [];
        bump(key);
        notify();
        batch.forEach((x) => x.fail(e));
      }
    }
  } finally {
    q.run = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!pendingCount()) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

/** 저장 중인 변경 개수 (표시용) */
export function usePending() {
  const [n, setN] = useState(pendingCount);
  useEffect(() => {
    listeners.add(setN);
    return () => listeners.delete(setN);
  }, []);
  return n;
}
