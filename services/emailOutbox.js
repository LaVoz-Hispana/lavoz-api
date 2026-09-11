import { marketplaceTypes, renderNotification } from "./notificationTemplates.js";

export const MAX_ATTEMPTS = 5;
// Store only known codes, never SMTP responses (which can contain addresses).
export function deliveryError(error) {
  const code = ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EENVELOPE", "EMESSAGE", "EDNS", "ECONNRESET", "ECONNREFUSED"].includes(error?.code)
    ? error.code : "DELIVERY_ERROR";
  const status = Number(error?.responseCode);
  return `${code}${Number.isInteger(status) && status >= 400 && status <= 599 ? `:${status}` : ""}`;
}

export async function deliverOutboxRow({ row, query, sendMail, from, clientUrl, log = console.info }) {
  // Recheck preferences and current address so queued mail respects opt-outs.
  const [recipient] = await query(
    "SELECT u.email, COALESCE(p.language, u.language) AS language, COALESCE(p.marketplaceEmail, 1) AS enabled FROM users u LEFT JOIN notification_preferences p ON p.userId = u.id WHERE u.id = ?",
    [row.userTo],
  );
  if (!recipient?.email || !recipient.enabled || !marketplaceTypes.has(row.type)) {
    await query("UPDATE email_outbox SET status = 'cancelled' WHERE id = ?", [row.id]);
    log("email_outbox_cancelled", { id: row.id });
    return;
  }
  try {
    const mail = renderNotification(row, recipient.language, clientUrl);
    const info = await sendMail({
      ...mail, from, to: { address: recipient.email },
      messageId: `<notification-${row.notificationId}@${new URL(clientUrl).hostname}>`,
    });
    if (!info?.accepted?.length) throw Object.assign(new Error("No recipient accepted"), { code: "EENVELOPE" });
  } catch (error) {
    const lastError = deliveryError(error);
    const permanent = Number(error?.responseCode) >= 500 && error.code !== "EAUTH";
    const status = permanent || row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    const delay = Math.min(3600, 60 * 2 ** (row.attempts - 1));
    await query("UPDATE email_outbox SET status = ?, lastError = ?, nextAttemptAt = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?",
      [status, lastError, delay, row.id]);
    log("email_outbox_delivery_failed", { id: row.id, attempts: row.attempts, status, error: lastError });
    return;
  }
  // A DB failure after SMTP acceptance is intentionally not recorded as an SMTP failure.
  await query("UPDATE email_outbox SET status = 'sent', sentAt = NOW(), lastError = NULL WHERE id = ?", [row.id]);
  log("email_outbox_sent", { id: row.id, attempts: row.attempts });
}

export async function processOutbox({ query, shouldStop = () => false, ...delivery }) {
  // One database-scoped lock, held on this dedicated connection through delivery.
  // MySQL releases it when a worker dies; overlapping workers do no work.
  const lockName = "SHA2(CONCAT(DATABASE(), ':notification-email-worker'), 256)";
  const [lock] = await query(`SELECT GET_LOCK(${lockName}, 0) AS acquired`);
  if (Number(lock.acquired) !== 1) return 0;
  let processed = 0;
  try {
    await query("UPDATE email_outbox SET status = IF(attempts >= ?, 'failed', 'pending'), lastError = 'WORKER_INTERRUPTED' WHERE status = 'processing'", [MAX_ATTEMPTS]);
    while (!shouldStop() && processed < 25) {
      const [row] = await query("SELECT * FROM email_outbox WHERE status = 'pending' AND nextAttemptAt <= NOW() ORDER BY id LIMIT 1");
      if (!row) break;
      await query("UPDATE email_outbox SET status = 'processing', attempts = attempts + 1 WHERE id = ?", [row.id]);
      row.attempts += 1;
      await deliverOutboxRow({ ...delivery, query, row });
      processed += 1;
    }
    return processed;
  } finally {
    await query(`SELECT RELEASE_LOCK(${lockName})`);
  }
}
