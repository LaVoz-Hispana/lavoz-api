# Section 1: resumes and project applications

This document covers the private resume library and applications in Section 1 of
`Postsstation/ux-feedback_2026_10/requirements.pdf`. The current implementation also
enforces Sections 2–3 privacy rules; provider migration details are in
`PROVIDER_PROFILES.md`. See `../Postsstation/ux-feedback_2026_10/requirements_verification.md`
for the full verification record.

## Deployment

1. Apply `migrations/027_student_resumes_and_applications.sql` after migrations
   001–026, before deploying the API. The database must support generated columns
   (MySQL 5.7+) and the existing users/projects/escrows tables must use InnoDB.
   The generated unique key enforces at most one live default resume per student.
2. Create a **separate private S3 bucket**, enable all four Block Public Access
   settings, and configure `RESUME_BUCKET_NAME`. The public `lavozbucket` is
   explicitly rejected. Set `RESUME_BUCKET_REGION` if different from
   `BUCKET_REGION`.
3. Grant the API credentials `s3:GetBucketPublicAccessBlock` on the bucket and
   `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on its `student-resumes/*`
   objects. Existing `ACCESS_KEY` / `SECRET_ACCESS_KEY` are supported; otherwise
   the standard AWS credential provider chain is used. Do not give the bucket a
   public policy or apply the public-media expiration rules to it.
4. Deploy the API and frontend. Existing notification preferences/email worker
   also support application events. `NOTIFICATION_EMAIL_ENABLED` controls email;
   in-app notifications are always persisted atomically with application changes.

No existing database, bucket, or deployed application is modified by the source
change itself. Missing/private-bucket configuration does not block profile setup.

## API

All routes require authentication. Roles are reloaded from users for these routes.
Resume/application JSON never includes S3 object keys or URLs.

| Method | Route                                                | Access / purpose                                                                                             |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/resumes`                                       | Student's live library                                                                                       |
| POST   | `/api/resumes`                                       | Student; multipart `file`, `label`                                                                           |
| PUT    | `/api/resumes/:id`                                   | Owner; `{label}` and/or `{isDefault: true}`                                                                  |
| PUT    | `/api/resumes/:id/file`                              | Owner; multipart replacement, returns new resume ID                                                          |
| DELETE | `/api/resumes/:id`                                   | Owner; refuses a resume in a submitted application                                                           |
| GET    | `/api/resumes/:id/download`                          | Owner, admin, or owner of a project with this resume in a submitted/selected application; streams attachment |
| GET    | `/api/applications/mine[?projectId=…]`               | Student's own applications                                                                                   |
| POST   | `/api/applications/projects/:projectId`              | Student; `{resumeId, note?}`                                                                                 |
| GET    | `/api/applications/projects/:projectId`              | Owning provider's review view                                                                                |
| PUT    | `/api/applications/projects/:projectId/:id/withdraw` | Applicant, submitted and project open                                                                        |
| PUT    | `/api/applications/projects/:projectId/:id/select`   | Owning provider, submitted and project open                                                                  |
| PUT    | `/api/applications/projects/:projectId/:id/reject`   | Owning provider, submitted and project open                                                                  |

Uploads validate extension, declared MIME, size (10 MiB), and PDF/OOXML signature.
DOCX validation checks the ZIP directory and core document XML with bounded
decompression, and rejects macro archives. This is type validation, not malware
scanning. Responses use stable `code` values translated by the client.

## Lifecycle and concurrency

Replacing creates a new library entry and soft-deletes the previous entry. The
old file and row remain intact for applications already referencing them.
Default/label changes never move an application's resume reference. Deleting
soft-deletes the library entry; no historical files are physically purged by this
feature. A future retention job must account for application history before
removing objects. Rejected/withdrawn applications no longer grant provider download
access. Selected applicants retain their resume reference in the escrow history.

A project/student unique key prevents repeat submissions, including after
withdrawal. `submitted` displays as “Application in Progress”; it is not an escrow.
Selection locks the project and atomically selects the application, rejects other
submitted applications, creates a pending escrow (adminId NULL), changes the
project to in_escrow, records the escrow event, and persists notifications/outbox.
Failure rolls back all those writes. Each transaction has a dedicated connection.
Per-student row locks serialize default changes, replacements, deletion and resume
selection. Legacy direct escrow creation now uses the same project lock and
requires using application selection when submitted applications exist.

## Verification

- API: `npm test` covers file validation, authorization, ownership, duplicate
  applications, state transitions, transaction rollback, replacement retention,
  default changes, deletion protection, and legacy escrow bypass prevention.
- Client: `CI=true npm test -- --watchAll=false --runInBand` exercises default
  selection, first-upload-before-apply, validation, applicant selection, guest
  visibility, and Spanish labels; `npm run build` compiles the production bundle.
- Before deployment, verify the migration and concurrent selections/default
  changes against a disposable MySQL database, plus real S3 upload/download and
  anonymous access denial against the configured private bucket. Unit tests use
  injected storage/query doubles and do not substitute for those service checks.
