import express from "express";
import {
  getServices,
  createService,
  updateService,
  deleteService,
} from "../controllers/service.js";
import { validateToken, optionalToken } from "../jwt.js";
import {
  privateNoStore,
  refreshViewer,
  requireRoles,
} from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);

router.get("/", optionalToken(), refreshViewer, getServices);
router.post(
  "/",
  validateToken(),
  refreshViewer,
  requireRoles("student"),
  createService,
);
router.put(
  "/:id",
  validateToken(),
  refreshViewer,
  requireRoles("student"),
  updateService,
);
router.delete("/:id", validateToken(), refreshViewer, deleteService);

export default router;
