CREATE TABLE IF NOT EXISTS private_users (
  user_id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscriptions (
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (user_id) REFERENCES private_users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id);
CREATE TABLE IF NOT EXISTS groups (
  group_id INTEGER PRIMARY KEY,
  moderation_status TEXT NOT NULL DEFAULT 'unknown',
  last_api_code TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS moderation_events (
  update_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  group_title TEXT,
  message_id INTEGER NOT NULL,
  sender_id INTEGER,
  file_name TEXT,
  mime_type TEXT,
  detection_reason TEXT NOT NULL,
  delete_status TEXT NOT NULL DEFAULT 'pending',
  delete_attempts INTEGER NOT NULL DEFAULT 0,
  delete_error TEXT,
  next_retry_at TEXT,
  warning_status TEXT NOT NULL DEFAULT 'pending',
  warning_attempts INTEGER NOT NULL DEFAULT 0,
  warning_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS moderation_events_group_time ON moderation_events(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_events_retry ON moderation_events(delete_status, next_retry_at);
CREATE INDEX IF NOT EXISTS moderation_events_warning ON moderation_events(warning_status, warning_retry_at);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  update_id INTEGER NOT NULL,
  recipient_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (update_id, recipient_id),
  FOREIGN KEY (update_id) REFERENCES moderation_events(update_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS notification_deliveries_status ON notification_deliveries(status, retry_at);
