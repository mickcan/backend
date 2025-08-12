import Stripe from "stripe";
import dotenv from "dotenv";
import { Invoice } from "../models/invoice.js";
import User from "../models/user.js";
import Booking from "../models/booking.js";
import Room from "../models/room.js";
import mongoose from "mongoose";
import RecurringBookingGroup from "../models/recurringBookingGroup.js";

import {
  createInvoiceForPayment,
  updateInvoicePaymentStatus,
} from "../utils/createInvoice.js";
import sendEmail from "../utils/sendEmail.js";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Auto-create invoice for a booking with successful payment
export const autoCreateInvoice = async (req, res) => {
  try {
    const { bookingId, paymentIntentId } = req.body;

    if (!bookingId || !paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: bookingId, paymentIntentId",
      });
    }

    // Find the booking
    const booking = await Booking.findById(bookingId).populate("roomId userId");
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check if invoice already exists
    const existingInvoice = await Invoice.findOne({ bookingId });
    if (existingInvoice) {
      // Update existing invoice status
      await updateInvoicePaymentStatus(bookingId, paymentIntentId);
      return res.status(200).json({
        success: true,
        message: "Invoice already exists, status updated",
        data: existingInvoice,
      });
    }

    // Create new invoice
    const invoice = await createInvoiceForPayment(
      booking,
      booking.userId,
      booking.roomId,
      paymentIntentId,
      "stripe"
    );

    if (!invoice) {
      return res.status(500).json({
        success: false,
        message: "Failed to create invoice",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Error auto-creating invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message,
    });
  }
};

// Create a single invoice for a specific booking
export const createSingleInvoice = async (req, res) => {
  try {
    const {
      bookingId,
      userId,
      amount,
      description,
      currency = "eur",
    } = req.body;

    if (!bookingId || !userId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: bookingId, userId, amount",
      });
    }

    // Verify booking exists
    const booking = await Booking.findById(bookingId).populate("roomId userId");
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create Stripe customer if not exists
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });
    }

    // Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      currency: currency,
      metadata: {
        bookingId: bookingId,
        userId: userId,
        roomName: booking.roomId?.name || "Unknown Room",
      },
    });

    // Add invoice items
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      description:
        description ||
        `Booking for ${booking.roomId?.name || "Room"} on ${(() => {
          try {
            // Handle different date formats
            let dateObj;
            if (booking.date && booking.date.includes("-")) {
              // Handle DD-MM-YYYY format
              const parts = booking.date.split("-");
              if (parts.length === 3) {
                const [day, month, year] = parts;
                dateObj = new Date(
                  parseInt(year),
                  parseInt(month) - 1,
                  parseInt(day)
                );
              } else {
                // Handle MM-DD-YYYY format
                const [month, day, year] = parts;
                dateObj = new Date(
                  parseInt(year),
                  parseInt(month) - 1,
                  parseInt(day)
                );
              }
            } else {
              // Handle standard date format
              dateObj = new Date(booking.date);
            }

            if (isNaN(dateObj.getTime())) {
              console.error("Invalid date for invoice:", booking.date);
              return booking.date || "Unknown Date";
            }

            return dateObj.toLocaleDateString();
          } catch (error) {
            console.error(
              "Error formatting date for invoice:",
              booking.date,
              error
            );
            return booking.date || "Unknown Date";
          }
        })()}`,
    });

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // Save to database
    const invoiceRecord = new Invoice({
      bookingId: bookingId,
      userId: userId,
      stripeInvoiceId: finalizedInvoice.id,
      amount: amount,
      currency: currency,
      paymentId: "", // Will be filled when paid
      paymentMethod: "stripe",
      status: "created",
      invoiceUrl: finalizedInvoice.hosted_invoice_url,
    });

    await invoiceRecord.save();

    return res.status(200).json({
      success: true,
      message: "Invoice created successfully",
      data: {
        invoiceId: finalizedInvoice.id,
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
        amount: amount,
        currency: currency,
        status: "created",
      },
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message,
    });
  }
};

// Send invoice to customer
export const sendInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({ stripeInvoiceId: invoiceId });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Send invoice via Stripe
    const sentInvoice = await stripe.invoices.sendInvoice(invoiceId);

    // Update status in database
    invoice.status = "sent";
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: "Invoice sent successfully",
      data: {
        invoiceId: sentInvoice.id,
        status: "sent",
        hostedInvoiceUrl: sentInvoice.hosted_invoice_url,
      },
    });
  } catch (error) {
    console.error("Error sending invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send invoice",
      error: error.message,
    });
  }
};

// Create bulk invoices for all users
export const createBulkInvoices = async (req, res) => {
  try {
    const { startDate, endDate, roomId, currency = "eur" } = req.body;

    // Build query for bookings
    let query = {};

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (roomId) {
      query.roomId = roomId;
    }

    // Get all bookings that match criteria
    const bookings = await Booking.find(query)
      .populate("roomId userId")
      .sort({ date: 1 });

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bookings found for the specified criteria",
      });
    }

    const createdInvoices = [];
    const errors = [];

    for (const booking of bookings) {
      try {
        // Skip if user doesn't exist
        if (!booking.userId) {
          errors.push(`Booking ${booking._id}: User not found`);
          continue;
        }

        // Check if invoice already exists for this booking
        const existingInvoice = await Invoice.findOne({
          bookingId: booking._id,
        });
        if (existingInvoice) {
          errors.push(`Booking ${booking._id}: Invoice already exists`);
          continue;
        }

        // Create or get customer
        let customer;
        const existingCustomers = await stripe.customers.list({
          email: booking.userId.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: booking.userId.email,
            name: booking.userId.name,
            metadata: {
              userId: booking.userId._id.toString(),
            },
          });
        }

        // Create Stripe invoice
        const invoice = await stripe.invoices.create({
          customer: customer.id,
          currency: currency,
          metadata: {
            bookingId: booking._id.toString(),
            userId: booking.userId._id.toString(),
            roomName: booking.roomId?.name || "Unknown Room",
          },
        });

        // Add invoice items
        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: Math.round(booking.price * 100), // Convert to cents
          currency: currency,
          description: `Booking for ${
            booking.roomId?.name || "Room"
          } on ${(() => {
            try {
              // Handle different date formats
              let dateObj;
              if (booking.date && booking.date.includes("-")) {
                // Handle DD-MM-YYYY format
                const parts = booking.date.split("-");
                if (parts.length === 3) {
                  const [day, month, year] = parts;
                  dateObj = new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day)
                  );
                } else {
                  // Handle MM-DD-YYYY format
                  const [month, day, year] = parts;
                  dateObj = new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day)
                  );
                }
              } else {
                // Handle standard date format
                dateObj = new Date(booking.date);
              }

              if (isNaN(dateObj.getTime())) {
                console.error("Invalid date for invoice:", booking.date);
                return booking.date || "Unknown Date";
              }

              return dateObj.toLocaleDateString();
            } catch (error) {
              console.error(
                "Error formatting date for invoice:",
                booking.date,
                error
              );
              return booking.date || "Unknown Date";
            }
          })()}`,
        });

        // Finalize the invoice
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(
          invoice.id
        );

        // Save to database
        const invoiceRecord = new Invoice({
          bookingId: booking._id,
          userId: booking.userId._id,
          stripeInvoiceId: finalizedInvoice.id,
          amount: booking.price,
          currency: currency,
          paymentId: "",
          paymentMethod: "stripe",
          status: "created",
          invoiceUrl: finalizedInvoice.hosted_invoice_url,
        });

        await invoiceRecord.save();

        createdInvoices.push({
          bookingId: booking._id,
          invoiceId: finalizedInvoice.id,
          amount: booking.price,
          userEmail: booking.userId.email,
          roomName: booking.roomId?.name,
          date: booking.date,
        });
      } catch (error) {
        errors.push(`Booking ${booking._id}: ${error.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk invoice creation completed. ${createdInvoices.length} invoices created.`,
      data: {
        createdInvoices,
        errors,
        totalCreated: createdInvoices.length,
        totalErrors: errors.length,
      },
    });
  } catch (error) {
    console.error("Error creating bulk invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create bulk invoices",
      error: error.message,
    });
  }
};

// Send bulk invoices
export const sendBulkInvoices = async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds)) {
      return res.status(400).json({
        success: false,
        message: "invoiceIds array is required",
      });
    }

    const sentInvoices = [];
    const errors = [];

    for (const invoiceId of invoiceIds) {
      try {
        // Check if invoice exists in our database
        const invoice = await Invoice.findOne({ stripeInvoiceId: invoiceId });
        if (!invoice) {
          errors.push(`Invoice ${invoiceId}: Not found in database`);
          continue;
        }

        // Send invoice via Stripe
        const sentInvoice = await stripe.invoices.sendInvoice(invoiceId);

        // Update status in database
        invoice.status = "sent";
        await invoice.save();

        sentInvoices.push({
          invoiceId: sentInvoice.id,
          status: "sent",
          hostedInvoiceUrl: sentInvoice.hosted_invoice_url,
        });
      } catch (error) {
        errors.push(`Invoice ${invoiceId}: ${error.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk invoice sending completed. ${sentInvoices.length} invoices sent.`,
      data: {
        sentInvoices,
        errors,
        totalSent: sentInvoices.length,
        totalErrors: errors.length,
      },
    });
  } catch (error) {
    console.error("Error sending bulk invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send bulk invoices",
      error: error.message,
    });
  }
};

// Get all invoices with filters
export const getInvoices = async (req, res) => {
  try {
    const {
      status,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.userId = userId;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const invoices = await Invoice.find(query)
      .populate("userId", "name email")
      .populate("bookingId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Invoice.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalInvoices: total,
          hasNextPage: skip + invoices.length < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
};

// Get single invoice
export const getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({ stripeInvoiceId: invoiceId })
      .populate("userId", "name email")
      .populate("bookingId");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoice",
      error: error.message,
    });
  }
};

// Delete invoice
export const deleteInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({ stripeInvoiceId: invoiceId });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Delete from Stripe
    await stripe.invoices.del(invoiceId);

    // Delete from database
    await Invoice.findByIdAndDelete(invoice._id);

    return res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete invoice",
      error: error.message,
    });
  }
};

// Get invoice statistics
export const getInvoiceStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    const stats = await Invoice.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const totalInvoices = await Invoice.countDocuments(dateFilter);
    const totalAmount = await Invoice.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const statsObject = {
      total: totalInvoices,
      totalAmount: totalAmount[0]?.total || 0,
      byStatus: {},
    };

    stats.forEach((stat) => {
      statsObject.byStatus[stat._id] = {
        count: stat.count,
        amount: stat.totalAmount,
      };
    });

    return res.status(200).json({
      success: true,
      data: statsObject,
    });
  } catch (error) {
    console.error("Error fetching invoice stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoice statistics",
      error: error.message,
    });
  }
};

// Get user billing data with booking summaries

export const getUserBillingData = async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;

    // Fetch all single (non-recurring) bookings with valid invoices
    const singleBookingQuery = { isRecurring: false };
    if (startDate && endDate) {
      singleBookingQuery.date = { $gte: startDate, $lte: endDate };
    }
    if (search) {
      // Find userIds matching search
      const userIds = await User.find({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).distinct("_id");
      singleBookingQuery.userId = { $in: userIds };
    }

    // Find all single bookings
    const singleBookings = await Booking.find(singleBookingQuery)
      .populate("userId")
      .populate("roomId");

    // For each single booking, get invoice and only include if invoice exists and has invoiceUrl
    const singleBookingsWithInvoice = [];
    for (const booking of singleBookings) {
      const invoiceDoc = await Invoice.findOne({ bookingId: booking._id });
      if (invoiceDoc && invoiceDoc.invoiceUrl && invoiceDoc._id) {
        singleBookingsWithInvoice.push({
          _id: booking._id,
          roomId: {
            _id: booking.roomId?._id,
            name: booking.roomId?.name || "Room",
          },
          timeSlot: booking.timeSlot,
          startTime: booking.startTime,
          endTime: booking.endTime,
          date: booking.date,
          price: booking.price,
          status: booking.status,
          isRecurring: false,
          recurringPeriod: null,
          invoiceUrl: invoiceDoc.invoiceUrl,
          invoiceId: invoiceDoc._id,
          paymentStatus: booking.paymentStatus,
          userId: booking.userId?._id,
          userName: booking.userId?.fullName,
          userEmail: booking.userId?.email,
        });
      }
    }

    // Group single bookings by user
    const singleBookingsByUser = {};
    for (const b of singleBookingsWithInvoice) {
      const userId = b.userId.toString();
      if (!singleBookingsByUser[userId]) {
        singleBookingsByUser[userId] = {
          _id: b.userId,
          name: b.userName,
          email: b.userEmail,
          bookings: [],
        };
      }
      singleBookingsByUser[userId].bookings.push(b);
    }

    // Now fetch recurring bookings as before
    // Query for recurring booking groups
    let recurringQuery = {
      status: "active",
      "monthlyBookings.0": { $exists: true },
    };

    if (startDate && endDate) {
      recurringQuery.startDate = { $lte: new Date(endDate) };
      recurringQuery.$or = [
        { endDate: { $gte: new Date(startDate) } },
        { endDate: null },
      ];
    }

    if (search) {
      const userIds = await User.find({
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).distinct("_id");
      recurringQuery.userId = { $in: userIds };
    }

    const recurringGroups = await RecurringBookingGroup.find(recurringQuery)
      .populate("userId")
      .populate({ path: "selectedRooms.roomId", select: "name" })
      .lean();

    // Process recurring groups to match the regular bookings format
    const recurringData = await Promise.all(
      recurringGroups
        .filter((group) => group.userId) // skip if userId is null (user deleted)
        .map(async (group) => {
          // Only include months that have at least one booking AND an invoiceId or stripeInvoiceId
          const filteredMonths = group.monthlyBookings.filter(
            (mb) =>
              mb.bookings?.length > 0 && (mb.invoiceId || mb.stripeInvoiceId)
          );
          const monthlyBookings = await Promise.all(
            filteredMonths.map(async (month) => {
              // Get first and last booking dates
              const [firstBooking, lastBooking] = await Promise.all([
                Booking.findById(month.bookings[0]).lean(),
                Booking.findById(
                  month.bookings[month.bookings.length - 1]
                ).lean(),
              ]);

              // Get invoice URL if exists
              let invoiceDoc = null;
              if (month.invoiceId) {
                invoiceDoc = await Invoice.findById(month.invoiceId).lean();
              } else if (month.stripeInvoiceId) {
                invoiceDoc = await Invoice.findOne({
                  stripeInvoiceId: month.stripeInvoiceId,
                }).lean();
              }
              const invoiceUrl = invoiceDoc?.invoiceUrl || null;
              const invoiceId = invoiceDoc?._id || null;

              return {
                _id: month.bookings[0], // Use first booking ID as identifier
                roomId: {
                  _id: group.selectedRooms?.[0]?.roomId?._id,
                  name: group.selectedRooms?.[0]?.roomId?.name || "Room",
                },
                timeSlot: group.timeSlot,
                startTime: firstBooking?.startTime || group.startTime,
                endTime: firstBooking?.endTime || group.endTime,
                date: `${firstBooking?.date || ""} to ${
                  lastBooking?.date || ""
                }`,
                price: month.price,
                status: "upcoming", // Or calculate based on dates
                isRecurring: true,
                recurringPeriod: month.month,
                invoiceUrl,
                invoiceId,
                paymentStatus: month.paymentStatus,
                userId: group.userId._id,
                userName: group.userId.fullName,
                userEmail: group.userId.email,
              };
            })
          );

          return {
            _id: group.userId._id,
            name: group.userId.fullName,
            email: group.userId.email,
            bookings: monthlyBookings,
          };
        })
    );

    // Combine both datasets
    // Merge non-recurring and recurring bookings for each user
    // Build a map of userId to user data
    const userMap = new Map();
    // Add single bookings by user
    Object.values(singleBookingsByUser).forEach((user) => {
      userMap.set(user._id.toString(), {
        _id: user._id,
        name: user.name,
        email: user.email,
        bookings: user.bookings.map((b) => ({ ...b, isRecurring: false })),
      });
    });
    // Add recurring bookings by user
    recurringData.forEach((user) => {
      const key = user._id.toString();
      const recurringBookings = (user.bookings || []).map((b) => ({
        ...b,
        isRecurring: true,
      }));
      if (userMap.has(key)) {
        userMap.get(key).bookings.push(...recurringBookings);
      } else {
        userMap.set(key, {
          _id: user._id,
          name: user.name,
          email: user.email,
          bookings: recurringBookings,
        });
      }
    });

    // For each user, filter out bookings with null invoiceId or invoiceUrl, and recalculate bookingCount and totalSpent
    const finalData = Array.from(userMap.values())
      .map((user) => {
        const filteredBookings = (user.bookings || []).filter(
          (b) => b.invoiceId !== null && b.invoiceUrl !== null
        );
        // Log which bookings are regular and which are recurring for this user
        const regular = filteredBookings.filter((b) => b.isRecurring === false);
        const recurring = filteredBookings.filter(
          (b) => b.isRecurring === true
        );
        console.log(`User: ${user.name} (${user.email})`);
        console.log(
          "Regular bookings:",
          regular.map((b) => b._id)
        );
        console.log(
          "Recurring bookings:",
          recurring.map((b) => b._id)
        );
        return {
          ...user,
          bookings: filteredBookings,
          bookingCount: filteredBookings.length,
          totalSpent: filteredBookings.reduce((sum, b) => sum + b.price, 0),
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Fallback data if no results found
    if (finalData.length === 0) {
      const usersWithBookings = await User.aggregate([
        {
          $lookup: {
            from: "bookings",
            localField: "_id",
            foreignField: "userId",
            as: "bookings",
          },
        },
        {
          $project: {
            _id: 1,
            name: "$fullName",
            email: 1,
            bookingCount: { $size: "$bookings" },
            totalSpent: { $sum: "$bookings.price" },
            bookings: {
              $map: {
                input: "$bookings",
                as: "booking",
                in: {
                  _id: "$$booking._id",
                  roomId: "$$booking.roomId",
                  timeSlot: "$$booking.timeSlot",
                  startTime: "$$booking.startTime",
                  endTime: "$$booking.endTime",
                  date: "$$booking.date",
                  price: "$$booking.price",
                  status: "$$booking.status",
                  isRecurring: "$$booking.isRecurring",
                  recurringPeriod: null,
                },
              },
            },
          },
        },
        { $sort: { totalSpent: -1 } },
      ]);

      return res.status(200).json({
        success: true,
        data: usersWithBookings,
        count: usersWithBookings.length,
      });
    }

    return res.status(200).json({
      success: true,
      data: finalData,
      count: finalData.length,
    });
  } catch (error) {
    console.error("Error getting user billing data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get user billing data",
      error: error.message,
    });
  }
};

// export const getUserBillingData = async (req, res) => {
//   try {
//     const { startDate, endDate, search } = req.query;

//     // Non-recurring bookings (same as before)
//     const baseMatch = { isRecurring: false };
//     if (startDate && endDate) {
//       baseMatch.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate),
//       };
//     }
//     const pipeline = [
//       { $match: baseMatch },
//       {
//         $lookup: {
//           from: "users",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user",
//         },
//       },
//       { $unwind: "$user" },
//       {
//         $lookup: {
//           from: "rooms",
//           localField: "roomId",
//           foreignField: "_id",
//           as: "room",
//         },
//       },
//       { $unwind: "$room" },
//       {
//         $group: {
//           _id: "$userId",
//           user: { $first: "$user" },
//           bookings: {
//             $push: {
//               _id: "$_id",
//               roomId: "$room",
//               timeSlot: "$timeSlot",
//               startTime: "$startTime",
//               endTime: "$endTime",
//               date: "$date",
//               price: "$price",
//               status: "$status",
//             },
//           },
//           bookingCount: { $sum: 1 },
//           totalSpent: { $sum: "$price" },
//         },
//       },
//       {
//         $addFields: {
//           bookings: {
//             $map: {
//               input: "$bookings",
//               as: "booking",
//               in: {
//                 $mergeObjects: [
//                   "$$booking",
//                   {
//                     invoiceUrl: null,
//                     invoiceId: null,
//                   },
//                 ],
//               },
//             },
//           },
//         },
//       },
//       {
//         $project: {
//           _id: 1,
//           name: "$user.fullName",
//           email: "$user.email",
//           bookings: 1,
//           bookingCount: 1,
//           totalSpent: 1,
//         },
//       },
//       { $sort: { totalSpent: -1 } },
//     ];
//     if (search) {
//       pipeline.unshift({
//         $lookup: {
//           from: "users",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user",
//         },
//       });
//       pipeline.unshift({ $unwind: "$user" });
//       pipeline.unshift({
//         $match: {
//           $or: [
//             { "user.fullName": { $regex: search, $options: "i" } },
//             { "user.email": { $regex: search, $options: "i" } },
//           ],
//         },
//       });
//     }
//     const userBillingData = await Booking.aggregate(pipeline);

//     // Recurring bookings: group by user, then for each group, for each month, filter out months without invoice
//     // Get all recurring booking groups
//     let recurringGroupsQuery = {};
//     if (startDate && endDate) {
//       recurringGroupsQuery.startDate = { $lte: new Date(endDate) };
//       recurringGroupsQuery.$or = [
//         { endDate: { $gte: new Date(startDate) } },
//         { endDate: null },
//       ];
//     }
//     if (search) {
//       // Find userIds matching search
//       const userIds = await User.find({
//         $or: [
//           { fullName: { $regex: search, $options: "i" } },
//           { email: { $regex: search, $options: "i" } },
//         ],
//       }).distinct("_id");
//       recurringGroupsQuery.userId = { $in: userIds };
//     }
//     const recurringGroups = await RecurringBookingGroup.find(
//       recurringGroupsQuery
//     )
//       .populate("userId")
//       .populate({ path: "selectedRooms.roomId" })
//       .lean();

//     // For each user, group their recurring bookings
//     const recurringByUser = {};
//     for (const group of recurringGroups) {
//       if (!group.userId) continue;
//       const userId = group.userId._id.toString();
//       if (!recurringByUser[userId]) {
//         recurringByUser[userId] = {
//           _id: userId,
//           name: group.userId.fullName,
//           email: group.userId.email,
//           recurringGroups: [],
//         };
//       }
//       // For each month in monthlyBookings, filter out if no invoice
//       const filteredMonths = (group.monthlyBookings || []).filter(
//         (mb) => mb.stripeInvoiceId
//       );
//       for (const month of filteredMonths) {
//         // Get all bookings for this month
//         // We'll need to fetch Booking details for first/last booking
//         let firstBooking = null;
//         let lastBooking = null;
//         if (Array.isArray(month.bookings) && month.bookings.length > 0) {
//           // Sort by date
//           const bookings = await Booking.find({ _id: { $in: month.bookings } })
//             .sort({ date: 1 })
//             .populate("roomId");
//           if (bookings.length > 0) {
//             firstBooking = bookings[0];
//             lastBooking = bookings[bookings.length - 1];
//           }
//         }
//         // Get invoice link
//         let invoiceUrl = null;
//         if (month.stripeInvoiceId) {
//           const invoiceDoc = await Invoice.findOne({
//             stripeInvoiceId: month.stripeInvoiceId,
//           });
//           invoiceUrl = invoiceDoc?.invoiceUrl || null;
//         }
//         recurringByUser[userId].recurringGroups.push({
//           _id: group._id,
//           month: month.month,
//           room:
//             firstBooking?.roomId?.name ||
//             group.selectedRooms?.[0]?.roomId?.name ||
//             "Room",
//           slot: group.timeSlot,
//           firstDate: firstBooking?.date || null,
//           lastDate: lastBooking?.date || null,
//           price: month.price,
//           invoiceUrl,
//           paymentStatus: month.paymentStatus,
//         });
//       }
//     }

//     // Convert recurringByUser to array
//     const recurringBillingData = Object.values(recurringByUser);

//     // Add fallback data if no results found
//     if (userBillingData.length === 0 && recurringBillingData.length === 0) {
//       const usersWithBookings = await User.aggregate([
//         {
//           $lookup: {
//             from: "bookings",
//             localField: "_id",
//             foreignField: "userId",
//             as: "bookings",
//           },
//         },
//         {
//           $project: {
//             _id: 1,
//             name: "$fullName",
//             email: 1,
//             bookingCount: { $size: "$bookings" },
//             totalSpent: { $sum: "$bookings.price" },
//             bookings: {
//               $map: {
//                 input: "$bookings",
//                 as: "booking",
//                 in: {
//                   _id: "$$booking._id",
//                   roomId: "$$booking.roomId",
//                   timeSlot: "$$booking.timeSlot",
//                   startTime: "$$booking.startTime",
//                   endTime: "$$booking.endTime",
//                   date: "$$booking.date",
//                   price: "$$booking.price",
//                   status: "$$booking.status",
//                 },
//               },
//             },
//           },
//         },
//         { $sort: { totalSpent: -1 } },
//       ]);
//       return res.status(200).json({
//         success: true,
//         data: {
//           nonRecurring: usersWithBookings,
//           recurring: [],
//         },
//         count: usersWithBookings.length,
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       data: {
//         nonRecurring: userBillingData,
//         recurring: recurringBillingData,
//       },
//       count: userBillingData.length + recurringBillingData.length,
//     });
//   } catch (error) {
//     console.error("Error getting user billing data:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to get user billing data",
//       error: error.message,
//     });
//   }
// };

// Send invoice for specific booking

export const sendInvoiceForBooking = async (req, res) => {
  try {
    const { userId, bookingId } = req.params;

    console.log("Sending invoice for booking:", bookingId, "by user:", userId);

    // Try to find the booking by bookingId
    let booking = await Booking.findById(bookingId).populate("roomId userId");

    // If not found, treat bookingId as invoiceId (for recurring bookings)
    let invoiceForRecurring = null;
    if (!booking) {
      // Try to find invoice by _id or stripeInvoiceId
      if (mongoose.Types.ObjectId.isValid(bookingId)) {
        invoiceForRecurring = await Invoice.findById(bookingId);
      }
      if (!invoiceForRecurring) {
        invoiceForRecurring = await Invoice.findOne({
          stripeInvoiceId: bookingId,
        });
      }
      if (invoiceForRecurring) {
        // For recurring: just send the invoice email with the invoiceUrl
        const user = await User.findById(invoiceForRecurring.userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found for this invoice",
          });
        }
        const emailSubject = `Invoice for your recurring booking`;
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice for Your Booking</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #574C3F; margin: 0; font-size: 24px;">Invoice for Your Recurring Booking</h1>
              </div>
              <p style="font-size: 16px; margin-bottom: 20px;">Hello ${
                user.fullName || user.name
              },</p>
              <p style="font-size: 16px; margin-bottom: 20px;">Your invoice for your recurring booking is ready.</p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #574C3F; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 8px 0; font-size: 14px;"><strong>Amount:</strong> €${
                  invoiceForRecurring.amount
                }</p>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Status:</strong> ${
                  invoiceForRecurring.status
                }</p>
              </div>
              <p style="font-size: 16px; margin-bottom: 20px;">You can view and download your invoice by clicking the button below:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${invoiceForRecurring.invoiceUrl}" 
                   style="background-color: #574C3F; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                  View Invoice
                </a>
              </div>
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 14px; color: #666; margin-bottom: 10px;">If you have any questions about this invoice, please don't hesitate to contact us.</p>
                <p style="font-size: 14px; color: #666; margin: 0;">Best regards,<br><strong>Your Booking Team</strong></p>
              </div>
            </div>
          </body>
          </html>
        `;
        let emailSent = false;
        let emailError = null;
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
          try {
            await sendEmail(user.email, emailSubject, emailHtml);
            emailSent = true;
          } catch (error) {
            emailError = error.message;
          }
        } else {
          emailError = "Email credentials not configured";
        }
        return res.status(200).json({
          success: true,
          message: emailSent
            ? "Recurring invoice email sent successfully"
            : "Invoice found but email failed to send",
          data: {
            invoiceId:
              invoiceForRecurring.stripeInvoiceId || invoiceForRecurring._id,
            invoiceUrl: invoiceForRecurring.invoiceUrl,
            amount: invoiceForRecurring.amount,
            currency: invoiceForRecurring.currency,
            status: invoiceForRecurring.status,
            emailSent: emailSent,
            emailError: emailError,
          },
        });
      } else {
        return res.status(404).json({
          success: false,
          message: "Booking or Invoice not found",
        });
      }
    }

    // Check if user owns this booking
    if (booking.userId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to booking",
      });
    }

    // Check if invoice already exists
    const existingInvoice = await Invoice.findOne({ bookingId });
    let invoiceRecord = existingInvoice;
    let invoiceUrl = "";

    if (!existingInvoice) {
      // Create or get Stripe customer (optimized)
      let customer;
      try {
        const existingCustomers = await stripe.customers.list({
          email: booking.userId.email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: booking.userId.email,
            name: booking.userId.fullName || booking.userId.name,
            metadata: {
              userId: booking.userId._id.toString(),
            },
          });
        }

        // Create Stripe invoice with optimized description
        const invoiceDescription = `Booking for ${
          booking.roomId?.name || "Room"
        } on ${booking.date}`;

        const invoice = await stripe.invoices.create({
          customer: customer.id,
          currency: "eur",
          metadata: {
            bookingId: booking._id.toString(),
            userId: booking.userId._id.toString(),
            roomName: booking.roomId?.name || "Unknown Room",
          },
        });

        // Add invoice items
        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: Math.round(booking.price * 100), // Convert to cents
          currency: "eur",
          description: invoiceDescription,
        });

        // Finalize and send invoice in parallel
        const [finalizedInvoice, sentInvoice] = await Promise.all([
          stripe.invoices.finalizeInvoice(invoice.id),
          stripe.invoices.sendInvoice(invoice.id),
        ]);

        // Save to database
        invoiceRecord = new Invoice({
          bookingId: booking._id,
          userId: booking.userId._id,
          stripeInvoiceId: finalizedInvoice.id,
          amount: booking.price,
          currency: "eur",
          paymentId: "",
          paymentMethod: "stripe",
          status: "sent",
          invoiceUrl: sentInvoice.hosted_invoice_url,
        });

        await invoiceRecord.save();
        invoiceUrl = sentInvoice.hosted_invoice_url;
      } catch (stripeError) {
        console.error("Stripe error:", stripeError);
        return res.status(500).json({
          success: false,
          message: "Failed to create Stripe invoice",
          error: stripeError.message,
        });
      }
    } else {
      // Use existing invoice URL
      invoiceUrl = existingInvoice.invoiceUrl;
    }

    // Create professional email content
    const emailSubject = `Invoice for your booking - ${
      booking.roomId?.name || "Room"
    } - ${booking.date}`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice for Your Booking</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #574C3F; margin: 0; font-size: 24px;">Invoice for Your Booking</h1>
          </div>
          
          <p style="font-size: 16px; margin-bottom: 20px;">Hello ${
            booking.userId.fullName || booking.userId.name
          },</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">Your invoice for the following booking is ready:</p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #574C3F; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 8px 0; font-size: 14px;"><strong>Room:</strong> ${
              booking.roomId?.name || "Unknown Room"
            }</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Date:</strong> ${
              booking.date
            }</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Time:</strong> ${
              booking.startTime
            } - ${booking.endTime}</p>
            <p style="margin: 8px 0; font-size: 14px;"><strong>Amount:</strong> €${
              booking.price
            }</p>
          </div>
          
          <p style="font-size: 16px; margin-bottom: 20px;">You can view and download your invoice by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invoiceUrl}" 
               style="background-color: #574C3F; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
              View Invoice
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="font-size: 14px; color: #666; margin-bottom: 10px;">If you have any questions about this invoice, please don't hesitate to contact us.</p>
            <p style="font-size: 14px; color: #666; margin: 0;">Best regards,<br><strong>Your Booking Team</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email synchronously (wait for completion)
    console.log("📧 Starting email sending process...");
    console.log("📧 Email config check:");
    console.log(
      "  - EMAIL_USER:",
      process.env.EMAIL_USER ? "✅ Set" : "❌ Not set"
    );
    console.log(
      "  - EMAIL_PASS:",
      process.env.EMAIL_PASS ? "✅ Set" : "❌ Not set"
    );
    console.log("  - Recipient:", booking.userId.email);

    let emailSent = false;
    let emailError = null;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        // Send email and wait for completion
        await sendEmail(booking.userId.email, emailSubject, emailHtml);
        console.log(
          `✅ Invoice email sent successfully to ${booking.userId.email}`
        );
        emailSent = true;
      } catch (error) {
        console.error("❌ Failed to send invoice email:", error);
        console.error("📧 Email error details:", {
          to: booking.userId.email,
          subject: emailSubject,
          error: error.message,
          stack: error.stack,
        });
        emailError = error.message;
      }
    } else {
      console.error(
        "❌ Email credentials not configured. Invoice email not sent."
      );
      console.error("📧 To fix this, add to your .env file:");
      console.error("   EMAIL_USER=your-email@gmail.com");
      console.error("   EMAIL_PASS=your-app-password");
      emailError = "Email credentials not configured";
    }

    return res.status(200).json({
      success: true,
      message: emailSent
        ? "Invoice created and email sent successfully"
        : "Invoice created but email failed to send",
      data: {
        invoiceId: invoiceRecord.stripeInvoiceId,
        invoiceUrl: invoiceUrl,
        amount: booking.price,
        currency: "eur",
        status: "sent",
        emailSent: emailSent,
        emailError: emailError,
      },
    });
  } catch (error) {
    console.error("Error sending invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send invoice",
      error: error.message,
    });
  }
};

// Get invoice information for a booking
export const getInvoiceForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find the invoice for this booking
    const invoice = await Invoice.findOne({ bookingId });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "No invoice found for this booking",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        invoiceId: invoice.stripeInvoiceId,
        invoiceUrl: invoice.invoiceUrl,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
      },
    });
  } catch (error) {
    console.error("Error getting invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get invoice",
      error: error.message,
    });
  }
};

// Test email functionality
export const testEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    console.log("🧪 Testing email configuration:");
    console.log(
      "  - EMAIL_USER:",
      process.env.EMAIL_USER ? "✅ Set" : "❌ Not set"
    );
    console.log(
      "  - EMAIL_PASS:",
      process.env.EMAIL_PASS ? "✅ Set" : "❌ Not set"
    );
    console.log("  - Test recipient:", email);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        success: false,
        message: "Email credentials not configured",
        details: {
          EMAIL_USER: process.env.EMAIL_USER ? "Set" : "Not set",
          EMAIL_PASS: process.env.EMAIL_PASS ? "Set" : "Not set",
        },
      });
    }

    const testSubject = "Test Email from Invoice System";
    const testHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Test Email</h2>
        <p>This is a test email to verify email functionality.</p>
        <p>If you receive this email, the email system is working correctly.</p>
        <p>Time sent: ${new Date().toLocaleString()}</p>
      </div>
    `;

    await sendEmail(email, testSubject, testHtml);

    return res.status(200).json({
      success: true,
      message: "Test email sent successfully",
    });
  } catch (error) {
    console.error("❌ Test email error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test email",
      error: error.message,
    });
  }
};
