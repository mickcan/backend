import express from "express";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

import {
  createRecurringBooking,
  checkRoomAvailability,
  handleStripeWebhook,
  testAvailability,
} from "../controllers/recurringBookingController.js";

import {
  getAllUsers,
  getTimeSlots,
  getAvailableRooms,
  createRecurringBookingGroup,
  cancelRecurringBookingGroup,
  deleteRecurringBookingGroup,
} from "../controllers/recurringModalController.js";

const router = express.Router();

// Modal-related routes (no auth for modal dropdowns, add auth if needed)
router.get("/modal/users", getAllUsers);
router.get("/modal/time-slots", getTimeSlots);
router.post("/modal/available-rooms", getAvailableRooms);

// Create recurring booking group (admin only)
router.post(
  "/modal/recurring-group",

  createRecurringBookingGroup
);
router.post("/cancel-recurring-group", cancelRecurringBookingGroup);

// Delete recurring booking group (hard delete)
router.post("/delete-recurring-group", deleteRecurringBookingGroup);

// Create recurring booking
router.post("/recurring", createRecurringBooking);

// Check room availability for recurring booking
router.get("/availability", protect, adminOnly, checkRoomAvailability);

// Test endpoint for debugging
router.get("/test", protect, adminOnly, testAvailability);

// Stripe webhook
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

export default router;
