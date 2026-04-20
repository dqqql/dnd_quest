PRAGMA foreign_keys = OFF;

-- Preserve old core tables first so the original rows stay available for inspection.
ALTER TABLE users RENAME TO legacy_users;
ALTER TABLE surveys RENAME TO legacy_surveys;

-- New auth table layout.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- New channel system.
CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id INTEGER,
  is_public INTEGER NOT NULL DEFAULT 0,
  access_mode TEXT NOT NULL DEFAULT 'visible',
  invite_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE channel_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, user_id)
);

-- New survey layout with channel ownership.
CREATE TABLE surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  creator_id INTEGER NOT NULL,
  is_closed INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Public channel bootstrap.
INSERT INTO channels (name, slug, owner_id, is_public, access_mode, invite_code)
VALUES ('公共频道', 'public', NULL, 1, 'visible', NULL);

-- Migrate users. All legacy users receive temporary password 123456.
-- Hash value:
-- pbkdf2$100000$bGVnYWN5LW1pZ3JhdGlvbg$98rNGgYJq6hYn_ngLJR70Z8bgWU_4OsKY32TB2z9VyA
INSERT INTO users (id, username, password_hash, created_at)
SELECT
  id,
  TRIM(name) AS username,
  'pbkdf2$100000$bGVnYWN5LW1pZ3JhdGlvbg$98rNGgYJq6hYn_ngLJR70Z8bgWU_4OsKY32TB2z9VyA' AS password_hash,
  created_at
FROM legacy_users;

-- Migrate surveys into the public channel while preserving IDs.
INSERT INTO surveys (id, channel_id, title, description, creator_id, is_closed, is_deleted, created_at, updated_at)
SELECT
  ls.id,
  c.id,
  ls.title,
  ls.description,
  ls.creator_id,
  ls.is_closed,
  ls.is_deleted,
  ls.created_at,
  ls.updated_at
FROM legacy_surveys ls
CROSS JOIN channels c
WHERE c.slug = 'public';

CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_channels_owner_id ON channels(owner_id);
CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX idx_surveys_channel_id ON surveys(channel_id);
CREATE INDEX idx_surveys_creator_id ON surveys(creator_id);
CREATE INDEX idx_questions_survey_id ON questions(survey_id);
CREATE INDEX idx_responses_survey_id ON responses(survey_id);
CREATE INDEX idx_responses_user_id ON responses(user_id);
CREATE INDEX idx_answers_response_id ON answers(response_id);
