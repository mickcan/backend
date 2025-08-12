import express from 'express';
import { 
  getAllSettings,
  updateTimeSlots,
  updateBookingRules,
  getTimeSlots,
  getBookingRules
} from '../controllers/settingsController.js';


const router = express.Router();


router.get('/', getAllSettings);

// Time slot routes
router.get('/time-slots', getTimeSlots);
router.post('/time-slots', updateTimeSlots);
router.put('/time-slots', updateTimeSlots);

// Booking rules routes
router.get('/booking-rules', getBookingRules);
router.post('/booking-rules', updateBookingRules);
router.put('/booking-rules', updateBookingRules);

export default router; 