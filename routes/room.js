import express from "express";
const router = express.Router();
const {
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  deleteRoomImage,
} = require("../controllers/roomController");
const adminAuth = require("../middleware/adminAuth");
const upload = require("../middleware/upload");

// Public routes
router.get("/", getAllRooms);
router.get("/:id", getRoomById);

// Admin protected routes
router.post("/", adminAuth, upload.array("images", 5), createRoom);
router.put("/:id", adminAuth, upload.array("images", 5), updateRoom);
router.delete("/:id", adminAuth, deleteRoom);
router.delete("/:roomId/images/:imageId", adminAuth, deleteRoomImage);

export default router;
