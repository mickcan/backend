import express from "express";
import {
  inviteUser,
  getAllUsers,
  editUser,
  deleteUser,
  getUserBookings,
  getUserRecurringReservations,
} from "../controllers/adminController.js";

import { protect, adminOnly } from "../middleware/authMiddleware.js";
import {
  getAllBookings,
  adminCancelBooking,
  adminDeleteBooking,
} from "../controllers/bookingController.js";
import {
  changeAdmin,
  adminForgotPassword,
  adminResetPassword,
} from "../controllers/authController.js";

const router = express.Router();

// Apply authentication middleware
// router.use(protect);
// router.use(adminOnly);

// Admin management routes
router.post("/change-admin", changeAdmin);
router.post("/forgot-password", adminForgotPassword);
router.post("/reset-password/:token", adminResetPassword);

// User management routes
router.post("/invite", inviteUser);
router.get("/users", getAllUsers);
router.get("/users/:userId/bookings", getUserBookings);
router.put("/users/:id", editUser);
router.delete("/users/:id", deleteUser);

// Add route to get all bookings (admin only)
router.get("/bookings", protect, adminOnly, getAllBookings);

// Add route for admin to cancel any booking
router.patch(
  "/bookings/:bookingId/cancel",
  protect,
  adminOnly,
  adminCancelBooking
);

// Add route for admin to completely delete a booking
router.delete("/bookings/:bookingId", protect, adminOnly, adminDeleteBooking);

// Add manual trigger for updating booking statuses
router.post(
  "/update-booking-statuses",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const result = await updateBookingStatuses();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to update booking statuses",
        error: error.message,
      });
    }
  }
);

router.get(
  "/users/:userId/recurring-reservations",
  getUserRecurringReservations
);

export default router;
