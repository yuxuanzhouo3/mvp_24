# Referral Membership Rollback Runbook (Apple / Alipay)

## Scope
- Use this runbook when a paid subscription is refunded/cancelled on providers without automatic rollback wiring in v1.
- Applies to: `apple` (iOS IAP), `alipay`.

## Preconditions
- Confirm refund is final in provider dashboard.
- Collect at least one identifier:
  - `transaction_id` (preferred)
  - or payment record `out_trade_no` / provider order id.

## 1. Locate impacted referral rewards
- Supabase:
  - Table: `public.referral_rewards`
  - Filter:
    - `related_transaction_id = <transaction_id>`
    - `status in ('granted','rollback_pending')`
    - `reward_type in ('first_payment_inviter','first_payment_invited')`
- CloudBase:
  - Collection: `web_referral_rewards`
  - Same filter fields as above.

## 2. Execute rollback script logic manually
- For each matched reward row:
  - Compute rollback days: `-abs(amount)`.
  - Use `reference_id = "rollback_" + original.reference_id`.
  - Apply membership delta to same `user_id`:
    - INTL: `public.user_wallets` / `subscriptions` / auth metadata via membership service path.
    - CN: `user_wallets` + `web_users.membership_expires_at`.
  - If deduction succeeds:
    - set reward `status = 'revoked'`
    - set `revoked_at = now()`
    - append `meta.rollbackProvider`, `meta.rollbackTransactionId`, `meta.rollbackReferenceId`.
  - If deduction fails:
    - keep/set `status = 'rollback_pending'`
    - append `meta.rollbackError`, `meta.rollbackAttemptAt`.

## 3. Verify consistency
- Check user membership expiry is reduced by the same days granted before.
- Confirm no duplicate rollback:
  - Ensure `rollback_<reference_id>` idempotency entry exists once.
- Confirm relation still exists; only reward status changes.

## 4. Audit log
- Record ticket/operator/date/provider/transaction id and number of revoked rows.
- Save SQL/console snapshots in incident ticket.

## Notes
- v1 intentionally does not auto-handle Apple/Alipay refund webhooks.
- Stripe/PayPal/WeChat refunds are automatic and should not use this runbook unless retry/recovery is required.
