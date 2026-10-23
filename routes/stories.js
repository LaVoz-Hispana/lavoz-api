import express from "express";
import { getStories, addStory, deleteStory } from "../controllers/story.js"
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router()
router.use(privateNoStore);

router.get("/", validateToken(), refreshViewer, getStories);
router.post("/", validateToken(), addStory);
router.delete("/:id", validateToken(), deleteStory);

export default router
