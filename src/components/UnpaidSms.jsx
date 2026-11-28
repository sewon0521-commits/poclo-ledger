import { useEffect, useState } from "react";
import { Landmark, AlertTriangle, Send } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { when } from "../lib/cs";
import { newId } from "../lib/id";

/**
 * CS 관리 › 먼저 연락 — 무통장 입금요청 문자 (11/28 세원 방향성 창: "입금전 관리에 입금요청 메시지 발송 2일 지나거나 하면 해줘").
 * 사무실 PC poclo-cafe24/unpaid_sms.py 가 30분마다 settings unpaid_sms 에 — 카페24 입금전(N00) 무통장 주문 중 주문 2일↑.
 * 보내기는 카페24 문자 API(발신번호 승인된 것). ⛔ 손님에게 가는 글이라: mode "button"(기본) = 여기서 [보내기] 누른 주문만 ·
 * "auto" = 세원이 문구 OK 하고 켠 뒤에만 새 대상을 10~20시에 저절로. 한 주문에 한 번.
 * 문구 자리: {주문일} {상품} {금액} {계좌} — 주문마다 채워짐(unpaid_sms.compose 와 같게).
 */
const DEFAULT = `[포클로] 입금 확인 안내
안녕하세요 고객님, 포클로입니다 :)
{주문일}에 주문해 주신 {상품}의 입금이 아직 확인되지 않아 연락드려요.

입금 금액: {금액}원
입금 계좌: {계좌}

입금 확인되는 대로 꼼꼼하게 챙겨서 보내드릴게요!
혹시 주문을 취소하실 거면 편하게 말씀 주세요. 감사합니다.`;

function composeUnpaid(x, text) {
  const d = String(x.orderedAt || "");
  const prod = (x.first || "상품") + (x.more ? ` 외 ${x.more}건` : "");
  return (text || DEFAULT)
    .replace(/\{주문일\}/g, d ? `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일` : "")
    .replace(/\{상품\}/g, prod)
    .replace(/\{금액\}/g, Number(x.amount || 0).toLocaleString())
    .replace(/\{계좌\}/g, `${x.bank || ""} ${x.account || ""} (${x.owner || ""})`.trim());
}

const ST = { new: ["안 보냄", "text-stone-500"], queued: ["보내는 중", "text-sky-700"], sent: ["보냄", "text-emerald-700"], skip: ["안 보냄(입금·취소)", "text-stone-400"], error: ["실패", "text-rose-700"] };

export default function UnpaidSms({ online }) {
  const [v, setV] = useState(null);
  const [text, setText] = useState("");
  const [pick, setPick] = useState(() => new Set());
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => loadKey("unpaid_sms", online, { items: [] }).then((x) => alive && setV(x)).catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "unpaid_sms" && load());
    const off2 = watchKeys(["unpaid_sms"], load, 30000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);
  const items = (v?.items || []).filter((x) => !x.gone || x.status === "sent");
  const open = items.filter((x) => !x.gone && x.status !== "sent" && x.status !== "skip");
  const msgText = text || v?.text || DEFAULT;
  const auto = v?.mode === "auto";
  const saveText = () => text && changeKey("unpaid_sms", online, (w) => ({ ...(w || {}), text }), { items: [] }).catch(() => {});
  const queue = (job) => changeKey("cs_queue", online, (q) => ({ ...(q || {}), items: [...((q || {}).items || []), { id: newId("q"), at: new Date().toISOString(), ...job }] }), { items: [] });
  const rescan = async () => {
    await queue({ kind: "unpaid_scan" });
    setMsg("사무실 PC에 다시 읽기를 맡겼어요 — 1분쯤 뒤 바뀌어요.");
  };
  const send = async () => {
    const ids = [...pick].filter((no) => open.some((x) => x.orderNo === no));
    if (!ids.length) return;
    if (!window.confirm(`입금요청 문자 ${ids.length}건을 보낼까요? 손님 휴대폰으로 바로 가요.`)) return;
    await changeKey("unpaid_sms", online, (w) => ({ ...(w || {}), text: text || w?.text || DEFAULT, items: (w?.items || []).map((x) => (ids.includes(x.orderNo) ? { ...x, status: "queued" } : x)) }), { items: [] });
    await queue({ kind: "unpaid_send", ids });
    setPick(new Set());
    setMsg(`${ids.length}건 보내기를 사무실 PC에 맡겼어요 — 1분 안에 '보냄'으로 바뀌어요.`);
  };
  const setMode = async (m) => {
    if (m === "auto" && !window.confirm("이 문구로 2일 지난 새 주문에 저절로 보낼까요? (10~20시, 30분마다 · 한 주문에 한 번)")) return;
    await changeKey("unpaid_sms", online, (w) => ({ ...(w || {}), mode: m, text: text || w?.text || DEFAULT }), { items: [] });
    setMsg(m === "auto" ? "자동으로 켰어요 — 새로 2일 지난 주문은 사무실 PC가 저절로 보내요." : "자동을 껐어요 — 여기서 고른 주문만 보내요.");
  };
  const first = open[0];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <Landmark size={15} className="text-rose-700" />
        <span className="text-sm font-bold text-stone-900">입금요청 문자</span>
        <span className="text-xs text-stone-500">카페24 무통장 주문 중 주문하고 2일 넘게 입금 전 · 보낼 대상 {open.length}건</span>
        <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (auto ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600")}>{auto ? "자동으로 보냄" : "누른 것만 보냄"}</span>
        <span className="ml-auto text-[11px] text-stone-400">{v?.at ? `${when(v.at)} 읽음` : ""}</span>
      </div>
      <div className="space-y-2 px-4 pb-3">
        {!auto && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>문구를 확인하고 고른 주문만 [보내기]로 나가요. 문구가 괜찮으면 '자동으로'를 켜면 그다음부터 2일 지난 새 주문에 저절로 보내요.</span>
          </p>
        )}
        {msg && <p className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
        {v?.error && <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">{v.error}</p>}
        {!items.length ? (
          <p className="py-2 text-xs text-stone-400">지금은 2일 넘게 입금 안 된 무통장 주문이 없어요.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {items.map((x) => {
              const can = !x.gone && x.status !== "sent" && x.status !== "skip" && x.status !== "queued";
              const [label, tone] = ST[x.status] || ST.new;
              return (
                <li key={x.orderNo} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!can}
                    checked={pick.has(x.orderNo)}
                    onChange={() =>
                      setPick((s) => {
                        const n = new Set(s);
                        if (n.has(x.orderNo)) n.delete(x.orderNo);
                        else n.add(x.orderNo);
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-rose-700"
                  />
                  <span className="font-mono text-xs text-stone-500">{x.orderNo}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-800">{(x.products || []).join(" · ")}</span>
                  <span className="text-xs text-stone-500">{x.buyer}</span>
                  <span className="text-xs tabular-nums text-stone-700">{Number(x.amount || 0).toLocaleString()}원</span>
                  <span className="text-xs font-semibold text-amber-700">{x.days}일째</span>
                  <span className={"text-[11px] " + tone} title={x.error || ""}>
                    {label}
                    {x.sentAt ? ` ${when(x.sentAt)}` : ""}
                    {x.error ? ` — ${x.error}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-stone-500">문자 문구 — {"{주문일} {상품} {금액} {계좌}"} 는 주문마다 채워져요 · 칸을 벗어나면 저장</span>
          <textarea value={msgText} onChange={(e) => setText(e.target.value)} onBlur={saveText} rows={9} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-rose-600" />
        </label>
        {first && (
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <p className="mb-1 text-[11px] font-medium text-stone-500">미리 보기 — {first.orderNo}</p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-800">{composeUnpaid(first, msgText)}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={rescan} className="rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:text-stone-800">
            지금 다시 읽기
          </button>
          <button type="button" onClick={() => setMode(auto ? "button" : "auto")} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:border-rose-300">
            {auto ? "자동 끄기" : "이 문구로 자동으로 보내기 켜기"}
          </button>
          <button type="button" onClick={send} disabled={!pick.size} className="ml-auto flex items-center gap-1 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300">
            <Send size={14} /> 고른 {pick.size}건 보내기
          </button>
        </div>
      </div>
    </section>
  );
}
