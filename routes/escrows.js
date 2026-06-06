import express from "express";
import {
    createEscrow, createEscrowByLocal,
    getAllEscrows, getMyEscrows, getEscrowById,
    updateEscrowStatus,
    completeEscrow, reopenEscrow,
    acceptEscrow, cancelEscrowByStudent,
    getEscrowEvents,
} from "../controllers/escrow.js";
import { finalizeEscrow } from "../controllers/milestone.js";
import { validateToken } from "../jwt.js";

const router = express.Router();

router.post("/",              validateToken(["admin"]),            createEscrow);
router.post("/invite",        validateToken(["local"]),            createEscrowByLocal);
router.get("/",               validateToken(["admin"]),            getAllEscrows);
router.get("/mine",           validateToken(["student", "local"]), getMyEscrows);
router.get("/me",             validateToken(["student", "local"]), getMyEscrows);
router.get("/:id",            validateToken(),                     getEscrowById);
router.get("/:id/events",    validateToken(),                     getEscrowEvents);
router.put("/:id/status",     validateToken(),                     updateEscrowStatus);
router.post("/:id/submit",    (_, res) => res.status(410).json({ error: "This endpoint has moved. Use POST /api/escrows/:id/milestones/:mid/submit instead." }));
router.post("/:id/finalize",  validateToken(["local"]),            finalizeEscrow);
router.put("/:id/complete",   validateToken(["local"]),            completeEscrow);
router.put("/:id/reopen",     validateToken(["local"]),            reopenEscrow);
router.put("/:id/accept",     validateToken(["student"]),          acceptEscrow);
router.put("/:id/cancel",     validateToken(["student"]),          cancelEscrowByStudent);

export default router;
