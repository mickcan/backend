import Booking from "../models/booking.js";
import RecurringBookingGroup from "../models/recurringBookingGroup.js";
import Room from "../models/room.js";
import User from "../models/user.js";
import mongoose from "mongoose";
import sendEmail from "../utils/sendEmail.js";
import Stripe from "stripe";
// import { Invoice } from "../models/invoice.js";
import Settings from "../models/settings.js";
import { createInvoiceForPayment } from "../utils/createInvoice.js";
import axios from "axios";

// Create a new booking
export const createBooking = async (req, res) => {
  try {
    const {
      roomId,
      date,
      dayOfWeek,
      timeSlot,
      startTime,
      endTime,
      price,
      paymentStatus,
      paymentId,
    } = req.body;

    // Validate required fields
    if (!roomId || !date || !timeSlot || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details",
      });
    }

    // Check minBookingDuration (days in advance)
    // Import Settings model
    // const Settings = (await import("../models/settings.js")).default;
    const settingsDoc = await Settings.findOne();
    const maxAdvanceBookingDays =
      settingsDoc?.bookingRules?.maxAdvanceBookingDays || 0;

    // Calculate days between today and booking date
    const today = new Date();
    const bookingDate = new Date(date);
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

    // Get user ID from authenticated user
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Check if room exists
    const roomExists = await Room.findById(roomId);
    if (!roomExists) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if booking already exists for this room at this time
    const existingBooking = await Booking.findOne({
      roomId,
      date,
      timeSlot,
      status: { $ne: "cancelled" }, // Exclude cancelled bookings
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "Room is already booked for this time slot",
      });
    }

    // Create the booking
    const booking = new Booking({
      roomId,
      userId,
      date,
      dayOfWeek,
      timeSlot,
      startTime,
      endTime,
      price,
      paymentStatus: paymentStatus || "pending",
      paymentId,
      status: "upcoming",
    });

    // Save the booking
    const savedBooking = await booking.save();

    // Auto-create Stripe invoice if payment is completed
    if (paymentStatus === "paid" && paymentId) {
      try {
        await axios.post(`${process.env.BASE_URL}/api/invoices/auto-create`, {
          bookingId: savedBooking._id,
          paymentIntentId: paymentId,
        });
      } catch (invoiceError) {
        console.error("Failed to create invoice:", invoiceError.message);
        // Don't fail the booking if invoice creation fails
      }
    }

    // Update room statistics
    roomExists.totalBooking += 1;
    if (paymentStatus === "paid") {
      roomExists.revenue += Number(price);
    }
    await roomExists.save();

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: savedBooking,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

// Get user's bookings
export const getUserBookings = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const { status } = req.query;
    const filter = { userId, isRecurring: false };
    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      filter.status = status;
    }

    // Get normal bookings
    const bookings = await Booking.find(filter)
      .populate("roomId", "name capacity timeSlot price images")
      .sort({ date: 1, startTime: 1 })
      .lean();

    // Get recurring bookings from RecurringBookingGroup
    const RecurringBookingGroup = (
      await import("../models/recurringBookingGroup.js")
    ).default;
    const recurringGroups = await RecurringBookingGroup.find({ userId })
      .populate({
        path: "selectedRooms.roomId",
        select: "name capacity timeSlot price images",
      })
      .lean();

    // Flatten recurring bookings into booking-like objects for frontend
    const recurringBookings = [];
    for (const group of recurringGroups) {
      // Collect all booking ObjectIds from monthlyBookings
      const allBookingIds = (group.monthlyBookings || []).flatMap(
        (mb) => mb.bookings || []
      );
      if (allBookingIds.length === 0) continue;

      // Fetch all bookings for this group
      const groupBookings = await (
        await import("../models/booking.js")
      ).default
        .find({ _id: { $in: allBookingIds } })
        .sort({ date: 1 })
        .lean();
      if (groupBookings.length === 0) continue;

      // Get first and last booking date
      const sortedDates = groupBookings.map((b) => b.date).sort();
      const firstDate = sortedDates[0];
      const lastDate = sortedDates[sortedDates.length - 1];

      // For each selected room, create a booking-like object
      for (const selRoom of group.selectedRooms || []) {
        if (!selRoom.roomId) continue;
        // Calculate total price for this room's recurring bookings
        const roomBookings = groupBookings.filter(
          (b) =>
            b.roomId && b.roomId.toString() === selRoom.roomId._id.toString()
        );
        const totalRoomPrice = roomBookings.reduce(
          (sum, b) => sum + (b.price || 0),
          0
        );
        recurringBookings.push({
          _id: `${group._id}_${selRoom.roomId._id}`,
          roomId: selRoom.roomId, // Populated room object
          date: `${firstDate} - ${lastDate}`,
          isRecurring: true,
          timeSlot: selRoom.timeSlot || group.timeSlot,
          status: group.status,
          price: totalRoomPrice,
          recurrencePattern: group.recurrencePattern,
          recurrenceInterval: group.recurrenceInterval,
          weekdays: group.weekdays,
          startTime: group.startTime,
          endTime: group.endTime,
        });
      }
    }

    // Merge normal and recurring bookings
    const allBookings = [...bookings, ...recurringBookings];

    return res.status(200).json({
      success: true,
      data: allBookings,
      count: allBookings.length,
    });
  } catch (error) {
    console.error("Get user bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

// Get room bookings
export const getRoomBookings = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { date, status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid room ID",
      });
    }

    // Build filter
    const filter = { roomId };

    if (date) {
      filter.date = date;
    }

    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      filter.status = status;
    }

    // Get bookings with user details
    const bookings = await Booking.find(filter)
      .populate("userId", "fullName email")
      .sort({ date: 1, startTime: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length,
    });
  } catch (error) {
    console.error("Get room bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch room bookings",
      error: error.message,
    });
  }
};

// Cancel booking
export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or you do not have permission to cancel it",
      });
    }

    // Check if booking is already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking is already cancelled",
      });
    }

    // Check if booking is already completed
    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed booking",
      });
    }

    // Find the room to update statistics
    const room = await Room.findById(booking.roomId);
    if (room) {
      // Decrease total bookings
      room.totalBooking = Math.max(0, (room.totalBooking || 0) - 1);
      // If the booking was paid, decrease revenue
      if (booking.paymentStatus === "paid") {
        room.revenue = Math.max(0, (room.revenue || 0) - (booking.price || 0));
      }
      await room.save();
    }

    // Update booking status
    booking.status = "cancelled";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
};

// Get booking by ID
export const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      userId,
    })
      .populate("roomId")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error("Get booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch booking",
      error: error.message,
    });
  }
};

// Get booked rooms for a specific date and time slot
export const getBookedRooms = async (req, res) => {
  try {
    const { date, timeSlot } = req.query;
    console.log("Fetching booked rooms with params:", { date, timeSlot });

    // Validate required parameters
    if (!date || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Date and timeSlot parameters are required",
      });
    }

    // Auto-update of booking status has been removed as requested
    // Bookings will remain in their original status regardless of time

    // Find all active bookings for this date and time slot (case-insensitive)
    const bookings = await Booking.find({
      date,
      timeSlot: { $regex: `^${timeSlot}$`, $options: "i" },
      status: { $in: ["upcoming", "completed"] }, // Include both upcoming and completed bookings
    }).lean();

    // Extract room IDs from bookings
    const bookedRoomIds = bookings.map((booking) => booking.roomId.toString());

    return res.status(200).json({
      success: true,
      bookedRooms: bookedRoomIds,
      count: bookedRoomIds.length,
    });
  } catch (error) {
    console.error("Get booked rooms error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch booked rooms",
      error: error.message,
    });
  }
};

// Get all bookings (admin only)
export const getAllBookings = async (req, res) => {
  try {
    // This function should only be accessible by admins,
    // We assume admin middleware is applied on the route level

    // Extract query parameters for filtering
    const {
      status,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    // Always only return non-recurring bookings in main data
    let filter = { isRecurring: false };

    // Filter by status if provided
    if (status && ["upcoming", "completed", "cancelled"].includes(status)) {
      filter.status = status;
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    // Handle search functionality - completely avoid ObjectId issues
    if (search && typeof search === "string" && search.trim() !== "") {
      const trimmedSearch = search.trim();

      // Skip search if it looks like problematic data
      if (
        trimmedSearch.toLowerCase() === "current user" ||
        trimmedSearch.toLowerCase() === "currentuser" ||
        trimmedSearch.includes("current") ||
        trimmedSearch.includes("user")
      ) {
        console.log("Skipping problematic search term:", trimmedSearch);
        // Just continue without search filter
      } else {
        try {
          // Find matching users and rooms
          const matchingUsers = await User.find({
            $or: [
              { fullName: { $regex: trimmedSearch, $options: "i" } },
              { email: { $regex: trimmedSearch, $options: "i" } },
            ],
          })
            .select("_id")
            .lean();

          const matchingRooms = await Room.find({
            name: { $regex: trimmedSearch, $options: "i" },
          })
            .select("_id")
            .lean();

          // Build OR conditions only if we have matches
          const orConditions = [];

          if (matchingUsers && matchingUsers.length > 0) {
            // Double-check that all user IDs are valid ObjectIds
            const validUserIds = matchingUsers
              .map((user) => user._id)
              .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

            if (validUserIds.length > 0) {
              orConditions.push({ userId: { $in: validUserIds } });
            }
          }

          if (matchingRooms && matchingRooms.length > 0) {
            // Double-check that all room IDs are valid ObjectIds
            const validRoomIds = matchingRooms
              .map((room) => room._id)
              .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

            if (validRoomIds.length > 0) {
              orConditions.push({ roomId: { $in: validRoomIds } });
            }
          }

          // Only add $or condition if we have valid conditions
          if (orConditions.length > 0) {
            filter.$or = orConditions;
          } else {
            // No matches found, return empty result
            return res.status(200).json({
              success: true,
              data: [],
              pagination: {
                total: 0,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
                pages: 0,
              },
            });
          }
        } catch (searchError) {
          console.error("Search error:", searchError);
          // Continue without search filter instead of failing
        }
      }
    }

    // CRITICAL: Add filter to exclude bookings with invalid ObjectIds
    // This prevents the casting error during populate
    filter.userId = {
      $exists: true,
      $type: "objectId", // Only include documents where userId is actually an ObjectId
    };
    filter.roomId = {
      $exists: true,
      $type: "objectId", // Only include documents where roomId is actually an ObjectId
    };

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Log the final filter for debugging
    console.log("Final booking filter:", JSON.stringify(filter, null, 2));

    // Count total documents
    let total = 0;
    try {
      total = await Booking.countDocuments(filter);
    } catch (countError) {
      console.error("Count error:", countError);
      return res.status(400).json({
        success: false,
        message: "Invalid filter parameters",
        error: countError.message,
      });
    }

    // Fetch bookings with error handling
    let bookings = [];
    try {
      bookings = await Booking.find(filter)
        .populate({
          path: "userId",
          select: "fullName email",
          options: { strictPopulate: false },
        })
        .populate({
          path: "roomId",
          select: "name capacity price images",
          options: { strictPopulate: false },
        })
        .sort({ date: -1, startTime: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
    } catch (queryError) {
      console.error("Booking query error:", queryError);
      return res.status(400).json({
        success: false,
        message: "Database query failed",
        error: queryError.message,
      });
    }

    // If ?includeRecurring=true, fetch recurring bookings from RecurringBookingGroup and send separately
    let recurringGroups = [];
    if (req.query.includeRecurring === "true") {
      try {
        recurringGroups = await RecurringBookingGroup.find({})
          .populate("userId", "fullName email")
          .populate({
            path: "selectedRooms.roomId",
            select: "name capacity price images",
            options: { strictPopulate: false },
          })
          .lean();
      } catch (recurringError) {
        console.error("Recurring bookings query error:", recurringError);
        // Continue with empty array
        recurringGroups = [];
      }
    }

    // Format recurring bookings data for response
    const recurringBookings = recurringGroups.map((group) => {
      return {
        groupId: group._id,
        user: group.userId
          ? {
              _id: group.userId._id,
              fullName: group.userId.fullName,
              email: group.userId.email,
            }
          : null,
        rooms: Array.isArray(group.selectedRooms)
          ? group.selectedRooms.map((r) =>
              r.roomId
                ? {
                    _id: r.roomId._id,
                    name: r.roomId.name,
                    capacity: r.roomId.capacity,
                    price: r.roomId.price,
                    images: r.roomId.images,
                    timeSlot: r.timeSlot,
                    availability: r.availability,
                  }
                : null
            )
          : [],
        timeSlot: group.timeSlot,
        startTime: group.startTime,
        endTime: group.endTime,
        weekdays: group.weekdays,
        startDate: group.startDate,
        endDate: group.endDate,
        recurrencePattern: group.recurrencePattern,
        recurrenceInterval: group.recurrenceInterval,
        status: group.status,
        price: group.price,
        monthlyBookings: Array.isArray(group.monthlyBookings)
          ? group.monthlyBookings.map((mb) => ({
              month: mb.month,
              price: mb.price,
              paymentStatus: mb.paymentStatus,
              bookings: mb.bookings,
              stripeInvoiceId: mb.stripeInvoiceId,
              invoiceId: mb.invoiceId,
            }))
          : [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      recurringBookings,
    });
  } catch (error) {
    console.error("Get all bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
};

// Admin Cancel booking
export const adminCancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find booking by id
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check if booking is already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking is already cancelled",
      });
    }

    // Check if booking is completed
    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed booking",
      });
    }

    // Find the room to update statistics
    const room = await Room.findById(booking.roomId);
    if (room) {
      // Decrease total bookings
      room.totalBooking = Math.max(0, (room.totalBooking || 0) - 1);
      // If the booking was paid, decrease revenue
      if (booking.paymentStatus === "paid") {
        room.revenue = Math.max(0, (room.revenue || 0) - (booking.price || 0));
      }
      await room.save();
    }

    // Update booking status to cancelled
    booking.status = "cancelled";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Admin cancel booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
};

// Admin Delete booking
export const adminDeleteBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find booking first to get its details before deletion
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Find the room to update statistics
    const room = await Room.findById(booking.roomId);
    if (room && booking.status !== "cancelled") {
      // Only decrease stats if the booking wasn't already cancelled
      // Decrease total bookings
      room.totalBooking = Math.max(0, (room.totalBooking || 0) - 1);
      // If the booking was paid, decrease revenue
      if (booking.paymentStatus === "paid") {
        room.revenue = Math.max(0, (room.revenue || 0) - (booking.price || 0));
      }
      await room.save();
    }

    // Now delete the booking using findByIdAndDelete
    await Booking.findByIdAndDelete(bookingId);

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
    });
  } catch (error) {
    console.error("Admin delete booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete booking",
      error: error.message,
    });
  }
};

// Create recurring bookings
export const createRecurringBooking = async (req, res) => {
  try {
    console.log("Received recurring booking request:", req.body);

    const { userId, roomId, timeSlot, dates, customPrice } = req.body;

    // Detailed validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "roomId is required",
      });
    }
    if (!timeSlot) {
      return res.status(400).json({
        success: false,
        message: "timeSlot is required",
      });
    }
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "dates must be a non-empty array",
      });
    }

    // Validate time slot value
    if (!["morning", "afternoon", "night"].includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: "Invalid timeSlot. Must be 'morning', 'afternoon', or 'night'",
      });
    }

    // Initialize Stripe
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("Stripe secret key is missing");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Check if user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Get time slot details based on timeSlot (morning, afternoon, night)
    let startTime, endTime;
    switch (timeSlot) {
      case "morning":
        startTime = "09:00 AM";
        endTime = "12:00 PM";
        break;
      case "afternoon":
        startTime = "01:00 PM";
        endTime = "05:00 PM";
        break;
      case "night":
        startTime = "06:00 PM";
        endTime = "10:00 PM";
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid time slot",
        });
    }

    // Calculate price (use custom price if provided, otherwise use room price)
    const price = customPrice ? Number(customPrice) : room.pricePerDay;

    // Calculate total price for all bookings
    const totalPrice = price * dates.length;

    // Create Stripe checkout session
    console.log("Creating Stripe session with data:", {
      email: userExists.email,
      roomName: room.name,
      timeSlot,
      datesCount: dates.length,
      totalPrice,
    });

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: userExists.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Recurring Booking - ${room.name}`,
                description: `${dates.length} bookings for ${timeSlot} slot`,
              },
              unit_amount: Math.round(totalPrice * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/booking-cancelled`,
        metadata: {
          userId,
          roomId,
          timeSlot,
          dates: JSON.stringify(dates),
          customPrice: customPrice ? String(customPrice) : "",
        },
      });
      console.log("Stripe session created successfully:", session.id);
      return session;
    } catch (stripeError) {
      console.error("Stripe session creation error:", stripeError);
      throw new Error(
        "Failed to create payment session: " + stripeError.message
      );
    }

    // Create bookings with pending status
    console.log("Creating bookings for dates:", dates);

    const bookingPromises = dates.map(async (date) => {
      try {
        const dayOfWeek = new Date(date).getDay();

        // Check if the date is already booked
        const existingBooking = await Booking.findOne({
          roomId,
          date,
          timeSlot,
          status: { $ne: "cancelled" },
        });

        if (existingBooking) {
          console.log(`Date ${date} is already booked`);
          return null;
        }

        const booking = await Booking.create({
          userId,
          roomId,
          date,
          dayOfWeek,
          timeSlot,
          startTime,
          endTime,
          price,
          status: "pending", // Set initial status as pending
          paymentStatus: "pending",
          paymentId: session.id, // Store Stripe session ID
        });

        console.log(`Booking created for date ${date}:`, booking._id);
        return booking;
      } catch (error) {
        console.error(`Error creating booking for date ${date}:`, error);
        return null;
      }
    });

    const bookings = await Promise.all(bookingPromises);
    const successfulBookings = bookings.filter((booking) => booking !== null);
    const failedBookings = dates.length - successfulBookings.length;

    // Send confirmation email with payment link
    try {
      console.log("Sending confirmation email to:", userExists.email);

      await sendEmail({
        email: userExists.email,
        subject: "Complete Your Recurring Booking Payment",
        html: `
          <h1>Complete Your Booking Payment</h1>
          <p>Thank you for booking ${room.name} for ${dates.length} dates.</p>
          <p>Total amount: $${totalPrice}</p>
          <p>Please click the link below to complete your payment:</p>
          <a href="${
            session.url
          }" style="background-color: #6B5843; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Pay Now
          </a>
          <p>Your bookings will be confirmed once the payment is complete.</p>
          <p>Booking Details:</p>
          <ul>
            ${dates.map((date) => `<li>${date} (${timeSlot})</li>`).join("")}
          </ul>
        `,
      });

      console.log("Confirmation email sent successfully");
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Don't throw error here, continue with the response
    }

    return res.status(200).json({
      success: true,
      message: "Recurring bookings created and payment email sent",
      data: {
        paymentLink: session.url,
        failedBookings:
          failedBookings > 0 ? dates.filter((_, i) => !bookings[i]) : [],
        successfulBookings: successfulBookings.length,
      },
    });
  } catch (error) {
    console.error("Create recurring booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create recurring bookings",
      error: error.message,
    });
  }
};

// Get booked dates for a room and time slot
export const getBookedDates = async (req, res) => {
  try {
    const { roomId, timeSlot } = req.query;

    // Validate required fields
    if (!roomId || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Room ID and time slot are required",
      });
    }

    // Find bookings for the room and time slot
    const bookings = await Booking.find({
      roomId,
      timeSlot,
      status: { $ne: "cancelled" },
    });

    // Extract unique dates
    const bookedDates = [...new Set(bookings.map((booking) => booking.date))];

    return res.status(200).json({
      success: true,
      bookedDates,
    });
  } catch (error) {
    console.error("Get booked dates error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get booked dates",
      error: error.message,
    });
  }
};

// Handle Stripe webhook
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Update all bookings associated with this payment
      await Booking.updateMany(
        { paymentId: session.id },
        {
          $set: {
            status: "upcoming",
            paymentStatus: "paid",
            stripePaymentId: session.payment_intent,
          },
        }
      );

      // Get the updated bookings
      const bookings = await Booking.find({ paymentId: session.id }).populate(
        "userId roomId"
      );

      // Create invoices for each successful booking
      for (const booking of bookings) {
        try {
          await createInvoiceForPayment(
            booking,
            booking.userId,
            booking.roomId,
            session.payment_intent,
            "stripe"
          );
        } catch (invoiceError) {
          console.error(
            `Failed to create invoice for booking ${booking._id}:`,
            invoiceError
          );
          // Don't fail the webhook if invoice creation fails
        }
      }

      // Send confirmation email
      if (bookings.length > 0) {
        const user = await User.findById(bookings[0].userId);
        const room = await Room.findById(bookings[0].roomId);

        if (user && room) {
          await sendEmail({
            email: user.email,
            subject: "Booking Confirmation",
            html: `
              <h1>Booking Confirmed!</h1>
              <p>Your bookings for ${room.name} have been confirmed.</p>
              <p>Details:</p>
              <ul>
                ${bookings
                  .map(
                    (booking) => `
                  <li>Date: ${booking.date}, Time: ${booking.startTime} - ${booking.endTime}</li>
                `
                  )
                  .join("")}
              </ul>
              <p>Thank you for your booking!</p>
            `,
          });
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

// Handle recurring booking cancellation
export const cancelRecurringBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { cancelFuture } = req.query;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // If it's part of a recurring series and cancelFuture is true
    if (
      booking.isRecurring &&
      booking.recurrenceGroupId &&
      cancelFuture === "true"
    ) {
      const bookingDate = new Date(booking.date);

      // Cancel all future bookings in the series
      await Booking.updateMany(
        {
          recurrenceGroupId: booking.recurrenceGroupId,
          date: { $gte: bookingDate },
        },
        {
          status: "cancelled",
        }
      );

      return res.json({
        success: true,
        message: "All future recurring bookings cancelled successfully",
      });
    }

    // Cancel just this booking
    booking.status = "cancelled";
    await booking.save();

    return res.json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling recurring booking:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
};
