import express from "express";
import {
  getProjects,
  getProjectsByLocal,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  closeProject,
} from "../controllers/project.js";
import { validateToken, optionalToken } from "../jwt.js";
import { refreshViewer, requireRoles } from "../services/studentPrivacy.js";

const router = express.Router();

router.get("/", optionalToken(), getProjects);
router.get(
  "/mine",
  validateToken(),
  refreshViewer,
  requireRoles("local"),
  getProjectsByLocal,
);
router.get("/:id", optionalToken(), getProjectById);
router.post(
  "/",
  validateToken(),
  refreshViewer,
  requireRoles("local"),
  createProject,
);
router.put(
  "/:id/close",
  validateToken(),
  refreshViewer,
  requireRoles("local"),
  closeProject,
);
router.put(
  "/:id",
  validateToken(),
  refreshViewer,
  requireRoles("local"),
  updateProject,
);
router.delete(
  "/:id",
  validateToken(),
  refreshViewer,
  requireRoles("local"),
  deleteProject,
);

export default router;
