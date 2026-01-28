-- Add cloudbase_file_id metadata to releases
alter table public.app_releases add column if not exists cloudbase_file_id text;
alter table public.app_releases add column if not exists download_filename text;