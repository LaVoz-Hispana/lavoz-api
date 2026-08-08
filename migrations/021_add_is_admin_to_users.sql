-- Allows a user to retain their marketplace role while receiving admin access.
ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE AFTER account_type;

-- Existing account_type='admin' users remain compatible through the legacy
-- authorization fallback. Grant the initial delegated admin account requested
-- for verification using its primary key (compatible with MySQL safe updates).
UPDATE users
SET is_admin = TRUE
WHERE id = 93;
