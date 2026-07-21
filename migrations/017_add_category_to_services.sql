-- Stores the one top-level service category chosen when a student posts a service.
-- Migrations 014 and 016 must be applied first.
ALTER TABLE services
  ADD COLUMN categoryId INT DEFAULT NULL,
  ADD CONSTRAINT fk_services_category
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL;
