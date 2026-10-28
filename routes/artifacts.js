import express from "express";
import {
  getArtifactsByEscrow,
  deleteArtifact,
} from "../controllers/artifact.js";
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);
router.use(validateToken(), refreshViewer);

router.get("/:escrowId", getArtifactsByEscrow);
router.delete("/:id", deleteArtifact);

export default router;
