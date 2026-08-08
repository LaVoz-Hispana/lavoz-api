-- Official posts display as Poststation while retaining userId as the
-- authenticated creator for moderation and audit purposes.
ALTER TABLE posts
  ADD COLUMN isAdminPost BOOLEAN NOT NULL DEFAULT FALSE AFTER postType;
