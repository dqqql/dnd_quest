# Legacy D1 Migration Plan

## Goal

Migrate the old personal-use production database to the new public release schema while preserving:

- legacy users
- existing surveys
- all responses and answers

## Target Result

After migration:

- legacy `users.name` becomes new `users.username`
- every legacy user gets a default password of `123456`
- all legacy surveys are moved into the new public channel
- existing `questions`, `responses`, and `answers` keep working through preserved IDs
- old `users` and `surveys` tables are kept as `legacy_users` / `legacy_surveys` backups inside the same DB for rollback inspection

## Important Constraints

### 1. Default password

Legacy users will all be assigned the same initial password:

`123456`

To make that workable, the backend now distinguishes:

- registration password policy: at least 8 characters
- login password policy: non-empty, max 72 characters

So migrated users can log in with `123456`, while new registrations still require stronger passwords.

### 2. Username compatibility

The migration assumes the old `users.name` values can be reused as new usernames.

Current login/registration validation allows:

- Chinese characters
- letters
- numbers
- `_`
- `-`

Before running the migration, manually inspect legacy usernames for values that may still be risky:

```sql
SELECT id, name, LENGTH(TRIM(name)) AS trimmed_length
FROM users
WHERE TRIM(name) != name
   OR LENGTH(TRIM(name)) < 3
   OR LENGTH(TRIM(name)) > 20
   OR name LIKE '% %';
```

If this query returns rows, decide whether to:

- rename those legacy users before migration
- relax username validation further

## Safe Migration Sequence

### Step 1. Back up the current production D1

Back up the current remote D1 first using Cloudflare Dashboard or Wrangler export tooling.

Do not skip this step.

### Step 2. Deploy the app code that includes the login-policy split

The codebase now supports:

- registration >= 8 chars
- login can accept migrated `123456`

Make sure this commit is deployed before migrating users.

### Step 3. Run the legacy migration SQL against the remote DB

From the repo root:

```powershell
npx wrangler d1 execute quest --remote --file=migrations/legacy_to_v1.sql
```

### Step 4. Verify the migration

Run these SQL checks in the Dashboard or via Wrangler:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
ORDER BY name;
```

You should see at least:

- `users`
- `sessions`
- `channels`
- `channel_members`
- `surveys`
- `questions`
- `responses`
- `answers`
- `legacy_users`
- `legacy_surveys`

Check the public channel:

```sql
SELECT id, name, slug, is_public, access_mode
FROM channels;
```

Expected:

- one row with `slug = 'public'`
- `is_public = 1`

Check migrated counts:

```sql
SELECT
  (SELECT COUNT(*) FROM legacy_users)   AS legacy_user_count,
  (SELECT COUNT(*) FROM users)          AS new_user_count,
  (SELECT COUNT(*) FROM legacy_surveys) AS legacy_survey_count,
  (SELECT COUNT(*) FROM surveys)        AS new_survey_count;
```

These counts should match.

Check that all surveys are in the public channel:

```sql
SELECT c.name AS channel_name, COUNT(*) AS survey_count
FROM surveys s
JOIN channels c ON c.id = s.channel_id
GROUP BY c.name;
```

Expected for the first migration:

- all migrated surveys are under `公共频道`

### Step 5. Smoke-test the live app

Test at least:

1. Login with one migrated user using password `123456`
2. Open an old survey
3. View results on a survey created by that user
4. Create a new private channel
5. Move one survey from public channel into the private channel

## Temporary Security Note

Assigning every legacy user the same password is only acceptable as a temporary bridge.

Recommended follow-up work:

- add password change UI
- force migrated users to change password after first login

## Rollback Note

This migration preserves the original data in:

- `legacy_users`
- `legacy_surveys`

That helps with inspection, but it is not a full rollback strategy by itself.

The real rollback is your pre-migration database backup.
