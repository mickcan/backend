import { generateTimeBlockData } from '../utils/weekdayGenerator.js';

/**
 * Get weekday time slots based on settings
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const getWeekdayTimeSlots = async (req, res) => {
  try {
    // Get the number of weeks to generate (default is 4)
    const numWeeks = parseInt(req.query.weeks) || 4;
    
    // In a real implementation, fetch from database
    // For now, using sample time slot settings
    const settings = {
      timeSlots: {
        morning: {
          startTime: "08:00",
          endTime: "12:30",
          enabled: true
        },
        evening: {
          startTime: "14:00",
          endTime: "17:00",
          enabled: true
        },
        night: {
          startTime: "19:00",
          endTime: "23:00",
          enabled: true
        }
      },
      weekdaysOnly: true,
      roomsAvailable: 5
    };
    
    // Generate weekday time blocks
    const weekdaysData = generateTimeBlockData(settings.timeSlots, numWeeks);
    
    return res.status(200).json({
      success: true,
      data: weekdaysData
    });
  } catch (error) {
    console.error('Error generating weekday time slots:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate weekday time slots",
      error: error.message
    });
  }
};

/**
 * Get available time slots with applied settings
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const getAvailableTimeSlots = async (req, res) => {
  try {
    // Get custom time slot settings if provided
    const { timeSlots } = req.body;
    const numWeeks = parseInt(req.query.weeks) || 4;
    
    // Default settings if not provided
    const defaultSettings = {
      morning: {
        startTime: "08:00",
        endTime: "12:30",
        enabled: true
      },
      evening: {
        startTime: "14:00",
        endTime: "17:00",
        enabled: true
      },
      night: {
        startTime: "19:00",
        endTime: "23:00",
        enabled: true
      }
    };
    
    // Use provided settings or default
    const settingsToUse = timeSlots || defaultSettings;
    
    // Generate weekday time blocks
    const weekdaysData = generateTimeBlockData(settingsToUse, numWeeks);
    
    // Add sample availability and booking info
    const enhancedData = weekdaysData.map(day => {
      return {
        ...day,
        timeBlocks: day.timeBlocks.map(block => {
          return {
            ...block,
            availableRooms: Math.floor(Math.random() * block.roomsAvailable) + 1,
            totalBookings: Math.floor(Math.random() * 10)
          };
        })
      };
    });
    
    return res.status(200).json({
      success: true,
      data: enhancedData
    });
  } catch (error) {
    console.error('Error generating available time slots:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate available time slots",
      error: error.message
    });
  }
}; 