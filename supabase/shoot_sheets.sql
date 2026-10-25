-- 촬영 시트 링크 (2026-10-25) — 모델에게 보내는 '그날 촬영' 한 장. 여러 번 실행해도 안전하다.
-- 로그인한 사람(세원·지원)은 표를 그대로 읽고 쓴다. 모델(로그인 없음)은 표에 직접 못 가고
-- 아래 함수 하나만 부른다 — sheet_get(토큰). 닫은 링크(closed)는 null. 토큰은 24바이트 무작위(32자).
-- data 는 ERP 가 고른 칸만 담은 스냅숏이다(도매가·판매가·거래처·위치·신마 링크·내부 메모 없음 — src/lib/shootSheet.js 머리말).

create table if not exists public.shoot_sheets (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  data        jsonb not null default '{}'::jsonb,
  closed      boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.shoot_sheets enable row level security;

drop policy if exists "로그인한 사람은 촬영 시트 전부" on public.shoot_sheets;
create policy "로그인한 사람은 촬영 시트 전부" on public.shoot_sheets
  for all to authenticated using (true) with check (true);

revoke all on table public.shoot_sheets from anon;

-- 모델 — 토큰으로 시트 읽기(없거나 닫혔으면 null)
create or replace function public.sheet_get(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('data', s.data, 'updated_at', s.updated_at)
  from public.shoot_sheets s
  where p_token is not null and length(p_token) >= 20 and s.token = p_token and not s.closed
$$;

revoke all on function public.sheet_get(text) from public;
grant execute on function public.sheet_get(text) to anon, authenticated;
