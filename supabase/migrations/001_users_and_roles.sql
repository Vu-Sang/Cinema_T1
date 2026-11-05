-- Users, roles and bans for Rạp T1. Paste into Supabase: SQL Editor > New query > Run.

-- =============================================================================
-- 0. DỌN DẸP / XOÁ TOÀN BỘ CSDL CŨ (AN TOÀN TUYỆT ĐỐI, TRÁNH LỖI VIEW/TABLE)
-- =============================================================================
do $$
begin
  -- Xoá trigger cũ nếu có
  drop trigger if exists on_auth_user_created on auth.users;

  -- Kiểm tra và xoá profiles dù nó đang là bảng hay là view
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') then
    execute 'drop table public.profiles cascade';
  elsif exists (select 1 from pg_views where schemaname = 'public' and viewname = 'profiles') then
    execute 'drop view public.profiles cascade';
  end if;

  -- Xoá các bảng còn lại
  execute 'drop table if exists public.bans cascade';
  execute 'drop table if exists public.characters cascade';
  execute 'drop table if exists public.users cascade';
  execute 'drop table if exists public.roles cascade';

  -- Xoá các hàm
  execute 'drop function if exists public.handle_new_user() cascade';
  execute 'drop function if exists public.is_admin() cascade';

  -- Xoá enum type cũ
  execute 'drop type if exists public.user_role cascade';
end $$;

-- =============================================================================
-- 1. BẢNG VAI TRÒ (roles)
-- =============================================================================
create table public.roles (
  role text primary key,
  description text not null
);

-- Nạp 2 vai trò: admin (quản trị viên) và viewer (người xem)
insert into public.roles (role, description) values
  ('admin', 'Quản trị viên rạp chiếu T1'),
  ('viewer', 'Khán giả vào xem rạp');

-- =============================================================================
-- 2. BẢNG NGƯỜI DÙNG (users)
-- =============================================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null check (char_length(display_name) between 2 and 20),
  look jsonb not null default '{}'::jsonb check (pg_column_size(look) < 2048),
  role text not null default 'viewer' references public.roles (role) on update cascade,
  created_at timestamptz not null default now()
);

-- Tạo View profiles để tương thích hoàn toàn
create or replace view public.profiles as
select id, display_name, look, role, created_at
from public.users;

-- =============================================================================
-- 3. BẢNG CẤM VÀO RẠP (bans)
-- =============================================================================
create table public.bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  reason text not null default '',
  banned_by uuid references public.users (id) on delete set null,
  expires_at timestamptz, -- null là cấm vĩnh viễn
  created_at timestamptz not null default now()
);

create index bans_user_id_idx on public.bans (user_id);
create index bans_banned_by_idx on public.bans (banned_by);

-- =============================================================================
-- 4. HÀM & TRIGGER XỬ LÝ ĐĂNG NHẬP (GOOGLE / KHÁCH)
-- =============================================================================

-- Hàm kiểm tra quyền admin
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- Trigger tự động tạo user khi đăng nhập bằng Google hoặc ẩn danh
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  ));
  assigned_role text := 'viewer';
begin
  wanted := left(wanted, 20);
  if char_length(wanted) < 2 then
    wanted := 'Khách';
  end if;

  -- Email quản trị viên mặc định: vudinhsang0403@gmail.com
  if lower(coalesce(new.email, '')) = 'vudinhsang0403@gmail.com' then
    assigned_role := 'admin';
  end if;

  insert into public.users (id, email, display_name, look, role)
  values (new.id, new.email, wanted, coalesce(new.raw_user_meta_data -> 'look', '{}'::jsonb), assigned_role)
  on conflict (id) do update
  set
    email = excluded.email,
    role = case when lower(coalesce(new.email, '')) = 'vudinhsang0403@gmail.com' then 'admin' else users.role end,
    display_name = case when users.display_name = 'Khách' and wanted <> 'Khách' then wanted else users.display_name end;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 5. PHÂN QUYỀN VÀ BẢO MẬT (ROW LEVEL SECURITY)
-- =============================================================================

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.bans enable row level security;

revoke all on public.roles from anon, authenticated;
revoke all on public.users from anon, authenticated;
revoke all on public.bans from anon, authenticated;

grant select on public.roles to anon, authenticated;
grant select on public.users to authenticated;
grant update (display_name, look) on public.users to authenticated;
grant select, insert, update, delete on public.bans to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Policies cho bảng roles (mọi người đều đọc được)
create policy "Allow read roles"
  on public.roles for select to anon, authenticated
  using (true);

-- Policies cho bảng users
create policy "Read own user, admins read all"
  on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "Update own user"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Policies cho bảng bans
create policy "Read own bans, admins read all"
  on public.bans for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "Admins add bans"
  on public.bans for insert to authenticated
  with check (public.is_admin());

create policy "Admins change bans"
  on public.bans for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins remove bans"
  on public.bans for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- 6. ĐỒNG BỘ DỮ LIỆU TỪ AUTH.USERS SANG BẢNG USERS
-- =============================================================================

insert into public.users (id, email, display_name, look, role)
select
  id,
  email,
  case
    when char_length(btrim(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(coalesce(email, ''), '@', 1), ''))) between 2 and 20
    then btrim(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(coalesce(email, ''), '@', 1), ''))
    else 'Khách'
  end,
  coalesce(raw_user_meta_data -> 'look', '{}'::jsonb),
  case when lower(coalesce(email, '')) = 'vudinhsang0403@gmail.com' then 'admin' else 'viewer' end
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  role = case when lower(coalesce(excluded.email, '')) = 'vudinhsang0403@gmail.com' then 'admin' else users.role end;
