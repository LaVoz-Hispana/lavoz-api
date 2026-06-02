import express from "express";
import { getProjects, getProjectsByLocal, getProjectById, createProject, updateProject, deleteProject } from "../controllers/project.js";
import { validateToken, optionalToken } from "../jwt.js";

const router = express.Router();

router.get("/",         optionalToken(),          getProjects);
router.get("/mine",     validateToken(["local"]), getProjectsByLocal);
router.get("/:id",      optionalToken(),          getProjectById);
router.post("/",        validateToken(["local"]), createProject);
router.put("/:id",      validateToken(["local"]), updateProject);
router.delete("/:id",   validateToken(["local"]), deleteProject);

export default router;
