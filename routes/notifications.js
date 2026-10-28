import express from "express";
import {
  getNotifications,
  getNewNotifications,
  getLikeNotif,
  getFollowNotif,
  getCommentNotif,
  clearNotifAlert,
} from "../controllers/notification.js";
import { validateToken } from "../jwt.js";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../controllers/notificationPreferences.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);
router.use(validateToken(), refreshViewer);

router.get("/preferences", getNotificationPreferences);
router.put("/preferences", updateNotificationPreferences);

router.get("/all", getNotifications);
router.get("/new", getNewNotifications);
router.get("/like", getLikeNotif);
router.get("/follow", getFollowNotif);
router.get("/comment", getCommentNotif);
router.put("/clearAlert", clearNotifAlert);

export default router;
