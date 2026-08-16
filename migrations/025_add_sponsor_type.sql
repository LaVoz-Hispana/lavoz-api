ALTER TABLE sponsors
  ADD COLUMN sponsorType ENUM('regular', 'principle') NOT NULL DEFAULT 'regular' AFTER link;
