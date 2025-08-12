/**
 * Utility to generate weekday dates (Monday to Friday)
 * Excludes weekends (Saturday and Sunday)
 */

/**
 * Generates an array of weekday dates from today onwards
 * @param {number} numWeeks - Number of weeks to generate dates for
 * @returns {Array} Array of date objects with formatted details
 */
const generateWeekdays = (numWeeks = 4) => {
  const today = new Date();
  const dates = [];
  const totalDays = numWeeks * 7; // Total days to check

  for (let i = 0; i < totalDays; i++) {
    const currentDate = new Date();
    currentDate.setDate(today.getDate() + i);
    
    // 0 = Sunday, 6 = Saturday
    const dayOfWeek = currentDate.getDay();
    
    // Skip weekends (Saturday and Sunday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      
      // Format date as DD-MM-YYYY
      const day = String(currentDate.getDate()).padStart(2, '0');
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const year = currentDate.getFullYear();
      
      dates.push({
        date: `${day}-${month}-${year}`,
        day: dayNames[dayOfWeek],
        dateObj: currentDate,
        displayDate: `${dayNames[dayOfWeek]} (${day}-${month}-${year})`
      });
    }
  }

  return dates;
};

/**
 * Generates formatted timeblock data for weekdays
 * @param {Object} timeSlots - Object containing time slot configurations
 * @param {number} numWeeks - Number of weeks to generate dates for
 * @returns {Array} Array of weekdays with time slots
 */
const generateTimeBlockData = (timeSlots, numWeeks = 4) => {
  const weekdays = generateWeekdays(numWeeks);
  
  return weekdays.map(day => {
    // Create timeblocks for this day
    const dayTimeBlocks = {
      day: day.day,
      date: day.date,
      displayDate: day.displayDate,
      timeBlocks: []
    };
    
    // Add morning slot if enabled
    if (timeSlots.morning && timeSlots.morning.enabled) {
      dayTimeBlocks.timeBlocks.push({
        label: "Morning",
        startTime: timeSlots.morning.startTime,
        endTime: timeSlots.morning.endTime,
        roomsAvailable: timeSlots.roomsAvailable || 5,
        timeSlot: "morning"
      });
    }
    
    // Add evening slot if enabled
    if (timeSlots.evening && timeSlots.evening.enabled) {
      dayTimeBlocks.timeBlocks.push({
        label: "Evening",
        startTime: timeSlots.evening.startTime,
        endTime: timeSlots.evening.endTime,
        roomsAvailable: timeSlots.roomsAvailable || 5,
        timeSlot: "evening"
      });
    }
    
    // Add night slot if enabled
    if (timeSlots.night && timeSlots.night.enabled) {
      dayTimeBlocks.timeBlocks.push({
        label: "Night",
        startTime: timeSlots.night.startTime,
        endTime: timeSlots.night.endTime,
        roomsAvailable: timeSlots.roomsAvailable || 5,
        timeSlot: "night"
      });
    }
    
    return dayTimeBlocks;
  });
};

export { generateWeekdays, generateTimeBlockData }; 