-- Three-tier user roles: free | pro | admin.
-- free  → playground, inference/models (view), docs
-- pro   → everything except the Admin console
-- admin → everything, plus heavy inference ops (pull/benchmark) and the console
--
-- New users default to 'free'. Legacy rows used 'admin' (default) and 'user';
-- normalise them: keep admins, and demote the generic 'user' to 'free'.

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'free';

UPDATE users SET role = 'free' WHERE role = 'user';
