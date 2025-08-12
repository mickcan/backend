


import mongoose from 'mongoose';

const calendarSchema = new mongoose.Schema({
  // Reference to specific time slot (which includes date, day, session)
  timeSlot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DayTimeSlot',
    required: true
  },
  // Reference to the room
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  // Room availability tracking
  totalCapacity: {
    type: Number,
    required: true,
    min: 1
  },
  seatsBooked: {
    type: Number,
    default: 0,
    min: 0
  },
  roomAvailable: {
    type: Number,
    default: function() {
      return this.totalCapacity - this.seatsBooked;
    }
  },
  // Optional booker reference
  bookedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    seats: {
      type: Number,
      default: 1
    },
    bookingDate: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual to calculate available rooms dynamically
calendarSchema.virtual('availableRooms').get(function() {
  return Math.max(0, this.totalCapacity - this.seatsBooked);
});

// Virtual to get booking status
calendarSchema.virtual('bookingStatus').get(function() {
  if (this.seatsBooked === 0) return 'Available';
  if (this.seatsBooked >= this.totalCapacity) return 'Fully Booked';
  return 'Partially Booked';
});

// Pre-save middleware to update roomAvailable
calendarSchema.pre('save', function(next) {
  this.roomAvailable = Math.max(0, this.totalCapacity - this.seatsBooked);
  next();
});

// Compound index for preventing duplicates
calendarSchema.index({ timeSlot: 1, room: 1 }, { unique: true });

export default mongoose.model('Calendar', calendarSchema);