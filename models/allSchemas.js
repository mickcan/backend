import mongoose from 'mongoose';

// User Schema
const userSchema = new mongoose.Schema({
  fullName: String,
  username: { type: String, required: false, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['pending', 'active'], default: 'pending' },
  isActive: { type: Boolean, default: false },
}, { timestamps: true });

// Room Schema
const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  timeSlot: {
    type: String,
    required: true,
    enum: ['Morning', 'Evening', 'Night', 'Full Day', '30 minutes', '1 hour', '2 hours', '4 hours']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  amenities: {
    type: String,
    default: ''
  },
  images: [{
    path: String,
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  totalBooking: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual to get current availability 
roomSchema.virtual('currentAvailability').get(function() {
  // This will be populated by the controller based on calendar entries
  return this._currentAvailability || 'Check calendar for availability';
});

// Time Slot Schema for Settings
const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: false
  }
});

// Booking Rules Schema
const bookingRulesSchema = new mongoose.Schema({
  maxAdvanceBookingDays: {
    type: Number,
    default: 7,
    min: 1,
    max: 60
  },
  minAdvanceBookingHours: {
    type: Number,
    default: 1,
    min: 0,
    max: 24
  },
  minBookingDuration: {
    type: Number,
    default: 30,
    min: 15,
    max: 60
  },
  maxBookingDuration: {
    type: Number,
    default: 240,
    min: 30,
    max: 480
  }
});

// Settings Schema
const settingsSchema = new mongoose.Schema(
  {
    timeSlots: {
      morning: timeSlotSchema,
      evening: timeSlotSchema,
      night: timeSlotSchema
    },
    weekdaysOnly: {
      type: Boolean,
      default: true
    },
    bookingRules: bookingRulesSchema,
    roomsAvailable: {
      type: Number,
      default: 5,
      min: 1
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Make sure we only have one settings document
settingsSchema.statics.findOneOrCreate = async function (query) {
  let settings = await this.findOne(query);
  if (!settings) {
    settings = await this.create({
      timeSlots: {
        morning: { startTime: '08:00', endTime: '12:00', enabled: true },
        evening: { startTime: '13:00', endTime: '17:00', enabled: true },
        night: { startTime: '18:00', endTime: '22:00', enabled: true }
      },
      weekdaysOnly: true,
      bookingRules: {
        maxAdvanceBookingDays: 7,
        minAdvanceBookingHours: 1,
        minBookingDuration: 30,
        maxBookingDuration: 240
      },
      roomsAvailable: 5
    });
  }
  return settings;
};

// Create models
export const User = mongoose.model('User', userSchema);
export const Room = mongoose.model('Room', roomSchema);
export const Settings = mongoose.model('Settings', settingsSchema);

export default {
  User,
  Room,
  Settings
}; 