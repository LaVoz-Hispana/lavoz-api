import { notificationPool, query } from "../services/notificationDb.js";
import { normalizeLanguage } from "../services/notificationTemplates.js";

export async function getNotificationPreferences(req, res) {
  try {
    const [row] = await query(notificationPool,
      "SELECT COALESCE(p.marketplaceEmail, 1) AS marketplaceEmail, COALESCE(p.language, u.language) AS language FROM users u LEFT JOIN notification_preferences p ON p.userId = u.id WHERE u.id = ?", [req.user.id]);
    if (!row) return res.status(404).json({ error: "User not found." });
    return res.json({ marketplaceEmail: Boolean(row.marketplaceEmail), language: normalizeLanguage(row.language) });
  } catch {
    return res.status(500).json({ error: "Unable to load notification preferences." });
  }
}

export async function updateNotificationPreferences(req, res) {
  const { marketplaceEmail, language } = req.body;
  if (typeof marketplaceEmail !== "boolean" || ![undefined, null, "en", "es"].includes(language)) {
    return res.status(400).json({ error: "marketplaceEmail must be a boolean; language must be en, es, or null." });
  }
  try {
    if (language === undefined) {
      await query(notificationPool,
        "INSERT INTO notification_preferences (userId, marketplaceEmail) VALUES (?, ?) ON DUPLICATE KEY UPDATE marketplaceEmail = VALUES(marketplaceEmail)",
        [req.user.id, marketplaceEmail]);
    } else {
      await query(notificationPool,
        "INSERT INTO notification_preferences (userId, marketplaceEmail, language) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE marketplaceEmail = VALUES(marketplaceEmail), language = VALUES(language)",
        [req.user.id, marketplaceEmail, language]);
    }
    return getNotificationPreferences(req, res);
  } catch {
    return res.status(500).json({ error: "Unable to save notification preferences." });
  }
}
