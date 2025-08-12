import Booking from '../models/booking.js';
import mongoose from 'mongoose';

/**
 * Convert 12-hour format time (e.g., "3:25 PM") to minutes since midnight
 */
function convertTimeToMinutes(timeStr) {
  // Handle "HH:MM AM/PM" format
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (match) {
    let [_, hours, minutes, period] = match;
    hours = parseInt(hours);
    minutes = parseInt(minutes);
    
    // Convert to 24-hour format
    if (period.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  }
  
  // Handle "HH:MM" 24-hour format
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Updates booking statuses based on current time
 * Changes 'upcoming' to 'completed' for bookings whose end time has passed
 */
export const updateBookingStatuses = async () => {
  try {
    const now = new Date();
    // Format current date as DD-MM-YYYY to match booking date format
    const today = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
    
    // Current time in HH:MM format
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;
    
    console.log(`Running status update check at ${today} ${currentTime}`);

    // Find bookings that need to be checked
    const bookingsToCheck = await Booking.find({
      status: 'upcoming'
    });

    console.log(`Found ${bookingsToCheck.length} upcoming bookings to check`);
    const bookingsToUpdate = [];
    
    // Manually check each booking to ensure date comparison is correct
    for (const booking of bookingsToCheck) {
      // Parse the booking date (DD-MM-YYYY format)
      const [bookingDay, bookingMonth, bookingYear] = booking.date.split('-').map(Number);
      const [currentDay, currentMonth, currentYear] = today.split('-').map(Number);
      
      // Create Date objects for proper comparison
      const bookingDate = new Date(bookingYear, bookingMonth - 1, bookingDay);
      const currentDate = new Date(currentYear, currentMonth - 1, currentDay);
      
      // Compare dates properly using timestamps
      const isBookingDateBeforeToday = bookingDate < currentDate;
      
      // For today's bookings, parse times properly
      const isToday = bookingDate.getTime() === currentDate.getTime();

      // Convert both times to minutes since midnight
      const endTimeInMinutes = convertTimeToMinutes(booking.endTime);
      const currentTimeInMinutes = convertTimeToMinutes(currentTime);
      
      // Check if end time has passed for today's bookings
      const isBookingEndTimePassedToday = 
        isToday && endTimeInMinutes < currentTimeInMinutes;

      // Enhanced logging
      console.log(`
=== Booking Check Details ===
Booking ID: ${booking._id}
Date comparison:
  - Booking date: ${booking.date} (D:${bookingDay} M:${bookingMonth} Y:${bookingYear})
  - Current date: ${today} (D:${currentDay} M:${currentMonth} Y:${currentYear})
  - Booking timestamp: ${bookingDate.getTime()}
  - Current timestamp: ${currentDate.getTime()}
  - Is before today: ${isBookingDateBeforeToday}
  - Is today: ${isToday}
Time comparison (for today's bookings):
  - Booking end time: ${booking.endTime} (${endTimeInMinutes} minutes from midnight)
  - Current time: ${currentTime} (${currentTimeInMinutes} minutes from midnight)
  - End time passed: ${isBookingEndTimePassedToday}
Final decision:
  - Will be marked completed: ${isBookingDateBeforeToday || isBookingEndTimePassedToday}
=========================`);

      // Only update if the booking is truly in the past
      if (isBookingDateBeforeToday || isBookingEndTimePassedToday) {
        bookingsToUpdate.push(booking);
      }
    }

    // Update all found bookings to 'completed'
    if (bookingsToUpdate.length > 0) {
      console.log(`Marking ${bookingsToUpdate.length} bookings as completed:
${bookingsToUpdate.map(b => `- Booking ${b._id} (${b.date} ${b.endTime})`).join('\n')}`);
      
      const updatePromises = bookingsToUpdate.map(booking => {
        booking.status = 'completed';
        return booking.save();
      });
      await Promise.all(updatePromises);
    } else {
      console.log('No bookings need to be marked as completed');
    }

    return {
      success: true,
      updatedCount: bookingsToUpdate.length
    };
  } catch (error) {
    console.error('Error updating booking statuses:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Export a function that can be called directly
export default updateBookingStatuses; 