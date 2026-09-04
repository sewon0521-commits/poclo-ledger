import { createClient } from "@supabase/supabase-js";

// 이 두 값은 브라우저에 노출돼도 되는 값이다(그러라고 있는 값이다).
// 실제 접근 통제는 Supabase의 RLS가 한다 — 로그인 안 한 사람은 아무것도 못 읽는다.
// service_role 키는 여기 절대 쓰지 않는다.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Supabase 설정이 없으면 앱은 이 기기에만 저장하는 방식으로 계속 돌아간다 */
export const isRemote = Boolean(url && anonKey);

export const supabase = isRemote
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
