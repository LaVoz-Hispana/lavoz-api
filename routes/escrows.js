import express from "express";
import {
  createEscrow,
  createEscrowByLocal,
  getAllEscrows,
  getMyEscrows,
  getEscrowById,
  updateEscrowStatus,
  completeEscrow,
  reopenEscrow,
  acceptEscrow,
  cancelEscrowByStudent,
  getEscrowEvents,
} from "../controllers/escrow.js";
import { finalizeEscrow } from "../controllers/milestone.js";
import { validateToken } from "../jwt.js";
import {
  privateNoStore,
  refreshViewer,
  requireRoles,
} from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);
router.use(validateToken(), refreshViewer);

router.post("/", requireRoles("admin"), createEscrow);
router.post("/invite", requireRoles("local"), createEscrowByLocal);
router.get("/", requireRoles("admin"), getAllEscrows);
router.get("/mine", requireRoles("student", "local"), getMyEscrows);
router.get("/me", requireRoles("student", "local"), getMyEscrows);
router.get("/:id", getEscrowById);
router.get("/:id/events", getEscrowEvents);
router.put("/:id/status", updateEscrowStatus);
router.post("/:id/submit", (_, res) =>
  res.status(410).json({
    error:
      "This endpoint has moved. Use POST /api/escrows/:id/milestones/:mid/submit instead.",
  }),
);
router.post("/:id/finalize", requireRoles("local"), finalizeEscrow);
router.put("/:id/complete", requireRoles("local"), completeEscrow);
router.put("/:id/reopen", requireRoles("local"), reopenEscrow);
router.put("/:id/accept", requireRoles("student"), acceptEscrow);
router.put("/:id/cancel", requireRoles("student"), cancelEscrowByStudent);

export default router;
