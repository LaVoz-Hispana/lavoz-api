import express from "express";
import { getUser, getAllUsers, updateUser, getFollowers, getFollowing } from "../controllers/user.js";
import { validateToken, optionalToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router()

router.use(privateNoStore);
router.get("/find/:userId", validateToken(), refreshViewer, getUser);
router.get("/", optionalToken(), refreshViewer, getAllUsers);
router.get("/followers", validateToken(), refreshViewer, getFollowers);
router.get("/following", validateToken(), refreshViewer, getFollowing);
router.put("/", validateToken(), refreshViewer, updateUser);

export default router
