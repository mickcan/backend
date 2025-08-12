import express from "express";
import paymentController from "../controllers/paymentController.js";

const router = express.Router();

// Stripe
router.post(
  "/stripe/create-payment-intent",
  paymentController.createStripePaymentIntent
);

// PayPal
router.post("/paypal/create-order", paymentController.createPaypalOrder);
router.post("/paypal/process-card", paymentController.processPayPalCard);

export default router;
