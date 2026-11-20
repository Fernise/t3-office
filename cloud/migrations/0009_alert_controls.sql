ALTER TABLE push_subscriptions ADD COLUMN quiet_start INTEGER;
ALTER TABLE push_subscriptions ADD COLUMN quiet_end INTEGER;
ALTER TABLE push_subscriptions ADD COLUMN tz TEXT;
ALTER TABLE push_subscriptions ADD COLUMN own INTEGER NOT NULL DEFAULT 1;
CREATE TABLE push_log(id TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),at INTEGER NOT NULL,kind TEXT NOT NULL,sent INTEGER NOT NULL,held INTEGER NOT NULL);
CREATE INDEX push_log_user ON push_log(user,at);
