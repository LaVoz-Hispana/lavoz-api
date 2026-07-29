CREATE TABLE project_reviews (
  id          INT NOT NULL AUTO_INCREMENT,
  escrowId    INT NOT NULL,
  reviewerId  INT NOT NULL,
  revieweeId  INT NOT NULL,
  rating      DECIMAL(2,1) NOT NULL,
  commentary  TEXT DEFAULT NULL,
  createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_project_review_rating CHECK (rating BETWEEN 0.5 AND 5 AND rating * 2 = FLOOR(rating * 2)),
  CONSTRAINT uq_project_review_reviewer UNIQUE (escrowId, reviewerId),
  INDEX idx_project_reviews_reviewee (revieweeId, createdAt),
  FOREIGN KEY (escrowId) REFERENCES escrows(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (revieweeId) REFERENCES users(id) ON DELETE CASCADE
);
