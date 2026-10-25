-- 모델 계약서 (2026-10-25) — 모바일 서명. 여러 번 실행해도 안전하다.
-- 로그인한 사람(세원·지원)은 표를 그대로 읽고 쓴다. 모델(로그인 없음)은 표에 직접 못 가고
-- 아래 두 함수만 부른다 — contract_get(토큰) · contract_sign(토큰, 서명 내용, 주민번호). 토큰은 24바이트 무작위(32자).
--
-- 주민등록번호 (10/25 세원: "3.3% 원천징수 신고용 — 번호만, 암호화 저장, 목록·상세는 뒷자리 가리고 '신고용 보기'에서만 전체")
--   · 서명 함수 안에서 AES-256(pgcrypto pgp_sym_encrypt)으로 암호화해 contracts.rrn_enc 에만 둔다. signed(jsonb)에는 가린 번호 rrnMask('020521-*******')만.
--   · 키는 Supabase Vault 의 'contract_rrn_key' — 처음 실행할 때 DB 안에서 무작위로 만든다(아무도 안 봄). ⚠ 이 비밀을 지우면 저장된 번호를 다시 못 읽는다.
--   · 전체 번호는 로그인한 사람만 contract_rrn(계약 id) 로 — 부를 때마다 contract_rrn_log 에 누가·언제 남는다.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault;

create table if not exists public.contracts (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  terms       jsonb not null default '{}'::jsonb,
  signed      jsonb,
  signed_at   timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.contracts add column if not exists rrn_enc bytea;

alter table public.contracts enable row level security;

drop policy if exists "로그인한 사람은 계약서 전부" on public.contracts;
create policy "로그인한 사람은 계약서 전부" on public.contracts
  for all to authenticated using (true) with check (true);

revoke all on table public.contracts from anon;

-- 주민번호 조회 기록 — 함수만 쓴다(계약서를 지워도 기록은 남김). 로그인한 사람은 읽기만.
create table if not exists public.contract_rrn_log (
  id            bigint generated always as identity primary key,
  contract_id   uuid not null,
  name          text,
  viewer        uuid,
  viewer_email  text,
  at            timestamptz not null default now()
);
alter table public.contract_rrn_log enable row level security;
drop policy if exists "로그인한 사람은 조회 기록 읽기" on public.contract_rrn_log;
create policy "로그인한 사람은 조회 기록 읽기" on public.contract_rrn_log
  for select to authenticated using (true);
revoke all on table public.contract_rrn_log from anon;
revoke insert, update, delete on table public.contract_rrn_log from authenticated;

-- 암호화 키 — 없을 때만 만든다
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'contract_rrn_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'contract_rrn_key',
      '모델 계약서 주민등록번호 암호화 키 — 지우면 저장된 번호를 다시 못 읽음'
    );
  end if;
end
$$;

-- 모델 — 토큰으로 계약 읽기(없으면 null). 서명했으면 사본용으로 서명 내용도 같이(주민번호는 가린 것만).
-- rrnReady = 주민번호를 받을 준비(키)가 됐는지 — 서명 화면이 이걸 보고 주민번호 칸을 띄운다.
create or replace function public.contract_get(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'terms', c.terms, 'signed', c.signed, 'signed_at', c.signed_at,
    'rrnReady', exists (select 1 from vault.secrets where name = 'contract_rrn_key')
  )
  from public.contracts c
  where p_token is not null and length(p_token) >= 20 and c.token = p_token
$$;

-- 모델 — 서명 보내기. 아직 서명 안 한 계약만 한 번. 서명 그림(png data URL)은 300KB 까지.
-- 주민번호는 숫자 13자리(뒷자리 첫 숫자 1~8 — 외국인등록번호 5~8 포함)만 받아 바로 암호화한다.
drop function if exists public.contract_sign(text, jsonb);
create or replace function public.contract_sign(p_token text, p_signed jsonb, p_rrn text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.contracts;
  s text := coalesce(p_signed->>'sign', '');
  d text := regexp_replace(coalesce(p_rrn, ''), '[^0-9]', '', 'g');
  k text;
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
  if length(d) <> 13 or substr(d, 7, 1) not in ('1', '2', '3', '4', '5', '6', '7', '8') then
    raise exception 'bad rrn';
  end if;
  if substr(d, 3, 2)::int not between 1 and 12 or substr(d, 5, 2)::int not between 1 and 31 then
    raise exception 'bad rrn';
  end if;

  select decrypted_secret into k from vault.decrypted_secrets where name = 'contract_rrn_key' limit 1;
  if k is null or length(k) < 32 then
    raise exception 'no key';
  end if;

  update public.contracts
     set signed = (p_signed - 'rrn' - 'rrnMask') || jsonb_build_object('rrnMask', substr(d, 1, 6) || '-*******', 'at', now()),
         signed_at = now(),
         rrn_enc = extensions.pgp_sym_encrypt(d, k, 'cipher-algo=aes256')
   where token = p_token and signed_at is null
  returning * into r;

  if r.id is null then
    if exists (select 1 from public.contracts where token = p_token) then
      raise exception 'already signed';
    end if;
    raise exception 'not found';
  end if;

  return jsonb_build_object('ok', true, 'signed_at', r.signed_at, 'rrnMask', r.signed->>'rrnMask');
end
$$;

-- ERP(로그인) — 주민번호를 받을 준비가 됐는지(이 SQL 을 실행했는지)
create or replace function public.contract_rrn_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from vault.secrets where name = 'contract_rrn_key')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contracts' and column_name = 'rrn_enc')
$$;

-- ERP(로그인) — '신고용 보기': 전체 번호 + 최근 조회 기록. 부를 때마다 기록이 남는다.
create or replace function public.contract_rrn(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e bytea;
  nm text;
  k text;
  d text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'role', '') <> 'authenticated' then
    raise exception 'not allowed';
  end if;
  select c.rrn_enc, c.terms->>'name' into e, nm from public.contracts c where c.id = p_id;
  if e is null then
    return jsonb_build_object('rrn', null);
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'contract_rrn_key' limit 1;
  if k is null then
    raise exception 'no key';
  end if;
  d := extensions.pgp_sym_decrypt(e, k);
  insert into public.contract_rrn_log (contract_id, name, viewer, viewer_email)
  values (p_id, nm, auth.uid(), auth.jwt()->>'email');
  return jsonb_build_object(
    'rrn', substr(d, 1, 6) || '-' || substr(d, 7),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('who', x.viewer_email, 'at', x.at)), '[]'::jsonb)
              from (select viewer_email, at from public.contract_rrn_log where contract_id = p_id order by at desc limit 5) x)
  );
end
$$;

revoke all on function public.contract_get(text) from public;
revoke all on function public.contract_sign(text, jsonb, text) from public;
grant execute on function public.contract_get(text) to anon, authenticated;
grant execute on function public.contract_sign(text, jsonb, text) to anon, authenticated;

revoke all on function public.contract_rrn_ready() from public, anon;
revoke all on function public.contract_rrn(uuid) from public, anon;
grant execute on function public.contract_rrn_ready() to authenticated;
grant execute on function public.contract_rrn(uuid) to authenticated;
