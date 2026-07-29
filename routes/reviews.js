import express from "express";
import { createReview, getCompletedProjectsForUser, getUserReviews, updateReview } from "../controllers/review.js";
import { optionalToken, validateToken } from "../jwt.js";

const router = express.Router();

router.get("/completed-projects/:userId", optionalToken(), getCompletedProjectsForUser);
router.get("/users/:userId", getUserReviews);
router.post("/escrows/:escrowId", validateToken(["student", "local"]), createReview);
router.put("/:reviewId", validateToken(["student", "local"]), updateReview);

export default router;
