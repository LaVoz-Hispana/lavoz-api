import express from "express";
import { getNotifications, getNewNotifications, getLikeNotif, getFollowNotif, getCommentNotif, clearNotifAlert } from "../controllers/notification.js";
import { validateToken } from "../jwt.js";

const router = express.Router()

router.get("/all", validateToken(), getNotifications);
router.get("/new", validateToken(), getNewNotifications);
router.get("/like", validateToken(), getLikeNotif);
router.get("/follow", validateToken(), getFollowNotif);
router.get("/comment", validateToken(), getCommentNotif);
router.put("/clearAlert", validateToken(), clearNotifAlert);

export default router
