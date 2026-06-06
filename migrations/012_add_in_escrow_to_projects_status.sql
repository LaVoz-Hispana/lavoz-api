ALTER TABLE projects MODIFY COLUMN status ENUM('open','in_escrow','closed') NOT NULL DEFAULT 'open';
