import express from "express";
import {
  getMessages,
  addMessage,
  getAllMessages,
  getNewMessages,
  markAsRead,
  getMessageParticipant,
} from "../controllers/message.js";
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);
router.use(validateToken(), refreshViewer);

router.get("/", getMessages);
router.get("/new", getNewMessages);
router.get("/all", getAllMessages);
router.get("/participant/:userId", getMessageParticipant);
router.post("/", addMessage);
router.put("/markRead", markAsRead);

export default router;
