import express from 'express';
import { 
    createBooking, 
    getUserBookings, 
    getRoomBookings, 
    cancelBooking, 
    getBookingById,
    getBookedRooms,
  
} from '../controllers/bookingController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(protect);


// Create a new booking
router.post('/', createBooking);

// Get bookings for the logged-in user
router.get('/my-bookings', getUserBookings);

// Check which rooms are booked for a specific date and time slot
router.get('/check-booked-rooms', getBookedRooms);

// Get booking by ID
router.get('/:bookingId', getBookingById);

// Get bookings for a specific room
router.get('/room/:roomId', getRoomBookings);

// Cancel a booking
router.patch('/:bookingId/cancel', cancelBooking);

export default router; 