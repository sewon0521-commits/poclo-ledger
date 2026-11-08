import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, ListTree, Loader2, Plus, Trash2 } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { addPhoto, photoUrlOf } from "../lib/notePhotos";
import { newId } from "../lib/id";

/**
 * 일 › 매뉴얼 (11/8) — 세원: "우리 포클로 물류 업무 메뉴얼 옛날에 만들었었거든? 나중에 물류할 때 메뉴얼 다시 써야 되니까
 *   노션에 있는 요거 참고해서 erp에 하나 만들어 줘 나중에 쓰게. 지금 노션 구독 해지하려고."
 *
 * 노션처럼 바로 고치는 칸 = 업무일지 편집기(JournalBlocks NoteEditor, media — 영상 블록까지). 글 모양은 업무일지와 같다(lib/journalBlocks).
 * 노션 '📦 포클로 물류 업무 메뉴얼'(8/29)을 그대로 옮겼다 — STEP 1~3 · 자주 묻는 질문 · 연락처, 토글·안내 상자(인용으로)·사진 7장·영상 2개.
 *   사진·영상은 Cloudflare R2(manual/logistics/…, 공개 주소 — 노션도 웹 게시였다), 원본은 바탕화면 05_물류·재고/노션_물류매뉴얼_백업_261108.
 * 매뉴얼은 여러 개 둘 수 있다(촬영·CS 등 나중에). settings `manuals` {items:[{id, title, icon, text, at, by}]}.
 * 쓸 때 changeKey(조건부 쓰기)로 그 매뉴얼만 바꿔 쓴다. 다른 기기에서 바뀌면 쓰고 있지 않을 때만 칸을 새로 그린다.
 */

const KEY = "manuals";
const OPEN_KEY = "poclo_manual_open";
const ME_KEY = "poclo_journal_me"; // 업무일지에서 고른 '이 기기 사람'
const ICONS = ["📦", "📸", "💬", "🧵", "🏷️", "📋", "🚚", "✂️"];
const TEMPLATE = {
  label: "틀로 시작 — 목적 · 순서 · 주의할 점 · 자주 묻는 질문",
  blocks: [
    { type: "heading", props: { level: 1 }, content: "목적" },
    { type: "paragraph" },
    { type: "heading", props: { level: 1 }, content: "순서" },
    { type: "numberedListItem" },
    { type: "heading", props: { level: 1 }, content: "주의할 점" },
    { type: "bulletListItem" },
    { type: "heading", props: { level: 1 }, content: "자주 묻는 질문" },
    { type: "toggleListItem", content: "Q. " },
  ],
  focusAt: 1,
};

const read = (k) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 기억 못 해도 그만 */
  }
};
const who = () => ({ sewon: "세원", jiwon: "지원" })[read(ME_KEY)] || "";
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** 제목 줄(# · ##)로 목차 — 꾸밈 표시 글자는 뺀다 */
const tocOf = (text) =>
  String(text || "")
    .split("\n")
    .map((l) => l.match(/^(#{1,2})\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ level: m[1].length, text: m[2].replace(/[⁠-⁤]|\*\*|__|~~|==/g, "").trim() }));

function PlainEditor({ initial, onSave }) {
  const [v, setV] = useState(initial || "");
  const timer = useRef(null);
  return (
    <textarea
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        clearTimeout(timer.current);
        const t = e.target.value;
        timer.current = setTimeout(() => onSave(t), 800);
      }}
      onBlur={(e) => onSave(e.target.value)}
      className="h-[60vh] w-full resize-y p-4 text-sm outline-none"
    />
  );
}
const NoteEditor = lazy(() =>
  import("./JournalBlocks")
    .then((m) => ({ default: m.NoteEditor }))
    .catch(() => ({ default: PlainEditor })),
);

export default function ManualPage({ online }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenIdState] = useState(() => read(OPEN_KEY));
  const [gen, setGen] = useState(0); // 바깥에서 바뀌면 편집 칸을 새로 그린다
  const focused = useRef(false);
  const mine = useRef(""); // 내가 마지막으로 저장한 글
  const setOpenId = (id) => {
    setOpenIdState(id);
    write(OPEN_KEY, id);
  };

  const load = useCallback(
    async (fromOutside) => {
      try {
        const v = await loadKey(KEY, online, { items: [] });
        const list = (v && v.items) || [];
        setItems((cur) => {
          if (fromOutside && !focused.current) {
            const open = list.find((m) => m.id === openId) || list[0];
            const was = cur.find((m) => m.id === open?.id);
            if (open && was && open.text !== was.text && open.text !== mine.current) setGen((g) => g + 1);
          }
          return list;
        });
      } catch {
        setMsg("매뉴얼을 불러오지 못했어요. 인터넷을 확인해 주세요.");
      } finally {
        setLoaded(true);
      }
    },
    [online, openId],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load(false);
    const off = onSettingsChange((k) => k === KEY && load(true));
    const stop = watchKeys([KEY], () => load(true));
    return () => {
      off();
      stop();
    };
  }, [load]);

  const cur = items.find((m) => m.id === openId) || items[0] || null;
  const toc = useMemo(() => tocOf(cur?.text), [cur?.text]);

  const change = async (fn) => {
    try {
      const v = await changeKey(KEY, online, (x) => ({ items: fn((x && x.items) || []) }), { items: [] });
      setItems(v.items || []);
      return true;
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
      throw e;
    }
  };
  const saveText = (id) => async (text) => {
    mine.current = text;
    await change((list) => list.map((m) => (m.id === id ? { ...m, text, at: new Date().toISOString(), by: who() } : m)));
  };
  const rename = (id, title) => change((list) => list.map((m) => (m.id === id ? { ...m, title } : m))).catch(() => {});
  const setIcon = (id, icon) => change((list) => list.map((m) => (m.id === id ? { ...m, icon } : m))).catch(() => {});
  const add = async () => {
    const id = newId("mn");
    await change((list) => [...list, { id, title: "새 매뉴얼", icon: "📋", text: "", at: new Date().toISOString(), by: who() }]).catch(() => {});
    setOpenId(id);
  };
  const remove = async (m) => {
    if (!window.confirm(`'${m.title}' 매뉴얼을 지울까요? 지우면 되살릴 수 없어요.`)) return;
    await change((list) => list.filter((x) => x.id !== m.id)).catch(() => {});
    setOpenId("");
  };
  const jump = (t) => {
    const hs = [...document.querySelectorAll(".manual-doc [data-content-type='heading']")];
    const h = hs.find((x) => x.innerText.trim() === t);
    h?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!loaded) return null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">매뉴얼</h2>
          <p className="mt-0.5 text-sm text-stone-500">일하는 방법을 적어 두는 곳. 노션처럼 바로 고치면 저절로 저장돼요.</p>
        </div>
        <button type="button" onClick={add} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 새 매뉴얼
        </button>
      </div>
      {msg && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <BookMarked size={22} className="mx-auto text-stone-300" />
          <p className="mt-2 text-sm text-stone-500">포장 순서·손질법처럼 파트타이머분께 알려 줄 일을 적어 두면, 사람이 바뀌어도 같은 방법으로 일할 수 있어요.</p>
          <button type="button" onClick={add} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700">
            <Plus size={14} /> 첫 매뉴얼 만들기
          </button>
        </div>
      ) : (
        <>
          {items.length > 1 && (
            <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1 [scrollbar-width:none]">
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className={"shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium " + (m.id === cur?.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
                >
                  {m.icon} {m.title}
                </button>
              ))}
            </div>
          )}
          {cur && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
              <article className="manual-doc min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3">
                  <select value={cur.icon || "📋"} onChange={(e) => setIcon(cur.id, e.target.value)} aria-label="아이콘" className="rounded-lg border border-transparent bg-transparent text-2xl hover:border-stone-200">
                    {[...new Set([cur.icon || "📋", ...ICONS])].map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <input
                    key={cur.id + "t"}
                    defaultValue={cur.title}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== cur.title && rename(cur.id, e.target.value.trim())}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    aria-label="매뉴얼 이름"
                    className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-xl font-bold text-stone-900 outline-none hover:bg-stone-50 focus:bg-stone-50"
                  />
                  <span className="text-xs text-stone-400">{cur.at ? `${cur.by ? cur.by + " · " : ""}${when(cur.at)} 저장` : ""}</span>
                  <button type="button" onClick={() => remove(cur)} aria-label="매뉴얼 지우기" className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-100 hover:text-rose-700">
                    <Trash2 size={15} />
                  </button>
                </header>
                <div onFocus={() => (focused.current = true)} onBlur={() => (focused.current = false)}>
                  <Suspense
                    fallback={
                      <div className="flex h-40 items-center justify-center text-stone-300">
                        <Loader2 size={18} className="animate-spin" />
                      </div>
                    }
                  >
                    <NoteEditor
                      key={cur.id + ":" + gen}
                      initial={cur.text}
                      onSave={saveText(cur.id)}
                      upload={(f) => addPhoto(f, online)}
                      resolve={(k) => photoUrlOf(k, online)}
                      heads={[]}
                      clock={false}
                      media
                      template={TEMPLATE}
                      placeholder="글을 쓰거나 '/' 를 눌러 제목·토글·사진·영상"
                    />
                  </Suspense>
                </div>
              </article>
              {toc.length > 0 && (
                <nav className="order-first min-w-0 self-start rounded-2xl border border-stone-200 bg-white p-3 lg:sticky lg:top-4 lg:order-none">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                    <ListTree size={13} /> 목차
                  </div>
                  <ul className="flex gap-1 overflow-x-auto text-sm [scrollbar-width:none] lg:block lg:space-y-0.5">
                    {toc.map((t, i) => (
                      <li key={i} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => jump(t.text)}
                          className={"w-full rounded-md px-2 py-1 text-left hover:bg-stone-100 " + (t.level === 1 ? "font-medium text-stone-800" : "pl-4 text-stone-500")}
                        >
                          {t.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
