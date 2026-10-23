import express from "express";
import {
    createMilestone,
    getMilestonesByEscrow,
    updateMilestone,
    deleteMilestone,
    approveMilestone,
    requestMilestoneChanges,
} from "../controllers/milestone.js";
import { submitArtifact } from "../controllers/artifact.js";
import { validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer, requireRoles } from "../services/studentPrivacy.js";

// mergeParams gives access to :id from the parent mount path
const router = express.Router({ mergeParams: true });
router.use(privateNoStore);
router.use(validateToken(), refreshViewer);

router.post("/",                    requireRoles("local"),   createMilestone);
router.get("/",                     getMilestonesByEscrow);
router.put("/:mid",                 requireRoles("local"),   updateMilestone);
router.delete("/:mid",              requireRoles("local"),   deleteMilestone);
router.put("/:mid/approve",         requireRoles("local"),   approveMilestone);
router.put("/:mid/request-changes", requireRoles("local"),   requestMilestoneChanges);
router.post("/:mid/submit",         requireRoles("student"), submitArtifact);

export default router;
