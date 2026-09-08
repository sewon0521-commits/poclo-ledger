import { useMemo, useState } from "react";
import { Search, AlertCircle } from "lucide-react";
import { won, pct } from "../lib/sales";
import { SEED_PRICES } from "../lib/seed";
import { Kpi, Empty } from "./ui";

// [고유네임, 상품명, 거래처, 공급가, 판매가, 판매중]
const rateOf = (p) => (p[4] ? (p[3] / p[4]) * 100 : 0);

const COLS = [
  ["고유네임", 0],
  ["상품명", 1],
  ["거래처", 2],
  ["공급가", 3],
  ["판매가", 4],
  ["원가율", 6],
  ["남는 돈", 7],
];

const chip = (r) =>
  r >= 60
    ? "bg-rose-100 text-rose-800"
    : r >= 50
      ? "bg-amber-100 text-amber-800"
      : "bg-emerald-100 text-emerald-800";

export default function PricePage() {
  const [q, setQ] = useState("");
  const [liveOnly, setLiveOnly] = useState(true);
  const [sort, setSort] = useState({ key: 6, dir: -1 });

  const all = useMemo(() => SEED_PRICES.map((p) => [...p, rateOf(p), p[4] - p[3]]), []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = all;
    if (liveOnly) out = out.filter((p) => p[5] === 1);
    if (needle)
      out = out.filter((p) => (p[0] + " " + p[1] + " " + p[2]).toLowerCase().includes(needle));
    return [...out].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return c * sort.dir;
    });
  }, [all, q, liveOnly, sort]);

  const live = all.filter((p) => p[5] === 1 && p[4]);
  const rates = live.map((p) => p[6]).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)] || 0;
  const risky = live.filter((p) => p[6] >= 60);
  const zero = live.filter((p) => p[3] === 0);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">단가표</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          카페24에 등록된 공급가 그대로예요. 손익의 매출원가가 여기서 나옵니다.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Kpi label="등록 상품" value={`${SEED_PRICES.length}개`} sub={`판매중 ${live.length}개`} />
        <Kpi
          label="원가율 중앙값"
          value={pct(median) + "%"}
          sub={rates.length ? `${pct(rates[0])}% ~ ${pct(rates[rates.length - 1])}%` : "—"}
        />
        <Kpi
          label="원가율 60% 이상"
          value={`${risky.length}개`}
          tone={risky.length ? "amber" : undefined}
          sub="많이 팔리면 이익이 무너져요"
        />
        <Kpi
          label="공급가 0원"
          value={`${zero.length}개`}
          tone={zero.length ? "rose" : "emerald"}
          sub="코디 세트"
        />
      </div>

      {zero.length > 0 && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            코디 세트는 카페24에서 공급가 칸을 고칠 수 없어요. 그래서 여기엔 0으로 보이지만,{" "}
            <b className="font-semibold">손익에서는 구성품 공급가를 합쳐서 원가를 채웁니다.</b>{" "}
            숫자가 빠지지는 않아요.
          </span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute top-2.5 left-3 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="상품명 · 고유네임 · 거래처 검색"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setLiveOnly((v) => !v)}
          className={
            "rounded-lg border px-3.5 py-2 text-sm font-medium transition " +
            (liveOnly
              ? "border-rose-700 bg-rose-700 text-white"
              : "border-stone-300 bg-white text-stone-600")
          }
        >
          판매중만
        </button>
      </div>

      {list.length === 0 ? (
        <Empty title="찾는 상품이 없어요." hint="검색어를 지우거나 '판매중만'을 꺼보세요." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400">
                {COLS.map(([label, key], i) => (
                  <th
                    key={label}
                    onClick={() =>
                      setSort((s) => ({ key, dir: s.key === key ? -s.dir : key <= 2 ? 1 : -1 }))
                    }
                    className={
                      "cursor-pointer px-3 py-2.5 font-medium select-none hover:text-stone-700 " +
                      (i <= 2 ? "text-left" : "text-right")
                    }
                  >
                    {label}
                    {sort.key === key && (sort.dir > 0 ? " ↑" : " ↓")}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((p, i) => (
                <tr key={p[0] + i} className="hover:bg-stone-50">
                  <td className="px-3 py-2 font-medium whitespace-nowrap text-stone-700">{p[0]}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-stone-600">{p[1]}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-stone-400">{p[2] || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-600">{won(p[3])}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-900">{won(p[4])}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums " + chip(p[6])
                      }
                    >
                      {pct(p[6])}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-600">{won(p[7])}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[11px] font-medium " +
                        (p[5] ? "bg-stone-100 text-stone-600" : "bg-stone-100 text-stone-400")
                      }
                    >
                      {p[5] ? "판매중" : "중지"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-stone-400">
        {list.length}개 보이는 중. 새로 등록한 상품을 반영하려면 poclo-cafe24 폴더에서{" "}
        <code className="rounded bg-stone-100 px-1 py-0.5">5_단가표갱신.bat</code> 을 돌리세요.
      </p>
    </div>
  );
}
