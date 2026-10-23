-- Section 4: explicit Project Provider identity fields.
-- Existing account_type='local' values remain unchanged for route compatibility.
ALTER TABLE users
  ADD COLUMN provider_type ENUM('individual', 'company', 'organization') NULL AFTER business_type,
  ADD COLUMN contact_person_name VARCHAR(150) NULL AFTER provider_type,
  ADD COLUMN company_name VARCHAR(200) NULL AFTER contact_person_name,
  ADD COLUMN organization_name VARCHAR(200) NULL AFTER company_name,
  ADD COLUMN provider_profile_complete BOOLEAN NOT NULL DEFAULT FALSE AFTER organization_name;

-- Preserve the legacy classification where it is unambiguous. Contact names are
-- deliberately left NULL, so every existing provider remains incomplete until
-- they confirm the responsible person on their next edit or project post.
UPDATE users
SET provider_type = CASE
  WHEN LOWER(TRIM(business_type)) = 'resident' THEN 'individual'
  WHEN LOWER(TRIM(business_type)) = 'business' THEN 'company'
  WHEN LOWER(TRIM(business_type)) IN ('non-profit', 'nonprofit', 'non profit') THEN 'organization'
  ELSE NULL
END,
provider_profile_complete = FALSE
WHERE account_type = 'local';

-- Some installations may have the legacy org_name column even though it was
-- never part of the tracked schema. Copy it when present without making this
-- migration depend on that column existing.
SET @has_legacy_org_name = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'org_name'
);
SET @copy_legacy_org_name = IF(
  @has_legacy_org_name > 0,
  'UPDATE users SET company_name = CASE WHEN provider_type = ''company'' THEN NULLIF(TRIM(org_name), '''') ELSE company_name END, organization_name = CASE WHEN provider_type = ''organization'' THEN NULLIF(TRIM(org_name), '''') ELSE organization_name END WHERE account_type = ''local''',
  'SELECT 1'
);
PREPARE provider_backfill FROM @copy_legacy_org_name;
EXECUTE provider_backfill;
DEALLOCATE PREPARE provider_backfill;

