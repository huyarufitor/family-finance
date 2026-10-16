-- Dedicated, unguessable receiving aliases. Raw email content is never stored here.
create table public.email_routes (
 channel_id uuid primary key references public.import_channels(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 recipient text not null unique,
 allowed_sender text not null check (length(allowed_sender) between 5 and 254),
 last_status text,
 updated_at timestamptz not null default now()
);
alter table public.email_routes enable row level security;
revoke all on public.email_routes from anon, authenticated;
grant select on public.email_routes to authenticated;
create policy email_route_read on public.email_routes for select to authenticated using (public.is_owner(household_id));

create function public.create_email_channel(h uuid, a uuid, channel_name text, sender text)
returns text language plpgsql security definer set search_path = '' as $$
declare c uuid; alias text := 'bill-' || encode(extensions.gen_random_bytes(24),'hex');
begin
 if not public.is_owner(h) then raise exception '仅家庭创建者可以配置邮件同步'; end if;
 if trim(sender) !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then raise exception '请输入完整的转发邮箱地址'; end if;
 insert into public.import_channels(household_id,account_id,name,token_hash)
 values(h,a,trim(channel_name),encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex')) returning id into c;
 insert into public.email_routes(channel_id,household_id,recipient,allowed_sender)
 values(c,h,alias,lower(trim(sender)));
 return alias;
end $$;
revoke all on function public.create_email_channel(uuid,uuid,text,text) from public;
grant execute on function public.create_email_channel(uuid,uuid,text,text) to authenticated;
