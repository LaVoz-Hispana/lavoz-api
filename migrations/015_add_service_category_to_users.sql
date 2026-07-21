-- Stores the service category selected by a student during registration.
-- Migration 014_create_categories_tables.sql must be applied first.
ALTER TABLE users
  ADD COLUMN serviceCategoryId INT DEFAULT NULL,
  ADD CONSTRAINT fk_users_service_category
    FOREIGN KEY (serviceCategoryId) REFERENCES categories(id) ON DELETE SET NULL;
