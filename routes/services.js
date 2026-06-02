import express from "express";
import { getServices, createService, deleteService } from "../controllers/service.js";
import { validateToken, optionalToken } from "../jwt.js";

const router = express.Router();

router.get("/",       optionalToken(),             getServices);
router.post("/",      validateToken(["student"]),  createService);
router.delete("/:id", validateToken(),             deleteService);

export default router;
