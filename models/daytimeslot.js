

import mongoose from 'mongoose';

const dayTimeSlotSchema = new mongoose.Schema({
  // Add date field
  date: {
    type: Date,
    required: true
  },
  // Add day field (will be calculated from date)
  day: {
    type: String,
    required: true,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  // Session type
  dayTime: {
    type: String,
    required: true,
    enum: ['Morning', 'Afternoon', 'Evening']
  },
  // Slot name for easier identification
  slotName: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function(time) {
        // Accept both 24-hour format (HH:MM) and 12-hour format (H:MM AM/PM)
        const format24 = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        const format12 = /^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$/i.test(time);
        return format24 || format12;
      },
      message: 'Start time must be in HH:MM (24-hour) or H:MM AM/PM format. Examples: 09:00, 9:00 AM'
    }
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function(time) {
        // Accept both 24-hour format (HH:MM) and 12-hour format (H:MM AM/PM)
        const format24 = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        const format12 = /^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$/i.test(time);
        return format24 || format12;
      },
      message: 'End time must be in HH:MM (24-hour) or H:MM AM/PM format. Examples: 17:00, 5:00 PM'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Helper function to convert time formats
const convertTo24Hour = (time) => {
  if (time.includes('AM') || time.includes('PM')) {
    const [timePart, period] = time.split(/\s+/);
    const [hours, minutes] = timePart.split(':');
    let hour24 = parseInt(hours);
    
    if (period.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (period.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    return `${hour24.toString().padStart(2, '0')}:${minutes}`;
  }
  return time; // Already in 24-hour format
};

// Helper function to convert 24-hour to 12-hour AM/PM
const convertTo12Hour = (time24) => {
  if (!time24 || !time24.includes(':')) return 'Invalid Time';
  
  const [hour, minute] = time24.split(':');
  const h = parseInt(hour);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12; // Converts 0 or 12 to 12
  
  return `${hour12}:${minute} ${ampm}`;
};

// Pre-save middleware to ensure end time is after start time and set day from date
dayTimeSlotSchema.pre('save', function(next) {
  try {
    // Set day based on date
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    this.day = days[this.date.getDay()];
    
    // Convert both times to 24-hour format for comparison
    const start24 = convertTo24Hour(this.startTime);
    const end24 = convertTo24Hour(this.endTime);
    
    const startMinutes = parseInt(start24.split(':')[0]) * 60 + parseInt(start24.split(':')[1]);
    const endMinutes = parseInt(end24.split(':')[0]) * 60 + parseInt(end24.split(':')[1]);
    
    if (endMinutes <= startMinutes) {
      return next(new Error('End time must be after start time'));
    }
    
    // Store times in 24-hour format internally
    this.startTime = start24;
    this.endTime = end24;
    
    next();
  } catch (error) {
    next(new Error('Invalid time or date format: ' + error.message));
  }
});

// Virtual property to display time in AM/PM format
dayTimeSlotSchema.virtual('timeRange').get(function() {
  return `${convertTo12Hour(this.startTime)} - ${convertTo12Hour(this.endTime)}`;
});

// Virtual to get slot duration
dayTimeSlotSchema.virtual('duration').get(function() {
  const start = this.startTime.split(':');
  const end = this.endTime.split(':');
  const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
  const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
  const durationMinutes = endMinutes - startMinutes;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  
  if (minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${hours}h`;
});

// Virtual property to get formatted date
dayTimeSlotSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
});

// Compound index for efficient queries
dayTimeSlotSchema.index({ date: 1, dayTime: 1 });

export default mongoose.model('DayTimeSlot', dayTimeSlotSchema);