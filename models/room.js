import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      // required: true,
      // min: 1,
      // max: 100,
    },
    timeSlot: {
      type: String,
      // required: true,
      // enum: [
      //   "Morning",
      //   "Evening",
      //   "Night",
      //   "Full Day",
      //   "30 minutes",
      //   "1 hour",
      //   "2 hours",
      //   "4 hours",
      // ],
    },
    
    morningPrice: {
      type: Number,
      min: 0,
    },
    afternoonPrice: {
      type: Number,
      min: 0,
    },
    nightPrice: {
      type: Number,
      min: 0,
    },

    // ✅ Nieuw: apart veld voor "Hele dag" prijs
    allDayPrice: {
      type: Number,
      min: 0,
      default: null, // blijft uitgeschakeld tot je een prijs invult
    },

    amenities: {
      type: String,
      default: "",
    },
    images: {
      type: [mongoose.Schema.Types.Mixed], // Changed to Mixed type to handle both strings and objects
      default: [],
      get: function (images) {
        if (!images) return [];
        // If it's a string, try to parse it
        if (typeof images === "string") {
          try {
            return JSON.parse(images);
          } catch (e) {
            return images;
          }
        }
        return images;
      },
      set: function (images) {
        if (typeof images === "string") {
          try {
            return JSON.parse(images);
          } catch (e) {
            return images;
          }
        }
        return images;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalBooking: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to get current availability
roomSchema.virtual("currentAvailability").get(function () {
  // This will be populated by the controller based on calendar entries
  return this._currentAvailability || "Check calendar for availability";
});

export default mongoose.model("Room", roomSchema);
