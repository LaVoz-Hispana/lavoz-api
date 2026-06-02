import express from "express";
import { getUser, getAllUsers, updateUser, getFollowers, getFollowing } from "../controllers/user.js";
import { validateToken, optionalToken } from "../jwt.js";

const router = express.Router()

router.get("/find/:userId", getUser);
router.get("/", optionalToken(), getAllUsers);
router.get("/followers", validateToken(), getFollowers);
router.get("/following", validateToken(), getFollowing);
router.put("/", validateToken(), updateUser);

export default router
