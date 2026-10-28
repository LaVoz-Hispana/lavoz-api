import express from "express";
import {
  addJob,
  getLatestNews,
  getTopPosts,
  getJobs,
  deleteJob,
  deleteEvent,
  addShort,
  getShorts,
  deleteShort,
} from "../controllers/post.js";
import {
  getPosts,
  getProjectPosts,
  getAdminPosts,
  findPost,
  getEvents,
  addPost,
  addAdminPost,
  addEvent,
  deletePost,
} from "../controllers/post.js";
import { optionalToken, validateToken } from "../jwt.js";
import { privateNoStore, refreshViewer } from "../services/studentPrivacy.js";

const router = express.Router();
router.use(privateNoStore);

const viewer = [optionalToken(), refreshViewer];
router.get("/", viewer, getPosts);
router.get("/find", viewer, findPost);
router.get("/project/:projectId", viewer, getProjectPosts);
router.get("/admin", validateToken(["admin"]), refreshViewer, getAdminPosts);
router.get("/top", viewer, getTopPosts);
router.get("/latestNews", viewer, getLatestNews);
router.get("/shorts", viewer, getShorts);
router.get("/events", viewer, getEvents);
router.get("/jobs", viewer, getJobs);
router.post("/addPost", validateToken(), addPost);
router.post("/admin", validateToken(["admin"]), addAdminPost);
router.post("/event", validateToken(), addEvent);
router.post("/job", validateToken(), addJob);
router.post("/short", validateToken(), addShort);
router.delete("/:id", validateToken(), deletePost);
router.delete("/jobs/:id", validateToken(), deleteJob);
router.delete("/events/:id", validateToken(), deleteEvent);
router.delete("/shorts/:id", validateToken(), deleteShort);

export default router;
