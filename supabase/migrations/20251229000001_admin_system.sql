-- =============================================================================
-- 后台管理系统数据库迁移
-- 包含: admin_users, advertisements, app_releases, social_links
-- =============================================================================

-- =============================================================================
-- 0. 启用加密扩展 (为了能在 SQL 里直接算哈希)
-- =============================================================================
create extension if not exists pgcrypto;

-- =============================================================================
-- 1. 创建管理员表 (admin_users)
-- =============================================================================
create table if not exists public.admin_users (
  id uuid default gen_random_uuid() primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz default now()
);

-- 启用 RLS - 前端 API (Anon Key) 完全无法访问此表
alter table public.admin_users enable row level security;

-- 插入初始管理员账号
insert into public.admin_users (username, password_hash)
values (
  'admin',
  crypt('Admin@123456', gen_salt('bf'))
)
on conflict (username) do nothing;

-- =============================================================================
-- 2. 创建广告表 (advertisements)
-- =============================================================================
create table if not exists public.advertisements (
  id uuid default gen_random_uuid() primary key,

  -- 基础信息
  title text not null,
  position text not null,        -- top/bottom/left/right/sidebar/bottom-left/bottom-right

  -- 资源信息
  media_type text not null,      -- image/video
  media_url text not null,
  target_url text,

  -- 控制开关
  is_active boolean default true,
  priority int default 0,

  -- 文件信息
  file_size bigint,

  -- 数据来源标记
  source text default 'supabase', -- supabase/cloudbase/both

  -- 审计时间
  created_at timestamptz default now()
);

-- 创建索引
create index if not exists idx_ads_simple
on public.advertisements(position, is_active, priority desc);

-- 启用 RLS
alter table public.advertisements enable row level security;

-- 允许 Public 读取激活的广告
create policy "Public can view active ads"
on public.advertisements for select
using ( is_active = true );

-- 创建 ads 存储桶
insert into storage.buckets (id, name, public)
values ('ads', 'ads', true)
on conflict (id) do nothing;

-- 允许所有人读取 ads 桶
create policy "Public Access Ads"
on storage.objects for select
using ( bucket_id = 'ads' );

-- 允许已登录用户上传
create policy "Authenticated users can upload ads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'ads' );

-- =============================================================================
-- 3. 创建发布版本表 (app_releases)
-- =============================================================================
create table if not exists public.app_releases (
  id uuid default gen_random_uuid() primary key,

  -- 版本信息
  version text not null,
  platform text not null,        -- ios/android/windows/macos/linux
  variant text,                  -- x64/x86/arm64/intel/m/deb/rpm 等

  -- 文件信息
  file_url text not null,
  file_size bigint,

  -- 版本说明
  release_notes text,

  -- 控制开关
  is_active boolean default true,
  is_mandatory boolean default false,

  -- 数据来源标记
  source text default 'supabase',

  -- 审计时间
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 创建索引
create index if not exists idx_releases_platform_version
on public.app_releases(platform, version desc);

create index if not exists idx_releases_platform_active
on public.app_releases(platform, is_active, created_at desc);

-- 启用 RLS
alter table public.app_releases enable row level security;

-- 允许 Public 读取激活的版本
create policy "Public can view active releases"
on public.app_releases for select
using ( is_active = true );

-- 创建 releases 存储桶
insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do nothing;

-- 允许所有人读取 releases 桶
create policy "Public Access Releases"
on storage.objects for select
using ( bucket_id = 'releases' );

-- 允许已登录用户上传
create policy "Authenticated users can upload releases"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'releases' );

-- =============================================================================
-- 4. 创建社交链接表 (social_links)
-- =============================================================================
create table if not exists public.social_links (
  id uuid default gen_random_uuid() primary key,

  -- 基础信息
  title text not null,
  description text,
  icon_url text not null,
  target_url text not null,

  -- 控制开关
  is_active boolean default true,
  sort_order int default 0,

  -- 文件信息
  file_size bigint,

  -- 数据来源标记
  source text default 'supabase',

  -- 审计时间
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 创建索引
create index if not exists idx_social_links_active_order
on public.social_links(is_active, sort_order asc);

-- 启用 RLS
alter table public.social_links enable row level security;

-- 允许 Public 读取激活的链接
create policy "Public can view active social links"
on public.social_links for select
using ( is_active = true );

-- 创建 social-icons 存储桶
insert into storage.buckets (id, name, public)
values ('social-icons', 'social-icons', true)
on conflict (id) do nothing;

-- 允许所有人读取 social-icons 桶
create policy "Public Access Social Icons"
on storage.objects for select
using ( bucket_id = 'social-icons' );

-- 允许已登录用户上传
create policy "Authenticated users can upload social icons"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'social-icons' );

-- =============================================================================
-- 5. 创建更新时间触发器函数
-- =============================================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 为 app_releases 添加触发器
drop trigger if exists update_app_releases_updated_at on public.app_releases;
create trigger update_app_releases_updated_at
before update on public.app_releases
for each row
execute function update_updated_at_column();

-- 为 social_links 添加触发器
drop trigger if exists update_social_links_updated_at on public.social_links;
create trigger update_social_links_updated_at
before update on public.social_links
for each row
execute function update_updated_at_column();
