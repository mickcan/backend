import mongoose from "mongoose";

const recurringBookingGroupSchema = new mongoose.Schema(
  {
    // User who created the recurring booking
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Multiple rooms support (legacy, keep for compatibility)
    roomIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Room",
        required: true,
      },
    ],

    // Selected rooms with availability and time slot info
    selectedRooms: [
      {
        roomId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Room",
          required: true,
        },
        availability: {
          type: String,
          enum: ["full", "partial"],
          required: true,
        },
        timeSlot: { type: String, required: true },
      },
    ],

    // Time slot details
    timeSlot: {
      type: String,
      required: true,
      enum: ["morning", "evening", "night"],
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },

    // Recurrence pattern
    weekdays: {
      type: [String],
      required: true,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    recurrencePattern: {
      type: String,
      required: true,
      enum: ["weekly", "biweekly", "monthly"],
    },
    recurrenceInterval: {
      type: Number, //e.g., 1 for weekly, 2 for biweekly
      required: true,
    },

    // Payment information
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },

    // Price information
    price: {
      type: Number,
      required: true,
    },

    // Simplified status tracking
    status: {
      type: String,
      enum: ["active", "cancelled", "completed"],
      default: "active",
    },

    // Bookings grouped by month, with invoice/payment info
    monthlyBookings: [
      {
        month: { type: String, required: true }, // Format: YYYY-MM
        bookings: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
          },
        ],
        price: { type: Number, required: true }, // Total price for the month
        stripeInvoiceId: { type: String },
        invoiceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Invoice",
        },
        paymentStatus: {
          type: String,
          enum: ["pending", "paid", "failed", "cancelled"],
          default: "pending",
        },
      },
    ],
    isOpenEnded: {
      type: Boolean,
      default: false,
    },

    nextBillingDate: Date,

    // Metadata
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for optimized queries
recurringBookingGroupSchema.index({ userId: 1 });
recurringBookingGroupSchema.index({ roomIds: 1 });
recurringBookingGroupSchema.index({ status: 1 });
recurringBookingGroupSchema.index({ startDate: 1 });
recurringBookingGroupSchema.index({ endDate: 1 });

// Middleware to automatically mark past bookings as completed
recurringBookingGroupSchema.pre("save", async function (next) {
  if (this.isModified("status") && this.status === "cancelled") {
    const Booking = mongoose.model("Booking");
    await Booking.updateMany(
      { _id: { $in: this.bookings } },
      { $set: { status: "cancelled" } }
    );
  }
  next();
});

// Static method to update completed statuses
recurringBookingGroupSchema.statics.updateCompletedStatuses =
  async function () {
    const now = new Date();
    const Booking = mongoose.model("Booking");

    // Find all active groups with past end dates
    const completedGroups = await this.find({
      status: "active",
      endDate: { $lt: now },
    });

    for (const group of completedGroups) {
      // Mark all upcoming bookings as completed
      await Booking.updateMany(
        {
          _id: { $in: group.bookings },
          status: "upcoming",
          date: { $lt: now.toISOString().split("T")[0] },
        },
        { $set: { status: "completed" } }
      );

      // Mark group as completed if all bookings are done
      const upcomingCount = await Booking.countDocuments({
        _id: { $in: group.bookings },
        status: "upcoming",
      });

      if (upcomingCount === 0) {
        group.status = "completed";
        await group.save();
      }
    }
  };

// Static method to find by Stripe session ID
recurringBookingGroupSchema.statics.findByStripeSession = function (sessionId) {
  return this.findOne({ stripeSessionId: sessionId })
    .populate("userId")
    .populate("roomIds")
    .populate("invoiceId");
};

// Static method to update payment status for monthlyBookings and all related bookings
recurringBookingGroupSchema.statics.updateMonthlyPaymentStatus = async function (
  stripeInvoiceId,
  status = "paid"
) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Find the recurring group containing the monthlyBookings with this stripeInvoiceId
    const group = await this.findOne({
      "monthlyBookings.stripeInvoiceId": stripeInvoiceId,
    }).session(session);

    if (!group) {
      await session.abortTransaction();
      session.endSession();
      return false;
    }

    // Find the monthlyBooking entry
    const monthlyBooking = group.monthlyBookings.find(
      (mb) => mb.stripeInvoiceId === stripeInvoiceId
    );

    if (!monthlyBooking) {
      await session.abortTransaction();
      session.endSession();
      return false;
    }

    // Update payment status for the monthlyBooking
    monthlyBooking.paymentStatus = status;

    // Update payment status for all bookings in this month
    const Booking = mongoose.model("Booking");
    if (
      Array.isArray(monthlyBooking.bookings) &&
      monthlyBooking.bookings.length > 0
    ) {
      await Booking.updateMany(
        { _id: { $in: monthlyBooking.bookings } },
        { $set: { paymentStatus: status } },
        { session }
      );
    }

    // Update group paymentStatus if all monthlyBookings are paid
    const allPaid = group.monthlyBookings.every(
      (mb) => mb.paymentStatus === "paid"
    );
    if (allPaid) {
      group.paymentStatus = "paid";
    }

    await group.save({ session });
    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating monthly payment status:", error);
    return false;
  }
};

const RecurringBookingGroup = mongoose.model(
  "RecurringBookingGroup",
  recurringBookingGroupSchema
);

// Add a scheduled job to run daily (you'll need to implement this separately)
// Example using node-cron:
// cron.schedule('0 0 * * *', () => RecurringBookingGroup.updateCompletedStatuses());

export default RecurringBookingGroup;
