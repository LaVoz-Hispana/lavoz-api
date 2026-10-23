import express from "express";
import { getApprovedAds, getPendingAds, postAd, approveAd } from "../controllers/ad.js";
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router()
router.use(privateNoStore);

router.get("/ads", validateToken(), refreshViewer, getApprovedAds);
router.get("/pending", validateToken(), refreshViewer, getPendingAds);
router.put("/", validateToken(), approveAd);
router.post("/", validateToken(), postAd);

export default router
