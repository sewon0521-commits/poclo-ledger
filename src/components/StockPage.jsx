import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardPaste, FileSpreadsheet, Loader2, Minus, Plus, Trash2, X } from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, onSettingsChange, watchKeys, FIELD } from "../lib/shoot";
import { queueChange, withPending, saveMark } from "../lib/saveQueue";
import { fileToCsv, fileFromDrop } from "../lib/tabular";
import { newId } from "../lib/id";
import { Empty, Kpi, Tab } from "./ui";
import { Sheet, SheetHead } from "./ShootBits";
import {
  STOCK_KEY,
  RACK_FIELDS,
  buildGroups,
  cleanOption,
  costFinder,
  diffNextpack,
  displayName,
  groupKey,
  guessRackColumns,
  knownNames,
  mergeRack,
  npSummary,
  parseNextpack,
  parseTable,
  rackAdd,
  rackBump,
  rackMerge,
  rackPatch,
  rackRemove,
  rackRestore,
  rackRows,
  rackSort,
  setNextpack,
  stockTotals,
  stripTags,
  toNum,
  viewGroups,
} from "../lib/stock";

/**
 * 일 › 재고 (lib/stock.js 머리말). 넥스트팩(이지어드민) + 사무실 렉을 상품별로 합쳐 본다. Claude API 호출 없음 · 사진 저장 없음.
 * 저장은 settings 'stock' 한 키 — 넥스트팩 넣기와 렉 고치기가 서로 안 지우게 서버 최신을 읽어 그 부분만 바꿔 쓴다(lib/saveQueue → changeKey).
 * 표를 Ctrl+V 하거나 파일을 놓으면 머리 줄을 보고 넥스트팩인지 렉인지 저절로 가른다.
 */

const TAB_KEY = "poclo_stock_tab";
const readTab = () => {
  try {
    return localStorage.getItem(TAB_KEY) || "view";
  } catch {
    return "view";
  }
};
const readCopy = () => {
  try {
    return JSON.parse(localStorage.getItem(`poclo_${STOCK_KEY}`) || "null") || {};
  } catch {
    return {};
  }
};

function useStock(online) {
  const [stock, setStock] = useState(readCopy);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const m0 = saveMark(STOCK_KEY);
    try {
      const v = await loadKey(STOCK_KEY, online, {});
      // 읽는 동안 내가 저장했으면 그 답은 누르기 전 값이라 버린다
      if (saveMark(STOCK_KEY) === m0) setStock(withPending(STOCK_KEY, v));
    } catch {
      setMsg("재고를 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [load]);

  // 다른 쪽(지원·다른 기기)이 고치면 바로
  useEffect(() => {
    if (!online) return;
    const again = (k) => k === STOCK_KEY && load();
    const off = onSettingsChange(again);
    const stop = watchKeys([STOCK_KEY], again);
    return () => {
      off();
      stop();
    };
  }, [online, load]);

  // 누르면 화면부터 바꾸고, 저장이 끝나면 서버 최신으로 맞춘다
  const change = useCallback(
    async (fn) => {
      setStock((cur) => fn(cur));
      try {
        setStock(withPending(STOCK_KEY, await queueChange(STOCK_KEY, online, fn, {})));
        return true;
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
        load();
        return false;
      }
    },
    [online, load],
  );
  return { stock, loaded, msg, setMsg, change };
}

const whenLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const daysAgo = (iso) => {
  if (!iso) return 0;
  const a = new Date(iso);
  const b = new Date();
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
};

/** 칸을 벗어나거나 엔터를 누를 때 저장 — 치는 동안엔 서버에서 새로 읽어도 안 덮인다. Esc 는 되돌림 */
function CommitInput({ value, onCommit, className = "", ...rest }) {
  const [text, setText] = useState(null);
  const skip = useRef(false);
  const cur = value == null ? "" : String(value);
  const done = () => {
    const t = text;
    setText(null);
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (t != null && t.trim() !== cur) onCommit(t.trim());
  };
  return (
    <input
      {...rest}
      value={text ?? cur}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
        if (e.key === "Escape") {
          skip.current = true;
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

const CHIP = "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap ";
const CHIP_ON = "border-rose-700 bg-rose-700 text-white";
const CHIP_OFF = "border-stone-200 bg-white text-stone-600 hover:border-stone-400";

// ---------------------------------------------------------------- 재고 보기

// 10/31 세원: "좀 헷갈리는데 한눈에 보이게 좀 못하나?" — 상품 줄 아래 옵션 줄이 같은 숫자로 또 나오고(대부분 옵션이 하나), '5 / 5' 표기가 뜻이 바로 안 들어왔다.
// → 상품 하나 = 한 줄. 옵션은 그 줄 안의 칩(회색 넥스트팩 · 빨강 사무실 · 노랑 주문에 묶임), 위치·원가는 줄을 누르면 펼쳐진다.
// 좁은 칸(폰·옆 창)에서는 왼쪽 이름·칩 / 오른쪽 장수·돈
const VIEW_GRID = "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_4.5rem_4.5rem_3.5rem_6.5rem]";
const TONE = {
  nextpack: "bg-stone-100 text-stone-700",
  rack: "bg-rose-50 text-rose-800",
  held: "bg-amber-100 text-amber-900",
};
const Pill = ({ tone, children }) => <span className={"inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-md px-1.5 py-0.5 text-xs " + TONE[tone]}>{children}</span>;
const NoCost = ({ n }) => <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800">원가 없음{n > 1 ? ` ${n}줄` : ""}</span>;

/** 옵션별 수량 칩 — 칩 하나 = 한 곳에 있는 그 옵션 */
function OptionChips({ lines }) {
  return (
    <span className="flex flex-wrap gap-1">
      {lines.flatMap((l) => {
        const name = l.option || "옵션 없음";
        const chips = l.rack.map((x) => (
          <Pill key={x.id} tone="rack">
            {name} <b className="font-semibold">{x.qty}</b>
            {x.rack && <span className="opacity-70">{x.rack}</span>}
          </Pill>
        ));
        if (l.np)
          chips.unshift(
            <Pill key={`${l.key}|np`} tone={l.held > 0 ? "held" : "nextpack"}>
              {name} <b className="font-semibold">{l.npQty}</b>
              {l.held > 0 && <span>묶임 {l.held}</span>}
            </Pill>,
          );
        return chips;
      })}
    </span>
  );
}

function Money({ g }) {
  if (g.money > 0)
    return (
      <>
        <span className="font-semibold text-stone-900">₩{won(g.money)}</span>
        {g.noCost > 0 && (
          <span className="mt-0.5 block">
            <NoCost n={g.noCost} />
          </span>
        )}
      </>
    );
  return g.noCost > 0 ? <NoCost /> : <span className="text-stone-300">—</span>;
}

function DetailRow({ option, where, tone, qty, note, cost, money, input }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm @2xl:pl-8">
      <span className="font-medium break-words text-stone-800">{option}</span>
      <Pill tone={tone}>{where}</Pill>
      <b className="font-semibold text-stone-800 tabular-nums">{qty}장</b>
      {note}
      <span className="ml-auto flex items-center gap-2 text-xs text-stone-500 tabular-nums">
        {input || (cost > 0 ? `장당 ${won(cost)}` : <NoCost />)}
        {money > 0 && <span className="text-sm font-medium text-stone-800">₩{won(money)}</span>}
      </span>
    </div>
  );
}

/** 줄을 누르면 — 곳마다 위치·장수·원가·묶인 돈. 사무실 줄 원가가 없으면 여기서 적는다 */
function Details({ group, onCost }) {
  return (
    <div className="divide-y divide-stone-100 border-t border-stone-100 bg-stone-50/60">
      {group.lines.flatMap((l) => {
        const name = l.option || "옵션 없음";
        const rows = l.rack.map((x) => (
          <DetailRow
            key={x.id}
            option={name}
            where={`사무실 ${x.rack || "위치 없음"}`}
            tone="rack"
            qty={x.qty}
            note={x.memo ? <span className="text-xs text-stone-400">{x.memo}</span> : null}
            cost={x.useCost}
            money={x.money}
            input={
              x.qty > 0 && !(x.useCost > 0) ? (
                <CommitInput
                  value=""
                  inputMode="numeric"
                  placeholder="원가 입력"
                  aria-label="사무실 줄 원가 직접 입력"
                  onCommit={(t) => onCost([x.id], toNum(t))}
                  className="w-24 rounded-md border border-amber-300 bg-amber-50/60 px-1.5 py-1 text-right text-xs outline-none focus:border-rose-600"
                />
              ) : null
            }
          />
        ));
        if (l.np)
          rows.unshift(
            <DetailRow
              key={`${l.key}|np`}
              option={name}
              where={`넥스트팩${l.np.locs.length ? ` ${l.np.locs.join(" · ")}` : ""}`}
              tone="nextpack"
              qty={l.npQty}
              note={l.held > 0 ? <Pill tone="held">주문에 묶임 {l.held} · 바로 보낼 수 있는 건 {l.npAvail}장</Pill> : null}
              cost={l.np.cost}
              money={l.np.money}
            />,
          );
        return rows;
      })}
    </div>
  );
}

function ViewTab({ groups, totals, onCost, goAdd }) {
  const [place, setPlace] = useState("all");
  const [held, setHeld] = useState(false);
  const [noCost, setNoCost] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("money");
  const [opened, setOpened] = useState(() => new Set());
  const list = useMemo(() => viewGroups(groups, { place, q, held, noCost, sort }), [groups, place, q, held, noCost, sort]);
  const toggle = (k) =>
    setOpened((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const allOpen = list.length > 0 && list.every((g) => opened.has(g.key));

  if (!groups.length)
    return (
      <Empty title="아직 재고가 없어요" hint="이지어드민 현재고조회 파일을 넣거나 사무실 렉 줄을 적으면 여기에 합쳐져요.">
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => goAdd("nextpack")} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            넥스트팩 넣기
          </button>
          <button type="button" onClick={() => goAdd("rack")} className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400">
            사무실 렉 적기
          </button>
        </div>
      </Empty>
    );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 gap-0.5 rounded-full bg-stone-100 p-0.5">
          {[
            ["all", "전체"],
            ["nextpack", "넥스트팩"],
            ["rack", "사무실"],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setPlace(k)} className={"rounded-full px-3 py-1 text-xs font-semibold " + (place === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setHeld((v) => !v)} className={CHIP + (held ? CHIP_ON : CHIP_OFF)}>
          주문에 묶임 {totals.heldLines}
        </button>
        {totals.noCost > 0 && (
          <button type="button" onClick={() => setNoCost((v) => !v)} className={CHIP + (noCost ? CHIP_ON : CHIP_OFF)}>
            원가 없음 {totals.noCost}
          </button>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품·옵션·렉·제조사 찾기" aria-label="재고 찾기" className={FIELD + " w-full min-w-0 py-1.5 @2xl:w-56 @2xl:flex-none"} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬" className="ml-auto rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-500 outline-none focus:border-rose-600">
          <option value="money">묶인 돈 많은 순</option>
          <option value="pieces">장수 많은 순</option>
          <option value="name">이름 순</option>
        </select>
      </div>

      {list.length === 0 ? (
        <Empty title="맞는 재고가 없어요" hint="찾는 말이나 거르기를 바꿔 보세요." />
      ) : (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
            <Pill tone="nextpack">넥스트팩</Pill>
            <Pill tone="rack">사무실</Pill>
            <Pill tone="held">주문에 묶임</Pill>
            <span className="ml-1 text-stone-400">상품을 누르면 위치·원가가 보여요</span>
            <button type="button" onClick={() => setOpened(allOpen ? new Set() : new Set(list.map((g) => g.key)))} className="ml-auto whitespace-nowrap underline decoration-dotted hover:text-stone-800">
              {allOpen ? "전부 접기" : "전부 펴기"}
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className={"hidden gap-x-3 border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-500 @2xl:grid " + VIEW_GRID}>
              <div className="pl-5">상품</div>
              <div>옵션별 수량</div>
              <div className="text-right">넥스트팩</div>
              <div className="text-right">사무실</div>
              <div className="text-right">합계</div>
              <div className="text-right">묶인 돈</div>
            </div>
            <div className="divide-y divide-stone-200">
              {list.map((g) => {
                const open = noCost || opened.has(g.key);
                return (
                  <div key={g.key}>
                    <button type="button" onClick={() => toggle(g.key)} aria-expanded={open} className={"grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-3 py-2.5 text-left text-sm hover:bg-stone-50 @2xl:items-center " + VIEW_GRID}>
                      <span className="flex min-w-0 items-start gap-1 font-semibold text-stone-900">
                        <span className="mt-0.5 shrink-0 text-stone-300">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                        <span className="min-w-0 break-words">{displayName(g.name)}</span>
                      </span>
                      <span className="row-span-2 text-right text-xs tabular-nums @2xl:hidden">
                        <b className="block text-base font-bold text-stone-900">{g.pieces}장</b>
                        <Money g={g} />
                      </span>
                      <span className="min-w-0 pl-5 @2xl:pl-0">
                        <OptionChips lines={g.lines} />
                      </span>
                      <span className="hidden text-right text-stone-600 tabular-nums @2xl:block">{g.npQty || <span className="text-stone-300">—</span>}</span>
                      <span className="hidden text-right tabular-nums @2xl:block">{g.rackQty ? <b className="font-semibold text-rose-700">{g.rackQty}</b> : <span className="text-stone-300">—</span>}</span>
                      <span className="hidden text-right font-bold text-stone-900 tabular-nums @2xl:block">{g.pieces}</span>
                      <span className="hidden text-right tabular-nums @2xl:block">
                        <Money g={g} />
                      </span>
                    </button>
                    {open && <Details group={g} onCost={onCost} />}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 넥스트팩 넣기

function DiffList({ title, tone, items, render }) {
  if (!items.length) return null;
  return (
    <details open className="rounded-xl border border-stone-200">
      <summary className={"cursor-pointer px-3 py-2 text-sm font-semibold " + tone}>
        {title} {items.length}
      </summary>
      <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto border-t border-stone-100 text-sm">
        {items.map((x, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
            {render(x)}
          </li>
        ))}
      </ul>
    </details>
  );
}

const rowName = (r) => (
  <span className="min-w-0 break-words text-stone-800">
    {stripTags(r.name)}
    {r.option && <span className="ml-1.5 text-stone-500">{cleanOption(r.option)}</span>}
  </span>
);
const arrow = (label, a, b) => (a === b ? `${label} ${b}` : `${label} ${a}→${b}`);

function NextpackPreview({ data, prev, onApply, onClose }) {
  const diff = useMemo(() => diffNextpack(prev, data.rows), [prev, data.rows]);
  const s = useMemo(() => npSummary(data.rows), [data.rows]);
  return (
    <Sheet wide onClose={onClose}>
      <SheetHead title="넥스트팩 넣기 전에 확인" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
          <div className="truncate text-xs text-stone-400">{data.file}</div>
          <div className="mt-0.5 text-stone-800 tabular-nums">
            <b>{s.lines}줄</b> · <b>{s.pieces}장</b> · 가용 {s.avail}장 · 묶인 돈 <b>₩{won(s.money)}</b>
            {s.noCost > 0 && <span className="ml-1.5 font-medium text-amber-700">원가 없는 {s.noCost}줄 빠짐</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-stone-600">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">새로 생긴 줄 {diff.added.length}</span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-800">사라진 줄 {diff.removed.length}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">수량 바뀐 줄 {diff.changed.length}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium">그대로 {diff.same}</span>
        </div>
        {diff.removed.length > data.rows.length && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">사라지는 줄이 넣을 줄보다 많아요. 검색 조건이 걸린 파일이 아닌지 확인해 주세요.</p>}
        <DiffList title="새로 생긴 줄" tone="text-emerald-800" items={diff.added} render={(r) => (<>{rowName(r)}<span className="text-xs text-stone-500 tabular-nums">정상 {r.qty} · 가용 {r.avail}</span></>)} />
        <DiffList title="사라진 줄" tone="text-rose-800" items={diff.removed} render={(r) => (<>{rowName(r)}<span className="text-xs text-stone-500 tabular-nums">정상 {r.qty} · 가용 {r.avail}</span></>)} />
        <DiffList title="수량 바뀐 줄" tone="text-amber-800" items={diff.changed} render={({ row, before }) => (<>{rowName(row)}<span className="text-xs text-stone-500 tabular-nums">{arrow("정상", before.qty, row.qty)} · {arrow("가용", before.avail, row.avail)}{before.hold !== row.hold ? ` · ${arrow("접수", before.hold, row.hold)}` : ""}</span></>)} />
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <p className="mb-2 text-xs text-stone-500">넥스트팩 줄 전체가 이 내용으로 바뀌어요. 사무실 렉은 그대로예요.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-400">
            취소
          </button>
          <button type="button" onClick={onApply} className="flex-[2] rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">
            넣기
          </button>
        </div>
      </footer>
    </Sheet>
  );
}

function NextpackTab({ nextpack, busy, drag, onPick }) {
  const s = useMemo(() => npSummary(nextpack?.rows), [nextpack]);
  const old = daysAgo(nextpack?.at);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onPick}
        className={"flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-12 text-center transition " + (drag ? "border-rose-400 bg-rose-50/60" : "border-stone-300 bg-white hover:border-rose-300")}
      >
        {busy ? <Loader2 size={28} className="animate-spin text-stone-400" /> : <FileSpreadsheet size={30} className="text-emerald-600" />}
        <span className="font-semibold text-stone-900">이지어드민 현재고조회 넣기</span>
        <span className="text-sm text-stone-500">끌어다 놓거나 눌러서 고르기 · .xls · .csv · 표를 복사해 Ctrl+V 도 돼요</span>
      </button>
      {nextpack?.rows ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="text-xs text-stone-400">지금 들어 있는 것</div>
          <div className="mt-1 font-semibold break-words text-stone-900">{nextpack.file}</div>
          <div className="mt-1 text-stone-600 tabular-nums">
            {whenLabel(nextpack.at)} 넣음
            {old > 0 && <span className="ml-1.5 font-medium text-amber-700">{old}일 전</span>} · {s.lines}줄 · {s.pieces}장 · 가용 {s.avail}장 · 묶인 돈 ₩{won(s.money)}
            {s.noCost > 0 && <span className="ml-1.5 font-medium text-amber-700">원가 없는 {s.noCost}줄 빠짐</span>}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-stone-400">아직 넣은 파일이 없어요.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 사무실 렉

const RACK_GRID = "@2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_8rem_6rem_minmax(0,1fr)_2.25rem]";
const CELL = "w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-rose-600 @2xl:py-1.5";
const STEP = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:border-stone-400 active:bg-stone-100 disabled:opacity-30 @2xl:h-8 @2xl:w-8 @2xl:rounded-lg";

function Stepper({ qty, onBump, onSet }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onBump(-1)} disabled={qty <= 0} aria-label="수량 하나 빼기" className={STEP}>
        <Minus size={16} />
      </button>
      <CommitInput value={qty} inputMode="numeric" aria-label="수량" onCommit={(t) => onSet(Math.max(0, toNum(t)))} className={CELL + " px-1 text-center font-semibold tabular-nums"} />
      <button type="button" onClick={() => onBump(1)} aria-label="수량 하나 더하기" className={STEP}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function CostCell({ row, found, onCommit }) {
  const missing = !(row.cost > 0) && !(found.cost > 0);
  return (
    <div className="min-w-0">
      <CommitInput
        value={row.cost > 0 ? row.cost : ""}
        inputMode="numeric"
        placeholder={found.cost > 0 ? won(found.cost) : "원가 입력"}
        aria-label="원가"
        onCommit={(t) => onCommit(toNum(t))}
        className={CELL + " text-right tabular-nums " + (missing ? "border-amber-300 bg-amber-50/60 placeholder:text-amber-700/70" : "")}
      />
      <div className={"mt-0.5 text-right text-[11px] leading-snug " + (missing && row.qty > 0 ? "text-amber-700" : "text-stone-400")}>{row.cost > 0 ? "직접 적은 값" : found.note || (row.qty > 0 ? "원가 없음" : "")}</div>
    </div>
  );
}

function RackRow({ row, find, known, listId, onChange, onBump, onRemove, onError }) {
  const unknown = known.words.size > 0 && !known.words.has(groupKey(row.name));
  const stamp = () => new Date().toISOString();
  return (
    <div className={"grid grid-cols-2 gap-2 px-3 py-3 @2xl:items-start @2xl:py-2 " + RACK_GRID}>
      <div className="col-span-2 min-w-0 @2xl:col-span-1">
        <CommitInput
          value={row.name}
          list={listId}
          placeholder="상품명"
          aria-label="상품명"
          onCommit={(t) => {
            // 오늘출발이 첫 낱말로 상품을 찾아서 이름을 비울 수 없다
            if (!groupKey(t)) return onError("상품명은 비울 수 없어요. 줄을 없애려면 휴지통을 누르세요.");
            onChange({ name: t, at: stamp() });
          }}
          className={CELL}
        />
        {unknown && (
          <div title="오늘출발은 상품명 첫 낱말(고유네임)로 카페24 상품을 찾아요." className="mt-0.5 text-[11px] text-amber-700">
            판매 중 상품에 없는 이름 · 첫 낱말을 확인해 주세요
          </div>
        )}
      </div>
      <CommitInput value={row.option} placeholder="옵션" aria-label="옵션" onCommit={(t) => onChange({ option: cleanOption(t), at: stamp() })} className={CELL} />
      <CommitInput value={row.rack} placeholder="렉 위치" aria-label="렉 위치" onCommit={(t) => onChange({ rack: t, at: stamp() })} className={CELL} />
      <Stepper qty={Number(row.qty) || 0} onBump={onBump} onSet={(n) => onChange({ qty: n, at: stamp() })} />
      <CostCell row={row} found={find(row.name, row.option)} onCommit={(n) => onChange({ cost: n, at: stamp() })} />
      <div className="col-span-2 flex items-center gap-2 @2xl:contents">
        <CommitInput value={row.memo} placeholder="메모" aria-label="메모" onCommit={(t) => onChange({ memo: t, at: stamp() })} className={CELL} />
        <button type="button" onClick={onRemove} aria-label={`${stripTags(row.name)} ${row.option} 줄 지우기`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-700">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function RackAdd({ listId, onAdd, onError }) {
  const blank = { name: "", option: "", rack: "", qty: "1", memo: "" };
  const [f, setF] = useState(blank);
  const optRef = useRef(null);
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const add = () => {
    if (!groupKey(f.name)) return onError("상품명을 적어 주세요. 첫 낱말(고유네임)로 같은 상품을 맞춰요.");
    onAdd({ id: newId("rk"), name: f.name.trim(), option: cleanOption(f.option), rack: f.rack.trim(), qty: Math.max(0, toNum(f.qty)), cost: 0, memo: f.memo.trim(), at: new Date().toISOString() });
    // 같은 상품 다른 옵션을 이어 적기 쉽게 상품명·렉은 남긴다
    setF((x) => ({ ...x, option: "", qty: "1", memo: "" }));
    optRef.current?.focus();
  };
  const enter = (e) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      add();
    }
  };
  const qty = toNum(f.qty);
  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className={"grid grid-cols-2 gap-2 p-3 @2xl:items-center " + RACK_GRID}>
        <input value={f.name} onChange={put("name")} onKeyDown={enter} list={listId} placeholder="상품명 (첫 낱말이 고유네임)" aria-label="새 줄 상품명" className={CELL + " col-span-2 @2xl:col-span-1"} />
        <input ref={optRef} value={f.option} onChange={put("option")} onKeyDown={enter} placeholder="옵션" aria-label="새 줄 옵션" className={CELL} />
        <input value={f.rack} onChange={put("rack")} onKeyDown={enter} placeholder="렉 위치" aria-label="새 줄 렉 위치" className={CELL} />
        <Stepper qty={qty} onBump={(d) => setF((x) => ({ ...x, qty: String(Math.max(0, toNum(x.qty) + d)) }))} onSet={(n) => setF((x) => ({ ...x, qty: String(n) }))} />
        <input value={f.memo} onChange={put("memo")} onKeyDown={enter} placeholder="메모" aria-label="새 줄 메모" className={CELL + " @2xl:col-span-2"} />
        <button type="button" onClick={add} className="col-span-2 flex h-11 items-center justify-center gap-1 rounded-xl bg-rose-700 text-sm font-semibold text-white hover:bg-rose-800 @2xl:col-span-1 @2xl:h-9 @2xl:w-9 @2xl:rounded-lg" aria-label="줄 추가">
          <Plus size={16} />
          <span className="@2xl:hidden">줄 추가</span>
        </button>
      </div>
    </div>
  );
}

function RackTab({ rack, find, known, onAdd, onChange, onBump, onRemove, onPaste, onPickFile, onError }) {
  const [q, setQ] = useState("");
  const listId = "stock-names";
  const list = useMemo(() => {
    const words = q.split(/\s+/).map((w) => w.toLowerCase()).filter(Boolean);
    const hit = (r) => {
      const t = `${r.name} ${r.option} ${r.rack} ${r.memo}`.toLowerCase().replace(/\s+/g, "");
      return words.every((w) => t.includes(w));
    };
    return rackSort(rack.filter(hit));
  }, [rack, q]);
  const pieces = rack.reduce((n, r) => n + Math.max(0, Number(r.qty) || 0), 0);
  const last = rack.reduce((a, r) => (String(r.at || "") > a ? String(r.at) : a), "");
  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {known.names.slice(0, 800).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onPaste} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
          <ClipboardPaste size={15} /> 표 붙여넣기
        </button>
        <button type="button" onClick={onPickFile} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
          <FileSpreadsheet size={15} /> 파일 넣기
        </button>
        <span className="ml-auto text-xs text-stone-500 tabular-nums">
          {rack.length}줄 · {pieces}장{last && ` · ${whenLabel(last)} 고침`}
        </span>
      </div>
      <p className="text-xs text-stone-400">엑셀 표를 복사해 이 화면에서 Ctrl+V 해도 돼요. 머리 줄 이름으로 열을 찾고, 못 찾으면 어느 열이 무엇인지 고르게 해 드려요.</p>
      <RackAdd listId={listId} onAdd={onAdd} onError={onError} />
      {rack.length > 0 ? (
        <>
          {rack.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="렉 줄 찾기" aria-label="렉 줄 찾기" className={FIELD} />}
          <div className="rounded-2xl border border-stone-200 bg-white">
            <div className={"hidden gap-2 rounded-t-2xl border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-500 @2xl:grid " + RACK_GRID}>
              <div>상품명</div>
              <div>옵션</div>
              <div>렉 위치</div>
              <div className="text-center">수량</div>
              <div className="text-right">원가</div>
              <div>메모</div>
              <div />
            </div>
            <div className="divide-y divide-stone-100">
              {list.map((r) => (
                <RackRow key={r.id} row={r} find={find} known={known} listId={listId} onError={onError} onChange={(p) => onChange(r.id, p)} onBump={(d) => onBump(r.id, d)} onRemove={() => onRemove(r)} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <Empty title="아직 렉 줄이 없어요" hint="위 칸에 적거나 엑셀 표를 붙여 넣으면 재고 보기에 합쳐져요." />
      )}
    </div>
  );
}

/** 표 넣기 — 열 고르기 + 미리보기 */
function RackImport({ data, current, known, onApply, onClose }) {
  const guess = useMemo(() => guessRackColumns(data.table), [data.table]);
  const width = useMemo(() => Math.max(0, ...data.table.map((r) => r.length)), [data.table]);
  const [map, setMap] = useState(() => Array.from({ length: width }, (_, i) => guess.map[i] || ""));
  const [headerAt, setHeaderAt] = useState(guess.headerAt);
  const [replace, setReplace] = useState(false);
  const ready = map.includes("name") && map.includes("qty");
  const [at] = useState(() => new Date().toISOString());
  const parsed = useMemo(() => (ready ? rackRows(data.table, headerAt, map, at, () => newId("rk")) : { rows: [], bad: [], filled: 0, merged: 0 }), [ready, data.table, headerAt, map, at]);
  const merged = useMemo(() => mergeRack(current, parsed.rows, replace), [current, parsed.rows, replace]);
  const samples = data.table.slice(headerAt + 1, headerAt + 7);
  const strange = known.words.size > 0 ? parsed.rows.filter((r) => !known.words.has(groupKey(r.name))) : [];
  const setCol = (i, f) => setMap((m) => m.map((x, j) => (j === i ? f : f && x === f ? "" : x)));
  const qtyLine = (r) => <span className="text-xs text-stone-500 tabular-nums">{r.rack || "위치 없음"} · {r.qty}장</span>;
  return (
    <Sheet xwide onClose={onClose}>
      <SheetHead title="사무실 렉에 넣기 전에 확인" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className={"rounded-lg px-3 py-2 text-sm " + (guess.headerAt >= 0 && ready ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
          {guess.headerAt >= 0 && ready ? "머리 줄에서 열을 찾았어요. 틀린 칸이 있으면 위 칸에서 바꿔 주세요." : "어느 열이 무엇인지 골라 주세요. 상품명과 수량은 꼭 필요해요."}
        </p>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={headerAt >= 0} onChange={(e) => setHeaderAt(e.target.checked ? Math.max(0, guess.headerAt) : -1)} className="accent-rose-700" />
          {headerAt > 0 ? `${headerAt + 1}번째 줄까지는 제목이에요` : "첫 줄은 제목이에요"}
        </label>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-50">
              <tr>
                {map.map((f, i) => (
                  <th key={i} className="min-w-[6.5rem] px-2 py-1.5 text-left font-normal">
                    <select value={f} onChange={(e) => setCol(i, e.target.value)} aria-label={`${i + 1}번째 열`} className={"w-full rounded-lg border px-1.5 py-1 text-xs outline-none focus:border-rose-600 " + (f ? "border-rose-300 bg-rose-50/60 font-semibold text-rose-800" : "border-stone-200 bg-white text-stone-500")}>
                      {RACK_FIELDS.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {samples.map((r, i) => (
                <tr key={i}>
                  {map.map((_, j) => (
                    <td key={j} className="max-w-[14rem] truncate px-2 py-1 text-xs text-stone-600">
                      {r[j]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ready && (
          <>
            <div className="flex flex-wrap gap-1.5 text-xs text-stone-600">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">새 줄 {merged.added.length}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">바뀌는 줄 {merged.changed.length}</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium">그대로 {merged.same}</span>
              {replace && <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-800">지울 줄 {merged.removed.length}</span>}
            </div>
            {parsed.filled > 0 && <p className="text-xs text-stone-500">상품명 칸이 빈 {parsed.filled}줄은 윗줄 이름·렉으로 채웠어요(엑셀 병합 칸). 맞는지 봐 주세요.</p>}
            {parsed.merged > 0 && <p className="text-xs text-stone-500">같은 상품·옵션·렉이 여러 번 있어서 {parsed.merged}줄은 수량을 합쳤어요.</p>}
            {strange.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">판매 중 상품에 없는 이름 {strange.length}줄: {[...new Set(strange.map((r) => groupKey(r.name)))].slice(0, 12).join(" · ")}. 첫 낱말이 고유네임이어야 오늘출발이 맞아요.</p>}
            <DiffList title="새 줄" tone="text-emerald-800" items={merged.added} render={(r) => (<>{rowName(r)}{qtyLine(r)}</>)} />
            <DiffList title="바뀌는 줄" tone="text-amber-800" items={merged.changed} render={({ row, before }) => (<>{rowName(row)}<span className="text-xs text-stone-500 tabular-nums">{row.rack || "위치 없음"} · {arrow("수량", Number(before.qty) || 0, row.qty)}</span></>)} />
            <DiffList title="못 넣는 줄" tone="text-rose-800" items={parsed.bad} render={(b) => (<><span className="min-w-0 break-words text-stone-600">{b.line}번째 줄 · {b.text}</span><span className="text-xs text-rose-700">{b.why}</span></>)} />
            <label className="flex items-start gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 accent-rose-700" />
              <span>
                이 표가 사무실 재고 전부예요. 표에 없는 줄은 지워요.
                {replace && merged.removed.length > 0 && <span className="mt-0.5 block text-xs text-rose-700">지워지는 줄: {merged.removed.map((r) => `${groupKey(r.name)} ${cleanOption(r.option)}`).slice(0, 20).join(" · ")}</span>}
              </span>
            </label>
          </>
        )}
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-stone-200 p-3">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-400">
          취소
        </button>
        <button type="button" disabled={!ready || !parsed.rows.length} onClick={() => onApply(parsed.rows, replace)} className="flex-[2] rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-40">
          {parsed.rows.length ? `${parsed.rows.length}줄 넣기` : "넣기"}
        </button>
      </footer>
    </Sheet>
  );
}

/** 폰처럼 Ctrl+V 가 없을 때 — 칸에 붙여 넣기 */
function PasteSheet({ onRead, onClose }) {
  const [text, setText] = useState("");
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="표 붙여넣기" onClose={onClose} />
      <div className="space-y-2 p-4">
        <p className="text-sm text-stone-500">엑셀에서 표를 복사해 아래 칸에 붙여 넣으세요.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} aria-label="표 글" placeholder={"상품명\t옵션\t렉\t수량\n엘비 레이스\t먹색\tA-1\t2"} className={FIELD + " font-mono text-xs"} />
      </div>
      <footer className="flex gap-2 border-t border-stone-200 p-3">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-400">
          취소
        </button>
        <button type="button" disabled={!text.trim()} onClick={() => onRead(text)} className="flex-[2] rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-40">
          읽기
        </button>
      </footer>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 화면

export default function StockPage({ online, pricing, stats }) {
  const { stock, loaded, msg, setMsg, change } = useStock(online);
  const [tab, setTabState] = useState(readTab);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState("");
  const [npPreview, setNpPreview] = useState(null);
  const [rackImport, setRackImport] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [gone, setGone] = useState(null); // 방금 지운 렉 줄 — 되돌리기
  const file = useRef(null);

  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(t);
  }, [note]);

  const rack = useMemo(() => (Array.isArray(stock.rack) ? stock.rack : []), [stock.rack]);
  const groups = useMemo(() => buildGroups(stock, pricing), [stock, pricing]);
  const totals = useMemo(() => stockTotals(groups), [groups]);
  const find = useMemo(() => costFinder(stock, pricing), [stock, pricing]);
  const known = useMemo(() => knownNames(stock, pricing, stats), [stock, pricing, stats]);

  // 머리 줄을 보고 넥스트팩인지 렉인지 가른다
  const route = useCallback(
    (table, name) => {
      setMsg("");
      if (!table.length) return setMsg("표를 읽지 못했어요. 파일이나 복사한 내용을 확인해 주세요.");
      const rows = parseNextpack(table);
      if (rows) {
        if (!rows.length) return setMsg("현재고조회 파일인데 재고 줄이 하나도 없어요. 검색 조건을 확인해 주세요.");
        return setNpPreview({ file: name, rows });
      }
      if (tab === "nextpack") return setMsg("이지어드민 현재고조회 모양이 아니에요('상품명 · 정상재고 · 가용재고' 머리 줄을 못 찾았어요).");
      if (Math.max(...table.map((r) => r.length)) < 2) return setMsg("칸이 하나뿐이라 표로 읽지 못했어요. 엑셀에서 표째로 복사해 주세요.");
      setRackImport({ table, file: name });
    },
    [tab, setMsg],
  );
  const readFile = async (f) => {
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      route(parseTable(await fileToCsv(f, { raw: true })), f.name || "파일");
    } catch {
      setMsg("파일을 읽지 못했어요. .xls · .xlsx · .csv 파일인지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  // 표를 복사해 Ctrl+V (이지어드민 화면·엑셀에서)
  const sheetOpen = !!(npPreview || rackImport || pasteOpen);
  useEffect(() => {
    if (sheetOpen) return;
    const onPaste = (e) => {
      if (e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!text.trim()) return;
      e.preventDefault();
      route(parseTable(text), "붙여넣은 표");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sheetOpen, route]);

  const applyNextpack = async () => {
    const { file: name, rows } = npPreview;
    const s = npSummary(rows);
    setNpPreview(null);
    if (await change(setNextpack({ at: new Date().toISOString(), file: name, rows }))) {
      setTab("view");
      setNote(`넥스트팩을 넣었어요 · ${s.lines}줄 ${s.pieces}장`);
    }
  };
  const applyRack = async (rows, replace) => {
    setRackImport(null);
    if (await change(rackMerge(rows, replace))) {
      setTab("rack");
      setNote(`사무실 렉에 넣었어요 · ${rows.length}줄`);
    }
  };
  const removeRack = (row) => {
    setGone(row);
    change(rackRemove(row.id));
  };

  const npOld = daysAgo(stock.nextpack?.at);
  return (
    <div
      className="@container"
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDrag(false)}
      onDrop={(e) => {
        if (!fileFromDrop(e.dataTransfer)) return;
        e.preventDefault();
        setDrag(false);
        readFile(fileFromDrop(e.dataTransfer));
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-xl font-bold text-stone-900">재고</h2>
        <p className="text-xs text-stone-500 tabular-nums">
          {stock.nextpack?.at ? (
            <>
              넥스트팩 {whenLabel(stock.nextpack.at)} 넣음
              {npOld > 0 && <b className="ml-1 font-medium text-amber-700">{npOld}일 전</b>}
            </>
          ) : (
            "넥스트팩 파일 아직 없음"
          )}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Kpi label="전체" value={`${totals.pieces}장`} sub={`상품 ${totals.products}개`} />
        <Kpi label="묶인 돈" value={`₩${won(totals.money)}`} tone="rose" sub={totals.noCost > 0 ? <span className="font-medium text-amber-700">원가 없는 {totals.noCost}줄 빠짐</span> : "원가 × 수량"} />
        <Kpi label="넥스트팩" value={`${totals.nextpack.pieces}장`} sub={`₩${won(totals.nextpack.money)}${totals.heldPieces > 0 ? ` · 주문에 묶임 ${totals.heldPieces}장` : ""}`} />
        <Kpi label="사무실" value={`${totals.rack.pieces}장`} sub={`₩${won(totals.rack.money)}${totals.rack.noCost > 0 ? ` · ${totals.rack.noCost}줄 빠짐` : ""}`} />
      </div>

      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1">
        <Tab active={tab === "view"} onClick={() => setTab("view")}>
          재고 보기
        </Tab>
        <Tab active={tab === "nextpack"} onClick={() => setTab("nextpack")}>
          넥스트팩 넣기
        </Tab>
        <Tab active={tab === "rack"} onClick={() => setTab("rack")}>
          사무실 렉
        </Tab>
      </div>

      <input
        ref={file}
        type="file"
        accept=".xls,.xlsx,.csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기" className="shrink-0 text-amber-700">
            <X size={16} />
          </button>
        </div>
      )}
      {note && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{note}</div>}
      {gone && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          <span className="min-w-0 break-words">
            {groupKey(gone.name)} {cleanOption(gone.option)} 줄을 지웠어요.
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                change(rackRestore(gone));
                setGone(null);
              }}
              className="font-semibold text-rose-700 underline decoration-dotted"
            >
              되돌리기
            </button>
            <button type="button" onClick={() => setGone(null)} aria-label="닫기" className="text-stone-400">
              <X size={15} />
            </button>
          </span>
        </div>
      )}

      {tab === "view" ? (
        !loaded && !groups.length ? (
          <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>
        ) : (
          <ViewTab groups={groups} totals={totals} goAdd={setTab} onCost={(ids, n) => change(rackPatch(ids, { cost: n, at: new Date().toISOString() }))} />
        )
      ) : tab === "nextpack" ? (
        <NextpackTab nextpack={stock.nextpack} busy={busy} drag={drag} onPick={() => file.current?.click()} />
      ) : (
        <RackTab
          rack={rack}
          find={find}
          known={known}
          onAdd={(row) => {
            setMsg("");
            change(rackAdd(row));
          }}
          onChange={(id, patch) => change(rackPatch([id], patch))}
          onBump={(id, d) => change(rackBump(id, d, new Date().toISOString()))}
          onRemove={removeRack}
          onPaste={() => setPasteOpen(true)}
          onPickFile={() => file.current?.click()}
          onError={setMsg}
        />
      )}

      {npPreview && <NextpackPreview data={npPreview} prev={stock.nextpack?.rows} onApply={applyNextpack} onClose={() => setNpPreview(null)} />}
      {rackImport && <RackImport data={rackImport} current={rack} known={known} onApply={applyRack} onClose={() => setRackImport(null)} />}
      {pasteOpen && (
        <PasteSheet
          onClose={() => setPasteOpen(false)}
          onRead={(text) => {
            setPasteOpen(false);
            route(parseTable(text), "붙여넣은 표");
          }}
        />
      )}
    </div>
  );
}
