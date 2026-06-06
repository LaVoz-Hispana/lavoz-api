CREATE TABLE escrow_events (
  id          INT          NOT NULL AUTO_INCREMENT,
  escrowId    INT          NOT NULL,
  milestoneId INT          DEFAULT NULL,
  artifactId  INT          DEFAULT NULL,
  actorId     INT          NOT NULL,
  actorRole   VARCHAR(50)  NOT NULL,
  eventType   ENUM(
    'escrow_created',
    'student_accepted',
    'student_declined',
    'milestone_added',
    'milestone_updated',
    'artifact_submitted',
    'change_requested',
    'milestone_approved',
    'escrow_completed',
    'escrow_cancelled'
  ) NOT NULL,
  note        TEXT         DEFAULT NULL,
  createdAt   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (escrowId)    REFERENCES escrows(id) ON DELETE CASCADE,
  FOREIGN KEY (milestoneId) REFERENCES milestones(id),
  FOREIGN KEY (artifactId)  REFERENCES artifacts(id),
  FOREIGN KEY (actorId)     REFERENCES users(id)
);
