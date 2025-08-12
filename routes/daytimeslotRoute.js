


// routes/daytimeslotRoute.js
import express from 'express';
import {
  createDayTimeSlot,
  getTimeSlots,
  getTimeSlotById,
  updateTimeSlot,
  deleteTimeSlot,
  getUpcomingTimeSlots
} from '../controllers/daytimeslotController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'DayTimeSlot routes are working!',
    timestamp: new Date().toISOString()
  });
});

// PUBLIC ROUTES (users can view slots)
router.get('/', getTimeSlots);                        // Get all time slots with filtering
router.get('/upcoming', getUpcomingTimeSlots);        // Get upcoming time slots for next 7 days
router.get('/:id', getTimeSlotById);                  // Get specific slot by ID

// ADMIN ONLY ROUTES (manage time slots)
router.post('/', protect, adminOnly, createDayTimeSlot);      // Create day time slot
router.put('/:id', protect, adminOnly, updateTimeSlot);       // Update day time slot
router.delete('/:id', protect, adminOnly, deleteTimeSlot);    // Delete day time slot

export default router;