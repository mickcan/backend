import mongoose from 'mongoose';

/**
 * Time slot schema for defining time blocks
 */
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
    // min: 15,
    // max: 60
  },
  maxBookingDuration: {
    type: Number,
    default: 240,
    min: 30,
    max: 480
  },
  cancellationPolicyDays: {
    type: Number,
    default: 1,
    min: 0,
    max: 30
  }
});

/**
 * Settings schema for managing application settings
 */
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
        maxBookingDuration: 240,
        cancellationPolicyDays: 1
      },
      roomsAvailable: 5
    });
  }
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings; 