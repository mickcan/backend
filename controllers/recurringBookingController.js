import Booking from "../models/booking.js";
import Room from "../models/room.js";
import User from "../models/user.js";
import { addWeeks } from "date-fns";
import sendEmail from "../utils/sendEmail.js";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

export const createRecurringBooking = async (req, res) => {
  try {
    console.log("Creating recurring booking with data:", req.body);

    const {
      userId,
      roomId,
      weekday,
      timeSlot,
      startDate,
      endDate,
      recurrencePattern,
    } = req.body;

    // Validate required fields
    if (!userId || !roomId || !weekday || !timeSlot || !startDate) {
      console.log("Missing required fields:", {
        userId,
        roomId,
        weekday,
        timeSlot,
        startDate,
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    console.log("All required fields present, proceeding with validation...");

    // Verify user exists
    try {
      console.log("Checking if user exists:", userId);
      const user = await User.findById(userId);
      if (!user) {
        console.log("User not found:", userId);
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      console.log("User found:", user.email);
    } catch (userError) {
      console.error("Error finding user:", userError);
      return res.status(500).json({
        success: false,
        message: "Error finding user",
        error: userError.message,
      });
    }

    // Verify room exists
    let room;
    try {
      console.log("Checking if room exists:", roomId);
      room = await Room.findById(roomId);
      if (!room) {
        console.log("Room not found:", roomId);
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }
      console.log("Room found:", room.name);
      console.log("Room details:", {
        id: room._id,
        name: room.name,
        price: room.price,
        isActive: room.isActive,
      });
    } catch (roomError) {
      console.error("Error finding room:", roomError);
      return res.status(500).json({
        success: false,
        message: "Error finding room",
        error: roomError.message,
      });
    }

    // Calculate booking dates based on recurrence pattern
    let bookingDates = [];
    try {
      console.log("Calculating booking dates...");
      let currentDate = new Date(startDate);
      const endDateTime = endDate ? new Date(endDate) : null;

      console.log("Start date:", startDate, "End date:", endDate);
      console.log("Current date:", currentDate, "End date time:", endDateTime);

      while (!endDateTime || currentDate <= endDateTime) {
        if (currentDate.getDay() === getWeekdayNumber(weekday)) {
          bookingDates.push(new Date(currentDate));
        }

        // Calculate next date based on recurrence pattern
        switch (recurrencePattern) {
          case "every-week":
            currentDate = addWeeks(currentDate, 1);
            break;
          case "every-2-weeks":
            currentDate = addWeeks(currentDate, 2);
            break;
          case "every-3-weeks":
            currentDate = addWeeks(currentDate, 3);
            break;
          case "every-4-weeks":
            currentDate = addWeeks(currentDate, 4);
            break;
          case "skip-one-week":
            currentDate = addWeeks(currentDate, 2); // Skip one week means add 2 weeks
            break;
          default:
            currentDate = addWeeks(currentDate, 1); // Default to weekly
        }

        // Break if no end date but we've generated too many bookings
        if (!endDateTime && bookingDates.length >= 52) {
          // Limit to 1 year
          break;
        }
      }

      console.log("Generated booking dates:", bookingDates.length);
      console.log("First few dates:", bookingDates.slice(0, 3));
    } catch (dateError) {
      console.error("Error calculating booking dates:", dateError);
      return res.status(500).json({
        success: false,
        message: "Error calculating booking dates",
        error: dateError.message,
      });
    }

    // Check availability for all dates
    try {
      console.log("Checking availability for", bookingDates.length, "dates...");
      const conflicts = [];
      for (const date of bookingDates) {
        const existingBooking = await Booking.findOne({
          roomId: roomId,
          dayOfWeek: weekday,
          timeSlot,
          date: date.toISOString().split("T")[0],
          status: { $nin: ["cancelled", "completed"] },
        });

        if (existingBooking) {
          conflicts.push(date.toISOString().split("T")[0]);
        }
      }

      console.log("Found", conflicts.length, "conflicts");

      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Some dates are already booked",
          conflicts,
        });
      }
    } catch (availabilityError) {
      console.error("Error checking availability:", availabilityError);
      return res.status(500).json({
        success: false,
        message: "Error checking availability",
        error: availabilityError.message,
      });
    }

    // Calculate total price (number of bookings * room price for specific time slot)
    let totalAmount = 0;
    try {
      console.log("Calculating total price...");
      console.log("Number of bookings:", bookingDates.length);
      console.log("Time slot:", timeSlot);
      console.log("Room object:", room);

      // Get the correct price based on time slot
      let roomPrice = 0;
      switch (timeSlot) {
        case "morning":
          roomPrice = parseFloat(room.morningPrice) || 0;
          console.log("Using morning price:", roomPrice);
          break;
        case "afternoon":
          roomPrice = parseFloat(room.afternoonPrice) || 0;
          console.log("Using afternoon price:", roomPrice);
          break;
        case "night":
          roomPrice = parseFloat(room.nightPrice) || 0;
          console.log("Using night price:", roomPrice);
          break;
        default:
          // Fallback to average price or default
          const prices = [
            parseFloat(room.morningPrice) || 0,
            parseFloat(room.afternoonPrice) || 0,
            parseFloat(room.nightPrice) || 0,
          ].filter((p) => p > 0);

          roomPrice =
            prices.length > 0
              ? prices.reduce((a, b) => a + b) / prices.length
              : 0;
          console.log("Using average price:", roomPrice);
      }

      console.log("Final room price:", roomPrice);

      totalAmount = bookingDates.length * roomPrice;
      console.log("Total amount:", totalAmount);

      // Validate total amount
      if (isNaN(totalAmount) || totalAmount < 0) {
        throw new Error("Invalid total amount calculated");
      }
    } catch (priceError) {
      console.error("Error calculating price:", priceError);
      return res.status(500).json({
        success: false,
        message: "Error calculating price",
        error: priceError.message,
      });
    }

    // Create a Stripe Checkout Session
    console.log("Creating Stripe session with total amount:", totalAmount);
    console.log("Stripe secret key exists:", !!process.env.STRIPE_SECRET_KEY);
    console.log("Frontend URL:", FRONTEND_URL);

    try {
      // Validate total amount before creating session
      if (totalAmount <= 0) {
        throw new Error("Total amount must be greater than 0");
      }

      // Test Stripe connection first
      console.log("Testing Stripe connection...");
      try {
        await stripe.paymentMethods.list({ limit: 1 });
        console.log("Stripe connection successful");
      } catch (stripeTestError) {
        console.error(
          "Stripe connection test failed:",
          stripeTestError.message
        );
        throw new Error(`Stripe connection failed: ${stripeTestError.message}`);
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "EUR", // Changed to EUR to match other controllers
              product_data: {
                name: `Recurring Booking - ${room.name}`,
                description: `${
                  weekday.charAt(0).toUpperCase() + weekday.slice(1)
                } ${timeSlot} (${bookingDates.length} sessions)`,
              },
              unit_amount: Math.round(totalAmount * 100), // Stripe expects amount in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/booking/cancel`,
        client_reference_id: JSON.stringify({
          userId,
          roomId,
          weekday,
          timeSlot,
          startDate,
          endDate,
          recurrencePattern,
          bookingDates: bookingDates.map((date) => date.toISOString()),
        }),
        metadata: {
          userId,
          roomId,
          bookingType: "recurring",
        },
      });

      console.log("Stripe session created successfully:", session.id);

      // Send email with payment link
      await sendEmail({
        to: user.email,
        subject: "Complete Your Recurring Booking Payment",
        html: `
          <h2>Complete Your Recurring Booking</h2>
          <p>Room: ${room.name}</p>
          <p>Day: ${weekday}</p>
          <p>Time Slot: ${timeSlot}</p>
          <p>Start Date: ${startDate}</p>
          ${endDate ? `<p>End Date: ${endDate}</p>` : ""}
          <p>Number of sessions: ${bookingDates.length}</p>
          <p>Total Amount: $${totalAmount}</p>
          <p>Please click the link below to complete your payment:</p>
          <a href="${
            session.url
          }" style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Complete Payment</a>
          <p>This link will expire in 24 hours.</p>
        `,
      });

      return res.status(200).json({
        success: true,
        message: "Payment link sent successfully",
        sessionId: session.id,
        checkoutUrl: session.url,
      });
    } catch (stripeError) {
      console.error("Stripe error details:", {
        message: stripeError.message,
        type: stripeError.type,
        code: stripeError.code,
        stack: stripeError.stack,
      });

      // For development/testing, create bookings without payment
      if (process.env.NODE_ENV === "development") {
        console.log("Creating bookings without payment for development...");
        try {
          const bookings = [];
          for (const date of bookingDates) {
            const booking = new Booking({
              userId: userId,
              roomId: roomId,
              timeSlot,
              date: date.toISOString().split("T")[0],
              dayOfWeek: weekday,
              startTime: getTimeSlotStartTime(timeSlot),
              endTime: getTimeSlotEndTime(timeSlot),
              price: roomPrice,
              status: "upcoming",
              isRecurring: true,
              recurrencePattern: recurrencePattern || "every-week",
              paymentStatus: "pending",
            });
            bookings.push(await booking.save());
          }

          console.log("Created", bookings.length, "bookings without payment");

          return res.status(200).json({
            success: true,
            message:
              "Recurring bookings created successfully (development mode - no payment)",
            bookingsCount: bookings.length,
          });
        } catch (bookingError) {
          console.error(
            "Error creating bookings without payment:",
            bookingError
          );
          return res.status(500).json({
            success: false,
            message: "Failed to create bookings",
            error: bookingError.message,
          });
        }
      }

      return res.status(500).json({
        success: false,
        message: "Failed to create payment session",
        error: stripeError.message,
      });
    }
  } catch (error) {
    console.error("Error creating recurring bookings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create recurring bookings",
      error: error.message,
    });
  }
};

export const checkRoomAvailability = async (req, res) => {
  try {
    const { weekday, timeSlot } = req.query;

    console.log("Availability check request:", { weekday, timeSlot });

    if (!weekday || !timeSlot) {
      console.log("Missing required fields:", { weekday, timeSlot });
      return res.status(400).json({
        success: false,
        message: "Weekday and time slot are required",
      });
    }

    // Get all rooms
    const rooms = await Room.find({ isActive: true });
    console.log("Found rooms:", rooms.length);

    // Check availability for each room
    const availableRoomIds = [];

    for (const room of rooms) {
      console.log(`Checking room: ${room.name} (${room._id})`);

      // Get existing bookings for this room, weekday and time slot
      const existingBookings = await Booking.find({
        roomId: room._id,
        dayOfWeek: weekday,
        timeSlot,
        status: { $nin: ["cancelled", "completed"] },
      });

      console.log(
        `Found ${existingBookings.length} existing bookings for room ${room.name}`
      );

      // If room has no conflicting bookings for this weekday and time slot, it's available
      if (existingBookings.length === 0) {
        availableRoomIds.push(room._id);
        console.log(`Room ${room.name} is available`);
      } else {
        console.log(`Room ${room.name} is not available`);
      }
    }

    console.log("Available room IDs:", availableRoomIds);
    return res.json(availableRoomIds);
  } catch (error) {
    console.error("Error checking room availability:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check room availability",
      error: error.message,
    });
  }
};

// Test endpoint for availability
export const testAvailability = async (req, res) => {
  try {
    console.log("Test availability endpoint called");

    // Get all rooms
    const rooms = await Room.find({});
    console.log(
      "All rooms:",
      rooms.map((r) => ({ id: r._id, name: r.name }))
    );

    // Get all bookings
    const bookings = await Booking.find({});
    console.log(
      "All bookings:",
      bookings.map((b) => ({
        roomId: b.roomId,
        dayOfWeek: b.dayOfWeek,
        timeSlot: b.timeSlot,
        status: b.status,
      }))
    );

    return res.json({
      success: true,
      rooms: rooms.length,
      bookings: bookings.length,
      message: "Test endpoint working",
    });
  } catch (error) {
    console.error("Error in test availability:", error);
    return res.status(500).json({
      success: false,
      message: "Test failed",
      error: error.message,
    });
  }
};

// Webhook handler for Stripe events
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payments
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    try {
      // Get booking details from client_reference_id
      const bookingData = JSON.parse(session.client_reference_id);
      const {
        userId,
        roomId,
        weekday,
        timeSlot,
        startDate,
        endDate,
        recurrencePattern,
        bookingDates,
      } = bookingData;

      // Create bookings
      const bookings = [];
      for (const dateStr of bookingDates) {
        const bookingDate = new Date(dateStr);
        const booking = new Booking({
          userId: userId,
          roomId: roomId,
          timeSlot,
          date: bookingDate.toISOString().split("T")[0],
          dayOfWeek: weekday,
          startTime: getTimeSlotStartTime(timeSlot),
          endTime: getTimeSlotEndTime(timeSlot),
          price: room.price || 0,
          status: "upcoming",
          isRecurring: true,
          recurrencePattern: recurrencePattern || "every-week",
          paymentId: session.id,
          paymentStatus: "paid",
        });

        bookings.push(await booking.save());
      }

      // Get user and room details for email
      const user = await User.findById(userId);
      const room = await Room.findById(roomId);

      // Send confirmation email
      await sendEmail({
        to: user.email,
        subject: "Recurring Booking Confirmed",
        html: `
          <h2>Your Recurring Booking is Confirmed!</h2>
          <p>Room: ${room.name}</p>
          <p>Day: ${weekday}</p>
          <p>Time Slot: ${timeSlot}</p>
          <p>Start Date: ${startDate}</p>
          ${endDate ? `<p>End Date: ${endDate}</p>` : ""}
          <p>Number of bookings: ${bookings.length}</p>
          <p>Payment Status: Completed</p>
          <p>Thank you for your booking!</p>
        `,
      });
    } catch (error) {
      console.error("Error processing successful payment:", error);
      return res
        .status(500)
        .json({ error: "Failed to process payment confirmation" });
    }
  }

  res.json({ received: true });
};

// Helper function to convert weekday string to number
function getWeekdayNumber(weekday) {
  const weekdays = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  return weekdays[weekday.toLowerCase()];
}

// Helper function to get start time for time slot
function getTimeSlotStartTime(timeSlot) {
  const timeSlots = {
    morning: "09:00",
    afternoon: "14:00",
    night: "19:00",
  };
  return timeSlots[timeSlot] || "09:00";
}

// Helper function to get end time for time slot
function getTimeSlotEndTime(timeSlot) {
  const timeSlots = {
    morning: "12:00",
    afternoon: "17:00",
    night: "22:00",
  };
  return timeSlots[timeSlot] || "12:00";
}
