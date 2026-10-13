ALTER TABLE moderation_events ADD COLUMN group_username TEXT;
ALTER TABLE moderation_events ADD COLUMN sender_name TEXT;
ALTER TABLE moderation_events ADD COLUMN sender_username TEXT;
ALTER TABLE moderation_events ADD COLUMN sender_chat_id INTEGER;
ALTER TABLE moderation_events ADD COLUMN warning_message_id INTEGER;
