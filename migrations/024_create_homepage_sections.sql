CREATE TABLE homepage_sections (
  sectionKey VARCHAR(64) PRIMARY KEY,
  contentEn TEXT NOT NULL,
  contentEs TEXT NOT NULL,
  updatedByUserId INT DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updatedByUserId) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO homepage_sections (sectionKey, contentEn, contentEs, updatedByUserId)
VALUES (
  'sponsor_support',
  'Thank you to our sponsors for helping students turn skills into real-world opportunities.',
  'Gracias a nuestros patrocinadores por ayudar a estudiantes a convertir sus habilidades en oportunidades reales.',
  NULL
);
