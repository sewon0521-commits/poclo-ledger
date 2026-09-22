import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { workerAlive } from "../lib/reels";

// 콘텐츠 화면(릴스 기획 · 캐러셀 기획)이 같이 쓰는 조각.

export function CopyButton({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("복사해서 쓰세요", text);
        }
      }}
      className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

// ------------------------------------------------------------- 분석기 상태

export function WorkerStatus({ worker }) {
  const alive = workerAlive(worker);
  return (
    <p className={"mt-2 flex items-start gap-1.5 text-xs " + (alive ? "text-emerald-700" : "text-stone-500")}>
      <span
        className={
          "mt-1 h-2 w-2 shrink-0 rounded-full " + (alive ? "bg-emerald-500" : "bg-stone-300")
        }
      />
      {alive ? (
        <span>
          사무실 PC 분석기 켜짐{worker.busy ? " · 지금 분석 중" : ""} — 소리까지 받아써서 분석해요.
        </span>
      ) : (
        <span>
          사무실 PC 분석기가 꺼져 있어요. 맡겨 두면 켜질 때 이어서 분석해요.
          <span className="block text-stone-400">
            켜기: poclo-cafe24 폴더의 <b className="font-medium">8_릴스분석기_켜기.bat</b> (한 번 켜 두면 PC 켤 때마다 자동)
          </span>
        </span>
      )}
    </p>
  );
}

