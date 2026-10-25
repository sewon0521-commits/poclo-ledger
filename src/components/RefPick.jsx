import { useState } from "react";
import { X, Check } from "lucide-react";
import { FIELD, shopsOf, hasCut } from "../lib/shoot";
import { CutFilter } from "./CutBits";
import { folderIdOf, withChildren, ordered } from "../lib/reelFolders";

// 촬영 레퍼런스에서 사진 고르기 — 소싱 관리(소싱 회차) · 촬영 관리(스타일링 창)가 같이 쓴다 (10/25 ShootPlan.jsx 에서 떼어 냄)

// 예전 '옷 종류' 꼬리표 사진은 같은 이름 상위 목록으로 (촬영 레퍼런스와 같게)
const withFolder = (r) => (r.folderId || r.folder ? r : { ...r, folder: (r.clothes || [])[0] || "" });

/** 촬영 레퍼런스에서 사진 고르기 (10/6 세원: "코디 촬영 관리 폴더 만든 곳에서 촬영 레퍼런스에 있는 사진 레퍼런스를 픽할 수 있었으면") */
export default function RefPick({ d, picked, onDone, onClose }) {
  const [sel, setSel] = useState(picked);
  const [folder, setFolder] = useState("");
  const [cut, setCut] = useState("");
  const [shop, setShop] = useState("");
  const shops = shopsOf(d.tags, d.refs);
  const inFolder = folder ? new Set(withChildren(folder, d.folders)) : null;
  const refs = d.refs
    .map(withFolder)
    .filter((r) => (!inFolder || inFolder.has(folderIdOf(r, d.folders))) && hasCut(r, cut) && (!shop || r.shop === shop));
  const flip = (id) => setSel((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));
  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <span className="font-semibold text-stone-900">촬영 레퍼런스에서 고르기 <span className="text-sm font-normal text-stone-400">{sel.length}장 골랐어요</span></span>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="shrink-0 space-y-2 border-b border-stone-100 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className={FIELD + " max-w-xs py-1.5 text-sm"}>
              <option value="">목록 전체</option>
              {ordered(d.folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-400">{refs.length}장</span>
          </div>
          {(d.tags?.cuts || []).length > 0 && <CutFilter tags={d.tags} value={cut} onChange={setCut} />}
          {shops.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {["", ...shops].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setShop(s)}
                  className={"rounded-full border px-2.5 py-0.5 text-xs " + (shop === s ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}
                >
                  {s || "쇼핑몰 전체"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {refs.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {refs.map((r) => {
                const on = sel.includes(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => flip(r.id)} className={"relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "")}>
                    {d.urls[r.photo] && <img src={d.urls[r.photo]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-white bg-black/20 text-transparent")}>
                      <Check size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-stone-400">{d.refs.length ? "이 목록·컷에는 사진이 없어요." : "촬영 › 촬영 레퍼런스에 사진을 넣으면 여기서 골라요."}</p>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-4 py-2.5">
          <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600">
            그만두기
          </button>
          <button type="button" onClick={() => onDone(sel)} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            {sel.length}장 담기
          </button>
        </footer>
      </div>
    </div>
  );
}
