import express from "express";
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
} = require("../controllers/authController");
const adminAuth = require("../middleware/adminAuth");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes (requires authentication)
router.get("/profile", adminAuth, getProfile);
router.put("/profile", adminAuth, updateProfile);

export default router;
