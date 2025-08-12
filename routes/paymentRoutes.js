import express from 'express';
import { 
  createCheckoutSession, 
  getCheckoutSession,
  saveBookingAfterPayment,
  createPayPalOrder,
  capturePayPalPayment,
  createSubscriptionCheckoutSession,
  getUserSubscriptions,
  cancelSubscription,
  addBookingToSubscription,
  createCardSetupSession,
  saveBookingAfterCardSetup
} from '../controllers/paymentController.js';
import { handleStripeWebhook } from '../controllers/webhookController.js';


const router = express.Router();


// Stripe payment routes
// Create a checkout session
router.post('/create-checkout-session', createCheckoutSession);

// Create a subscription checkout session for auto-charge monthly
router.post('/create-subscription-checkout-session', createSubscriptionCheckoutSession);

// Create a card setup session for saving card and booking immediately
router.post('/create-card-setup-session', createCardSetupSession);

// Stripe webhook for subscription events
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Get session details (for the success page after payment)
router.get('/sessions/:sessionId', getCheckoutSession);

// Save booking after successful payment
router.post('/sessions/:sessionId/save-booking', saveBookingAfterPayment);

// Save booking after card setup
router.post('/sessions/:sessionId/save-card-booking', saveBookingAfterCardSetup);

// Subscription management routes
router.get('/subscriptions/:userId', getUserSubscriptions);
router.put('/subscriptions/:subscriptionId/cancel', cancelSubscription);
router.post('/subscriptions/:subscriptionId/bookings', addBookingToSubscription);

// PayPal payment routes
// Create a PayPal order
router.post('/create-paypal-order', createPayPalOrder);

// Capture payment after user approval
router.post('/paypal-capture', capturePayPalPayment);

export default router; 