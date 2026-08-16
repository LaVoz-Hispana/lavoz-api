import express from "express";
import { createSponsor, deleteSponsor, getSponsorSection, getSponsors, updateSponsor, updateSponsorSection } from "../controllers/sponsor.js";
import { validateToken } from "../jwt.js";

const router = express.Router();

router.get("/", getSponsors);
router.get("/section", getSponsorSection);
router.put("/section", validateToken(["admin"]), updateSponsorSection);
router.post("/", validateToken(["admin"]), createSponsor);
router.put("/:id", validateToken(["admin"]), updateSponsor);
router.delete("/:id", validateToken(["admin"]), deleteSponsor);

export default router;
