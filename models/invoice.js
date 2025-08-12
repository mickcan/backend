import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: false,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecurringBookingGroup",
      required: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stripeInvoiceId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "eur",
    },
    paymentId: {
      type: String,
      required: false,
    },
    paymentMethod: {
      type: String,
      default: "stripe",
    },
    status: {
      type: String,
      enum: ["created", "sent", "paid", "cancelled"],
      default: "created",
    },
    invoiceUrl: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    validate: {
      validator: function (doc) {
        // Require exactly one of bookingId or groupId
        const hasBookingId = !!doc.bookingId;
        const hasGroupId = !!doc.groupId;
        return hasBookingId !== hasGroupId; // true if only one is present
      },
      message: "Invoice must have either bookingId or groupId, but not both.",
    },
  }
);

export { invoiceSchema };
export const Invoice = mongoose.model("Invoice", invoiceSchema);
