import express from "express";
import { getComments, addComment, getCommentDesc } from "../controllers/comment.js";
import { optionalToken, validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);

router.get("/", optionalToken(), refreshViewer, getComments);
router.get("/desc", getCommentDesc);
router.post("/", validateToken(), addComment);

export default router;
