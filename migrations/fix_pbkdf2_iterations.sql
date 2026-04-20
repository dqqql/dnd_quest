-- Cloudflare Workers PBKDF2 currently rejects iterations above 100000.
-- This patch updates already-migrated legacy users from 310000 -> 100000 iterations
-- while keeping the same temporary password: 123456

UPDATE users
SET password_hash = 'pbkdf2$100000$bGVnYWN5LW1pZ3JhdGlvbg$98rNGgYJq6hYn_ngLJR70Z8bgWU_4OsKY32TB2z9VyA'
WHERE password_hash = 'pbkdf2$310000$bGVnYWN5LW1pZ3JhdGlvbg$ek3D0JocSpAjBvmrKQUIwfCN8rjSWFr992CExmyHL30';
