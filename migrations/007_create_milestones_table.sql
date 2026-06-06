CREATE TABLE milestones (
  id          INT          NOT NULL AUTO_INCREMENT,
  escrowId    INT          NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT         DEFAULT NULL,
  dueDate     DATE         DEFAULT NULL,
  `order`     INT          NOT NULL DEFAULT 0,
  status      ENUM('pending','active','submitted','approved','revision_requested') NOT NULL DEFAULT 'pending',
  createdAt   DATETIME     NOT NULL,
  updatedAt   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (escrowId) REFERENCES escrows(id) ON DELETE CASCADE
);
