import Stripe from "stripe";
import dotenv from "dotenv";
import Subscription from "../models/subscription.js";
import Booking from "../models/booking.js";
import { Invoice } from "../models/invoice.js";
import {
  createInvoiceForPayment,
  updateInvoicePaymentStatus,
} from "../utils/createInvoice.js";
import User from "../models/user.js";
import Room from "../models/room.js";
import RecurringBookingGroup from "../models/recurringBookingGroup.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
};

export const handleInvoiceStatusWebhook = async (req, res) => {
  console.log("[Webhook] Received Stripe webhook event");
  console.log(
    "[Webhook] Request headers:",
    JSON.stringify(req.headers, null, 2)
  );
  console.log("[Webhook] Request body:", JSON.stringify(req.body, null, 2));

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    console.log("[Webhook] Verifying webhook signature...");
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log("[Webhook] Successfully verified webhook signature");
    console.log(`[Webhook] Event type: ${event.type}, ID: ${event.id}`);
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    console.error("[Webhook] Error details:", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log(`[Webhook] Processing event type: ${event.type}`);

    switch (event.type) {
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice_payment.paid": {
        const invoice = event.data.object;
        console.log(`[Webhook] Processing payment for invoice: ${invoice.id}`);
        console.log(
          `[Webhook] Invoice amount: ${invoice.amount_paid / 100} ${
            invoice.currency
          }`
        );
        console.log(`[Webhook] Invoice status: ${invoice.status}`);
        console.log(`[Webhook] Customer email: ${invoice.customer_email}`);

        // Find and update invoice record
        console.log(
          `[Webhook] Looking up local invoice with Stripe ID: ${invoice.id}`
        );
        const localInvoice = await Invoice.findOneAndUpdate(
          { stripeInvoiceId: invoice.id },
          { status: "paid" },
          { new: true }
        );

        if (!localInvoice) {
          console.error(
            `[Webhook] Invoice ${invoice.id} not found in database`
          );
          // Always respond to Stripe to avoid 500 error
          return res.json({ received: true });
        }

        console.log(`[Webhook] Found local invoice ID: ${localInvoice._id}`);
        console.log(
          `[Webhook] Local invoice details:`,
          JSON.stringify(
            {
              bookingId: localInvoice.bookingId,
              groupId: localInvoice.groupId,
              amount: localInvoice.amount,
              status: localInvoice.status,
            },
            null,
            2
          )
        );

        if (localInvoice.bookingId) {
          // Single booking invoice
          console.log(
            `[Webhook] Updating single booking: ${localInvoice.bookingId}`
          );
          const updatedBooking = await Booking.findByIdAndUpdate(
            localInvoice.bookingId,
            { paymentStatus: "paid" },
            { new: true }
          );

          if (updatedBooking) {
            console.log(
              `[Webhook] Successfully updated booking ${localInvoice.bookingId}`
            );
            console.log(
              `[Webhook] Booking new status: ${updatedBooking.paymentStatus}`
            );
          } else {
            console.error(
              `[Webhook] Failed to update booking ${localInvoice.bookingId}`
            );
          }
        } else if (localInvoice.groupId) {
          // Recurring group invoice
          console.log(
            `[Webhook] Processing recurring group: ${localInvoice.groupId}`
          );
          console.log(
            `[Webhook] Calling updateMonthlyPaymentStatus for invoice ${invoice.id}`
          );

          const updateSuccess =
            await RecurringBookingGroup.updateMonthlyPaymentStatus(
              localInvoice.stripeInvoiceId,
              "paid"
            );

          if (updateSuccess) {
            console.log(
              `[Webhook] Successfully updated recurring group ${localInvoice.groupId}`
            );

            // Fetch updated group for logging
            const updatedGroup = await RecurringBookingGroup.findById(
              localInvoice.groupId
            ).select("monthlyBookings paymentStatus");

            console.log(
              `[Webhook] Updated group payment status: ${updatedGroup.paymentStatus}`
            );
            console.log(
              `[Webhook] Monthly bookings status:`,
              updatedGroup.monthlyBookings.map((mb) => ({
                month: mb.month,
                paymentStatus: mb.paymentStatus,
                invoiceId: mb.invoiceId,
              }))
            );
          } else {
            console.error(
              `[Webhook] Failed to update recurring group payment status for invoice ${invoice.id}`
            );
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log(
          `[Webhook] Processing failed payment for invoice: ${invoice.id}`
        );
        console.log(
          `[Webhook] Invoice amount due: ${invoice.amount_due / 100} ${
            invoice.currency
          }`
        );
        console.log(`[Webhook] Attempt count: ${invoice.attempt_count}`);
        console.log(
          `[Webhook] Next payment attempt: ${invoice.next_payment_attempt}`
        );

        // Find and update invoice record
        console.log(
          `[Webhook] Looking up local invoice with Stripe ID: ${invoice.id}`
        );
        const localInvoice = await Invoice.findOneAndUpdate(
          { stripeInvoiceId: invoice.id },
          { status: "failed" },
          { new: true }
        );

        if (!localInvoice) {
          console.error(
            `[Webhook] Invoice ${invoice.id} not found in database`
          );
          // Always respond to Stripe to avoid 500 error
          return res.json({ received: true });
        }

        console.log(`[Webhook] Found local invoice ID: ${localInvoice._id}`);

        if (localInvoice.groupId) {
          console.log(
            `[Webhook] Updating recurring group payment status to failed`
          );
          const updateSuccess =
            await RecurringBookingGroup.updateMonthlyPaymentStatus(
              localInvoice.stripeInvoiceId,
              "failed"
            );

          if (updateSuccess) {
            console.log(
              `[Webhook] Successfully marked group ${localInvoice.groupId} as failed`
            );

            // Fetch updated group for logging
            const updatedGroup = await RecurringBookingGroup.findById(
              localInvoice.groupId
            ).select("monthlyBookings paymentStatus");

            console.log(
              `[Webhook] Updated group payment status: ${updatedGroup.paymentStatus}`
            );
            console.log(
              `[Webhook] Monthly bookings status:`,
              updatedGroup.monthlyBookings.map((mb) => ({
                month: mb.month,
                paymentStatus: mb.paymentStatus,
                invoiceId: mb.invoiceId,
              }))
            );
          } else {
            console.error(
              `[Webhook] Failed to update recurring group payment status for invoice ${invoice.id}`
            );
          }
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
        console.log(
          `[Webhook] Full event details:`,
          JSON.stringify(event, null, 2)
        );
    }

    console.log("[Webhook] Successfully processed event");
    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Handler error:", error.message);
    console.error("[Webhook] Error stack:", error.stack);
    console.error("[Webhook] Error details:", JSON.stringify(error, null, 2));
    res.status(500).json({ error: "Webhook handler failed" });
  }
};


const handleSubscriptionCreated = async (subscription) => {
  try {
    const subscriptionData = {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      price: subscription.items.data[0].price.unit_amount / 100,
      currency: subscription.currency,
      interval: subscription.items.data[0].price.recurring.interval,
      roomName: subscription.metadata.roomName,
      userEmail: subscription.metadata.userEmail,
      nextBillingDate: new Date(subscription.current_period_end * 1000),
      userId: subscription.metadata.userId,
      roomId: subscription.metadata.roomId,
    };

    await Subscription.create(subscriptionData);
    console.log("Subscription created:", subscription.id);
  } catch (error) {
    console.error("Error handling subscription created:", error);
  }
};

const handleSubscriptionUpdated = async (subscription) => {
  try {
    const updateData = {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      nextBillingDate: new Date(subscription.current_period_end * 1000),
      isActive: subscription.status === "active",
    };

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      updateData,
      { new: true }
    );
    console.log("Subscription updated:", subscription.id);
  } catch (error) {
    console.error("Error handling subscription updated:", error);
  }
};

const handleSubscriptionDeleted = async (subscription) => {
  try {
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        status: "canceled",
        isActive: false,
      }
    );
    console.log("Subscription deleted:", subscription.id);
  } catch (error) {
    console.error("Error handling subscription deleted:", error);
  }
};

const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    // Find the booking using the payment intent ID
    const booking = await Booking.findOne({ paymentId: paymentIntent.id });

    if (booking) {
      // Update booking payment status
      booking.paymentStatus = "paid";
      await booking.save();

      // Update invoice payment status
      await updateInvoicePaymentStatus(booking._id, paymentIntent.id);
    }
  } catch (error) {
    console.error("Error handling payment intent succeeded:", error);
  }
};

const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    if (invoice.subscription) {
      const subscription = await Subscription.findOne({
        stripeSubscriptionId: invoice.subscription,
      });

      if (subscription) {
        // Update subscription billing info
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: invoice.subscription },
          {
            lastBillingDate: new Date(),
            nextBillingDate: new Date(invoice.period_end * 1000),
            status: "active",
            isActive: true,
          }
        );

        // Create invoice for the subscription payment
        const invoiceData = {
          userId: subscription.userId,
          subscriptionId: subscription._id,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          status: "paid",
          stripeInvoiceId: invoice.id,
          description: `Monthly subscription payment for ${subscription.roomName}`,
          paymentMethod: "stripe",
          billingPeriod: {
            start: new Date(invoice.period_start * 1000),
            end: new Date(invoice.period_end * 1000),
          },
        };

        await Invoice.create(invoiceData);
        console.log(
          "Invoice payment succeeded for subscription:",
          invoice.subscription
        );
      }
    } else {
      // Handle one-time payment invoice
      const paymentIntent = invoice.payment_intent;
      if (paymentIntent) {
        await handlePaymentIntentSucceeded({ id: paymentIntent });
      }
    }
  } catch (error) {
    console.error("Error handling invoice payment succeeded:", error);
  }
};

const handleInvoicePaymentFailed = async (invoice) => {
  try {
    if (invoice.subscription) {
      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: invoice.subscription },
        {
          status: "past_due",
          isActive: false,
        }
      );
      console.log(
        "Invoice payment failed for subscription:",
        invoice.subscription
      );
    } else {
      // Handle one-time payment invoice failure
      const paymentIntent = invoice.payment_intent;
      if (paymentIntent) {
        const booking = await Booking.findOne({ paymentId: paymentIntent });
        if (booking) {
          booking.paymentStatus = "failed";
          await booking.save();
        }
      }
    }
  } catch (error) {
    console.error("Error handling invoice payment failed:", error);
  }
};
