

import express from 'express';
import {
  createCalendarEntry,
  getCalendarByDate,
  getAllCalendarEntries,
  getCalendarBySessionwithtimerange,
  bookSeats,
  getAllBookingsWithDetails,
 getAllBookingsSimple,

  cancelBooking,
  getUserBookings
} from '../controllers/calenderController.js';
import { protect } from '../middleware/authMiddleware.js';
import { verifyAdmin } from '../middleware/adminMiddleware.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Calendar routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Public routes
router.get('/', getCalendarByDate);  
router.get('/all', getAllCalendarEntries);                     // Get calendar entries by date
router.get('/session', getCalendarBySessionwithtimerange);
router.get('/bookings/all', protect, getAllBookingsWithDetails); 
router.get('/bookings', getAllBookingsSimple);  // Get calendar by session and time range

// Protected routes for all users
router.post('/:calendarId/book', protect, bookSeats);                         // Book seats
router.delete('/:calendarId/bookings/:bookingId', protect, cancelBooking);    // Cancel booking
router.get('/user/:userId/bookings', protect, getUserBookings);               // Get user bookings

// Admin routes
router.post('/new', protect, verifyAdmin, createCalendarEntry);                  // Create calendar entry

export default router;