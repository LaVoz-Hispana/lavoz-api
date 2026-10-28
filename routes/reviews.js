import express from "express";
import {
  createReview,
  getEscrowReview,
  getCompletedProjectsForUser,
  getUserReviews,
  updateReview,
} from "../controllers/review.js";
import { optionalToken, validateToken } from "../jwt.js";
import {
  privateNoStore,
  refreshViewer,
  requireRoles,
} from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);

router.get(
  "/completed-projects/:userId",
  optionalToken(),
  refreshViewer,
  getCompletedProjectsForUser,
);
router.get("/users/:userId", optionalToken(), refreshViewer, getUserReviews);
router.get(
  "/escrows/:escrowId",
  validateToken(),
  refreshViewer,
  requireRoles("student", "local"),
  getEscrowReview,
);
router.post(
  "/escrows/:escrowId",
  validateToken(),
  refreshViewer,
  requireRoles("student", "local"),
  createReview,
);
router.put(
  "/:reviewId",
  validateToken(),
  refreshViewer,
  requireRoles("student", "local"),
  updateReview,
);

export default router;
