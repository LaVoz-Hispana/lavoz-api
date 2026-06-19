import express from "express";
import { getMessages, addMessage, getAllMessages, getNewMessages, markAsRead } from "../controllers/message.js";
import { validateToken } from "../jwt.js";

const router = express.Router()

router.get("/", validateToken(), getMessages);
router.get("/new", validateToken(), getNewMessages);
router.get("/all", validateToken(), getAllMessages);
router.post("/", validateToken(), addMessage);
router.put("/markRead", validateToken(), markAsRead);

export default router
