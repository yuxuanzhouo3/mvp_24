-- Disable legacy token quota; Credits is the only monthly quota source

update public.plan_quota_settings
set token_limit = 0
where token_limit <> 0;

comment on column public.plan_quota_settings.token_limit is 'Deprecated legacy token quota. Credits is the only monthly billing quota.';
