# Project Provider profile migration

First run `npm run requirements:check` to inspect the target schema without changing records. Apply `migrations/028_add_provider_profile_fields.sql` only when its fields are missing. It is a one-time migration; duplicate-column errors mean you must inspect the existing schema rather than rerun its backfill. The configured database passed the schema checks on October 19, 2026.

The migration keeps `account_type = 'local'`, adds the explicit provider identity fields, and maps legacy `business_type` values as follows:

- `Resident` → `individual`
- `Business` → `company`
- `Non-profit` → `organization`

If a deployment has the legacy `org_name` column, its value is copied into the matching company or organization name. Existing providers deliberately remain marked incomplete because the migration cannot safely invent a responsible contact person. They must confirm their provider type and contact person the next time they edit their profile. The API also blocks new project creation until that profile is complete.

New provider registrations and profile updates are validated by the API. Fields that do not match the selected provider type are rejected, and student updates clear all provider-only fields.
