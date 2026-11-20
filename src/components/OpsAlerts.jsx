import { useEffect, useState } from "react";
import { AlertOctagon, ExternalLink } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { opsDown } from "../lib/ops";

/**
 * 멈추면 바로 보이게 (lib/ops.js 머리말 — 11/20 세원 "멈춰도 모름").
 * useOps = settings ops_alerts + cs_worker(살아 있음) 를 보고 지금 멈춘 것 목록. 알림 종(NotifyBell)과 CS 관리 맨 위(OpsBanner)가 같이 쓴다.
 * 폰 푸시는 포클로_방향성 창이 30분마다 ops_alerts 를 읽어 보낸다(여기선 안 함).
 */
export function useOps(online) {
  const [ops, setOps] = useState(null);
  const [worker, setWorker] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const loadOps = () => loadKey("ops_alerts", online, { items: [] }).then((v) => alive && setOps(v)).catch(() => {});
    const loadW = () => loadKey("cs_worker", online, {}).then((v) => alive && setWorker(v)).catch(() => {});
    loadOps();
    loadW();
    const off1 = onSettingsChange((k) => (k === "ops_alerts" ? loadOps() : k === "cs_worker" ? loadW() : null));
    const off2 = watchKeys(["ops_alerts"], loadOps, 30000);
    const t = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) loadW();
    }, 60000);
    return () => {
      alive = false;
      off1();
      off2();
      clearInterval(t);
    };
  }, [online]);
  return opsDown(ops, worker, now);
}

/** CS 관리 맨 위 빨간 줄 — 멈춘 게 없으면 안 그림 */
export function OpsBanner({ online }) {
  const down = useOps(online);
  if (!down.length) return null;
  return (
    <div role="alert" className="space-y-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
      {down.map((a) => (
        <div key={a.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-rose-900">
          <AlertOctagon size={15} className="shrink-0 text-rose-700" />
          <b>{a.line}</b>
          <span className="text-rose-800">· {a.fix}</span>
          {a.url && (
            <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-lg bg-white px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
              <ExternalLink size={11} /> 열기
            </a>
          )}
          {a.msg && <span className="w-full pl-6 text-[11px] text-rose-700/80">{a.msg}</span>}
        </div>
      ))}
    </div>
  );
}
