import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bell, Headset } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { channelOf, inTab } from "../lib/cs";

/**
 * 위 오른쪽 알림 종 + 'HH:MM 기준' (11/10 세원: "넥스트팩처럼 알림이랑 언제 업데이트됐는지 보여줄 수 있어?")
 * 알림 = 답할 CS 문의(cs_inbox 의 답할 문의 탭). 이 기기에서 본 것(종을 열면 본 것으로)은 숫자에서 빠진다.
 * 11/11 세원 "세원 할일에서 빼줘" → 세원 할 일(sewon_todo)은 종에서도 뺌(데이터는 그대로).
 * 기준 시각 = 이 화면이 서버에서 마지막으로 새로 읽은 시각. 30초마다 updated_at 만 보고, 바뀌었으면 그때만 다시 읽는다(가볍게).
 */

const SEEN_KEY = "poclo_notify_seen";
const readSeen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const md = (iso) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toDateString() === new Date().toDateString() && iso.length > 10 ? hm(d) : `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function NotifyBell({ online, onPage }) {
  const [cs, setCs] = useState([]);
  const [at, setAt] = useState(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadKey("cs_inbox", online, { items: [] })
        .then((c) => {
          if (!alive) return;
          setCs(c.items || []);
          setAt(new Date());
        })
        .catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "cs_inbox" && load());
    const off2 = watchKeys(["cs_inbox"], load, 30000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      off1();
      off2();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [online]);

  // 창 자리 — 종 묶음 오른쪽에 맞추되 화면 밖으로 안 나가게(11/14 세원 "휴대폰에서 erp 알림 누르면 안 보여":
  // 폰은 종 오른쪽에 '공유 장부 · 실시간 연결됨 · 새로 읽기'가 있어서 right-0 창이 왼쪽 화면 밖으로 밀렸다)
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = box.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const w = Math.min(320, vw - 32);
      const left = Math.min(Math.max(16, r.right - w), vw - 16 - w);
      setPos({ left: left - r.left, width: w });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const list = useMemo(() => {
    return cs
      .filter((x) => inTab(x, "todo"))
      .map((x) => ({
        id: `cs:${x.id}`,
        kind: "cs",
        when: x.at || x.createdAt || "",
        title: `${channelOf(x.channel).short} · ${x.customer || "고객"}`,
        text: x.summary || x.title || (x.message || "").slice(0, 40) || "새 문의",
      }))
      .sort((p, q) => String(q.when).localeCompare(String(p.when)));
  }, [cs]);
  const unread = list.filter((x) => !seen.has(x.id)).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // 종을 열면 지금 있는 알림은 본 것으로 (지금 목록에 없는 예전 것은 지워서 가볍게)
      const s = new Set(list.map((x) => x.id));
      setSeen(s);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
      } catch {
        /* 무시 */
      }
    }
  };
  const go = (k) => {
    setOpen(false);
    onPage(k);
  };
  const fresh = at && now - at.getTime() < 3 * 60000;

  return (
    <div ref={box} className="relative flex items-center gap-2">
      <button type="button" onClick={toggle} aria-label={`알림 ${unread}개`} className="relative rounded-full p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800">
        <Bell size={18} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-bold text-white tabular-nums">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {at && (
        <span className="flex items-center gap-1 text-xs text-stone-500 tabular-nums" title="서버에서 마지막으로 새로 읽은 시각 — 30초마다 바뀐 게 있는지 봐요">
          <span className={"h-1.5 w-1.5 rounded-full " + (fresh ? "bg-emerald-500" : "bg-stone-300")} />
          {hm(at)} 기준
        </span>
      )}
      {open && (
        <div style={pos || { right: 0, width: 320 }} className="absolute top-full z-40 mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
            <span className="text-sm font-bold text-stone-900">알림 {list.length}</span>
            <span className="text-[11px] text-stone-400">답할 CS 문의</span>
          </div>
          {!list.length ? (
            <p className="px-3 py-6 text-center text-xs text-stone-400">새 알림이 없어요.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
              {list.slice(0, 30).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => go("cs")} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-stone-50">
                    <Headset size={14} className="mt-0.5 shrink-0 text-rose-600" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[11px] text-stone-500">
                        <span className="truncate font-semibold">{x.title}</span>
                        <span className="shrink-0 tabular-nums">{md(x.when)}</span>
                      </span>
                      <span className="line-clamp-2 block text-sm text-stone-800">{x.text}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-stone-100 text-xs">
            <button type="button" onClick={() => go("cs")} className="w-full py-2 font-semibold text-stone-600 hover:bg-stone-50">
              CS 관리
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
