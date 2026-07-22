import express from "express";
import { getServices, createService, updateService, deleteService } from "../controllers/service.js";
import { validateToken, optionalToken } from "../jwt.js";

const router = express.Router();

router.get("/",       optionalToken(),             getServices);
router.post("/",      validateToken(["student"]),  createService);
router.put("/:id",    validateToken(["student"]),  updateService);
router.delete("/:id", validateToken(),             deleteService);

export default router;
