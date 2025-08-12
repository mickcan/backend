import express from "express";
import {
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  deleteRoomImage,
  getAvailableRoomsByTimeSlot,
  getRoomBookingsByUser,
} from "../controllers/roomController.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import multer from "multer";
import { handleCloudinaryUpload } from "../middleware/cloudinaryUpload.js";

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Test route
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Room routes are working!",
  });
});

// PUBLIC ROUTES (for users to view rooms)
router.get("/", getAllRooms); // Get all rooms
router.get("/available", getAvailableRoomsByTimeSlot); // Get rooms available for specific time slot
router.get("/:id", getRoomById); // Get specific room details

// ADMIN ONLY ROUTES (for room management)
router.post(
  "/",
  verifyAdmin,
  upload.array("images", 10),
  handleCloudinaryUpload,
  createRoom
);

router.put(
  "/:id",
  verifyAdmin,
  upload.array("images", 10),
  handleCloudinaryUpload,
  updateRoom
);

router.delete("/:id", deleteRoom); // Delete room
router.delete("/:roomId/images/:imageId", deleteRoomImage); // Delete room image

// Get room bookings by specific user
// Supports both simple and recurring bookings. For recurring, use ?recurring=true&groupId=...
router.get("/:roomId/bookings/:userId", getRoomBookingsByUser);

export default router;
