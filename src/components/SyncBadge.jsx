import { Cloud, CloudOff, Loader2, RefreshCw, UploadCloud } from "lucide-react";

/**
 * 지금 보고 있는 장부가 공유 장부인지, 이 기기에만 있는 것인지를 늘 보여준다.
 * 이게 안 보이면 상대가 고친 게 왜 안 보이는지 알 방법이 없다.
 */
export function SyncBadge({ live, email, onReload }) {
  const look = {
    on: ["실시간 연결됨", "bg-emerald-50 text-emerald-700 border-emerald-300", Cloud],
    connecting: ["연결 중", "bg-stone-50 text-stone-500 border-stone-300", Loader2],
    off: ["실시간 끊김", "bg-amber-50 text-amber-800 border-amber-300", CloudOff],
    local: ["이 기기에만 저장", "bg-stone-50 text-stone-500 border-stone-300", CloudOff],
  }[live] || ["", "", Cloud];

  const [label, cls, Icon] = look;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={"flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium " + cls}
        title={email ? `공유 장부 · ${email}` : undefined}
      >
        <Icon size={13} className={live === "connecting" ? "animate-spin" : ""} />
        {live === "local" ? label : "공유 장부 · " + label}
      </span>
      {onReload && (
        <button
          type="button"
          onClick={onReload}
          className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
        >
          <RefreshCw size={12} /> 새로 읽기
        </button>
      )}
    </div>
  );
}

/**
 * 로그인은 했는데 공유 장부가 비어 있고, 이 브라우저에는 예전 거래가 남아 있을 때.
 *
 * 예전에는 "공유 장부로 옮길까요?"만 떠서 어디로 가는지 알 수가 없었다.
 * 무엇이 어디로 가는지, 상대에게 어떻게 보이는지까지 적는다.
 */
export function UploadBanner({ count, email, onUpload }) {
  return (
    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm">
      <div className="font-semibold text-rose-900">
        이 브라우저에만 남아 있는 거래가 {count}건 있어요
      </div>
      <p className="mt-1.5 leading-relaxed text-rose-800">
        공유 장부(Supabase)를 쓰기 전에 이 기기에 저장해 둔 거래예요. 지금 <b>공유 장부는 비어
        있습니다.</b> 옮기면 {email ? <b>{email}</b> : "로그인한 계정"} 의 공유 장부로 올라가고,
        <b> 지원님 화면에도 바로 보입니다.</b> 이 기기 원본은 지워지지 않아요.
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 font-medium text-white"
      >
        <UploadCloud size={15} /> 공유 장부로 옮기기
      </button>
    </div>
  );
}
