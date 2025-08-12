import express from 'express';
import * as weekdaysController from '../controllers/weekdaysController.js';

const router = express.Router();

// GET weekday time slots
router.get('/', weekdaysController.getWeekdayTimeSlots);

// POST to get available time slots with custom settings
router.post('/available', weekdaysController.getAvailableTimeSlots);

export default router; 