import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    dayOfWeek: {
      type: String,
      required: true,
    },
    timeSlot: {
      type: String,
      enum: ["Morning", "Afternoon", "Night", "Full Day"], // <-- enum toegevoegd
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
    },
    paymentId: {
      type: String,
    },
    status: {
      type: String,
      enum: ["upcoming", "completed", "cancelled"],
      default: "upcoming",
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePattern: {
      type: String,
      enum: ["weekly", "biweekly", "monthly"],
      required: function () {
        return this.isRecurring;
      },
    },
    recurrenceGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringBookingGroup",
    },
    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true, // allow multiple nulls
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for common queries
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ roomId: 1, date: 1 });
bookingSchema.index({ date: 1, status: 1 });

export default mongoose.model("Booking", bookingSchema);
