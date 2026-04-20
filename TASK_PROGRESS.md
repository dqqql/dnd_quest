# Public Release Progress

## Goal

Turn the current personal-use survey app into a public multi-user app with:

- username/password accounts
- persistent login sessions
- one public channel plus up to three private channels per user
- invite-based private channel membership
- per-channel visibility / fill permissions
- survey move / import / export support

## Confirmed Product Rules

- First visit requires registration.
- Accounts use `username + password`.
- Username is unique and immutable in v1.
- Persistent auth uses server-side cookie sessions.
- Password reset is out of scope for v1.
- All users are logged-in users; guest flows are out of scope.
- Public channel is visible to all logged-in users.
- Each user can create up to 3 private channels.
- Channel creator is the only admin.
- Each private channel has one reusable invite code.
- Invite code can be regenerated; old code becomes invalid.
- Joining once makes the user a member until removed.
- Removed users lose access/fill rights, but can rejoin with a valid invite.
- Kicking a member should remind the admin to refresh the invite code.
- Private channels support:
  - visible to all, fill by members only
  - visible in list, content gated to members only
- Survey results remain visible only to the survey creator.
- Surveys can be moved between public and owned private channels.
- Moving a survey preserves prior responses.
- Export only includes survey structure JSON.
- Import always creates in the public channel first, then offers moving to a private channel.
- The built-in sample JSON should use the post-session review questionnaire.

## Work Plan

- [x] Add progress tracking document
- [x] Add auth/session backend
- [x] Add channel/member/invite backend
- [x] Add survey export and move backend
- [x] Rework SPA auth flow
- [x] Rework home/channel browsing UI
- [x] Add private channel management UI
- [x] Add import/export/move UI
- [ ] Smoke-test core flows

## Notes

- Current implementation stores only a local username and has no real auth.
- Current database schema will need a breaking v1 refresh or equivalent migration.
- Frontend routes now pivot around real sessions and channel-based permissions.
- Remaining work is mainly verification, polish, and any migration/deployment follow-up.
