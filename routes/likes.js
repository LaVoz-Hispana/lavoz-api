import express from "express";
import { getLikes, getShortLikes, getReaction, addLike, addShortLike, deleteLike, deleteShortLike } from "../controllers/like.js";
import { optionalToken, validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router()
router.use(privateNoStore);

router.get("/", optionalToken(), refreshViewer, getLikes);
router.get("/shorts", optionalToken(), refreshViewer, getShortLikes);
router.get("/single", getReaction);
router.post("/", validateToken(), addLike);
router.post("/shorts", validateToken(), addShortLike);
router.delete("/", validateToken(), deleteLike);
router.delete("/shorts", validateToken(), deleteShortLike);

export default router
