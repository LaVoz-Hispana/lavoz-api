# Notification email rollout

All 12 notification types now use `utils/notificationHelper.js`. The promise-based
`createNotification({ userTo, userFrom, type, objectId, postId, eventKey })` suppresses
self notifications and commits the in-app notification and optional email job in
one transaction. Its rejection reports a persistence failure. Existing controllers
await the compatibility wrapper, which logs a failure and returns `{ failed: true }`
without failing an already-persisted business action. No request waits for SMTP.

Only the nine marketplace types are email-enabled (including milestone_added).
Comments, follows, and reactions remain in-app. Social digest and direct-message
email delivery are deferred. Browser-supplied post owners and follower IDs are
ignored. Notification clearing and email preferences are scoped to the logged-in user.

## Deployment

1. Back up the database and apply `migrations/026_notification_email_outbox.sql`
   once, before deploying this API version. Use your normal MySQL migration tool.
   It adds an event key to notifications, ensures that table uses InnoDB, and creates
   preferences and outbox tables. The ALTER can lock/rebuild a large table; schedule
   accordingly. The migration is additive and does not change existing notifications.
2. Deploy API and client. Use `.env.notifications.example` to configure the existing
   environment. Keep `NOTIFICATION_EMAIL_ENABLED=false` until ready for the pilot.
   `CLIENT_URL` must be the public client URL, such as `https://www.poststation.link`.
3. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM. Existing
   MY_EMAIL / APP_PASSWORD work for Gmail. Port 465 uses implicit TLS; other ports
   require STARTTLS. The reusable mailer also serves existing password recovery.
4. Set `NOTIFICATION_EMAIL_ENABLED=true` on both API and worker. Start
   `npm run worker:email` under the deployment's process supervisor, with restart
   on failure. It polls every ten seconds and handles 25 jobs per batch. For a
   scheduler, use `npm run worker:email -- --once` instead. No mail is backfilled
   for notifications created while the flag was false.
5. In staging, trigger an invitation, verify in-app notification and outbox rows,
   follow the delivered link, opt out in Edit Profile, and verify further events
   remain in-app. Test an SMTP outage and recovery before production activation.

The worker uses a dedicated MySQL connection and a database-scoped advisory lock.
All workers must connect to the same writable database server, and the account must
be permitted to call GET_LOCK/RELEASE_LOCK. A second worker exits its batch without
sending while another owns the lock. SIGTERM/SIGINT finish the current message;
allow at least 90 seconds of shutdown grace. A crash releases the database lock;
the next worker recovers processing rows. Queue rows survive notification cleanup.

## Preferences

The profile editor has a separate email preferences Save button. Authenticated API:

- `GET /api/notifications/preferences` returns `{ marketplaceEmail, language }`.
- `PUT /api/notifications/preferences` takes `{ marketplaceEmail: false, language: "es" }`.
  marketplaceEmail is required; language can be en, es, null, or omitted. Omitting
  preserves the current override; null falls back to the user's profile language.

Marketplace email defaults to enabled when no preference exists, subject to the
global rollout flag. Preferences and the recipient's current email are checked
both at enqueue and before delivery. English is the fallback; Spanish, Español,
es, and es-* / es_* are normalized to es. Free-form profile language is preserved.
Templates contain server-controlled text and links, not comments or deliverables.
The email action links to the homepage configured in CLIENT_URL. The instruction
to manage email preferences in Edit Profile is plain text, without a link.

## Reliability and operations

- One outbox row per notification is enforced by a unique key. Callers that replay
  a logical event may supply a stable, recipient-specific eventKey to deduplicate
  notification creation too. Do not use only escrow ID for repeatable events such
  as submissions or reopenings. Existing escrow callers do not supply replay keys.
  Notification event keys expire with the existing notification cleanup policy.
- SMTP delivery is at least once. A crash after provider acceptance but before
  marking sent can cause a duplicate; a stable Message-ID helps identification but
  does not guarantee provider deduplication. Sent means SMTP accepted, not inbox delivery.
- Temporary errors retry after 1, 2, 4, and 8 minutes, with five total attempts.
  Permanent SMTP 5xx errors fail immediately except authentication errors, which
  use the retry budget. Interrupted attempts count toward that budget.
- Logs include outbox ID, attempt count, status and allowlisted error codes only.
  No email body, address, SMTP response, or credentials are logged. lastError stores
  the same sanitized code. Monitor `email_worker_batch_failed`,
  `notification_creation_failed`, failed jobs, and the age of pending jobs.
- After resolving a failure, retry a specific reviewed job with
  `UPDATE email_outbox SET status='pending', attempts=0, nextAttemptAt=NOW(), lastError=NULL WHERE id=<job_id> AND status='failed';`.
  Confirm it was not already delivered before resetting an interrupted job.
- To pause mail, stop the worker and disable the API flag. Already queued jobs are
  retained. Sent/failed rows are not automatically deleted; set a retention policy
  appropriate for operational diagnosis before adding cleanup.
- Business updates still use the legacy connection outside this notification
  transaction. A crash between a business update and calling the helper can lose
  a notification. Full business-event atomicity requires migrating those operations
  into the same transaction; this rollout guarantees atomicity once the helper runs.

`npm test` runs isolated tests for service policy, transactions, templates, delivery
retry behavior, worker locking and social authorization. Tests do not connect to
the deployment database or send mail. Run the staging checks above against real
MySQL and the chosen SMTP provider before activation.

Transport configuration follows the [Nodemailer SMTP documentation](https://nodemailer.com/smtp).
For Gmail pilot limitations, see [Nodemailer's Gmail guidance](https://nodemailer.com/guides/using-gmail).
The same SMTP interface supports a production provider without changing templates.
