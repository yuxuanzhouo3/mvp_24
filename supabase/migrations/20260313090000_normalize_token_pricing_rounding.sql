-- Best practice: token-based pricing should settle proportionally by actual usage.
-- Historical catalog rows may have persisted token pricing rules with rounding=ceil,
-- which overcharges short requests by rounding every request up to the next 1K block.

with normalized as (
  select
    c.id,
    jsonb_agg(
      case
        when coalesce(rule->>'metricKey', '') ~* '(^|_)(token|tokens)(_|$)'
          then jsonb_set(rule, '{rounding}', '"none"', true)
        else rule
      end
      order by ord
    ) as pricing_rules
  from public.ai_model_catalog c
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(c.pricing_rules) = 'array' then c.pricing_rules
      else '[]'::jsonb
    end
  ) with ordinality as rules(rule, ord)
  group by c.id
)
update public.ai_model_catalog as c
set
  pricing_rules = normalized.pricing_rules,
  updated_at = timezone('utc'::text, now())
from normalized
where c.id = normalized.id
  and c.pricing_rules is distinct from normalized.pricing_rules;
