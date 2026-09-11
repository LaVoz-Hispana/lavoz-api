import { marketplaceTypes, notificationTypes } from "./notificationTemplates.js";

export function notificationService({ transaction, emailEnabled = () => false }) {
  return async function createNotification({ userTo, userFrom, type, objectId = null, postId = null, eventKey = null }) {
    for (const id of [userTo, userFrom]) {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error("Invalid notification user");
    }
    if (Number(userTo) === Number(userFrom)) return { suppressed: true };
    if (!notificationTypes.has(type)) throw new Error("Unknown notification type");
    const linkId = type === "follow" ? userFrom : marketplaceTypes.has(type) ? objectId : postId;
    if (!Number.isSafeInteger(Number(linkId)) || Number(linkId) <= 0) throw new Error("Invalid notification link");
    if (eventKey !== null && (typeof eventKey !== "string" || !eventKey.length || eventKey.length > 191)) {
      throw new Error("Invalid notification event key");
    }
    return transaction(async (query) => {
      const inserted = await query(
        "INSERT INTO notifications (userTo, userFrom, type, createdAt, objectId, postId, eventKey) VALUES (?, ?, ?, NOW(), ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
        [userTo, userFrom, type, objectId, postId, eventKey],
      );
      const notificationId = inserted.insertId;
      // FOUND_ROWS is disabled: a duplicate no-op reports zero affected rows.
      if (inserted.affectedRows !== 1 || !emailEnabled() || !marketplaceTypes.has(type)) {
        return { notificationId, queued: false };
      }
      const [recipient] = await query(
        "SELECT u.email, COALESCE(p.marketplaceEmail, 1) AS enabled FROM users u LEFT JOIN notification_preferences p ON p.userId = u.id WHERE u.id = ?",
        [userTo],
      );
      if (!recipient?.email || !recipient.enabled) return { notificationId, queued: false };
      await query(
        "INSERT INTO email_outbox (notificationId, userTo, userFrom, type, objectId, postId) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE notificationId = VALUES(notificationId)",
        [notificationId, userTo, userFrom, type, objectId, postId],
      );
      return { notificationId, queued: true };
    });
  };
}
