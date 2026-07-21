-- Allows each student to select multiple top-level service categories.
-- Migration 014_create_categories_tables.sql must be applied first.
CREATE TABLE student_service_categories (
  userId     INT NOT NULL,
  categoryId INT NOT NULL,
  PRIMARY KEY (userId, categoryId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);
