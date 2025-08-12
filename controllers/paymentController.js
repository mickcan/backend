import Stripe from "stripe";
import dotenv from "dotenv";
import Room from "../models/room.js";
import User from "../models/user.js";
import Booking from "../models/booking.js";
import { Invoice } from "../models/invoice.js";
import { createInvoiceForPayment } from "../utils/createInvoice.js";
import mongoose from "mongoose";
import fetch from "node-fetch";
import Subscription from "../models/subscription.js";

dotenv.config();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

// PayPal configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API =
  process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

// Get PayPal access token
const getPayPalAccessToken = async () => {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  return data.access_token;
};

// Create a checkout session for room booking
export const createCheckoutSession = async (req, res) => {
  try {
    const { room, booking } = req.body;

    if (!room || !booking) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // --- Booking validation ---
    // 1. Check if booking already exists for this room/date/time slot
    const existingBooking = await Booking.findOne({
      roomId: room.id,
      date: booking.date.full,
      timeSlot: booking.time.slot,
      status: { $ne: "cancelled" },
    });
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available.",
      });
    }

    // 2. Validate maxAdvanceBookingDays from settings
    const Settings = (await import("../models/settings.js")).default;
    const settingsDoc = await Settings.findOne();
    const maxAdvanceBookingDays =
      settingsDoc?.bookingRules?.maxAdvanceBookingDays || 0;
    const today = new Date();
    const bookingDate = new Date(booking.date.full);
    today.setHours(0, 0, 0, 0);
    bookingDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((bookingDate - today) / (1000 * 60 * 60 * 24));
    // Only allow booking if diffDays >= maxAdvanceBookingDays
    if (maxAdvanceBookingDays > 0 && diffDays < maxAdvanceBookingDays) {
      return res.status(400).json({
        success: false,
        message: `Bookings must be made at least ${maxAdvanceBookingDays} days in advance.`,
      });
    }

    // Format image URLs correctly for Stripe
    let imageArray = [];
    if (room.images) {
      let images = room.images;
      // If images is a string, try to parse it
      if (typeof images === "string") {
        try {
          images = JSON.parse(images);
        } catch (e) {
          console.warn("Failed to parse images string:", e);
          images = [];
        }
      }
      // Convert image objects to full URLs
      if (Array.isArray(images)) {
        const baseUrl = process.env.BACKEND_URL || "http://localhost:3000";
        imageArray = images
          .filter(
            (img) => img && (typeof img === "string" || typeof img === "object")
          )
          .map((img) => {
            if (typeof img === "string") {
              return img.startsWith("http") ? img : `${baseUrl}${img}`;
            }
            return img.path ? `${baseUrl}${img.path}` : null;
          })
          .filter(
            (url) =>
              url && (url.startsWith("http://") || url.startsWith("https://"))
          )
          .slice(0, 1); // Only use the first valid image
      }
    }

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            // currency: "usd",
            currency: "EUR",
            product_data: {
              name: room.name,
              description: `Booking for ${booking.date.day}, ${booking.date.full} - ${booking.time.slot} (${booking.time.start} - ${booking.time.end})`,
              ...(imageArray.length > 0 && { images: imageArray }),
            },
            unit_amount: room.price * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        roomId: room.id,
        userId: booking.userId,
        bookingDate: booking.date.full,
        timeSlot: booking.time.slot,
        roomName: room.name,
        timeStart: booking.time.start,
        timeEnd: booking.time.end,
        dayOfWeek: booking.date.day,
        userEmail: booking.email || "",
        price: room.price.toString(),
        paymentType: "one-time",
      },
      mode: "payment",
      success_url: `${FRONTEND_URL}/book-your-space?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/book-your-space?payment=canceled`,
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create checkout session",
      error: error.message,
    });
  }
};

// Create a subscription checkout session for auto-charge monthly
export const createSubscriptionCheckoutSession = async (req, res) => {
  try {
    const { room, booking } = req.body;

    if (!room || !booking) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Format image URLs correctly for Stripe
    let imageArray = [];
    if (room.images) {
      let images = room.images;

      // If images is a string, try to parse it
      if (typeof images === "string") {
        try {
          images = JSON.parse(images);
        } catch (e) {
          console.warn("Failed to parse images string:", e);
          images = [];
        }
      }

      // Convert image objects to full URLs
      if (Array.isArray(images)) {
        const baseUrl = process.env.BACKEND_URL || "http://localhost:3000";
        imageArray = images
          .filter(
            (img) => img && (typeof img === "string" || typeof img === "object")
          )
          .map((img) => {
            if (typeof img === "string") {
              return img.startsWith("http") ? img : `${baseUrl}${img}`;
            }
            return img.path ? `${baseUrl}${img.path}` : null;
          })
          .filter(
            (url) =>
              url && (url.startsWith("http://") || url.startsWith("https://"))
          )
          .slice(0, 1); // Only use the first valid image
      }
    }

    // Create a subscription checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "EUR",
            product_data: {
              name: `${room.name} - Monthly Subscription`,
              description: `Monthly auto-charge for ${room.name} bookings`,
              ...(imageArray.length > 0 && { images: imageArray }),
            },
            unit_amount: room.price * 100, // Convert to cents
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        roomId: room.id,
        userId: booking.userId,
        roomName: room.name,
        userEmail: booking.email || "",
        price: room.price.toString(),
        paymentType: "subscription",
        subscriptionType: "monthly",
      },
      mode: "subscription",
      success_url: `${FRONTEND_URL}/book-your-space?payment=success&session_id={CHECKOUT_SESSION_ID}&subscription=true`,
      cancel_url: `${FRONTEND_URL}/book-your-space?payment=canceled`,
      subscription_data: {
        metadata: {
          roomId: room.id,
          userId: booking.userId,
          roomName: room.name,
          userEmail: booking.email || "",
          price: room.price.toString(),
        },
      },
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error("Error creating subscription checkout session:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create subscription checkout session",
      error: error.message,
    });
  }
};

// Create a PayPal order for room booking
export const createPayPalOrder = async (req, res) => {
  try {
    const { room, booking } = req.body;

    if (!room || !booking) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Create order data
    const orderData = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            // currency_code: "USD",
            currency_code: "EUR",
            value: room.price.toString(),
          },
          description: `Booking for ${room.name}: ${booking.date.day}, ${booking.date.full} - ${booking.time.slot}`,
          custom_id: JSON.stringify({
            roomId: room.id,
            userId: booking.userId,
            bookingDate: booking.date.full,
            timeSlot: booking.time.slot,
            roomName: room.name,
            timeStart: booking.time.start,
            timeEnd: booking.time.end,
            dayOfWeek: booking.date.day,
            userEmail: booking.email || "",
            price: room.price.toString(),
          }),
        },
      ],
      application_context: {
        brand_name: "Co-working Space Booking",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${FRONTEND_URL}/paypal-success`,
        cancel_url: `${FRONTEND_URL}?payment=canceled`,
      },
    };

    // Create PayPal order
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderData),
    });

    const order = await response.json();

    if (order.error) {
      return res.status(500).json({
        success: false,
        message: "Failed to create PayPal order",
        error: order.error,
      });
    }

    return res.status(200).json({
      success: true,
      orderId: order.id,
      approvalLink: order.links.find((link) => link.rel === "approve").href,
    });
  } catch (error) {
    console.error("Error creating PayPal order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create PayPal order",
      error: error.message,
    });
  }
};

// Capture a PayPal payment after user approval
export const capturePayPalPayment = async (req, res) => {
  try {
    const { orderID } = req.body;
    const accessToken = await getPayPalAccessToken();

    // Capture the payment
    const response = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const captureData = await response.json();

    if (captureData.error) {
      return res.status(400).json({
        success: false,
        message: "Payment capture failed",
        error: captureData.error,
      });
    }

    // Extract custom data from the order
    const orderDetails = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderID}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const orderData = await orderDetails.json();
    const customData = JSON.parse(orderData.purchase_units[0].custom_id);

    // Check if booking already exists with this order ID
    const existingBooking = await Booking.findOne({ paypalOrderId: orderID });
    if (existingBooking) {
      return res.status(200).json({
        success: true,
        message: "Booking already exists for this payment",
        data: existingBooking,
      });
    }

    // Check if time slot is available
    const conflictingBooking = await Booking.findOne({
      roomId: customData.roomId,
      date: customData.bookingDate,
      timeSlot: customData.timeSlot,
      status: { $ne: "cancelled" },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available",
      });
    }

    // Find the room
    const room = await Room.findById(customData.roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Find or create user
    let user;
    if (mongoose.Types.ObjectId.isValid(customData.userId)) {
      user = await User.findById(customData.userId);
    }

    if (!user && customData.userEmail) {
      user = await User.findOne({ email: customData.userEmail });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found. Cannot create booking without a valid user.",
      });
    }

    // Create booking
    const booking = new Booking({
      roomId: customData.roomId,
      userId: user._id,
      date: customData.bookingDate,
      dayOfWeek: customData.dayOfWeek,
      timeSlot: customData.timeSlot,
      startTime: customData.timeStart,
      endTime: customData.timeEnd,
      price: parseFloat(customData.price),
      paymentStatus: "paid",
      paymentId: captureData.id,
      paymentMethod: "paypal",
      status: "upcoming",
      paypalOrderId: orderID,
    });

    // Save the booking
    await booking.save();

    // Create invoice for the successful PayPal payment
    try {
      await createInvoiceForPayment(
        booking,
        user,
        room,
        captureData.id,
        "paypal"
      );
    } catch (invoiceError) {
      console.error(
        `Failed to create invoice for PayPal booking ${booking._id}:`,
        invoiceError
      );
      // Don't fail the booking if invoice creation fails
    }

    // Update room statistics
    room.totalBooking += 1;
    room.revenue += parseFloat(customData.price);
    await room.save();

    return res.status(200).json({
      success: true,
      message: "Payment captured and booking created successfully",
      data: {
        bookingId: booking._id,
        roomId: customData.roomId,
        roomName: customData.roomName,
        bookingDate: customData.bookingDate,
        timeSlot: customData.timeSlot,
        timeStart: customData.timeStart,
        timeEnd: customData.timeEnd,
        dayOfWeek: customData.dayOfWeek,
        amount: customData.price,
        paymentStatus: "paid",
        userEmail: user.email,
      },
    });
  } catch (error) {
    console.error("Error capturing PayPal payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to capture payment",
      error: error.message,
    });
  }
};

// Get checkout session details
export const getCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent", "setup_intent"],
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("Error retrieving session:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve session",
      error: error.message,
    });
  }
};

// Save booking after successful payment verification
export const saveBookingAfterPayment = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify that the payment was successful by retrieving the session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent"],
    });

    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment not completed or invalid session",
      });
    }

    // Extract booking details from session metadata
    const {
      roomId,
      userId,
      bookingDate,
      timeSlot,
      roomName,
      timeStart,
      timeEnd,
      dayOfWeek,
      userEmail,
      price,
    } = session.metadata;

    // Find the room
    let room;
    try {
      room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }
    } catch (roomError) {
      console.error("Error finding room:", roomError);
      return res.status(404).json({
        success: false,
        message: "Room not found or invalid room ID",
        error: roomError.message,
      });
    }

    // Find the user or create a temporary one based on email
    let user;
    try {
      // If we have a valid userId, use it
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }

      // If user not found and we have an email, find by email
      if (!user && userEmail) {
        user = await User.findOne({ email: userEmail });
      }

      // If still no user, check if this is a guest booking without a user account
      if (!user) {
        return res.status(400).json({
          success: false,
          message:
            "User not found. Cannot create booking without a valid user.",
        });
      }
    } catch (userError) {
      console.error("Error finding user:", userError);
      return res.status(400).json({
        success: false,
        message: "Error finding user",
        error: userError.message,
      });
    }

    // Check if booking already exists with this session ID to avoid duplicates
    const existingBooking = await Booking.findOne({
      stripeSessionId: sessionId,
    });
    if (existingBooking) {
      console.log(
        "Duplicate booking attempt prevented for sessionId:",
        sessionId
      );
      return res.status(200).json({
        success: true,
        message: "Booking already exists for this payment",
        data: existingBooking,
      });
    }

    // Additional check: Check if a booking already exists for this user, room, date, and time slot
    const existingUserBooking = await Booking.findOne({
      userId: user._id,
      roomId,
      date: bookingDate,
      timeSlot,
      status: { $ne: "cancelled" },
    });
    if (existingUserBooking) {
      console.log(
        "User already has a booking for this time slot:",
        existingUserBooking._id
      );
      return res.status(200).json({
        success: true,
        message: "You already have a booking for this time slot",
        data: existingUserBooking,
      });
    }

    // Check if time slot is available (not booked already)
    const conflictingBooking = await Booking.findOne({
      roomId,
      date: bookingDate,
      timeSlot,
      status: { $ne: "cancelled" },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available",
      });
    }

    // Create the booking
    const booking = new Booking({
      roomId,
      userId: user._id,
      date: bookingDate,
      dayOfWeek,
      timeSlot,
      startTime: timeStart,
      endTime: timeEnd,
      price: parseFloat(price),
      paymentStatus: "paid",
      paymentId: session.payment_intent.id,
      paymentMethod: "stripe",
      status: "upcoming",
      stripeSessionId: sessionId,
    });

    // Save the booking
    await booking.save();

    // Create invoice for the successful payment
    try {
      await createInvoiceForPayment(
        booking,
        user,
        room,
        session.payment_intent.id,
        "stripe"
      );
    } catch (invoiceError) {
      console.error(
        `Failed to create invoice for booking ${booking._id}:`,
        invoiceError
      );
      // Don't fail the booking if invoice creation fails
    }

    // Update room statistics
    room.totalBooking += 1;
    room.revenue += session.amount_total / 100; // Convert from cents to dollars
    await room.save();

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Booking created successfully",
      data: {
        bookingId: booking._id,
        roomId,
        roomName,
        bookingDate,
        timeSlot,
        timeStart,
        timeEnd,
        dayOfWeek,
        amount: session.amount_total / 100,
        paymentStatus: session.payment_status,
        userEmail: user.email,
      },
    });
  } catch (error) {
    console.error("Error saving booking:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save booking",
      error: error.message,
    });
  }
};

// Create a setup session for saving card and booking immediately
export const createCardSetupSession = async (req, res) => {
  try {
    const { room, booking } = req.body;

    // Use userId from booking or fallback to req.user if available
    const userId = booking.userId || (req.user && req.user._id);
    // Use price from booking or room, ensure it's a number
    const price = Number(booking.price || room.price || 0);
    console.log("[Invoice] Start creating monthly invoice for booking:", {
      userId,
      email: booking.email,
      room: room.name,
      date: booking.date,
      time: booking.time,
      price,
    });

    if (!room || !booking || !booking.email || !price) {
      console.log("[Invoice] Missing required fields or invalid price");
      return res.status(400).json({
        success: false,
        message: "Missing required fields or invalid price",
      });
    }

    // Start MongoDB transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // 0. Check maxAdvanceBookingDays (days in advance)
      const Settings = (await import("../models/settings.js")).default;
      const settingsDoc = await Settings.findOne();
      const maxAdvanceBookingDays =
        settingsDoc?.bookingRules?.maxAdvanceBookingDays || 0;
      const today = new Date();
      const bookingDate = new Date(booking.date.full);
      today.setHours(0, 0, 0, 0);
      bookingDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((bookingDate - today) / (1000 * 60 * 60 * 24));
      // Only allow booking if diffDays >= maxAdvanceBookingDays
      if (maxAdvanceBookingDays > 0 && diffDays < maxAdvanceBookingDays) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Bookings must be made at least ${maxAdvanceBookingDays} days in advance.`,
        });
      }

      // 1. Create the booking
      const BookingModel = (await import("../models/booking.js")).default;
      const bookingDoc = await BookingModel.create(
        [
          {
            roomId: room.id,
            userId: userId,
            date: booking.date.full,
            dayOfWeek: booking.date.day,
            timeSlot: booking.time.slot,
            startTime: booking.time.start,
            endTime: booking.time.end,
            price: price,
            paymentStatus: "pending",
            status: "upcoming",
          },
        ],
        { session }
      );
      const bookingInstance = bookingDoc[0];

      // 2. Find or create Stripe customer
      let customer;
      try {
        console.log(
          "[Invoice] Looking up Stripe customer for email:",
          booking.email
        );
        const existingCustomers = await stripe.customers.list({
          email: booking.email,
          limit: 1,
        });
        customer =
          existingCustomers.data[0] ||
          (await stripe.customers.create({
            email: booking.email,
            name: booking.userName || booking.fullName || booking.email,
            metadata: { userId },
          }));
        console.log("[Invoice] Stripe customer ID:", customer.id);
      } catch (err) {
        console.error("[Invoice] Stripe customer error:", err);
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          success: false,
          message: "Stripe customer error",
          error: err.message,
        });
      }

      // 3. Create a Stripe invoice item for this booking
      console.log("[Invoice] Creating invoice item...");
      const invoiceItem = await stripe.invoiceItems.create({
        customer: customer.id,
        amount: Math.round(price * 100),
        currency: "eur",
        description: `Booking for ${room.name} on ${booking.date.full} (${booking.time.slot} ${booking.time.start}-${booking.time.end})`,
        metadata: {
          roomId: room.id,
          userId,
          bookingId: bookingInstance._id.toString(),
          bookingDate: booking.date.full,
          timeSlot: booking.time.slot,
          roomName: room.name,
          timeStart: booking.time.start,
          timeEnd: booking.time.end,
          dayOfWeek: booking.date.day,
          userEmail: booking.email || "",
          price: price.toString(),
          paymentType: "monthly_invoice",
        },
      });
      console.log(
        "[Invoice] Invoice item created:",
        invoiceItem.id,
        "amount:",
        invoiceItem.amount / 100
      );

      // 4. Create the invoice (unfinalized, to be sent/paid at end of month)
      console.log("[Invoice] Creating invoice...");
      const invoice = await stripe.invoices.create({
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: 30,
        auto_advance: true,
        pending_invoice_items_behavior: "include",
        metadata: {
          userId,
          bookingId: bookingInstance._id.toString(),
          paymentType: "monthly_invoice",
        },
      });
      console.log("[Invoice] Invoice created:", invoice.id);

      // 5. Finalize the invoice so it can be paid later
      console.log("[Invoice] Finalizing invoice...");
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(
        invoice.id
      );
      console.log("[Invoice] Invoice finalized:", finalizedInvoice.id);
      // Log finalized invoice line items
      const finalizedInvoiceDetails = await stripe.invoices.retrieve(
        finalizedInvoice.id,
        { expand: ["lines"] }
      );
      console.log(
        "[Invoice] Finalized invoice line items:",
        finalizedInvoiceDetails.lines.data
      );

      // 6. Create Invoice document in DB
      const { Invoice } = await import("../models/invoice.js");
      await Invoice.create(
        [
          {
            bookingId: bookingInstance._id,
            userId: userId,
            stripeInvoiceId: finalizedInvoice.id,
            amount: finalizedInvoice.amount_due / 100,
            currency: finalizedInvoice.currency,
            status: "created",
            invoiceUrl: finalizedInvoice.hosted_invoice_url,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
        invoiceId: finalizedInvoice.id,
        bookingId: bookingInstance._id,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("[Invoice] Transaction error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to create booking and invoice",
        error: err.message,
      });
    }
  } catch (error) {
    console.error("[Invoice] Error creating monthly invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create monthly invoice",
      error: error.message,
    });
  }
};

// Save booking after card setup (immediate booking)
export const saveBookingAfterCardSetup = async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log("saveBookingAfterCardSetup called with sessionId:", sessionId);

    // Verify that the setup was successful by retrieving the session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent"],
    });

    console.log("Retrieved session:", {
      id: session.id,
      mode: session.mode,
      payment_status: session.payment_status,
      setup_intent_status: session.setup_intent?.status,
      metadata: session.metadata,
    });

    if (!session) {
      return res.status(400).json({
        success: false,
        message: "Setup session not found",
      });
    }

    // For setup sessions, we check if the setup intent is successful
    if (
      session.mode === "setup" &&
      (!session.setup_intent || session.setup_intent.status !== "succeeded")
    ) {
      return res.status(400).json({
        success: false,
        message: "Setup not completed or invalid session",
      });
    }

    // Extract booking details from session metadata
    const {
      roomId,
      userId,
      bookingDate,
      timeSlot,
      roomName,
      timeStart,
      timeEnd,
      dayOfWeek,
      userEmail,
      price,
    } = session.metadata;

    // Find the room
    let room;
    try {
      room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }
    } catch (roomError) {
      console.error("Error finding room:", roomError);
      return res.status(404).json({
        success: false,
        message: "Room not found or invalid room ID",
        error: roomError.message,
      });
    }

    // Find the user or create a temporary one based on email
    let user;
    try {
      // If we have a valid userId, use it
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }

      // If user not found and we have an email, find by email
      if (!user && userEmail) {
        user = await User.findOne({ email: userEmail });
      }

      // If still no user, check if this is a guest booking without a user account
      if (!user) {
        return res.status(400).json({
          success: false,
          message:
            "User not found. Cannot create booking without a valid user.",
        });
      }
    } catch (userError) {
      console.error("Error finding user:", userError);
      return res.status(400).json({
        success: false,
        message: "Error finding user",
        error: userError.message,
      });
    }

    // Check if booking already exists with this session ID to avoid duplicates
    const existingBooking = await Booking.findOne({
      stripeSessionId: sessionId,
    });
    if (existingBooking) {
      console.log(
        "Duplicate booking attempt prevented for sessionId:",
        sessionId
      );
      return res.status(200).json({
        success: true,
        message: "Booking already exists for this setup",
        data: existingBooking,
      });
    }

    // Additional check: Check if a booking already exists for this user, room, date, and time slot
    const existingUserBooking = await Booking.findOne({
      userId: user._id,
      roomId,
      date: bookingDate,
      timeSlot,
      status: { $ne: "cancelled" },
    });
    if (existingUserBooking) {
      console.log(
        "User already has a booking for this time slot:",
        existingUserBooking._id
      );
      return res.status(200).json({
        success: true,
        message: "You already have a booking for this time slot",
        data: existingUserBooking,
      });
    }

    // Check if time slot is available (not booked already)
    const conflictingBooking = await Booking.findOne({
      roomId,
      date: bookingDate,
      timeSlot,
      status: { $ne: "cancelled" },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available",
      });
    }

    // Create the booking with pending payment status
    const booking = new Booking({
      roomId,
      userId: user._id,
      date: bookingDate,
      dayOfWeek,
      timeSlot,
      startTime: timeStart,
      endTime: timeEnd,
      price: parseFloat(price),
      paymentStatus: "pending", // Will be charged at end of month
      paymentMethod: "stripe_card_setup",
      status: "upcoming",
      stripeSessionId: sessionId,
      setupIntentId: session.setup_intent.id,
    });

    // Save the booking
    await booking.save();

    // Create invoice for the booking (unpaid until end of month)
    try {
      await createInvoiceForPayment(
        booking,
        user,
        room,
        session.setup_intent.id,
        "stripe_card_setup"
      );
    } catch (invoiceError) {
      console.error(
        `Failed to create invoice for booking ${booking._id}:`,
        invoiceError
      );
      // Don't fail the booking if invoice creation fails
    }

    // Update room statistics
    room.totalBooking += 1;
    // Don't add to revenue yet since payment is pending
    await room.save();

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Booking created successfully with card setup",
      data: {
        bookingId: booking._id,
        roomId,
        roomName,
        bookingDate,
        timeSlot,
        timeStart,
        timeEnd,
        dayOfWeek,
        amount: parseFloat(price),
        paymentStatus: "pending",
        userEmail: user.email,
        setupIntentId: session.setup_intent.id,
      },
    });
  } catch (error) {
    console.error("Error saving booking after card setup:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save booking",
      error: error.message,
    });
  }
};

// Get user subscriptions
export const getUserSubscriptions = async (req, res) => {
  try {
    const { userId } = req.params;

    const subscriptions = await Subscription.find({
      userId: userId,
      isActive: true,
    }).populate("roomId", "name images");

    return res.status(200).json({
      success: true,
      subscriptions,
    });
  } catch (error) {
    console.error("Error getting user subscriptions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get subscriptions",
      error: error.message,
    });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Cancel subscription in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local subscription
    await Subscription.findByIdAndUpdate(subscriptionId, {
      status: "canceled",
      isActive: false,
    });

    return res.status(200).json({
      success: true,
      message: "Subscription canceled successfully",
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel subscription",
      error: error.message,
    });
  }
};

// Add booking to subscription
export const addBookingToSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { bookingData } = req.body;

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Add booking to monthly bookings array
    const newBooking = {
      date: new Date(bookingData.date),
      timeSlot: bookingData.timeSlot,
      roomName: bookingData.roomName,
      price: bookingData.price,
    };

    await Subscription.findByIdAndUpdate(subscriptionId, {
      $push: { monthlyBookings: newBooking },
      $inc: { totalBookings: 1 },
    });

    return res.status(200).json({
      success: true,
      message: "Booking added to subscription",
    });
  } catch (error) {
    console.error("Error adding booking to subscription:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add booking to subscription",
      error: error.message,
    });
  }
};
