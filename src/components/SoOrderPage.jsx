import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Copy, Check, X, Loader2, RotateCcw, Info, Save, Undo2, Trash2 } from "lucide-react";
import { won } from "../lib/sales";
import { loadKey, changeKey, upsert, remove, FIELD } from "../lib/shoot";
import { newId } from "../lib/id";
import { Tab } from "./ui";
import SoSaved from "./SoSaved";
import { dayKey } from "../lib/journal";
import { fileToCsv, fileFromDrop } from "../lib/tabular";
import { parseOrder, findPrice, memoryKey, soLines, splitName, sameVendor, SO_TYPES, misongFor, misongOpt, orderKey, orderStamp, stampLabel, diffOrder, splitOpt, joinOpt, colorKey, vendorColors, colorMatch } from "../lib/soOrder";
import { flowBoard } from "../lib/pending";

/**
 * 돈 › 매입 › SO+ 발주 변환 (lib/soOrder.js 머리말).
 * 이지어드민 발주 엑셀 → 줄마다 한 장 단가를 채워서 → SO+ '엑셀 붙여넣기' 칸 모양으로 복사.
 * 만들던 발주는 이 기기에 남는다(poclo_so_draft). 직접 고친 단가·매장명은 복사할 때 settings so_prices {prices, stores} 에 기억한다.
 */

const DRAFT = "poclo_so_draft";
const MEMORY = "so_prices";
const INDEX = "so_orders"; // 저장한 발주 목록(요약) — 한 발주 전체는 'so_order_<id>'
const VIEW = "poclo_so_view";
const readDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
    if (!d?.rows) return d;
    // 10/6 전에 만든 발주 — 도매 상품명에 붙은 위치·매장을 뗀다
    return {
      ...d,
      rows: d.rows.map((r) => {
        if (r.rawName != null) return r;
        const sp = splitName(r.name);
        return { ...r, rawName: r.name, name: sp.name, place: sp.place, parsedStore: sp.store };
      }),
    };
  } catch {
    return null;
  }
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const FROM_TONE = {
  ledger: "text-emerald-700",
  pricing: "text-stone-500",
  memory: "text-sky-700",
};

function MissChip({ value, onChange }) {
  const opts = [
    ["yes", "미송 가능"],
    ["no", "미송 X"],
  ];
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-stone-200">
      {opts.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(value === k ? null : k)}
          className={
            "px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " +
            (value === k ? (k === "yes" ? "bg-stone-900 text-white" : "bg-rose-700 text-white") : "bg-white text-stone-400 hover:text-stone-700")
          }
        >
          {label}
        </button>
      ))}
    </span>
  );
}

const squashKey = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const storeKey = (r) => squashKey(r.store || r.vendor);
const nameKey = (r) => storeKey(r) + "|" + squashKey(String(r.name || "").replace(/\s*\([^)]*\)\s*$/, ""));

// 색상 칸 폭 = 글자 폭(한글 1em · 그 밖 0.6em) — 칸이 글자보다 넓으면 '[ 아이보리 ]' 처럼 빈칸이 생긴다
const optWidth = (s) => Math.max(2, [...String(s || "")].reduce((w, c) => w + (/[가-힣ㄱ-ㅎ]/.test(c) ? 1 : 0.6), 0));

export default function SoOrderPage({ tx, vendors, pricing, online }) {
  const [draft, setDraft] = useState(readDraft);
  const [memory, setMemory] = useState({});
  const [stores, setStores] = useState({}); // 제조사 → 지난번 적은 매장명
  const [colors, setColors] = useState({}); // '제조사|도매 상품|원래 색' → 거래처가 부르는 색 (10/13)
  const [shootItems, setShootItems] = useState([]); // 신상 관리 상품 — 거래처 색상과 맞춰 보기 (10/13)
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState("");
  const [allMemo, setAllMemo] = useState("");
  const file = useRef(null);
  const [view, setViewState] = useState(() => {
    try {
      return localStorage.getItem(VIEW) || "make";
    } catch {
      return "make";
    }
  });
  const setView = (v) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW, v);
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  const [saved, setSaved] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      if (draft) localStorage.setItem(DRAFT, JSON.stringify(draft));
      else localStorage.removeItem(DRAFT);
    } catch {
      /* 이 기기에 못 남겨도 화면은 돈다 */
    }
  }, [draft]);

  const loadMemory = useCallback(async () => {
    try {
      const m = await loadKey(MEMORY, online, { prices: {} });
      setMemory(m.prices || {});
      setStores(m.stores || {});
      setColors(m.colors || {});
    } catch {
      /* 기억한 단가 없이도 된다 */
    }
    try {
      setShootItems((await loadKey("shoot_items", online, { items: [] })).items || []);
    } catch {
      /* 신상 관리 없이도 된다 — 색상 비교만 빠진다 */
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadMemory();
  }, [loadMemory]);
  const loadSaved = useCallback(async () => {
    try {
      setSaved((await loadKey(INDEX, online)).items || []);
    } catch {
      /* 목록을 못 읽어도 만들기는 된다 */
    } finally {
      setSavedLoaded(true);
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadSaved();
  }, [loadSaved]);

  // 매장명: 직접 고친 값 → 괄호 안 매장명(지난번에 고쳐 둔 이름이 있으면 그것, 키 '@괄호 이름') → 지난번 그 제조사에 적은 매장명 → 제조사
  const autoStore = useCallback((r) => (r.parsedStore ? stores["@" + r.parsedStore] || r.parsedStore : stores[r.vendor] || r.vendor), [stores]);
  // 매장 위치 (10/6 세원: "매장명 밑에 해당 거래처 매장 위치, 복사 내용엔 안 들어가게") — 돈 › 거래처 주소 → 없으면 이지어드민 괄호 위치. 화면에만.
  const addrOf = useCallback((store) => (vendors || []).find((v) => v.address && sameVendor(v.name, store))?.address || "", [vendors]);
  const vname = useMemo(() => Object.fromEntries((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const withStore = useMemo(
    () =>
      (draft?.rows || []).map((r) => {
        const store = r.storeEdit || autoStore(r);
        // 색상: 직접 고친 색 → 지난번 그 상품·색에 고친 색 → 원래 색. 원래 옵션은 optionFile 로 남긴다(2차 발주 비교·미송 맞추기)
        const o = splitOpt(r.option);
        const remembered = colors[colorKey(r, o.color)];
        const color = r.colorEdit ?? remembered ?? o.color;
        // 신상 관리에 적힌 거래처 색상과 비교 — 없는 색이면 노랗게 + 거래처 색상 칩
        const vc = vendorColors(r, shootItems, vname);
        const colorOk = vc ? colorMatch(color, vc.list) : null;
        return { ...r, store, addr: addrOf(store) || r.place || "", optionFile: r.option, option: joinOpt({ ...o, color }), colorFrom: color !== o.color ? o.color : "", colorAuto: r.colorEdit == null && !!remembered, vc, colorOk };
      }),
    [draft?.rows, autoStore, addrOf, colors, shootItems, vname],
  );

  // 줄마다 찾은 단가 — 장끼·판매가 목록이 바뀌면 다시 찾는다(직접 고친 값은 그대로)
  const found = useMemo(() => {
    const src = { tx, vendors, pricing, memory };
    return Object.fromEntries(withStore.map((r) => [r.id, findPrice(r, src)]));
  }, [withStore, tx, vendors, pricing, memory]);

  // 남은 미송 (돈 › 미송·매입금 과 같은 계산)
  const misong = useMemo(() => {
    // 같은 날 앞 차수 발주가 이미 쓴 미송은 빼고 (draft.misBefore — 2차·3차 발주)
    const before = draft?.misBefore || {};
    return flowBoard(tx || [], (id) => vname[id] || "", "pending")
      .groups.flatMap((g) => g.lines)
      .map((l) => ({ ...l, left: l.left - (before[l.key] || 0) }))
      .filter((l) => l.left > 0);
  }, [tx, vname, draft?.misBefore]);

  const priced = useMemo(
    () =>
      withStore.map((r) => {
        const f = found[r.id] || {};
        const price = r.manual != null ? r.manual : f.price;
        return { ...r, price: price > 0 ? price : null, auto: f };
      }),
    [withStore, found],
  );
  // × 로 뺀 줄 (10/12 세원: "x 누르면 바로 없어지지 말고 맨 밑으로 내려갔다가 다시 살릴 수 있게, 최종적으로 확인할 때 지울 수 있게")
  // — 표 맨 아래 '뺀 줄'로 내려가고 복사·합계·미송·저장에서 빠진다. 되살리기 / 지우기(진짜로)
  const offRows = useMemo(() => priced.filter((r) => r.off), [priced]);
  const rows = useMemo(() => {
    const list = priced.filter((r) => !r.off);
    // 같은 매장끼리 붙여서 (10/11 세원: "같은 거래처에서 같은 상품 다른 옵션이든 그냥 같은 거래처이면 바로 아래 보여주게")
    // 매장은 처음 나온 순서, 매장 안에서는 같은 상품끼리(처음 나온 순서), 나머지는 원래 순서. 복사 글도 이 순서
    const first = new Map();
    list.forEach((r, i) => {
      if (!first.has(storeKey(r))) first.set(storeKey(r), i);
      if (!first.has(nameKey(r))) first.set(nameKey(r), i);
    });
    const sorted = list
      .map((r, i) => ({ r, i }))
      .sort((a, b) => first.get(storeKey(a.r)) - first.get(storeKey(b.r)) || first.get(nameKey(a.r)) - first.get(nameKey(b.r)) || a.i - b.i)
      .map((x) => x.r);

    // 남은 미송 빼기 (10/11 세원: "발주 7장인데 미송 3개 빼서 4개 추가로 넣어야 하는 상황 — 저절로") — lib/soOrder.misongFor
    // 같은 상품·같은 색상·사이즈면 저절로 뺀다(misongOff 면 안 뺌), 옵션이 다르면 알려만 주고 '빼기'(misongForce)로.
    const left = new Map(misong.map((l) => [l.key, l.left]));
    const usedBy = new Map(); // 미송 줄 → 쓴 발주 줄
    const out = sorted.map((r) => {
      const m = misongFor(r, misong);
      const forced = m.loose.filter((l) => (r.misongForce || []).includes(l.key));
      const take = r.misongOff ? [] : [...m.exact, ...forced];
      let used = 0;
      const from = [];
      for (const l of take) {
        const can = Math.min(left.get(l.key) || 0, r.qty - used);
        if (can <= 0) continue;
        left.set(l.key, left.get(l.key) - can);
        used += can;
        from.push({ key: l.key, name: l.name, qty: can, date: l.lastDate });
        usedBy.set(l.key, r.id);
      }
      return { ...r, want: r.qty, qty: r.qty - used, misUsed: used, misFrom: from, misExact: m.exact, misLoose: m.loose };
    });
    // 옵션이 다른 미송은 아직 남았고 다른 줄이 안 쓴 것만 알려 준다
    return out.map((r) => ({ ...r, misHint: r.misLoose.filter((l) => !usedBy.has(l.key) && (left.get(l.key) || 0) > 0 && !(r.misongForce || []).includes(l.key)) }));
  }, [priced, misong]);
  const dropRows = (ids) => setDraft((d) => ({ ...d, rows: d.rows.filter((x) => !ids.includes(x.id)) }));

  /**
   * 파일 읽기 — 여러 개를 한 번에 넣으면 파일명 끝 시각이 늦은 것이 이번 발주, 바로 앞 것이 앞 차수.
   * 하나만 넣으면 저장한 발주 중 같은 요청일 · 더 이른 시각의 것을 찾아 앞 차수로 본다(diffOrder).
   */
  const read = async (input) => {
    const files = (Array.isArray(input) ? input : [input]).filter(Boolean);
    if (!files.length) return;
    setBusy(true);
    setMsg("");
    try {
      const parsed = [];
      for (const f of files) {
        const order = parseOrder(await fileToCsv(f));
        if (!order) throw new Error(`${f.name || "파일"} — 이지어드민 발주 파일 모양이 아니에요('제조사 · 공급처상품명' 머리 줄을 못 찾았어요).`);
        parsed.push({ f, order, stamp: orderStamp(f.name, order.title) });
      }
      parsed.sort((a, b) => a.stamp.localeCompare(b.stamp));
      const cur = parsed[parsed.length - 1];
      const { order, f } = cur;
      if (!order.rows.length) throw new Error("발주 줄이 하나도 없어요. 파일을 확인해 주세요.");
      const all = order.rows.map((r) => ({ ...r, miss: null, manual: null }));

      // 앞 차수 찾기
      let base = null;
      const misBefore = {};
      if (parsed.length > 1) {
        const p = parsed[parsed.length - 2];
        base = { label: stampLabel(p.f.name, p.order.title), rows: p.order.rows.map((r) => ({ k: orderKey(r), q: r.qty })) };
      } else if (cur.stamp) {
        const recs = (await Promise.all(saved.map((x) => loadKey(`so_order_${x.id}`, online, null).catch(() => null)))).filter(Boolean);
        const earlier = recs
          .filter((x) => (x.reqOn || x.on) === order.on && (x.stamp || orderStamp(x.file, x.title)) && (x.stamp || orderStamp(x.file, x.title)) < cur.stamp)
          .sort((a, b) => (a.stamp || orderStamp(a.file, a.title)).localeCompare(b.stamp || orderStamp(b.file, b.title)));
        const last = earlier[earlier.length - 1];
        if (last) {
          base = {
            label: stampLabel(last.file, last.title),
            // 저장할 때 남긴 파일 줄 그대로(fileRows) — 예전 저장은 줄마다 처음 요청 수량
            rows: last.fileRows || (last.rows || []).map((r) => ({ k: orderKey({ ...r, option: r.optionFile || r.option }), q: r.qtyFrom ?? r.want ?? r.qty })),
          };
          // 앞 차수들이 쓴 미송은 이미 쓴 것
          for (const x of earlier) for (const r of x.rows || []) for (const m of r.misFrom || []) misBefore[m.key] = (misBefore[m.key] || 0) + m.qty;
        }
      }
      let rows = all;
      let diff = null;
      if (base) {
        const d = diffOrder(all, base.rows);
        rows = d.rows;
        diff = { label: base.label, dropped: d.dropped.length, less: d.less, kept: d.rows, all };
      }
      setDraft({
        ...order,
        file: f.name || "붙여넣은 표",
        at: new Date().toISOString(),
        type: "주문",
        rows,
        diff,
        misBefore,
        stamp: cur.stamp,
        fileRows: all.map((r) => ({ k: orderKey(r), q: r.qty })),
      });
      setCopied("");
    } catch (e) {
      setMsg(e.message || "파일을 읽지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  // 표를 복사해 Ctrl+V 해도 된다 (이지어드민 화면·엑셀에서)
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!text.includes("\t") && !text.includes(",")) return;
      const order = parseOrder(text);
      if (!order?.rows.length) return;
      e.preventDefault();
      setDraft({ ...order, file: "붙여넣은 표", at: new Date().toISOString(), type: "주문", rows: order.rows.map((r) => ({ ...r, miss: null, manual: null })) });
      setCopied("");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const patchRow = (id, p) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  // 매장명을 고치면 같은 제조사·같은 매장으로 읽힌 다른 줄도 같이 (디벨롭 두 줄처럼)
  const setStore = (row, value) => {
    const v = value.trim();
    const before = autoStore(row);
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((x) =>
        x.id === row.id || (x.vendor === row.vendor && autoStore(x) === before && !x.storeEdit) ? { ...x, storeEdit: v && v !== autoStore(x) ? v : null } : x,
      ),
    }));
  };
  // 색 고치기 — 같은 제조사·같은 도매 상품·같은 원래 색 줄을 같이. 원래 색으로 돌리면 기억도 지운다(복사할 때)
  const setColor = (row, value) => {
    const v = value.trim();
    const orig = splitOpt(row.optionFile || row.option).color;
    if (!v) return;
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((x) => (x.vendor === row.vendor && x.name === row.name && splitOpt(x.option).color === orig ? { ...x, colorEdit: v === orig ? (colors[colorKey(x, orig)] ? orig : null) : v } : x)),
    }));
  };
  const diffOff = () => setDraft((d) => ({ ...d, rows: d.diff.all, diff: { ...d.diff, off: true } }));
  const diffOn = () => setDraft((d) => ({ ...d, rows: d.diff.kept, diff: { ...d.diff, off: false } }));
  const allMiss = (v) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, miss: v })) }));

  const type = draft?.type || "주문";
  // 미송으로 다 채운 줄(주문 0장)도 SO+ 에 넣는다 — 수량 0 + 메모 '미송 N장 받기(결제함)'. 삼촌이 그 매장에 들르게 (10/12 세원)
  // 단가·미송 가능/X 고르기는 새로 사는 줄(live)만
  const live = useMemo(() => rows.filter((r) => r.qty > 0), [rows]);
  const lines = useMemo(() => soLines(rows, type), [rows, type]);
  const text = lines.join("\n");
  const pieces = live.reduce((s, r) => s + r.qty, 0);
  const total = live.reduce((s, r) => s + r.qty * (r.price || 0), 0);
  const noPrice = live.filter((r) => !r.price);
  const noMiss = live.filter((r) => !r.miss);
  const misTaken = rows.filter((r) => r.misUsed > 0);
  const differ = rows.filter((r) => r.manual == null && r.auto?.alt);

  // 날짜별 저장 (10/6 세원: "다 끝나면 날짜별로 저장") — 날짜 기본 = 이지어드민 요청일. 복사할 때도 저절로 저장(같은 발주는 덮어씀)
  const saveOn = draft?.saveOn || draft?.on || dayKey();
  const sig = `${saveOn}|${text}`;
  const isSaved = !!draft?.savedId && draft.savedSig === sig;
  const saveOrder = async () => {
    if (!draft || !rows.length) return false;
    setSaving(true);
    try {
      const id = draft.savedId || newId("so");
      const savedAt = new Date().toISOString();
      // 저장하는 qty = SO+ 에 넣은 수량(미송 뺀 것), want = 요청 수량
      const pick = ({ auto, misExact: _e, misLoose: _l, misHint: _h, vc: _vc, colorOk: _ok, ...r }) => ({ ...r, note: r.manual != null ? "직접 적음" : auto?.note || "" });
      const stores = [...new Set(rows.map((r) => r.store || r.vendor))];
      const rec = {
        id,
        on: saveOn,
        reqOn: draft.on || "",
        title: draft.title || draft.file || "발주",
        file: draft.file || "",
        stamp: draft.stamp || orderStamp(draft.file, draft.title),
        fileRows: draft.fileRows || null,
        misBefore: draft.misBefore || {},
        type,
        savedAt,
        lines: lines.length,
        pieces,
        total,
        text,
        rows: rows.map(pick),
      };
      await changeKey(`so_order_${id}`, online, () => rec, {});
      const next = await changeKey(INDEX, online, upsert({ id, on: saveOn, title: rec.title, lines: rec.lines, pieces, total, stores, savedAt }));
      setSaved(next.items || []);
      setDraft((d) => ({ ...d, savedId: id, savedSig: sig, savedAt }));
      return true;
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const openSaved = (rec) => {
    if (draft && !isSaved && !window.confirm("만들던 발주가 저장 안 된 채 바뀌어요. 저장한 발주를 불러올까요?")) return;
    const strip = (r) => {
      // 불러올 땐 요청 수량으로 — 미송은 지금 남은 걸로 다시 뺀다(두 번 빼지 않게)
      const out = { ...r, qty: r.want ?? r.qty, option: r.optionFile || r.option };
      for (const k of ["store", "addr", "price", "note", "want", "misUsed", "misFrom", "misExact", "misLoose", "misHint", "optionFile", "colorFrom", "colorAuto", "vc", "colorOk"]) delete out[k];
      return out;
    };
    setDraft({
      title: rec.title,
      on: rec.reqOn || rec.on,
      file: rec.file,
      at: rec.savedAt,
      type: rec.type || "주문",
      rows: rec.rows.map(strip),
      stamp: rec.stamp,
      fileRows: rec.fileRows,
      misBefore: rec.misBefore || {},
      savedId: rec.id,
      saveOn: rec.on,
      savedSig: `${rec.on}|${rec.text}`,
      savedAt: rec.savedAt,
    });
    setCopied("");
    setView("make");
  };
  const deleteSaved = async (id) => {
    try {
      await changeKey(`so_order_${id}`, online, () => ({}), {});
      const next = await changeKey(INDEX, online, remove(id));
      setSaved(next.items || []);
      if (draft?.savedId === id) setDraft((d) => ({ ...d, savedId: null, savedSig: null }));
    } catch (e) {
      setMsg(e.message || "지우지 못했어요.");
    }
  };

  const copy = async () => {
    if (noMiss.length) return;
    const ok = await copyText(text);
    if (!ok) {
      setMsg("복사가 막혔어요. 아래 '복사되는 내용 보기'에서 직접 골라 복사해 주세요.");
      return;
    }
    const now = new Date();
    setCopied(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
    saveOrder();
    // 직접 적은 단가는 다음 발주 때 쓰게 기억 (장끼·판매가 목록에 없는 상품용)
    const mine = rows.filter((r) => r.manual > 0);
    // 매장명 기억 — 괄호에서 읽은 이름을 고쳤으면 '@괄호 이름' → 고친 이름, 제조사 → 매장명(다음 발주에 괄호가 없어도 그 매장으로)
    const named = {};
    for (const r of rows) {
      if (!r.store) continue;
      if (r.parsedStore && r.storeEdit) named["@" + r.parsedStore] = r.store;
      if (r.storeEdit || r.store !== r.vendor) named[r.vendor] = r.store;
    }
    // 고친 색 기억 — 같은 상품·같은 색이면 다음 발주부터 저절로
    const colorNew = {};
    for (const r of rows) if (r.colorEdit != null) colorNew[colorKey(r, splitOpt(r.optionFile).color)] = r.colorEdit;
    const newColors = Object.entries(colorNew).filter(([k, v]) => colors[k] !== v);
    const newNames = Object.entries(named).filter(([k, v]) => (stores[k] || (k.startsWith("@") ? k.slice(1) : k)) !== v);
    if (mine.length || newNames.length || newColors.length) {
      try {
        const next = await changeKey(
          MEMORY,
          online,
          (v) => ({
            ...v,
            prices: { ...(v.prices || {}), ...Object.fromEntries(mine.map((r) => [memoryKey(r), { price: r.manual, on: dayKey(), name: r.name, vendor: r.store }])) },
            stores: { ...(v.stores || {}), ...named },
            colors: { ...(v.colors || {}), ...colorNew },
          }),
          { prices: {} },
        );
        setMemory(next.prices || {});
        setStores(next.stores || {});
        setColors(next.colors || {});
      } catch {
        /* 기억은 못 해도 복사는 됐다 */
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const fs = [...(e.dataTransfer?.files || [])];
        read(fs.length > 1 ? fs : fileFromDrop(e.dataTransfer));
      }}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">SO+ 발주 변환</h2>
          <p className="mt-0.5 text-sm text-stone-500">이지어드민 발주 엑셀을 넣으면 한 장 단가까지 채워서 SO+ '엑셀 붙여넣기' 칸 모양으로 복사해요. 수량 × 단가는 SO+ 가 곱해요.</p>
        </div>
        {draft && view === "make" && (
          <button
            type="button"
            onClick={() => (isSaved || window.confirm("지금 발주가 저장 안 됐어요. 비우고 새로 넣을까요?")) && setDraft(null)}
            className="flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:border-rose-300 hover:text-rose-800"
          >
            <RotateCcw size={14} /> 새 발주 넣기
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1">
        <Tab active={view === "make"} onClick={() => setView("make")}>
          발주 만들기
        </Tab>
        <Tab active={view === "saved"} onClick={() => setView("saved")}>
          저장한 발주 <span className="text-stone-400">{saved.length}</span>
        </Tab>
      </div>

      {view === "saved" ? (
        <SoSaved items={saved} loaded={savedLoaded} online={online} onLoad={openSaved} onDelete={deleteSaved} copyText={copyText} />
      ) : !draft ? (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className={
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-14 text-center transition " +
            (drag ? "border-rose-400 bg-rose-50/60" : "border-stone-300 bg-white hover:border-rose-300")
          }
        >
          {busy ? <Loader2 size={28} className="animate-spin text-stone-400" /> : <FileSpreadsheet size={30} className="text-emerald-600" />}
          <span className="font-semibold text-stone-900">이지어드민 발주 엑셀 넣기</span>
          <span className="text-sm text-stone-500">끌어다 놓거나 눌러서 고르기 · request_stock_….xls · xlsx · csv · 표를 복사해 Ctrl+V 도 돼요</span>
        </button>
      ) : (
        <>
          {/* 발주 머리 */}
          <div className="mb-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-stone-900">{draft.title || draft.file}</div>
                <div className="text-xs text-stone-400">
                  {draft.on && `요청일 ${draft.on} · `}
                  {draft.file}
                </div>
              </div>
              <div className="text-right text-sm text-stone-600 tabular-nums">
                {lines.length}줄 · 총 {pieces}장 · 단가 합 <b className="text-stone-900">₩{won(total)}</b>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-stone-500">
                타입
                <select value={type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} className={FIELD + " w-auto py-1.5"}>
                  {SO_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <input value={allMemo} onChange={(e) => setAllMemo(e.target.value)} placeholder="메모 — 예: 색상 바뀌면 전화 주세요" className={FIELD + " min-w-0 flex-1 py-1.5"} />
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, memo: allMemo })) }))}
                  className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-stone-700 hover:border-rose-300"
                >
                  전체 적용
                </button>
              </span>
            </div>
          </div>

          {/* 앞 차수와 겹치는 줄 뺌 (10/11) */}
          {draft.diff && (
            <div className={"rounded-xl border px-4 py-3 text-sm " + (draft.diff.off ? "border-stone-200 bg-stone-50 text-stone-600" : "border-emerald-200 bg-emerald-50/70 text-emerald-900")}>
              {draft.diff.off ? (
                <span>
                  {draft.diff.label} 발주와 겹치는 줄도 전부 보여요.
                  <button type="button" onClick={diffOn} className="ml-2 font-semibold text-emerald-700 underline decoration-dotted">
                    다시 빼기
                  </button>
                </span>
              ) : (
                <>
                  <span className="font-semibold">{draft.diff.label} 발주와 겹치는 {draft.diff.dropped}줄을 뺐어요</span> — 새로 넣을 {draft.diff.kept.length}줄만 남겼어요.
                  <button type="button" onClick={diffOff} className="ml-2 text-xs text-stone-500 underline decoration-dotted">
                    빼기 취소
                  </button>
                  {draft.diff.less.length > 0 && (
                    <div className="mt-1 text-xs text-amber-800">
                      {draft.diff.label}보다 줄어든 줄 {draft.diff.less.length}개(안 넣음):{" "}
                      {draft.diff.less.map((x) => `${x.vendor} ${x.name} ${x.option} ${x.before}→${x.now}`).join(" · ")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 줄 */}
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">매장명</th>
                  <th className="px-3 py-2 font-medium">도매처 상품명</th>
                  <th className="px-3 py-2 font-medium">색상</th>
                  <th className="px-3 py-2 text-right font-medium">수량</th>
                  <th className="px-3 py-2 font-medium">한 장 단가</th>
                  <th className="px-3 py-2 text-right font-medium">금액</th>
                  <th className="px-3 py-2 font-medium">
                    <div>미송</div>
                    <div className="mt-0.5 flex gap-1">
                      <button type="button" onClick={() => allMiss("yes")} className="rounded-full border border-stone-200 bg-white px-1.5 text-[10px] text-stone-600 hover:border-stone-400">
                        전부 가능
                      </button>
                      <button type="button" onClick={() => allMiss("no")} className="rounded-full border border-stone-200 bg-white px-1.5 text-[10px] text-stone-600 hover:border-stone-400">
                        전부 X
                      </button>
                    </div>
                  </th>
                  <th className="px-3 py-2 font-medium">메모</th>
                  <th className="sticky right-0 w-9 bg-stone-50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r, i) => {
                  const f = r.auto || {};
                  const edited = r.manual != null;
                  const top = i === 0 || storeKey(rows[i - 1]) !== storeKey(r);
                  let end = i;
                  while (top && end + 1 < rows.length && storeKey(rows[end + 1]) === storeKey(r)) end++;
                  const group = top ? rows.slice(i, end + 1) : null;
                  const sameItem = !top && nameKey(rows[i - 1]) === nameKey(r);
                  return (
                    <tr key={r.id} className={"align-top " + (top && i > 0 ? "border-t-2 border-t-stone-300" : "") + (r.qty <= 0 ? " bg-emerald-50/40" : "")}>
                      {top && (
                      <td rowSpan={group.length} className="bg-stone-50/70 px-3 py-2">
                        <input
                          key={r.store}
                          defaultValue={r.store}
                          onBlur={(e) => e.target.value.trim() !== r.store && setStore(r, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          aria-label={`${r.name} 매장명`}
                          title="SO+ 에 들어갈 매장명 — 고치면 같은 제조사 줄도 같이 바뀌어요"
                          className={
                            "w-32 rounded-lg border px-2 py-1 font-medium text-stone-900 outline-none focus:border-rose-600 " +
                            (r.storeEdit ? "border-rose-300 bg-rose-50/50" : "border-stone-200 bg-white")
                          }
                        />
                        <div className="mt-0.5 max-w-[8.5rem] space-y-px text-[11px] leading-tight text-stone-400">
                          {r.addr ? <div className="text-stone-600">{r.addr}</div> : <div className="text-amber-700">위치 모름</div>}
                          {r.store !== r.vendor && <div className="truncate">제조사 {r.vendor}</div>}
                          {group.length > 1 && (
                            <div className="pt-0.5 font-medium text-stone-500">
                              {group.length}줄 · {group.reduce((n, x) => n + x.qty, 0)}장
                            </div>
                          )}
                        </div>
                      </td>
                      )}
                      <td className="max-w-[15rem] px-3 py-2">
                        <div className={"font-medium " + (sameItem ? "text-stone-400" : "text-stone-900")} title={sameItem ? "바로 위와 같은 상품 · 다른 옵션" : undefined}>
                          {r.name}
                        </div>
                        {r.shopName && <div className="truncate text-xs text-stone-400">{r.shopName}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                        {/* 10/13 세원: "상품등록할 때 거래처랑 다르게 적은 색이 있어" — 색만 고친다(사이즈는 그대로). 고치면 같은 상품·같은 색 줄도 같이, 복사할 때 기억 */}
                        <span className="inline-flex items-center gap-0.5">
                          {splitOpt(r.option).wrap && <span className="text-stone-400">[</span>}
                          <input
                            key={r.option}
                            defaultValue={splitOpt(r.option).color}
                            onBlur={(e) => setColor(r, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            aria-label={`${r.name} 색상`}
                            title="거래처가 부르는 색으로 고쳐요 — 같은 상품·같은 색 줄도 같이, 다음 발주부터 저절로"
                            style={{ width: `calc(${optWidth(splitOpt(r.option).color)}em + 16px)` }}
                            className={"rounded-md border px-1.5 py-0.5 text-sm outline-none focus:border-rose-600 " + (r.colorOk === false ? "border-amber-400 bg-amber-50" : r.colorFrom ? "border-rose-300 bg-rose-50/50" : "border-transparent hover:border-stone-200")}
                          />
                          <span>{splitOpt(r.option).rest}</span>
                          {splitOpt(r.option).wrap && <span className="text-stone-400">]</span>}
                          {r.colorOk && <Check size={13} className="ml-0.5 text-emerald-600" aria-label="거래처 색상과 같아요" title={`신상 관리 거래처 색상과 같아요 (${r.vc.list.join(", ")})`} />}
                        </span>
                        {r.colorOk === false && (
                          <div className="mt-1 max-w-[16rem] whitespace-normal rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                            거래처 색상에 없어요 — 신상 관리 '{r.vc.item}'
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.vc.list.map((c) => (
                                <button key={c} type="button" onClick={() => setColor(r, c)} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:border-rose-400 hover:text-rose-700">
                                  {c}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.colorFrom && (
                          <button type="button" onClick={() => setColor(r, r.colorFrom)} title="원래 색으로" className="block text-[11px] text-stone-400 underline decoration-dotted">
                            {r.colorAuto ? "기억한 색 · " : ""}원래 {r.colorFrom}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {/* 10/6 세원: "수량도 변경 가능하게" — 칸을 벗어나거나 엔터에 적용, 1 아래로는 안 내려간다(줄을 빼려면 ×) */}
                        <input
                          key={`${r.qty}|${r.misUsed}`}
                          defaultValue={r.qty}
                          inputMode="numeric"
                          onBlur={(e) => {
                            const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
                            if (Number.isNaN(n) || n < (r.misUsed ? 0 : 1)) {
                              e.target.value = String(r.qty);
                              return;
                            }
                            if (n !== r.qty) patchRow(r.id, { qty: n + r.misUsed, qtyFrom: r.qtyFrom ?? r.want });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          aria-label={`${r.name} 수량`}
                          className={
                            "w-14 rounded-lg border px-2 py-1 text-right text-stone-900 tabular-nums outline-none focus:border-rose-600 " +
                            (r.qtyFrom != null && r.qtyFrom !== r.qty ? "border-rose-300 bg-rose-50/50" : "border-stone-200 bg-white")
                          }
                        />
                        {r.qtyFrom != null && r.qtyFrom !== r.want && (
                          <button type="button" onClick={() => patchRow(r.id, { qty: r.qtyFrom, qtyFrom: null })} title="원래 수량으로" className="mt-0.5 block w-full text-right text-[11px] text-stone-400 underline decoration-dotted">
                            원래 {r.qtyFrom}
                          </button>
                        )}
                        {r.prevQty > 0 && !draft.diff?.off && (
                          <div className="mt-1 text-right text-[11px] leading-tight text-stone-500" title="이지어드민 파일 수량 − 앞 차수 수량">
                            파일 {r.qtyFile} · 앞 차수 −{r.prevQty}
                          </div>
                        )}
                        {/* 남은 미송 (10/11) — 뺀 것 / 옵션이 달라 안 뺀 것 */}
                        {r.misUsed > 0 && (
                          <div
                            className="mt-1 max-w-[7rem] text-right text-[11px] leading-tight text-emerald-700"
                            title={r.misFrom.map((x) => `${x.name} ${x.qty}장 (${x.date} 잡음)`).join("\n")}
                          >
                            요청 {r.want} · 미송 −{r.misUsed}
                            {r.qty <= 0 && <div className="font-semibold">미송으로 다 채워져요 — 수량 0 · '미송 받기' 메모로 넣어요(삼촌이 들르게)</div>}
                            <button type="button" onClick={() => patchRow(r.id, { misongOff: true, misongForce: null })} className="ml-1 text-stone-400 underline decoration-dotted">
                              안 빼기
                            </button>
                          </div>
                        )}
                        {r.misongOff && r.misExact.length > 0 && (
                          <div className="mt-1 max-w-[7rem] text-right text-[11px] leading-tight text-stone-500">
                            미송 {r.misExact.reduce((n, l) => n + l.left, 0)}장 있음
                            <button type="button" onClick={() => patchRow(r.id, { misongOff: false })} className="ml-1 text-emerald-700 underline decoration-dotted">
                              빼기
                            </button>
                          </div>
                        )}
                        {r.misHint.map((l) => (
                          <div key={l.key} className="mt-1 max-w-[7rem] text-right text-[11px] leading-tight text-amber-700" title={`${l.name} — 색상·사이즈가 달라서 안 뺐어요`}>
                            같은 상품 미송 {l.left}장{misongOpt(l.name) ? ` (${misongOpt(l.name)})` : ""}
                            <button type="button" onClick={() => patchRow(r.id, { misongOff: false, misongForce: [...(r.misongForce || []), l.key] })} className="ml-1 text-emerald-700 underline decoration-dotted">
                              빼기
                            </button>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.price ? String(r.price) : ""}
                          inputMode="numeric"
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, "");
                            patchRow(r.id, { manual: v ? Number(v) : null });
                          }}
                          placeholder="단가"
                          aria-label={`${r.store} ${r.name} 한 장 단가`}
                          className={
                            "w-24 rounded-lg border px-2 py-1 text-right tabular-nums outline-none focus:border-rose-600 " +
                            (r.price ? "border-stone-300 bg-white" : "border-amber-400 bg-amber-50")
                          }
                        />
                        <div className="mt-0.5 text-[11px] leading-tight">
                          {edited ? (
                            <span className="text-rose-700">
                              직접 적음
                              {f.price > 0 && f.price !== r.manual && (
                                <button type="button" onClick={() => patchRow(r.id, { manual: null })} className="ml-1 underline decoration-dotted">
                                  찾은 값 {won(f.price)}
                                </button>
                              )}
                            </span>
                          ) : f.note ? (
                            <span className={FROM_TONE[f.from] || "text-stone-500"}>{f.note}</span>
                          ) : (
                            <span className="text-amber-700">못 찾음 — 적어 주세요</span>
                          )}
                          {!edited && f.alt && <div className="text-amber-700">{f.alt}</div>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-stone-500 tabular-nums">{r.price ? won(r.price * r.qty) : ""}</td>
                      <td className="px-3 py-2">
                        <MissChip value={r.miss} onChange={(v) => patchRow(r.id, { miss: v })} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.memo || ""} onChange={(e) => patchRow(r.id, { memo: e.target.value })} className="w-28 rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-rose-600" />
                      </td>
                      <td className="sticky right-0 bg-white py-2 pr-1.5 pl-1 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]">
                        <button type="button" onClick={() => patchRow(r.id, { off: true })} aria-label="이 줄 빼기" title="이 줄 빼기 — 맨 아래 '뺀 줄'로 내려가요(되살릴 수 있어요)" className="rounded-md p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {offRows.length > 0 && (
                  <tr className="border-t-2 border-t-stone-300 bg-stone-100/70">
                    <td colSpan={9} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-stone-600">뺀 줄 {offRows.length}개</span>
                        {/* 표가 넓어 오른쪽 끝은 잘려 보일 수 있어서 글 바로 옆에 */}
                        <button
                          type="button"
                          onClick={() => window.confirm(`뺀 줄 ${offRows.length}개를 지울까요? 지우면 되살릴 수 없어요.`) && dropRows(offRows.map((r) => r.id))}
                          className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-600 hover:border-rose-300 hover:text-rose-700"
                        >
                          <Trash2 size={12} /> 전부 지우기
                        </button>
                        <span className="text-stone-500">SO+ 에 안 넣어요 · 다시 넣으려면 '되살리기', 마지막에 확인하고 지워요</span>
                      </div>
                    </td>
                  </tr>
                )}
                {offRows.map((r) => (
                  <tr key={r.id} className="bg-stone-50/80 align-top text-stone-400">
                    <td className="px-3 py-2">
                      <div className="w-32 truncate font-medium">{r.store}</div>
                    </td>
                    <td className="max-w-[15rem] px-3 py-2">
                      <div className="font-medium line-through decoration-stone-300">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.option}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.price ? won(r.price) : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.price ? won(r.price * r.qty) : ""}</td>
                    <td colSpan={2} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => patchRow(r.id, { off: false })}
                        className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        <Undo2 size={12} /> 되살리기
                      </button>
                    </td>
                    <td className="sticky right-0 bg-stone-50 py-2 pr-1.5 pl-1 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]">
                      <button type="button" onClick={() => dropRows([r.id])} aria-label="이 줄 지우기" title="이 줄 지우기 — 되살릴 수 없어요" className="rounded-md p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-stone-400">
            <Info size={12} className="mt-px shrink-0" />
            단가는 같은 거래처 장끼의 가장 최근 단가(초록) → 판매가 목록 공급가 → 지난번 여기서 직접 적은 값 순으로 찾아요. 칸을 고치면 그 값으로, 비우면 다시 찾은 값으로.
          </p>

          {/* 복사 */}
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-stone-900">
                  SO+ 에 붙여넣기 · {lines.length}줄 · 총 {pieces}장
                </div>
                {misTaken.length > 0 && (
                  <div className="text-emerald-700">
                    남은 미송을 뺐어요 — {misTaken.map((r) => `${r.store} ${r.name} ${r.misUsed}장`).join(" · ")}
                    {rows.some((r) => r.qty <= 0) && ` (미송으로 다 채운 ${rows.filter((r) => r.qty <= 0).length}줄은 수량 0 · 메모 '미송 N장 받기(결제함)'로 넣어요 — 삼촌이 매장에 들르게)`}
                  </div>
                )}
                {offRows.length > 0 && <div className="text-stone-500">뺀 줄 {offRows.length}개는 안 넣어요 — 표 맨 아래에서 되살리거나 지워요.</div>}
                {noMiss.length > 0 && <div className="text-amber-700">미송을 아직 안 고른 줄 {noMiss.length}개 — 표 머리 '전부 가능 / 전부 X' 또는 줄마다 골라 주세요.</div>}
                {noPrice.length > 0 && <div className="text-amber-700">단가가 빈 줄 {noPrice.length}개 — 비운 채 복사하면 SO+ 에서 따로 넣어야 해요.</div>}
                {differ.length > 0 && <div className="text-stone-500">장끼 단가와 판매가 목록 공급가가 다른 상품 {differ.length}개 — 장끼(실제로 낸 값)로 넣었어요.</div>}
                {copied && (
                  <div className="flex items-center gap-1 text-emerald-700">
                    <Check size={14} /> {copied} 복사했어요 — SO+ › 엑셀 사입 관리 › 엑셀 붙여넣기 칸에 Ctrl+V → '변환'
                  </div>
                )}
                {draft.savedId &&
                  (isSaved ? (
                    <div className="flex items-center gap-1 text-emerald-700">
                      <Check size={14} /> {saveOn.slice(5, 7) * 1}/{saveOn.slice(8, 10) * 1} 발주로 저장됨 · '저장한 발주'에서 다시 볼 수 있어요
                    </div>
                  ) : (
                    <div className="text-amber-700">저장한 뒤 바뀐 게 있어요 — 다시 저장하거나 복사하면 덮어써요.</div>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-stone-500">
                  날짜
                  <input
                    type="date"
                    value={saveOn}
                    onChange={(e) => e.target.value && setDraft((d) => ({ ...d, saveOn: e.target.value }))}
                    className="rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-800"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving || !lines.length}
                  onClick={saveOrder}
                  className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-4 py-2.5 font-semibold text-stone-700 hover:border-rose-300 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 저장
                </button>
                <button
                  type="button"
                  disabled={!!noMiss.length || !lines.length}
                  onClick={copy}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2.5 font-semibold text-white disabled:bg-stone-300"
                >
                  <Copy size={16} /> SO+ 모양으로 복사
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">복사하면 이 날짜로 저장도 같이 돼요(같은 발주는 덮어써요). 저장한 발주는 위 '저장한 발주'에서 날짜별로 보고, 다시 복사하거나 불러와서 고쳐요.</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-stone-500">복사되는 내용 보기</summary>
              <textarea readOnly value={text} rows={Math.min(14, lines.length + 1)} className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-[11px] leading-5 text-stone-700" />
              <p className="mt-1 text-[11px] text-stone-400">
                열 순서: 매장명 · 타입 · 제품명(도매) · 색상 · 사이즈 · 수량 · 개당단가 · 메모 · 사진링크 · 코드 — 넥스트팩 변환기 때 SO+ 에 맞춰 둔 그대로예요. 제품명 뒤에 붙어 있던 '(위치 / 매장)'은 떼고 매장명 칸으로 옮겼어요. 같은 매장·상품·색상 줄은 수량을 합쳐요.
              </p>
            </details>
          </div>
        </>
      )}
      <input
        ref={file}
        type="file"
        accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        multiple
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          read(fs.length > 1 ? fs : fs[0]);
        }}
      />
      {draft && view === "make" && (
        <p className="mt-3 text-center text-[11px] text-stone-400">
          다른 발주는 이 화면 아무 데나 파일을 끌어다 놓아도 돼요 ·{" "}
          <button type="button" onClick={() => file.current?.click()} className="underline decoration-dotted">
            파일 고르기
          </button>
        </p>
      )}
    </div>
  );
}

