-- artifacts.milestoneId
ALTER TABLE artifacts
  DROP FOREIGN KEY artifacts_ibfk_1;

ALTER TABLE artifacts
  ADD CONSTRAINT artifacts_milestoneId_fk
  FOREIGN KEY (milestoneId) REFERENCES milestones(id) ON DELETE SET NULL;

-- escrow_events.milestoneId
ALTER TABLE escrow_events
  DROP FOREIGN KEY escrow_events_ibfk_2;

ALTER TABLE escrow_events
  ADD CONSTRAINT escrow_events_milestoneId_fk
  FOREIGN KEY (milestoneId) REFERENCES milestones(id) ON DELETE SET NULL;
