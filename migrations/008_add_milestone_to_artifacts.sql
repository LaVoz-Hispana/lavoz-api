ALTER TABLE artifacts
  ADD COLUMN milestoneId INT DEFAULT NULL,
  ADD FOREIGN KEY (milestoneId) REFERENCES milestones(id);
