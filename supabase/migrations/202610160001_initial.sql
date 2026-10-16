-- Run once in a fresh Supabase SQL editor. All amounts are integer RMB cents.
create extension if not exists pgcrypto with schema extensions;
create table public.households (id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 80), created_at timestamptz not null default now());
create table public.memberships (household_id uuid not null references public.households(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null check (role in ('owner','member')), primary key(household_id,user_id));
create unique index memberships_user_idx on public.memberships(user_id);
create function public.is_member(h uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.memberships where household_id=h and user_id=(select auth.uid())); $$;
create function public.is_owner(h uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.memberships where household_id=h and user_id=(select auth.uid()) and role='owner'); $$;
revoke all on function public.is_member(uuid), public.is_owner(uuid) from public;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to authenticated;
create table public.people (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, name text not null check(length(name) between 1 and 60), color text not null check(color ~ '^#[0-9a-fA-F]{6}$'), unique(id,household_id));
create table public.accounts (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, person_id uuid not null, name text not null check(length(name) between 1 and 80), kind text not null check(kind in ('cash','deposit','investment','property','liability')), foreign key(person_id,household_id) references public.people(id,household_id), unique(id,household_id), unique(id,person_id,household_id));
create table public.valuations (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, account_id uuid not null, date date not null, value bigint not null check(value between 0 and 100000000000000), foreign key(account_id,household_id) references public.accounts(id,household_id), unique(account_id,date));
create table public.transactions (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, person_id uuid not null, account_id uuid not null, to_account_id uuid, kind text not null check(kind in ('income','expense','transfer')), amount bigint not null check(amount between 1 and 100000000000000), date date not null, category text not null check(length(category) between 1 and 80), note text not null default '' check(length(note)<=2000), source text not null check(length(source) between 1 and 100), external_id text check(length(external_id) between 1 and 500), created_at timestamptz not null default now(), foreign key(account_id,person_id,household_id) references public.accounts(id,person_id,household_id), foreign key(to_account_id,household_id) references public.accounts(id,household_id), check((kind='transfer' and to_account_id is not null and to_account_id<>account_id) or (kind<>'transfer' and to_account_id is null)), unique(household_id,source,account_id,external_id));
create index transactions_household_date_idx on public.transactions(household_id,date);
create index valuations_household_date_idx on public.valuations(household_id,date);
create table public.invitations (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, token_hash text not null unique, expires_at timestamptz not null default now()+interval '7 days', used_at timestamptz);
create table public.import_channels (id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, account_id uuid not null, name text not null check(length(name) between 1 and 80), token_hash text not null unique, created_at timestamptz not null default now(), last_received_at timestamptz, foreign key(account_id,household_id) references public.accounts(id,household_id));

alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.import_channels enable row level security;
create policy household_read on public.households for select to authenticated using(public.is_member(id));
create policy membership_read on public.memberships for select to authenticated using(public.is_member(household_id));
create policy channel_read on public.import_channels for select to authenticated using(public.is_owner(household_id));
create policy channel_delete on public.import_channels for delete to authenticated using(public.is_owner(household_id));
-- No direct invitation or membership writes. Security-definer RPCs validate ownership.
do $$ declare t text; begin foreach t in array array['people','accounts','valuations','transactions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy family_read on public.%I for select to authenticated using(public.is_member(household_id))',t);
 execute format('create policy family_insert on public.%I for insert to authenticated with check(public.is_member(household_id))',t);
 execute format('create policy family_update on public.%I for update to authenticated using(public.is_member(household_id)) with check(public.is_member(household_id))',t);
 execute format('create policy family_delete on public.%I for delete to authenticated using(public.is_member(household_id))',t);
end loop; end $$;
revoke all on public.households, public.memberships, public.invitations, public.import_channels from anon, authenticated;
grant select on public.households, public.memberships, public.import_channels to authenticated;
grant delete on public.import_channels to authenticated;
grant select,insert,update,delete on public.people, public.accounts, public.valuations, public.transactions to authenticated;

create function public.create_household(family_name text, person_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare h uuid; begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception '你已经加入了家庭'; end if;
 insert into public.households(name) values(trim(family_name)) returning id into h;
 insert into public.memberships values(h,auth.uid(),'owner');
 insert into public.people(household_id,name,color) values(h,trim(person_name),'#49745b'); return h;
end $$;
create function public.create_invitation(h uuid) returns text language plpgsql security definer set search_path = '' as $$
declare token text := encode(extensions.gen_random_bytes(24),'hex'); begin
 if not public.is_owner(h) then raise exception '仅家庭创建者可以邀请'; end if;
 insert into public.invitations(household_id,token_hash) values(h,encode(extensions.digest(token,'sha256'),'hex')); return token;
end $$;
create function public.accept_invitation(token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception '你已经加入了家庭'; end if;
 select * into inv from public.invitations where token_hash=encode(extensions.digest(token,'sha256'),'hex') and used_at is null and expires_at>now() for update;
 if inv.id is null then raise exception '邀请码无效、已使用或已过期'; end if;
 insert into public.memberships values(inv.household_id,auth.uid(),'member');
 update public.invitations set used_at=now() where id=inv.id; return inv.household_id;
end $$;
create function public.create_import_channel(h uuid, a uuid, channel_name text) returns text language plpgsql security definer set search_path = '' as $$
declare token text := encode(extensions.gen_random_bytes(32),'hex'); begin
 if not public.is_owner(h) then raise exception '仅家庭创建者可以创建渠道'; end if;
 insert into public.import_channels(household_id,account_id,name,token_hash) values(h,a,trim(channel_name),encode(extensions.digest(token,'sha256'),'hex')); return token;
end $$;
revoke all on function public.create_household(text,text), public.create_invitation(uuid), public.accept_invitation(text), public.create_import_channel(uuid,uuid,text) from public;
grant execute on function public.create_household(text,text), public.create_invitation(uuid), public.accept_invitation(text), public.create_import_channel(uuid,uuid,text) to authenticated;
-- Logical replication sends only rows allowed by RLS.
alter publication supabase_realtime add table public.people, public.accounts, public.valuations, public.transactions;

create table public.ai_usage(user_id uuid not null references auth.users(id) on delete cascade, day date not null, calls integer not null, primary key(user_id,day));
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon,authenticated;
create function public.acquire_ai_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; begin
 if auth.uid() is null or not exists(select 1 from public.memberships where user_id=auth.uid()) then return false; end if;
 insert into public.ai_usage(user_id,day,calls) values(auth.uid(),current_date,1)
 on conflict(user_id,day) do update set calls=public.ai_usage.calls+1 where public.ai_usage.calls<30 returning calls into n;
 return n is not null;
end $$;
revoke all on function public.acquire_ai_quota() from public;
grant execute on function public.acquire_ai_quota() to authenticated;

create function public.create_account(h uuid,p uuid,account_name text,account_kind text,initial_value bigint,initial_date date) returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; begin
 if not public.is_member(h) then raise exception '无权修改此家庭'; end if;
 insert into public.accounts(household_id,person_id,name,kind) values(h,p,trim(account_name),account_kind) returning id into a;
 insert into public.valuations(household_id,account_id,date,value) values(h,a,initial_date,initial_value);return a;
end $$;
revoke all on function public.create_account(uuid,uuid,text,text,bigint,date) from public;
grant execute on function public.create_account(uuid,uuid,text,text,bigint,date) to authenticated;
