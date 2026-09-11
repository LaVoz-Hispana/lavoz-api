import { withTransaction } from "../services/notificationDb.js";
import { notificationService } from "../services/notificationService.js";

export const createNotification = notificationService({
  transaction: withTransaction,
  emailEnabled: () => process.env.NOTIFICATION_EMAIL_ENABLED === "true",
});

// Existing callback controllers can inspect the returned persistence result.
export const sendNotification = (userTo, userFrom, type, objectId = null, postId = null) =>
  createNotification({ userTo, userFrom, type, objectId, postId }).catch(() => {
    console.error("notification_creation_failed", { type });
    return { failed: true };
  });
