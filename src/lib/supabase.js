import { createClient } from "@supabase/supabase-js";
import { safeSet, trimLocal } from "./localCache";

// 이 두 값은 브라우저에 노출돼도 되는 값이다(그러라고 있는 값이다).
// 실제 접근 통제는 Supabase의 RLS가 한다 — 로그인 안 한 사람은 아무것도 못 읽는다.
// service_role 키는 여기 절대 쓰지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Supabase 설정이 없으면 앱은 이 기기에만 저장하는 방식으로 계속 돌아간다 */
export const isRemote = Boolean(url && anonKey);

// 로그인 기록 저장소 (11/14 세원: "포클로에 담기 누를 때마다 로그인해야 돼") —
// 라이브러리에 맡기면 시작할 때 localStorage 에 한 번 써 보고, 가득 차서 안 써지면 로그인을 메모리에만 둔다
// → 창을 새로 열 때마다 로그인이 사라졌다. 직접 넘기면 그 시험을 안 하고, 쓸 때 자리가 없으면
// 서버 값의 이 기기 사본을 지워 자리를 낸다(lib/localCache.js). 그래도 안 되면 이 창 안에서만 기억한다.
const mem = {};
const authStorage = {
  getItem(k) {
    if (k in mem) return mem[k]; // 못 쓴 새 기록이 있으면 그게 최신(저장 공간엔 예전 것이 남아 있을 수 있다)
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k, v) {
    mem[k] = v;
    if (safeSet(k, v, { evict: true })) delete mem[k];
    else
      try {
        localStorage.removeItem(k); // 예전 기록을 다른 창이 쓰면 이미 쓴 토큰이라 로그인이 통째로 끊긴다
      } catch {
        /* 무시 */
      }
  },
  removeItem(k) {
    delete mem[k];
    try {
      localStorage.removeItem(k);
    } catch {
      /* 무시 */
    }
  },
};

if (isRemote) trimLocal();

export const supabase = isRemote
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storage: authStorage },
    })
  : null;
