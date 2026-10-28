import express from "express";
import {
  login,
  register,
  logout,
  sendRecoveryEmail,
  resetPassword,
} from "../controllers/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/send_recovery_email", sendRecoveryEmail);
router.put("/resetPassword", resetPassword);

export default router;
