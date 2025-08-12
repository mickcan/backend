import mongoose from "mongoose";

const businessHoursSchema = new mongoose.Schema(
  {
    sessionName: {
      type: String,
      required: true,
      enum: ["Morning Session", "Evening Session", "Night Session"],
      unique: true,
    },
    sessionKey: {
      type: String,
      required: true,
      enum: ["morning", "evening", "night"],
      unique: true,
    },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(v);
        },
        message: 'Start time must be in format "H:MM AM/PM"',
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(v);
        },
        message: 'End time must be in format "H:MM AM/PM"',
      },
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  { timestamps: true }
);

// Index for better performance
businessHoursSchema.index({ sessionKey: 1 });
businessHoursSchema.index({ enabled: 1 });
businessHoursSchema.index({ displayOrder: 1 });

// Virtual for time range display
businessHoursSchema.virtual("timeRange").get(function () {
  return `${this.startTime} - ${this.endTime}`;
});

// Method to convert to 24-hour format for calculations
businessHoursSchema.methods.getStartTime24 = function () {
  return convertTo24Hour(this.startTime);
};

businessHoursSchema.methods.getEndTime24 = function () {
  return convertTo24Hour(this.endTime);
};

// Helper function
function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(" ");
  let [hours, minutes] = time.split(":");
  if (hours === "12") {
    hours = "00";
  }
  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12;
  }
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

export default mongoose.model("BusinessHours", businessHoursSchema);
