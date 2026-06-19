-- Adds phone number as an optional contact method for users.
-- Email already exists on the users table.

ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) DEFAULT NULL;
