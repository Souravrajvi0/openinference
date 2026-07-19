-- Per-key model allowlist. NULL = no restriction (all models the tenant's
-- plan allows). Enforced in the chat route after routing resolves the model,
-- so defaults, A/B routes, and fallbacks are all covered.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS allowed_models TEXT[];
