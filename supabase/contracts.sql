-- 모델 계약서 (2026-10-25) — 모바일 서명. 여러 번 실행해도 안전하다.
-- 로그인한 사람(세원·지원)은 표를 그대로 읽고 쓴다. 모델(로그인 없음)은 표에 직접 못 가고
-- 아래 두 함수만 부른다 — contract_get(토큰) · contract_sign(토큰, 서명 내용). 토큰은 24바이트 무작위(32자).
-- 주민등록번호는 받지 않는다(암호화 저장 의무 — src/lib/contract.js 머리말).

create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  terms       jsonb not null default '{}'::jsonb,
  signed      jsonb,
  signed_at   timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "로그인한 사람은 계약서 전부" on public.contracts;
create policy "로그인한 사람은 계약서 전부" on public.contracts
  for all to authenticated using (true) with check (true);

revoke all on table public.contracts from anon;

-- 모델 — 토큰으로 계약 읽기(없으면 null). 서명했으면 사본용으로 서명 내용도 같이.
create or replace function public.contract_get(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('terms', c.terms, 'signed', c.signed, 'signed_at', c.signed_at)
  from public.contracts c
  where p_token is not null and length(p_token) >= 20 and c.token = p_token
$$;

-- 모델 — 서명 보내기. 아직 서명 안 한 계약만 한 번. 서명 그림(png data URL)은 300KB 까지.
create or replace function public.contract_sign(p_token text, p_signed jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.contracts;
  s text := coalesce(p_signed->>'sign', '');
begin
  if p_token is null or length(p_token) < 20 then
    raise exception 'not found';
  end if;
  if p_signed is null or jsonb_typeof(p_signed) <> 'object' then
    raise exception 'bad data';
  end if;
  if length(s) > 300000 or s not like 'data:image/png;base64,%' then
    raise exception 'bad sign';
  end if;
  if length(p_signed::text) > 320000 then
    raise exception 'too big';
  end if;

  update public.contracts
     set signed = p_signed || jsonb_build_object('at', now()),
         signed_at = now()
   where token = p_token and signed_at is null
  returning * into r;

  if r.id is null then
    if exists (select 1 from public.contracts where token = p_token) then
      raise exception 'already signed';
    end if;
    raise exception 'not found';
  end if;

  return jsonb_build_object('ok', true, 'signed_at', r.signed_at);
end
$$;

revoke all on function public.contract_get(text) from public;
revoke all on function public.contract_sign(text, jsonb) from public;
grant execute on function public.contract_get(text) to anon, authenticated;
grant execute on function public.contract_sign(text, jsonb) to anon, authenticated;
