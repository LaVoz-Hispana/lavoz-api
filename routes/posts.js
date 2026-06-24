import express from "express";
import { addJob, getLatestNews, getTopPosts, getJobs, deleteJob, deleteEvent, addShort, getShorts, deleteShort } from "../controllers/post.js";
import { getPosts, getProjectPosts, findPost, getEvents, addPost, addEvent, deletePost } from "../controllers/post.js"
import { validateToken } from "../jwt.js";

const router = express.Router()

router.get("/", getPosts);
router.get("/find", findPost);
router.get("/project/:projectId", getProjectPosts);
router.get("/top", getTopPosts);
router.get("/latestNews", getLatestNews);
router.get("/shorts", getShorts);
router.get("/events", getEvents);
router.get("/jobs", getJobs);
router.post("/addPost", validateToken(), addPost);
router.post("/event", validateToken(), addEvent);
router.post("/job", validateToken(), addJob);
router.post("/short", validateToken(), addShort);
router.delete("/:id", validateToken(), deletePost);
router.delete("/jobs/:id", validateToken(), deleteJob);
router.delete("/events/:id", validateToken(), deleteEvent);
router.delete("/shorts/:id", validateToken(), deleteShort);

export default router
