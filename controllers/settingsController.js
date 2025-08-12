import Settings from '../models/settings.js';

// Get all settings
export const getAllSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No settings found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update time slot settings
export const updateTimeSlots = async (req, res) => {
  try {
    const { timeSlots, weekdaysOnly } = req.body;
    
    // Validate request body
    if (!timeSlots) {
      return res.status(400).json({
        success: false,
        message: 'Time slots data is required'
      });
    }
    
    // Find settings or create if not exist
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings({
        timeSlots,
        weekdaysOnly: weekdaysOnly || false,
        bookingRules: {
          maxAdvanceBookingDays: 7,
          minAdvanceBookingHours: 1,
          minBookingDuration: 30,
          maxBookingDuration: 240
        },
        roomsAvailable: 5
      });
    } else {
      settings.timeSlots = timeSlots;
      if (weekdaysOnly !== undefined) {
        settings.weekdaysOnly = weekdaysOnly;
      }
    }
    
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Time slot settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating time slot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update booking rules
export const updateBookingRules = async (req, res) => {
  try {
    const { bookingRules, roomsAvailable } = req.body;
    
    // Validate request body
    if (!bookingRules) {
      return res.status(400).json({
        success: false,
        message: 'Booking rules data is required'
      });
    }
    
    // Find settings or create if not exist
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings({
        timeSlots: {
          morning: { startTime: '', endTime: '', enabled: false },
          evening: { startTime: '', endTime: '', enabled: false },
          night: { startTime: '', endTime: '', enabled: false }
        },
        weekdaysOnly: true,
        bookingRules,
        roomsAvailable: roomsAvailable || 5
      });
    } else {
      settings.bookingRules = bookingRules;
      if (roomsAvailable !== undefined) {
        settings.roomsAvailable = roomsAvailable;
      }
    }
    
    await settings.save();
    
    res.status(200).json({
      success: true,
      message: 'Booking rules updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating booking rules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get time slot settings
export const getTimeSlots = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No time slot settings found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        timeSlots: settings.timeSlots,
        weekdaysOnly: settings.weekdaysOnly
      }
    });
  } catch (error) {
    console.error('Error getting time slot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get booking rules
export const getBookingRules = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No booking rules found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        bookingRules: settings.bookingRules,
        roomsAvailable: settings.roomsAvailable
      }
    });
  } catch (error) {
    console.error('Error getting booking rules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}; 