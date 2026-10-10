-- Section 1: private resume library and pre-escrow applications.
-- Requires MySQL 5.7+ and migrations 001–026.
CREATE TABLE student_resumes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  studentId INT NOT NULL,
  label VARCHAR(150) NOT NULL,
  objectKey VARCHAR(255) NOT NULL,
  originalFileName VARCHAR(255) NOT NULL,
  mimeType VARCHAR(100) NOT NULL,
  sizeBytes INT UNSIGNED NOT NULL,
  isDefault BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deletedAt DATETIME DEFAULT NULL,
  defaultStudentId INT GENERATED ALWAYS AS
    (CASE WHEN isDefault = 1 AND deletedAt IS NULL THEN studentId ELSE NULL END) STORED,
  UNIQUE KEY one_default_per_student (defaultStudentId),
  KEY student_resume_library (studentId, deletedAt),
  FOREIGN KEY (studentId) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE project_applications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INT NOT NULL,
  studentId INT NOT NULL,
  resumeId INT NOT NULL,
  note TEXT DEFAULT NULL,
  status ENUM('submitted', 'withdrawn', 'selected', 'rejected') NOT NULL DEFAULT 'submitted',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolvedAt DATETIME DEFAULT NULL,
  UNIQUE KEY one_application_per_project_student (projectId, studentId),
  KEY student_applications (studentId, createdAt),
  KEY project_application_status (projectId, status),
  FOREIGN KEY (projectId) REFERENCES projects(id),
  FOREIGN KEY (studentId) REFERENCES users(id),
  FOREIGN KEY (resumeId) REFERENCES student_resumes(id)
) ENGINE=InnoDB;

-- Existing installations may use an ENUM for notification types.
ALTER TABLE notifications MODIFY COLUMN type VARCHAR(40) NOT NULL;
