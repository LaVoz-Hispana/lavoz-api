import express from "express";
import { getRelationships, addRelationship, deleteRelationship, followUser, unfollowUser } from "../controllers/relationship.js";
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router()
router.use(privateNoStore);

router.get("/", validateToken(), refreshViewer, getRelationships);
router.post("/", validateToken(), refreshViewer, addRelationship);
router.post("/follow", validateToken(), refreshViewer, followUser);
router.delete("/", validateToken(), refreshViewer, deleteRelationship);
router.delete("/unfollow", validateToken(), refreshViewer, unfollowUser);

export default router
