import { useMemo, useState } from "react";
import { Plus, Search, List, BarChart3, Pencil, Trash2, Link2 } from "lucide-react";
import { won, rangeOf, rangeLabel, ranking, summarizeVendors } from "../lib/calc";
import { searchVendors } from "../lib/match";
import { Badge, Empty } from "./ui";
import DateRange from "./DateRange";
import VendorDetail from "./VendorDetail";
import VendorEditor from "./VendorEditor";

const SORTS = [
  ["name", "이름순"],
  ["supply", "거래액 많은순"],
  ["recent", "최근 거래순"],
];

/**
 * 거래처 카드.
 * 들어가는 문은 '이름' 하나뿐이다 — 카드 전체가 눌리면 수정·삭제를 누르려다
 * 잘못 들어가기 쉽다. 이름에는 커서를 올렸을 때 색이 바뀌어 누를 수 있음을 알린다.
 */
function VendorCard({ v, onOpen, onEdit, onDelete, onMerge }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {v.flag && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" aria-label="우선순위" />}
            <button
              type="button"
              onClick={() => onOpen(v)}
              title="눌러서 거래내역 보기"
              className="rounded font-semibold text-stone-900 underline-offset-4 transition hover:text-rose-700 hover:underline focus-visible:text-rose-700 focus-visible:underline"
            >
              {v.name}
            </button>
            {v.status === "mixed" && <Badge tone="amber">혼합</Badge>}
          </div>
          {v.address && <div className="mt-1 text-sm text-stone-500">{v.address}</div>}
          {v.count > 0 && (
            <div className="mt-1 text-sm tabular-nums text-stone-600">
              거래액 <span className="font-semibold">{won(v.supply)}</span>
              <span className="text-stone-400"> · {v.count}건 · 계산서 {v.invoiceCount}/{v.count}</span>
            </div>
          )}
          <div className="mt-1 space-y-0.5 text-sm text-stone-500">
            {v.phone && <div>{v.phone}</div>}
            {(v.accounts || []).map((a) => (
              <div key={a.id} className="tabular-nums">
                {[a.bank, a.number, a.holder].filter(Boolean).join(" ")}
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 text-stone-400">
          <button type="button" onClick={() => onMerge(v)} title="다른 거래처와 합치기" className="p-1.5 hover:text-stone-700">
            <Link2 size={16} />
          </button>
          <button type="button" onClick={() => onEdit(v)} title="수정" className="p-1.5 hover:text-stone-700">
            <Pencil size={16} />
          </button>
          <button type="button" onClick={() => onDelete(v)} title="삭제" className="p-1.5 hover:text-rose-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorsPage({
  vendors,
  rows,
  taxType,
  onSaveVendor,
  onDeleteVendor,
  onMergeVendor,
  rowProps,
}) {
  const [view, setView] = useState("list"); // list | rank
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [openId, setOpenId] = useState(null);
  const [editor, setEditor] = useState(null);

  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState(rangeOf("month"));
  const range = preset === "custom" ? custom : rangeOf(preset);

  const summary = useMemo(() => summarizeVendors(rows, vendors, taxType), [rows, vendors, taxType]);
  const rank = useMemo(() => ranking(rows, vendors, range), [rows, vendors, range]);

  const listed = useMemo(() => {
    const found = searchVendors(summary, q);
    const sorted = [...found];
    if (sort === "supply") sorted.sort((a, b) => b.supply - a.supply);
    else if (sort === "recent") sorted.sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
    else sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return sorted;
  }, [summary, q, sort]);

  const open = summary.find((v) => v.id === openId) || null;

  if (open) {
    return (
      <VendorDetail
        vendor={open}
        rows={rows}
        onBack={() => setOpenId(null)}
        onEditVendor={(v) => setEditor({ ...v, _k: Date.now() })}
        rowProps={rowProps}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">거래처</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            장끼를 올리면 거래처가 자동으로 등록되고 위치·전화·계좌가 모여요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ _k: Date.now() })}
          className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800"
        >
          <Plus size={16} /> 거래처 추가
        </button>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-stone-200 p-1">
        {[
          ["list", "목록", List],
          ["rank", "거래·순위", BarChart3],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition " +
              (view === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")
            }
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {editor && (
        <VendorEditor
          key={editor._k}
          seed={editor}
          onSubmit={(v) => {
            onSaveVendor(v);
            setEditor(null);
          }}
          onCancel={() => setEditor(null)}
        />
      )}

      {view === "list" ? (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5">
            <Search size={16} className="shrink-0 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="거래처명·위치·계좌번호·예금주·전화 검색"
              className="w-full text-sm outline-none"
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {SORTS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition " +
                  (sort === key ? "bg-rose-700 text-white" : "bg-white text-stone-600 border border-stone-300")
                }
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-stone-400">{listed.length}곳</span>
          </div>

          {listed.length === 0 ? (
            <Empty
              title={q ? "찾는 거래처가 없어요." : "등록된 거래처가 없어요."}
              hint={q ? "다른 말로 찾아보세요." : "장끼를 올리면 자동으로 등록돼요."}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {listed.map((v) => (
                <VendorCard
                  key={v.id}
                  v={v}
                  onOpen={(x) => setOpenId(x.id)}
                  onEdit={(x) => setEditor({ ...x, _k: Date.now() })}
                  onDelete={onDeleteVendor}
                  onMerge={onMergeVendor}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <DateRange
            preset={preset}
            custom={custom}
            onChange={({ preset: p, custom: c }) => {
              setPreset(p);
              setCustom(c);
            }}
          />

          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">총 거래액 (공급가)</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-stone-900">
                {won(rank.totalSupply)}
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">거래처</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-stone-900">
                {rank.vendorCount}곳
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">거래 건수</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-stone-900">{rank.txCount}건</div>
            </div>
          </div>

          <p className="mt-2 text-xs text-stone-400">{rangeLabel(range)}</p>

          {rank.vendors.length === 0 ? (
            <div className="mt-3">
              <Empty title="이 기간에 거래가 없어요." hint="위에서 다른 기간을 골라보세요." />
            </div>
          ) : (
            <ol className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {rank.vendors.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(v.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-stone-50"
                  >
                    <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-stone-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {v.flag && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />}
                        <span className="truncate font-medium text-stone-900">{v.name}</span>
                        {v.status === "mixed" && <Badge tone="amber">혼합</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-400">
                        {v.count}건 · 계산서 {v.invoiceCount}/{v.count}
                        {v.samchonSupply > 0 && ` · 대납 ${won(v.samchonSupply)}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums text-stone-900">{won(v.supply)}</div>
                      <div className="text-xs tabular-nums text-stone-400">
                        {rank.totalSupply ? Math.round((v.supply / rank.totalSupply) * 100) : 0}%
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
