import express from "express";
import { createSponsor, deleteSponsor, getSponsors } from "../controllers/sponsor.js";
import { validateToken } from "../jwt.js";

const router = express.Router();

router.get("/", getSponsors);
router.post("/", validateToken(["admin"]), createSponsor);
router.delete("/:id", validateToken(["admin"]), deleteSponsor);

export default router;
