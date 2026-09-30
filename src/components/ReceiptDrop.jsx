import { useRef, useState } from "react";
import { UploadCloud, Loader2, Camera } from "lucide-react";

const isImage = (f) => f && f.type.startsWith("image/");

/**
 * 장끼 올리기 영역.
 * 끌어다 놓아도 되고, 눌러서 골라도 되고, 폰에서는 바로 촬영도 된다.
 */
export default function ReceiptDrop({ busy, onFile, waiting = 0 }) {
  const [over, setOver] = useState(false);
  const [reject, setReject] = useState("");
  const pickRef = useRef(null);
  const cameraRef = useRef(null);

  // 여러 장 한 번에 (9/30) — 사진만 추려서 넘긴다
  const take = (files) => {
    const list = [...(files || [])].filter(Boolean);
    if (!list.length) return;
    const imgs = list.filter(isImage);
    setReject(imgs.length < list.length ? "사진이 아닌 파일은 뺐어요. JPG·PNG만 올릴 수 있어요." : "");
    if (imgs.length) onFile(imgs);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      take(files);
    }
  };

  return (
    <div className="mb-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="장끼 올리기"
        onClick={() => pickRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickRef.current?.click();
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
            <p className="mt-0.5 text-xs text-stone-500">눌러서 사진을 여러 장 한 번에 고를 수 있어요</p>
            {waiting > 0 && <p className="mt-1.5 text-xs font-medium text-rose-700">장끼 {waiting}장 읽는 중 · 다 읽으면 한 장씩 확인 창이 떠요</p>}
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
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          take(fs);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          take(fs);
        }}
      />
    </div>
  );
}
