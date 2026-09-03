import { useRef, useState } from "react";
import { UploadCloud, Loader2, Camera } from "lucide-react";

const isImage = (f) => f && f.type.startsWith("image/");

/**
 * 장끼 올리기 영역.
 * 끌어다 놓아도 되고, 눌러서 골라도 되고, 폰에서는 바로 촬영도 된다.
 */
export default function ReceiptDrop({ busy, onFile }) {
  const [over, setOver] = useState(false);
  const [reject, setReject] = useState("");
  const pickRef = useRef(null);
  const cameraRef = useRef(null);

  const take = (file) => {
    if (!file) return;
    if (!isImage(file)) {
      setReject("사진 파일만 올릴 수 있어요. JPG·PNG로 다시 올려주세요.");
      return;
    }
    setReject("");
    onFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    take(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])][0];
    if (file) {
      e.preventDefault();
      take(file);
    }
  };

  return (
    <div className="mb-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="장끼 올리기"
        onClick={() => !busy && pickRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) pickRef.current?.click();
          }
        }}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition outline-none " +
          (busy
            ? "cursor-wait border-stone-300 bg-stone-100"
            : over
              ? "border-rose-600 bg-rose-50"
              : "border-stone-300 bg-white hover:border-rose-400 hover:bg-rose-50/40 focus-visible:border-rose-600")
        }
      >
        {busy ? (
          <>
            <Loader2 size={30} className="animate-spin text-rose-700" />
            <p className="mt-2.5 font-semibold text-stone-700">장끼 읽는 중…</p>
            <p className="mt-0.5 text-xs text-stone-400">10초쯤 걸려요</p>
          </>
        ) : (
          <>
            <UploadCloud size={30} className={over ? "text-rose-600" : "text-stone-400"} />
            <p className="mt-2.5 font-semibold text-stone-800">
              {over ? "여기에 놓으세요" : "장끼를 끌어다 놓으세요"}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">눌러서 사진을 고를 수도 있어요</p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 sm:hidden"
      >
        <Camera size={18} /> 장끼 찍기
      </button>

      {reject && <p className="mt-2 text-sm text-rose-700">{reject}</p>}

      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          take(f);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          take(f);
        }}
      />
    </div>
  );
}
