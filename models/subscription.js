import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  stripeSubscriptionId: {
    type: String,
    required: true,
    unique: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'unpaid', 'incomplete'],
    default: 'active'
  },
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  interval: {
    type: String,
    default: 'month'
  },
  roomName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastBillingDate: {
    type: Date,
    default: Date.now
  },
  nextBillingDate: {
    type: Date,
    required: true
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  monthlyBookings: [{
    date: {
      type: Date,
      required: true
    },
    timeSlot: {
      type: String,
      required: true
    },
    roomName: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }]
}, {
  timestamps: true
});

// Index for efficient queries
subscriptionSchema.index({ userId: 1, status: 1 });
// subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1, nextBillingDate: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription; 