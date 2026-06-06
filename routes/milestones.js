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

// mergeParams gives access to :id from the parent mount path
const router = express.Router({ mergeParams: true });

router.post("/",                    validateToken(["local"]),            createMilestone);
router.get("/",                     validateToken(),                     getMilestonesByEscrow);
router.put("/:mid",                 validateToken(["local"]),            updateMilestone);
router.delete("/:mid",              validateToken(["local"]),            deleteMilestone);
router.put("/:mid/approve",         validateToken(["local"]),            approveMilestone);
router.put("/:mid/request-changes", validateToken(["local"]),            requestMilestoneChanges);
router.post("/:mid/submit",         validateToken(["student"]),          submitArtifact);

export default router;
