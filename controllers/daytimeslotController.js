

import DayTimeSlot from '../models/daytimeslot.js';
import Room from '../models/room.js';
import Calendar from '../models/calender.js';

// Create DayTimeSlot with date and auto-calculate day
const createDayTimeSlot = async (req, res) => {
  try {
    const { date, dayTime, slotName, startTime, endTime, isActive } = req.body;

    // Validate required fields
    if (!date || !dayTime || !slotName || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Date, dayTime, slotName, startTime, and endTime are required'
      });
    }

    // Check if slot with same date and time range already exists
    const existingSlot = await DayTimeSlot.findOne({
      date: new Date(date),
      dayTime: dayTime,
      startTime: startTime,
      endTime: endTime
    });

    if (existingSlot) {
      return res.status(409).json({
        success: false,
        message: 'Time slot already exists for this date, session, and time range'
      });
    }

    // Calculate day from date
    const dateObj = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[dateObj.getDay()];

    // Create new slot with day explicitly set
    const dayTimeSlot = new DayTimeSlot({
      date: new Date(date),
      day, // Explicitly set the day based on the date
      dayTime,
      slotName: slotName.trim(),
      startTime,
      endTime,
      isActive: isActive !== undefined ? isActive : true
    });

    await dayTimeSlot.save();

    res.status(201).json({
      success: true,
      message: 'Day time slot created successfully',
      data: dayTimeSlot
    });

  } catch (error) {
    console.error('Create day time slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get time slots by date and/or session type
const getTimeSlots = async (req, res) => {
  try {
    const { date, dayTime, active } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    
    if (date) {
      const searchDate = new Date(date);
      searchDate.setHours(0, 0, 0, 0);
      const endDate = new Date(searchDate);
      endDate.setHours(23, 59, 59, 999);
      
      filter.date = {
        $gte: searchDate,
        $lte: endDate
      };
    }
    
    if (dayTime) {
      filter.dayTime = dayTime;
    }
    
    if (active === 'true') {
      filter.isActive = true;
    } else if (active === 'false') {
      filter.isActive = false;
    }

    const timeSlots = await DayTimeSlot.find(filter)
      .sort({ date: 1, dayTime: 1, startTime: 1 })
      .skip(skip)
      .limit(limit);

    const total = await DayTimeSlot.countDocuments(filter);

    res.json({
      success: true,
      data: {
        timeSlots,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      message: 'Time slots retrieved successfully'
    });

  } catch (error) {
    console.error('Get time slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get time slot by ID
const getTimeSlotById = async (req, res) => {
  try {
    const timeSlot = await DayTimeSlot.findById(req.params.id);

    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }

    res.json({
      success: true,
      data: timeSlot
    });

  } catch (error) {
    console.error('Get time slot by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update time slot
const updateTimeSlot = async (req, res) => {
  try {
    const { date, dayTime, slotName, startTime, endTime, isActive } = req.body;
    const slotId = req.params.id;

    const timeSlot = await DayTimeSlot.findById(slotId);
    
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }

    // Check if this time slot is used in any room
    const roomsUsingSlot = await Room.find({
      availableTimeSlots: slotId
    });

    // Check if this time slot has bookings
    const hasBookings = await Calendar.exists({
      timeSlot: slotId,
      seatsBooked: { $gt: 0 }
    });

    // If there are bookings, restrict what can be changed
    if (hasBookings) {
      // Can only update slot name and isActive status if has bookings
      if (slotName) timeSlot.slotName = slotName.trim();
      if (isActive !== undefined) timeSlot.isActive = isActive;
      
      await timeSlot.save();
      
      return res.json({
        success: true,
        message: 'Time slot partially updated. Time and date changes restricted due to existing bookings.',
        data: timeSlot
      });
    }

    // Full update if no bookings
    if (date) {
      const dateObj = new Date(date);
      timeSlot.date = dateObj;
      
      // Update day based on new date
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      timeSlot.day = days[dateObj.getDay()];
    }
    
    if (dayTime) timeSlot.dayTime = dayTime;
    if (slotName) timeSlot.slotName = slotName.trim();
    if (startTime) timeSlot.startTime = startTime;
    if (endTime) timeSlot.endTime = endTime;
    if (isActive !== undefined) timeSlot.isActive = isActive;

    await timeSlot.save();

    res.json({
      success: true,
      message: 'Time slot updated successfully',
      data: timeSlot,
      usageInfo: {
        usedInRooms: roomsUsingSlot.length,
        rooms: roomsUsingSlot.map(r => ({ id: r._id, name: r.roomName }))
      }
    });

  } catch (error) {
    console.error('Update time slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete time slot
const deleteTimeSlot = async (req, res) => {
  try {
    const slotId = req.params.id;
    
    // Check if this time slot is used in any room
    const roomsUsingSlot = await Room.find({
      availableTimeSlots: slotId
    });

    if (roomsUsingSlot.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete time slot used by ${roomsUsingSlot.length} rooms. Remove from rooms first.`,
        rooms: roomsUsingSlot.map(r => ({ id: r._id, name: r.roomName }))
      });
    }

    // Check if this time slot has any calendar entries
    const calendarEntries = await Calendar.find({
      timeSlot: slotId
    });

    if (calendarEntries.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete time slot with ${calendarEntries.length} calendar entries. Delete calendar entries first.`
      });
    }

    const deletedSlot = await DayTimeSlot.findByIdAndDelete(slotId);
    
    if (!deletedSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }

    res.json({
      success: true,
      message: 'Time slot deleted successfully'
    });

  } catch (error) {
    console.error('Delete time slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get upcoming time slots for the next 7 days
const getUpcomingTimeSlots = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);
    
    const upcomingSlots = await DayTimeSlot.find({
      date: { $gte: today, $lte: endDate },
      isActive: true
    }).sort({ date: 1, dayTime: 1, startTime: 1 });
    
    // Group by date and dayTime
    const groupedSlots = {};
    
    upcomingSlots.forEach(slot => {
      const dateStr = slot.date.toISOString().split('T')[0];
      
      if (!groupedSlots[dateStr]) {
        groupedSlots[dateStr] = {
          date: dateStr,
          dayName: slot.day,
          sessions: {}
        };
      }
      
      if (!groupedSlots[dateStr].sessions[slot.dayTime]) {
        groupedSlots[dateStr].sessions[slot.dayTime] = [];
      }
      
      groupedSlots[dateStr].sessions[slot.dayTime].push(slot);
    });
    
    res.json({
      success: true,
      data: {
        dateRange: {
          start: today.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        },
        groupedSlots,
        totalSlots: upcomingSlots.length
      },
      message: 'Upcoming time slots retrieved successfully'
    });
    
  } catch (error) {
    console.error('Get upcoming time slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Test route function
const testRoute = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'DayTimeSlot routes are working!',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export {
  createDayTimeSlot,
  getTimeSlots,
  getTimeSlotById,
  updateTimeSlot,
  deleteTimeSlot,
  getUpcomingTimeSlots,
  testRoute
};