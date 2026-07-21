-- Stores the one top-level category chosen when a local posts a project.
-- Migration 014_create_categories_tables.sql must be applied first.
ALTER TABLE projects
  ADD COLUMN categoryId INT DEFAULT NULL,
  ADD CONSTRAINT fk_projects_category
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL;
