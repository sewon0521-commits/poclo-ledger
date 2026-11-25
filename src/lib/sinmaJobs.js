// 신마에서 찾기 (2026-11-25 세원: "촬영 레퍼런스 옆에 버튼 하나 — 요번에 찍을 사진 쫙 넣고 버튼 하나 누르면 신마에서 찾아주게")
// 소싱 회차 창 '촬영 레퍼런스' 칸의 [신마에서 찾기] → settings `sinma_jobs` 에 일감 → 사무실 PC(poclo-cafe24 sinma_worker.py, PocloReels 안 스레드)가
// 사진 하나씩 어사이드로 신마에서 찾아 `sinma_finds_<회차 id>`(SinmaFinds 화면)에 넣는다. 어사이드 일은 한 번에 하나.
//
// sinma_jobs = {items: [{
//   id, sessionId, title, on(소싱일), createdAt, status: queued|running|blocked|stopped|done|error,
//   refs: [{refId, refNo, photo(촬영 레퍼런스 사진 키), url, look(룩 메모), shop, status: queued|running|done|blocked|error, n(찾은 수), msg, at}],
//   cur(지금 찾는 refId), day(찜 폴더 날짜 YYMMDD — PC 가 처음 시작할 때), msg, at, startedAt, doneAt, found, host }]}
// ERP 는 일감을 넣고(queued) · 멈추고(stopped) · 이어서(queued) · 지운다(끝난 것만). 나머지는 PC 가 쓴다.

export const JOBS_KEY = "sinma_jobs";
export const ACTIVE = ["queued", "running", "blocked"];
const now = () => new Date().toISOString();
const rid = () => "sj" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 이 회차의 가장 최근 일감 (없으면 null) */
export function jobOf(list, sessionId) {
  const xs = (list || []).filter((j) => j.sessionId === sessionId);
  return xs.length ? xs.reduce((a, b) => (String(a.createdAt) > String(b.createdAt) ? a : b)) : null;
}
export const isActive = (j) => !!j && ACTIVE.includes(j.status);

/** 일감 안 사진 수 */
export function jobCount(j) {
  const refs = j?.refs || [];
  const done = refs.filter((r) => r.status === "done").length;
  return { total: refs.length, done, found: refs.reduce((n, r) => n + (Number(r.n) || 0), 0) };
}

/** 상태 한 줄 — {tone: wait|run|stop|done|err, text} */
export function jobLine(j) {
  if (!j) return null;
  const { total, done, found } = jobCount(j);
  const cur = (j.refs || []).find((r) => r.refId === j.cur);
  if (j.status === "queued") return { tone: "wait", text: done ? `이어서 찾기 대기 · ${done}/${total}장 끝` : `대기 중 · 사진 ${total}장 · 사무실 PC 가 곧 시작해요` };
  if (j.status === "running") return { tone: "run", text: `${done + 1}/${total} 찾는 중${cur ? ` · ${cur.refNo}번 사진` : ""}${found ? ` · 지금까지 ${found}개` : ""}` };
  if (j.status === "blocked") return { tone: "stop", text: `멈춤: ${j.msg || "신마 로그인·보안 확인 필요"} · ${done}/${total}장 끝` };
  if (j.status === "stopped") return { tone: "stop", text: `멈춰 둠 · ${done}/${total}장 끝${found ? ` · ${found}개 찾음` : ""}` };
  if (j.status === "error") return { tone: "err", text: `오류: ${j.msg || "다시 시도해 주세요"} · ${done}/${total}장 끝` };
  if (j.status === "done") return { tone: "done", text: `끝 · 사진 ${total}장에서 ${found}개 찾음` };
  return { tone: "wait", text: j.status || "" };
}

/** 넣기 — 이 회차에 살아 있는 일감이 있으면 사진만 더하고, 없으면 새 일감 (settings 를 고치는 함수) */
export function enqueue(session, refs) {
  return (v) => {
    const items = [...(v?.items || [])];
    const at = now();
    const add = refs.map((r) => ({ ...r, status: "queued", n: 0, msg: "", at }));
    const live = items.find((j) => j.sessionId === session.id && ACTIVE.includes(j.status));
    if (live) {
      const have = new Set((live.refs || []).map((r) => r.refId));
      const more = add.filter((r) => !have.has(r.refId));
      return { ...v, items: items.map((j) => (j === live ? { ...j, refs: [...(j.refs || []), ...more], at } : j)) };
    }
    // 끝난 일감은 회차마다 마지막 것만 남긴다(목록이 커지지 않게)
    const keep = items.filter((j) => j.sessionId !== session.id || ACTIVE.includes(j.status));
    const job = { id: rid(), sessionId: session.id, title: session.title || "", on: session.on || "", createdAt: at, at, status: "queued", refs: add, msg: "" };
    return { ...v, items: [...keep, job] };
  };
}

/** 멈추기 — 찾던 사진은 PC 가 어사이드를 멈추고 '대기'로 되돌린다 */
export const stopJob = (id) => (v) => ({ ...v, items: (v?.items || []).map((j) => (j.id === id && ACTIVE.includes(j.status) ? { ...j, status: "stopped", stop: true, at: now(), msg: "" } : j)) });

/** 이어서 — 끝나지 않은 사진부터 */
export const resumeJob = (id) => (v) => ({
  ...v,
  items: (v?.items || []).map((j) =>
    j.id === id
      ? { ...j, status: "queued", stop: false, msg: "", at: now(), refs: (j.refs || []).map((r) => (r.status === "done" ? r : { ...r, status: "queued", msg: "" })) }
      : j,
  ),
});

/** 지우기 — 끝났거나 멈춘 일감만 (찾은 후보는 그대로) */
export const clearJob = (id) => (v) => ({ ...v, items: (v?.items || []).filter((j) => !(j.id === id && !["running"].includes(j.status))) });
