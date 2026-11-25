import { useEffect, useRef } from "react";
import { loadKey, onSettingsChange, watchKeys } from "./shoot";

/**
 * 둘이 같이 쓰기 (11/25 세원: "소싱관리 → 촬영 레퍼런스도 바로바로 지원이랑 동기화 가능?")
 * 상대가 이 키를 저장하면 방송으로 바로, 방송을 놓쳐도 4초 안에(updated_at 만 보는 작은 요청) 다시 읽어 apply(값)를 부른다.
 * 내가 저장한 건 changeKey 가 이미 화면에 넣고 seen 에 적어 두므로 다시 안 읽는다(lib/shoot '둘이 같이 쓰기').
 * 공유 장부일 때만 — 이 기기 저장 모드는 상대가 없다.
 */
export function useLiveKey(keys, online, apply, fallback) {
  const fn = useRef(apply);
  useEffect(() => {
    fn.current = apply;
  });
  const list = keys.join("|");
  useEffect(() => {
    if (!online) return;
    const ks = list.split("|");
    const again = (key) => {
      if (!ks.includes(key)) return;
      loadKey(key, online, fallback)
        .then((v) => fn.current(key, v))
        .catch(() => {});
    };
    const off = onSettingsChange(again);
    const stop = watchKeys(ks, again);
    return () => {
      off();
      stop();
    };
    // fallback 은 처음 값만 쓴다
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [list, online]);
}
