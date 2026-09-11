-- Apply before deploying the notification service. Requires InnoDB transactions.
ALTER TABLE notifications
  ENGINE = InnoDB,
  ADD COLUMN eventKey VARCHAR(191) DEFAULT NULL,
  ADD UNIQUE KEY notifications_event_key (eventKey);

CREATE TABLE notification_preferences (
  userId INT NOT NULL PRIMARY KEY,
  marketplaceEmail BOOLEAN NOT NULL DEFAULT TRUE,
  language ENUM('en', 'es') DEFAULT NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- No FK to notifications: routine cleanup must not delete pending mail.
CREATE TABLE email_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notificationId INT NOT NULL,
  userTo INT NOT NULL,
  userFrom INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  objectId INT DEFAULT NULL,
  postId INT DEFAULT NULL,
  status ENUM('pending', 'processing', 'sent', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  nextAttemptAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastError VARCHAR(100) DEFAULT NULL,
  sentAt DATETIME DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY email_notification_key (notificationId),
  KEY email_due (status, nextAttemptAt)
) ENGINE=InnoDB;
