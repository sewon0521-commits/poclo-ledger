/** 로컬에서만 쓰는 짧은 고유 id. M2에서 Supabase로 가면 서버 id로 바뀐다. */
export function newId(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
