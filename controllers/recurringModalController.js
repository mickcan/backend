import RecurringBookingGroup from "../models/recurringBookingGroup.js";
import Booking from "../models/booking.js";
import User from "../models/user.js";
import Room from "../models/room.js";
import Settings from "../models/settings.js";
import { Invoice } from "../models/invoice.js";
import sendEmail from "../utils/sendEmail.js";
import Stripe from "stripe";
import cron from "node-cron";
import mongoose from "mongoose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const currency = "eur";

// Helper: weekday string to number (0=Sunday, 6=Saturday)
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

// Helper: get all dates in range for selected weekdays
function getDatesInRange(startDate, endDate, weekdays) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  const weekdayNumbers = weekdays.map(getWeekdayNumber);
  const dates = [];
  let current = new Date(start);
  while (current <= end) {
    if (weekdayNumbers.includes(current.getDay())) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
    if (dates.length > 366) break;
  }
  return dates;
}

// Helper: get day of week string from date (YYYY-MM-DD)
function getDayOfWeek(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

// Helper: get start/end time for time slot
function getStartTime(timeSlot) {
  const slots = {
    morning: "09:00",
    afternoon: "14:00",
    night: "19:00",
  };
  return slots[timeSlot.toLowerCase()] || "09:00";
}

function getEndTime(timeSlot) {
  const slots = {
    morning: "12:00",
    afternoon: "17:00",
    night: "22:00",
  };
  return slots[timeSlot.toLowerCase()] || "12:00";
}

// Get all users (for modal dropdown)
export const getAllUsers = async (req, res) => {
  try {
    // Only return users with role 'user'
    const users = await User.find({ role: "user" }, "_id name fullName email");
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

// Get all available time slots from settings
export const getTimeSlots = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings || !settings.timeSlots) {
      return res
        .status(404)
        .json({ success: false, message: "No time slots found in settings" });
    }
    // Convert settings.timeSlots object to array with value/label/startTime/endTime/enabled
    const timeSlots = Object.entries(settings.timeSlots).map(([key, slot]) => ({
      value: key.charAt(0).toUpperCase() + key.slice(1),
      label: key.charAt(0).toUpperCase() + key.slice(1),
      startTime: slot.startTime,
      endTime: slot.endTime,
      enabled: slot.enabled,
    }));
    res.json({ success: true, timeSlots });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch time slots",
      error: error.message,
    });
  }
};

// Get available rooms for given time slot, weekdays, and date range
export const getAvailableRooms = async (req, res) => {
  try {
    let { timeSlot, weekdays, startDate, endDate } = req.body;
    // If no endDate, set it to 30 days after startDate
    if (!endDate && startDate) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      // Format endDate as YYYY-MM-DD
      const yyyy = end.getFullYear();
      const mm = String(end.getMonth() + 1).padStart(2, "0");
      const dd = String(end.getDate()).padStart(2, "0");
      endDate = `${yyyy}-${mm}-${dd}`;
    }
    console.log("Fetching available rooms with params:", {
      timeSlot,
      weekdays,
      startDate,
      endDate,
    });
    if (
      !timeSlot ||
      !weekdays ||
      !Array.isArray(weekdays) ||
      weekdays.length === 0 ||
      !startDate
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // 1. Get all active rooms
    const allRooms = await Room.find({ isActive: true });
    console.log(
      "All active rooms:",
      allRooms.map((r) => ({ id: r._id, name: r.name }))
    );
    if (!allRooms.length) {
      console.log("No active rooms found.");
      return res.json({ success: true, rooms: [] });
    }

    // 2. Build all dates in range for selected weekdays
    const dates = getDatesInRange(startDate, endDate, weekdays);
    console.log("Dates to check:", dates);

    // 3. Find all bookings for these rooms, dates, and time slot
    const bookingDates = dates.map((d) => {
      const [year, month, day] = d.split("-");
      return `${day}-${month}-${year}`;
    });
    console.log("Booking dates to check:", bookingDates);

    const bookings = await Booking.find({
      roomId: { $in: allRooms.map((r) => r._id) },
      date: { $in: bookingDates },
      timeSlot,
      status: { $nin: ["cancelled"] },
    });
    console.log("Fetched bookings:", bookings.length);

    // Get today's date in booking format
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${today.getFullYear()}`;

    // 4. Build fully and partially available rooms
    const enhancedRooms = [];

    function groupConsecutiveDates(dates) {
      if (!dates.length) return [];
      const sorted = dates.slice().sort((a, b) => {
        const [da, ma, ya] = a.split("-");
        const [db, mb, yb] = b.split("-");
        return new Date(`${ya}-${ma}-${da}`) - new Date(`${yb}-${mb}-${db}`);
      });
      const ranges = [];
      let rangeStart = sorted[0];
      let rangeEnd = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(
          `${rangeEnd.split("-")[2]}-${rangeEnd.split("-")[1]}-${
            rangeEnd.split("-")[0]
          }`
        );
        const curr = new Date(
          `${sorted[i].split("-")[2]}-${sorted[i].split("-")[1]}-${
            sorted[i].split("-")[0]
          }`
        );
        if ((curr - prev) / (1000 * 60 * 60 * 24) === 1) {
          rangeEnd = sorted[i];
        } else {
          ranges.push({ start: rangeStart, end: rangeEnd });
          rangeStart = sorted[i];
          rangeEnd = sorted[i];
        }
      }
      ranges.push({ start: rangeStart, end: rangeEnd });
      return ranges;
    }

    allRooms.forEach((room) => {
      const roomBookings = bookings.filter(
        (b) => String(b.roomId) === String(room._id)
      );
      const bookedDates = new Set(roomBookings.map((b) => b.date));
      roomBookings.forEach((b) => {
        if (b.status === "completed" && b.date === todayStr) {
          bookedDates.add(b.date);
        }
      });
      const availableDates = bookingDates.filter((d) => !bookedDates.has(d));
      let availability = [];
      if (availableDates.length === bookingDates.length) {
        availability.push({
          type: "full",
          start: availableDates[0],
          end: availableDates[availableDates.length - 1],
        });
      } else if (availableDates.length > 0) {
        const ranges = groupConsecutiveDates(availableDates);
        let foundFull = false;
        for (let idx = 0; idx < ranges.length; idx++) {
          if (foundFull) break;
          const rg = ranges[idx];
          const rangeDates = [];
          let curr = rg.start;
          while (true) {
            rangeDates.push(curr);
            if (curr === rg.end) break;
            const [d, m, y] = curr.split("-");
            const nextDate = new Date(`${y}-${m}-${d}`);
            nextDate.setDate(nextDate.getDate() + 1);
            curr = `${String(nextDate.getDate()).padStart(2, "0")}-${String(
              nextDate.getMonth() + 1
            ).padStart(2, "0")}-${nextDate.getFullYear()}`;
          }
          const remainingBookingDates = bookingDates.slice(
            bookingDates.indexOf(rg.start)
          );
          const allRemainingAvailable = remainingBookingDates.every((dt) =>
            availableDates.includes(dt)
          );
          if (allRemainingAvailable && rangeDates.length > 0) {
            availability.push({
              type: "full",
              start: rg.start,
              end: bookingDates[bookingDates.length - 1],
            });
            foundFull = true;
          } else {
            availability.push({
              type: "partial",
              start: rg.start,
              end: rg.end,
            });
          }
        }
      }
      if (availability.length > 0) {
        enhancedRooms.push({ id: room._id, name: room.name, availability });
      }
    });

    res.json({ success: true, rooms: enhancedRooms });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get available rooms",
      error: error.message,
    });
  }
};

// Create Recurring Booking Group, Bookings, Invoice, and Email

export const createRecurringBookingGroup = async (req, res) => {
  const session = await Booking.startSession();
  session.startTransaction();
  try {
    console.log("[createRecurringBookingGroup] Start", req.body);
    const {
      userId,
      selectedRooms,
      weekdays,
      startDate,
      endDate,
      recurrencePattern,
      recurrenceInterval,
      timeSlot: requestTimeSlot,
    } = req.body;

    // Basic validation for required fields
    if (
      !userId ||
      !selectedRooms ||
      !Array.isArray(selectedRooms) ||
      selectedRooms.length === 0 ||
      !weekdays ||
      !Array.isArray(weekdays) ||
      weekdays.length === 0 ||
      !startDate ||
      !recurrencePattern
    ) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Date handling
    const now = new Date();
    const currentDate = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const isAfter16th = currentDate > 16;
    const isOpenEnded = !endDate;
    const isLastDayOfMonth =
      currentDate === new Date(currentYear, currentMonth + 1, 0).getDate();

    // Calculate dates
    let initialEndDate = endDate
      ? new Date(endDate)
      : new Date(currentYear, currentMonth + 1, 0);
    let nextMonthStartDate = null;
    let nextMonthEndDate = null;

    // In the date handling section:
    if (isOpenEnded) {
      // Always include current month, even if it's the last day
      initialEndDate = new Date(currentYear, currentMonth + 1, 0);
      nextMonthStartDate = new Date(currentYear, currentMonth + 1, 1);
      nextMonthEndDate = new Date(currentYear, currentMonth + 2, 0);

      // Special case: if today is last day AND after 16th
      if (isLastDayOfMonth && isAfter16th) {
        // Fix: Next month starts from first of next month, not today
        initialEndDate = new Date(currentYear, currentMonth + 1, 0); // Today (last day of month)
        nextMonthStartDate = new Date(currentYear, currentMonth + 1, 1); // First day of next month
        console.log(
          "[Date Handling] Last day & after 16th: initialEndDate:",
          initialEndDate,
          "nextMonthStartDate:",
          nextMonthStartDate
        );
      } else {
        console.log(
          "[Date Handling] Open ended: initialEndDate:",
          initialEndDate,
          "nextMonthStartDate:",
          nextMonthStartDate
        );
      }
    }

    // Create bookings
    let totalPrice = 0;
    let roomDetails = [];
    const bookingSet = new Set();
    let enrichedSelectedRooms = [];
    const settings = await Settings.findOne();
    // For monthly grouping
    const monthlyBookingsMap = {};

    const createBookingsForDateRange = async (
      startDate,
      endDate,
      periodType
    ) => {
      const bookings = [];
      let rangeTotalPrice = 0;

      for (const roomObj of selectedRooms) {
        const room = await Room.findById(roomObj.roomId).session(session);
        if (!room) continue;

        // Get room details
        const roomName = room.name || "Room";
        const normalizedTimeSlot = ["morning", "evening", "night"].includes(
          roomObj.timeSlot?.toLowerCase()
        )
          ? roomObj.timeSlot.toLowerCase()
          : requestTimeSlot?.toLowerCase() || "morning";

        const slotInfo = settings?.timeSlots?.[normalizedTimeSlot] || null;
        const startTime =
          slotInfo?.startTime || getStartTime(normalizedTimeSlot);
        const endTime = slotInfo?.endTime || getEndTime(normalizedTimeSlot);

        // Calculate price
        let bookingPrice = roomObj.price;
        if (typeof bookingPrice !== "number" || isNaN(bookingPrice)) {
          if (
            normalizedTimeSlot === "morning" &&
            room.morningPrice !== undefined
          ) {
            bookingPrice = room.morningPrice;
          } else if (
            normalizedTimeSlot === "evening" &&
            room.afternoonPrice !== undefined
          ) {
            bookingPrice = room.afternoonPrice;
          } else if (
            normalizedTimeSlot === "night" &&
            room.nightPrice !== undefined
          ) {
            bookingPrice = room.nightPrice;
          } else {
            bookingPrice = room.price;
          }
        }

        // Add to enriched rooms
        enrichedSelectedRooms.push({
          roomId: roomObj.roomId,
          roomName,
          availability: roomObj.availability,
          timeSlot: normalizedTimeSlot,
          startTime,
          endTime,
          price: bookingPrice,
        });

        // Get dates and create bookings
        let dates = getDatesInRange(startDate, endDate, weekdays);

        // Filter dates for next month only
        if (periodType === "next") {
          const nextMonth = nextMonthStartDate.getMonth();
          const nextMonthYear = nextMonthStartDate.getFullYear();
          dates = dates.filter((dateStr) => {
            const dateObj = new Date(dateStr);
            return (
              dateObj.getMonth() === nextMonth &&
              dateObj.getFullYear() === nextMonthYear
            );
          });
        }
        for (const date of dates) {
          const [year, month, day] = date.split("-");
          const bookingDate = `${day}-${month}-${year}`;
          const bookingKey = `${roomObj.roomId}_${bookingDate}_${normalizedTimeSlot}`;

          // Check for existing bookings
          const existingBooking = await Booking.findOne({
            roomId: roomObj.roomId,
            date: bookingDate,
            timeSlot: normalizedTimeSlot,
            status: { $ne: "cancelled" },
          }).session(session);

          if (existingBooking || bookingSet.has(bookingKey)) continue;
          bookingSet.add(bookingKey);

          // Create new booking
          const booking = new Booking({
            roomId: roomObj.roomId,
            roomName,
            userId,
            date: bookingDate,
            dayOfWeek: getDayOfWeek(date),
            timeSlot: normalizedTimeSlot,
            startTime,
            endTime,
            price: bookingPrice,
            paymentStatus: "pending",
            status: "upcoming",
            isRecurring: true,
            recurrencePattern,
            periodType,
          });

          await booking.save({ session });
          bookings.push(booking);
          rangeTotalPrice += bookingPrice;
          roomDetails.push({
            room: roomName,
            price: bookingPrice,
            date: bookingDate,
            timeSlot: normalizedTimeSlot,
            periodType,
          });

          // Group bookings by month for monthlyBookings
          const bookingMonth = `${year}-${month}`;
          if (!monthlyBookingsMap[bookingMonth]) {
            monthlyBookingsMap[bookingMonth] = [];
          }
          monthlyBookingsMap[bookingMonth].push(booking._id);
        }
      }

      return { bookings, totalPrice: rangeTotalPrice };
    };

    // Create initial bookings (will be empty if no valid dates)
    console.log(
      "[Bookings] Creating initial bookings for:",
      startDate,
      "to",
      initialEndDate
    );
    const { bookings: initialBookings, totalPrice: initialTotalPrice } =
      await createBookingsForDateRange(startDate, initialEndDate, "current");
    totalPrice += initialTotalPrice;
    console.log(
      "[Bookings] Initial bookings count:",
      initialBookings.length,
      "Initial total price:",
      initialTotalPrice
    );

    // Create next month bookings if needed (only for open-ended)
    let nextMonthBookings = [];
    let nextMonthTotalPrice = 0;
    if (isOpenEnded && nextMonthStartDate && nextMonthEndDate) {
      console.log(
        "[Bookings] Creating next month bookings for:",
        nextMonthStartDate,
        "to",
        nextMonthEndDate
      );
      const result = await createBookingsForDateRange(
        nextMonthStartDate,
        nextMonthEndDate,
        "next"
      );
      nextMonthBookings = result.bookings;
      nextMonthTotalPrice = result.totalPrice;
      totalPrice += nextMonthTotalPrice;
      console.log(
        "[Bookings] Next month bookings count:",
        nextMonthBookings.length,
        "Next month total price:",
        nextMonthTotalPrice
      );
    }

    // Prepare monthlyBookings array for schema
    let monthlyBookingsArr = [];
    // We'll fill invoice info after invoice creation
    Object.keys(monthlyBookingsMap).forEach((monthKey) => {
      // Calculate total price for this month
      let monthTotalPrice = 0;
      for (const bookingId of monthlyBookingsMap[monthKey]) {
        // Find the booking in initialBookings or nextMonthBookings
        const booking = [...initialBookings, ...nextMonthBookings].find(
          (b) => String(b._id) === String(bookingId)
        );
        if (booking) {
          monthTotalPrice += booking.price || 0;
        }
      }
      monthlyBookingsArr.push({
        month: monthKey,
        bookings: monthlyBookingsMap[monthKey],
        price: monthTotalPrice,
        stripeInvoiceId: null,
        invoiceId: null,
        paymentStatus: "pending",
      });
    });

    // Create recurring group
    console.log("[Group] Creating RecurringBookingGroup with:", {
      userId,
      selectedRooms: enrichedSelectedRooms,
      roomIds: enrichedSelectedRooms.map((r) => r.roomId),
      weekdays,
      startDate,
      endDate: isOpenEnded ? null : endDate,
      initialEndDate: isOpenEnded ? initialEndDate : null,
      recurrencePattern,
      recurrenceInterval,
      price: totalPrice,
      monthlyBookings: monthlyBookingsArr,
      status: "active",
      timeSlot: enrichedSelectedRooms[0]?.timeSlot || "morning",
      startTime: enrichedSelectedRooms[0]?.startTime || getStartTime("morning"),
      endTime: enrichedSelectedRooms[0]?.endTime || getEndTime("morning"),
      isOpenEnded,
      nextBillingDate: isOpenEnded
        ? new Date(currentYear, currentMonth + 1, 1)
        : null,
    });
    const group = new RecurringBookingGroup({
      userId,
      selectedRooms: enrichedSelectedRooms,
      roomIds: enrichedSelectedRooms.map((r) => r.roomId),
      weekdays,
      startDate,
      endDate: isOpenEnded ? null : endDate,
      initialEndDate: isOpenEnded ? initialEndDate : null,
      recurrencePattern,
      recurrenceInterval,
      price: totalPrice,
      monthlyBookings: monthlyBookingsArr,
      status: "active",
      timeSlot: enrichedSelectedRooms[0]?.timeSlot || "morning",
      startTime: enrichedSelectedRooms[0]?.startTime || getStartTime("morning"),
      endTime: enrichedSelectedRooms[0]?.endTime || getEndTime("morning"),
      isOpenEnded,
      nextBillingDate: isOpenEnded
        ? new Date(currentYear, currentMonth + 1, 1)
        : null,
    });
    await group.save({ session });
    console.log("[Group] Saved RecurringBookingGroup with id:", group._id);

    // Stripe invoice creation
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });
      customer =
        existingCustomers.data[0] ||
        (await stripe.customers.create({
          email: user.email,
          name: user.fullName || user.name,
          metadata: { userId: user._id.toString() },
        }));
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(500)
        .json({ success: false, message: "Stripe customer error" });
    }

    const createStripeInvoice = async (bookings, description) => {
      const invoice = await stripe.invoices.create({
        customer: customer.id,
        currency: currency,
        collection_method: "send_invoice",
        days_until_due: 14,
        metadata: {
          groupId: group._id.toString(),
          userId: user._id.toString(),
        },
      });

      // In createStripeInvoice function:
      for (const booking of bookings) {
        // Ensure we have the room name
        let roomName = "Room";
        try {
          const room = await Room.findById(booking.roomId).session(session);
          if (room?.name) roomName = room.name;
        } catch (err) {
          console.error("Error fetching room name:", err);
        }

        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: Math.round(booking.price * 100),
          currency: currency,
          description: `${roomName} - ${formatDateForDisplay(booking.date)} (${
            booking.timeSlot
          })`,
        });
      }

      const finalizedInvoice = await stripe.invoices.finalizeInvoice(
        invoice.id
      );

      // Save invoice and update monthlyBookings
      const invoiceDoc = await new Invoice({
        userId: user._id,
        stripeInvoiceId: finalizedInvoice.id,
        amount: bookings.reduce((sum, b) => sum + b.price, 0),
        currency: currency,
        paymentMethod: "stripe",
        status: "created",
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
        groupId: group._id,
        period: description,
      }).save({ session });

      // Find month for these bookings
      if (bookings.length > 0) {
        // Use first booking's date to get month
        const firstBooking = bookings[0];
        const [day, month, year] = firstBooking.date.split("-");
        const monthKey = `${year}-${month}`;
        // Find monthlyBookings entry and update invoice info
        const mb = group.monthlyBookings.find((m) => m.month === monthKey);
        if (mb) {
          mb.stripeInvoiceId = finalizedInvoice.id;
          mb.invoiceId = invoiceDoc._id;
          mb.paymentStatus = "pending";
        }
        await group.save({ session });
      }

      return finalizedInvoice;
    };

    // Create invoices
    let initialInvoice = null;
    let nextMonthInvoice = null;

    try {
      // Always create invoice for current period
      initialInvoice = await createStripeInvoice(
        initialBookings,
        "Current Period"
      );

      // For open-ended after 16th or last day of month, invoice next month immediately
      if ((isAfter16th || isLastDayOfMonth) && nextMonthBookings.length > 0) {
        nextMonthInvoice = await createStripeInvoice(
          nextMonthBookings,
          "Next Month"
        );
      }
      // For open-ended before 16th, add as pending items
      else if (isOpenEnded && nextMonthBookings.length > 0) {
        for (const booking of nextMonthBookings) {
          let roomName = "Room";
          try {
            const roomDoc = await Room.findById(booking.roomId);
            if (roomDoc && roomDoc.name) {
              roomName = roomDoc.name;
            }
          } catch (err) {
            // fallback to default
          }
          await stripe.invoiceItems.create({
            customer: customer.id,
            amount: Math.round(booking.price * 100),
            currency: currency,
            description: `${roomName} - ${formatDate(booking.date)} (${
              booking.timeSlot
            })`,
          });
          booking.stripeInvoiceItemId = true;
          await booking.save({ session });
        }
      }
    } catch (error) {
      console.error("[Invoice Generation Error]", error);
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: "Stripe invoice error",
        error: error.message,
      });
    }

    // Send email with proper room names and dates
    try {
      // In email sending section:
      const currentPeriodBookings = roomDetails
        .filter((b) => b.periodType === "current")
        .map((b) => ({
          ...b,
          formattedDate: formatDateForDisplay(b.date),
        }));

      const nextPeriodBookings = roomDetails
        .filter((b) => b.periodType === "next")
        .map((b) => ({
          ...b,
          formattedDate: formatDateForDisplay(b.date),
        }));

      let emailBody = `
  <h2>Your Booking Confirmation</h2>
  ${
    currentPeriodBookings.length > 0
      ? `
    <h3>Current Period </h3>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr><th>Room</th><th>Date</th><th>Time</th><th>Price</th></tr>
      ${currentPeriodBookings
        .map(
          (b) => `
        <tr>
          <td>${b.room}</td>
          <td>${b.formattedDate}</td>
          <td>${b.timeSlot}</td>
          <td>${b.price} ${currency}</td>
        </tr>
      `
        )
        .join("")}
    </table>
    <p><strong>Current Period Total:</strong> ${initialTotalPrice} ${currency}</p>
    <p><a href="${
      initialInvoice?.hosted_invoice_url
    }">View/Pay Current Invoice</a></p>
  `
      : ""
  }

  ${
    nextPeriodBookings.length > 0
      ? `
    <h3>Next Period </h3>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr><th>Room</th><th>Date</th><th>Time</th><th>Price</th></tr>
      ${nextPeriodBookings
        .map(
          (b) => `
        <tr>
          <td>${b.room}</td>
          <td>${b.formattedDate}</td>
          <td>${b.timeSlot}</td>
          <td>${b.price} ${currency}</td>
        </tr>
      `
        )
        .join("")}
    </table>
    <p><strong>Next Period Total:</strong> ${nextMonthTotalPrice} ${currency}</p>
    ${
      nextMonthInvoice
        ? `
      <p><a href="${nextMonthInvoice.hosted_invoice_url}">View/Pay Next Invoice</a></p>
    `
        : `
      <p>Next month's invoice will be generated on the 16th.</p>
    `
    }
  `
      : ""
  }
`;

      if (isOpenEnded) {
        emailBody += `<p>This is a recurring booking that will continue each month.</p>`;
      }

      await sendEmail(user.email, `Your Booking Confirmation`, emailBody);
    } catch (emailError) {
      console.error("Email sending error:", emailError);
    }

    await session.commitTransaction();
    session.endSession();
    console.log("[Success] Booking created successfully. GroupId:", group._id);
    return res.status(200).json({
      success: true,
      message: "Booking created successfully",
      groupId: group._id,
      invoices: {
        current: initialInvoice?.hosted_invoice_url,
        next: nextMonthInvoice?.hosted_invoice_url,
      },
      totalPrice,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[Error] createRecurringBookingGroup:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function
function formatDate(dateStr) {
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return new Date(year, month - 1, day).toLocaleDateString();
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Add this helper function
const formatDateForDisplay = (dateStr) => {
  try {
    if (!dateStr) return "N/A";
    // Handle both "DD-MM-YYYY" and "MM-DD-YYYY" formats
    const parts = dateStr.includes("-") ? dateStr.split("-") : [];
    if (parts.length === 3) {
      // Check if first part is day or month
      const isDayFirst = parts[0].length <= 2;
      const day = isDayFirst ? parts[0] : parts[1];
      const month = isDayFirst ? parts[1] : parts[0];
      const year = parts[2];

      const dateObj = new Date(`${year}-${month}-${day}`);
      return isNaN(dateObj.getTime()) ? dateStr : dateObj.toLocaleDateString();
    }
    return dateStr;
  } catch {
    return dateStr || "N/A";
  }
};

// Cancel Recurring Booking Group
export const deleteRecurringBookingGroup = async (req, res) => {
  const { groupId, userId } = req.body;
  console.log(
    "[Delete] Request received for groupId:",
    groupId,
    "userId:",
    userId
  );
  const session = await Booking.startSession();
  session.startTransaction();
  try {
    console.log("[Delete] Fetching group...");
    const group = await RecurringBookingGroup.findById(groupId).session(
      session
    );
    if (!group) {
      console.log("[Delete] Group not found");
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }
    if (userId && String(group.userId) !== String(userId)) {
      console.log("[Delete] Unauthorized user");
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Delete all bookings in monthlyBookings (handle ObjectId, string, or object)
    let allBookingIds = [];
    for (const monthObj of group.monthlyBookings) {
      if (Array.isArray(monthObj.bookings) && monthObj.bookings.length > 0) {
        // Normalize all booking ids to string
        const ids = monthObj.bookings.map((b) => {
          if (typeof b === "object" && b !== null && b.$oid) return b.$oid;
          if (typeof b === "object" && b._id) return b._id.toString();
          return b.toString();
        });
        allBookingIds.push(...ids);
      }
    }
    let totalDeletedBookings = 0;
    if (allBookingIds.length > 0) {
      const deleteResult = await Booking.deleteMany(
        { _id: { $in: allBookingIds } },
        { session }
      );
      totalDeletedBookings = deleteResult.deletedCount || 0;
    }
    console.log(`[Delete] Bookings deleted: ${totalDeletedBookings}`);

    // Void Stripe invoices using monthlyBookings BEFORE deleting group or invoices in DB
    console.log("[Delete] Voiding Stripe invoices...");
    let stripeVoidingFailed = false;
    for (const monthObj of group.monthlyBookings) {
      if (monthObj.stripeInvoiceId) {
        try {
          await stripe.invoices.voidInvoice(monthObj.stripeInvoiceId);
        } catch (err) {
          // If invoice is already paid or already void, skip voiding and log info, do not fail the operation
          const alreadyPaid =
            err &&
            err.type === "StripeInvalidRequestError" &&
            err.raw &&
            typeof err.raw.message === "string" &&
            err.raw.message.includes(
              "Invoices with `paid` payments cannot be voided"
            );
          const alreadyVoided =
            err &&
            err.type === "StripeInvalidRequestError" &&
            err.raw &&
            typeof err.raw.message === "string" &&
            err.raw.message.toLowerCase().includes("invoice is already void");
          const notOpen =
            err &&
            err.type === "StripeInvalidRequestError" &&
            err.raw &&
            typeof err.raw.message === "string" &&
            err.raw.message.includes(
              "You can only pass in open invoices. This invoice isn't open."
            );
          const resourceMissing =
            err &&
            err.type === "StripeInvalidRequestError" &&
            err.code === "resource_missing";
          if (alreadyPaid) {
            console.warn(
              `[Delete] Invoice ${monthObj.stripeInvoiceId} already paid, skipping void.`
            );
          } else if (alreadyVoided) {
            console.warn(
              `[Delete] Invoice ${monthObj.stripeInvoiceId} already voided, skipping void.`
            );
          } else if (notOpen) {
            console.warn(
              `[Delete] Invoice ${monthObj.stripeInvoiceId} is not open, skipping void.`
            );
          } else if (resourceMissing) {
            console.warn(
              `[Delete] Invoice ${monthObj.stripeInvoiceId} does not exist on Stripe, skipping void.`
            );
          } else {
            console.error("[Delete] Error voiding Stripe invoice:", err);
            stripeVoidingFailed = true;
          }
        }
      }
    }
    if (stripeVoidingFailed) {
      // Abort transaction if any Stripe voiding failed for reasons other than already paid
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message:
          "Failed to void one or more Stripe invoices (not already paid). No data deleted.",
      });
    }

    // Delete all invoices in DB
    console.log("[Delete] Deleting all invoices in DB...");
    const invoiceDbResult = await Invoice.deleteMany(
      { groupId: group._id },
      { session }
    );
    console.log(
      "[Delete] Invoices deleted in DB:",
      invoiceDbResult.deletedCount
    );

    // Delete the group itself
    console.log("[Delete] Deleting group status...");
    try {
      await RecurringBookingGroup.deleteOne({ _id: group._id }, { session });
      console.log("[Delete] Group deleted:", group._id);
    } catch (err) {
      console.error("[Delete] Error deleting group:", err);
      throw err;
    }

    console.log("[Delete] Committing transaction...");
    try {
      await session.commitTransaction();
      console.log("[Delete] Transaction committed and session ended.");
    } catch (err) {
      console.error("[Delete] Error committing transaction:", err);
      throw err;
    }
    session.endSession();

    // Optionally, send deletion email

    return res.status(200).json({
      success: true,
      message: "Recurring booking group, bookings, and invoices deleted",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[Error] deleteRecurringBookingGroup:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelRecurringBookingGroup = async (req, res) => {
  const { groupId, userId, effectiveDate } = req.body;
  console.log(
    "[Cancel] Request received for groupId:",
    groupId,
    "userId:",
    userId
  );
  const session = await Booking.startSession();
  session.startTransaction();
  try {
    console.log("[Cancel] Fetching group...");
    const group = await RecurringBookingGroup.findById(groupId).session(
      session
    );
    if (!group) {
      console.log("[Cancel] Group not found");
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }
    if (userId && String(group.userId) !== String(userId)) {
      console.log("[Cancel] Unauthorized user");
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Cancel bookings in monthlyBookings according to effectiveDate
    let totalCancelledBookings = 0;
    const effective = effectiveDate ? new Date(effectiveDate) : null;
    for (const monthObj of group.monthlyBookings) {
      if (Array.isArray(monthObj.bookings) && monthObj.bookings.length > 0) {
        // Find bookings to cancel
        let bookingsToCancel;
        if (effective) {
          bookingsToCancel = await Booking.find({
            _id: { $in: monthObj.bookings },
            date: { $gte: effective.toISOString().split("T")[0] },
            status: { $ne: "cancelled" },
          }).session(session);
        } else {
          bookingsToCancel = await Booking.find({
            _id: { $in: monthObj.bookings },
            status: { $ne: "cancelled" },
          }).session(session);
        }
        const bookingIdsToCancel = bookingsToCancel.map((b) => b._id);

        if (bookingIdsToCancel.length > 0) {
          const bookingResult = await Booking.updateMany(
            { _id: { $in: bookingIdsToCancel } },
            { $set: { status: "cancelled" } },
            { session }
          );
          totalCancelledBookings += bookingResult.modifiedCount;
        }

        // If all bookings in the month are cancelled, update paymentStatus
        const remainingActive = await Booking.countDocuments({
          _id: { $in: monthObj.bookings },
          status: { $ne: "cancelled" },
        }).session(session);
        if (remainingActive === 0) {
          monthObj.paymentStatus = "cancelled";
        }
      }
    }
    await group.save({ session });
    console.log(`[Cancel] Bookings cancelled: ${totalCancelledBookings}`);

    // Void Stripe invoices using monthlyBookings BEFORE updating DB invoices or group status
    console.log("[Cancel] Voiding Stripe invoices...");
    let stripeVoidingFailed = false;
    for (const monthObj of group.monthlyBookings) {
      if (monthObj.stripeInvoiceId) {
        try {
          await stripe.invoices.voidInvoice(monthObj.stripeInvoiceId);
          console.log(
            "[Cancel] Voided Stripe invoice:",
            monthObj.stripeInvoiceId
          );
        } catch (err) {
          // If invoice is already paid, skip voiding and log info, do not fail the operation
          if (
            err &&
            err.type === "StripeInvalidRequestError" &&
            err.raw &&
            typeof err.raw.message === "string" &&
            err.raw.message.includes(
              "Invoices with `paid` payments cannot be voided"
            )
          ) {
            console.warn(
              `[Cancel] Invoice ${monthObj.stripeInvoiceId} already paid, skipping void.`
            );
          } else {
            console.error("[Cancel] Stripe invoice void error:", err);
            stripeVoidingFailed = true;
          }
        }
      }
    }
    if (stripeVoidingFailed) {
      // Abort transaction if any Stripe voiding failed for reasons other than already paid
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message:
          "Failed to void one or more Stripe invoices (not already paid). No data cancelled.",
      });
    }

    // Cancel all invoices in DB
    console.log("[Cancel] Cancelling all invoices in DB...");
    const invoiceDbResult = await Invoice.updateMany(
      { groupId: group._id },
      { $set: { status: "cancelled" } },
      { session }
    );
    console.log(
      "[Cancel] Invoices cancelled in DB:",
      invoiceDbResult.modifiedCount
    );

    // Cancel group status
    console.log("[Cancel] Cancelling group status...");
    group.status = "cancelled";
    console.log("[Cancel] Saving group status...");
    try {
      await group.save({ session });
      console.log("[Cancel] Group cancelled:", group._id);
    } catch (err) {
      console.error("[Cancel] Error saving group status:", err);
      throw err;
    }

    console.log("[Cancel] Committing transaction...");
    try {
      await session.commitTransaction();
      console.log("[Cancel] Transaction committed and session ended.");
    } catch (err) {
      console.error("[Cancel] Error committing transaction:", err);
      throw err;
    }
    session.endSession();

    // Optionally, send cancellation email

    return res.status(200).json({
      success: true,
      message: "Recurring booking group and invoices cancelled",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[Error] cancelRecurringBookingGroup:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

//Jobs for recurring bookings and invoices

// Cron job to schedule bookings for next month (runs on 1st of each month)
export const scheduleNextMonthBookings = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    console.log("[Cron] Running scheduleNextMonthBookings job");
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate next month's start and end dates
    const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
    const nextMonthEnd = new Date(currentYear, currentMonth + 2, 0); // Last day of next month

    // Find all active, open-ended recurring booking groups
    const groups = await RecurringBookingGroup.find({
      status: "active",
      isOpenEnded: true,
    }).session(session);

    console.log(
      `[Cron] Found ${groups.length} active recurring groups to process`
    );

    let totalBookingsCreated = 0;
    let totalGroupsProcessed = 0;

    for (const group of groups) {
      try {
        console.log(`[Cron] Processing group ${group._id}`);

        // Check if bookings already exist for next month
        const nextMonthKey = `${nextMonthStart.getFullYear()}-${String(
          nextMonthStart.getMonth() + 1
        ).padStart(2, "0")}`;
        const hasExistingBookings = group.monthlyBookings.some(
          (mb) => mb.month === nextMonthKey && mb.bookings.length > 0
        );

        if (hasExistingBookings) {
          console.log(
            `[Cron] Group ${group._id} already has bookings for ${nextMonthKey}`
          );
          continue;
        }

        // Get all dates in next month for the group's weekdays
        const dates = getDatesInRange(
          nextMonthStart,
          nextMonthEnd,
          group.weekdays
        );

        if (dates.length === 0) {
          console.log(
            `[Cron] No valid dates for group ${group._id} in ${nextMonthKey}`
          );
          continue;
        }

        // Create bookings for each room and date
        const newBookings = [];
        for (const roomObj of group.selectedRooms) {
          for (const date of dates) {
            const [year, month, day] = date.split("-");
            const bookingDate = `${day}-${month}-${year}`;

            // Check for existing booking
            const existingBooking = await Booking.findOne({
              roomId: roomObj.roomId,
              date: bookingDate,
              timeSlot: roomObj.timeSlot,
              status: { $ne: "cancelled" },
            }).session(session);

            if (existingBooking) continue;

            const room = await Room.findById(roomObj.roomId).session(session);
            const roomName = room?.name || "Room";
            const timeSlot = roomObj.timeSlot;
            const startTime = getStartTime(timeSlot);
            const endTime = getEndTime(timeSlot);
            let price = roomObj.price;
            if (typeof price !== "number" || isNaN(price)) {
              price = room[`${timeSlot}Price`] || room.price;
            }

            // Create new booking
            const booking = new Booking({
              roomId: roomObj.roomId,
              roomName,
              userId: group.userId,
              date: bookingDate,
              dayOfWeek: getDayOfWeek(date),
              timeSlot,
              startTime,
              endTime,
              price,
              paymentStatus: "pending",
              status: "upcoming",
              isRecurring: true,
              recurrencePattern: group.recurrencePattern,
              periodType: "next",
            });

            await booking.save({ session });
            newBookings.push(booking);
          }
        }

        if (newBookings.length === 0) {
          console.log(`[Cron] No new bookings created for group ${group._id}`);
          continue;
        }

        // Add to monthlyBookings array, update if entry exists and is empty
        const bookingIds = newBookings.map((b) => b._id);
        const monthTotalPrice = newBookings.reduce(
          (sum, b) => sum + (b.price || 0),
          0
        );
        let monthlyBooking = group.monthlyBookings.find(
          (mb) => mb.month === nextMonthKey
        );
        if (monthlyBooking) {
          // Only update if no bookings yet
          if (
            !monthlyBooking.bookings ||
            monthlyBooking.bookings.length === 0
          ) {
            monthlyBooking.bookings = bookingIds;
            monthlyBooking.price = monthTotalPrice;
            monthlyBooking.stripeInvoiceId = null;
            monthlyBooking.invoiceId = null;
            monthlyBooking.paymentStatus = "pending";
          } else {
            console.log(
              `[Cron] MonthlyBookings entry for ${nextMonthKey} already has bookings, skipping update.`
            );
          }
        } else {
          // If not found, push new entry
          monthlyBooking = {
            month: nextMonthKey,
            bookings: bookingIds,
            price: monthTotalPrice,
            stripeInvoiceId: null,
            invoiceId: null,
            paymentStatus: "pending",
          };
          group.monthlyBookings.push(monthlyBooking);
        }
        await group.save({ session });

        totalBookingsCreated += newBookings.length;
        totalGroupsProcessed++;
        console.log(
          `[Cron] Created ${newBookings.length} bookings for group ${group._id}`
        );
      } catch (groupError) {
        console.error(
          `[Cron] Error processing group ${group._id}:`,
          groupError
        );
        // Continue with next group even if one fails
      }
    }

    await session.commitTransaction();
    session.endSession();
    console.log(
      `[Cron] Job completed. Processed ${totalGroupsProcessed} groups, created ${totalBookingsCreated} bookings.`
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[Cron] Error in scheduleNextMonthBookings:", error);
  }
};

// Cron job to create invoices (runs on 16th of each month)
export const createMonthlyInvoices = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    console.log("[Cron] Running createMonthlyInvoices job");
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate next month's start and end dates
    const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
    const nextMonthEnd = new Date(currentYear, currentMonth + 2, 0);
    const nextMonthKey = `${nextMonthStart.getFullYear()}-${String(
      nextMonthStart.getMonth() + 1
    ).padStart(2, "0")}`;

    // Find all active recurring booking groups with pending invoices for next month
    const groups = await RecurringBookingGroup.find({
      status: "active",
      "monthlyBookings.month": nextMonthKey,
      "monthlyBookings.paymentStatus": "pending",
    })
      .populate("userId")
      .session(session);

    console.log(
      `[Cron] Found ${groups.length} groups needing invoices for ${nextMonthKey}`
    );

    let totalInvoicesCreated = 0;

    for (const group of groups) {
      try {
        console.log(`[Cron] Processing invoices for group ${group._id}`);

        // Find the monthly booking entry for next month
        const monthlyBooking = group.monthlyBookings.find(
          (mb) => mb.month === nextMonthKey
        );

        if (!monthlyBooking || monthlyBooking.bookings.length === 0) {
          console.log(
            `[Cron] No bookings found for ${nextMonthKey} in group ${group._id}`
          );
          continue;
        }

        // Check if invoice already exists
        if (monthlyBooking.stripeInvoiceId) {
          console.log(
            `[Cron] Invoice already exists for group ${group._id} month ${nextMonthKey}`
          );
          continue;
        }

        // Get all bookings for this month
        const bookings = await Booking.find({
          _id: { $in: monthlyBooking.bookings },
        }).session(session);

        if (bookings.length === 0) {
          console.log(
            `[Cron] No booking documents found for group ${group._id} month ${nextMonthKey}`
          );
          continue;
        }

        // Create Stripe customer if needed
        let customer;
        try {
          const existingCustomers = await stripe.customers.list({
            email: group.userId.email,
            limit: 1,
          });
          customer =
            existingCustomers.data[0] ||
            (await stripe.customers.create({
              email: group.userId.email,
              name: group.userId.fullName || group.userId.name,
              metadata: { userId: group.userId._id.toString() },
            }));
        } catch (stripeError) {
          console.error(
            `[Cron] Stripe customer error for group ${group._id}:`,
            stripeError
          );
          continue;
        }

        // Create invoice
        const invoice = await stripe.invoices.create({
          customer: customer.id,
          currency: currency,
          collection_method: "send_invoice",
          days_until_due: 14,
          metadata: {
            groupId: group._id.toString(),
            userId: group.userId._id.toString(),
            month: nextMonthKey,
          },
        });

        // Add invoice items
        for (const booking of bookings) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: invoice.id,
            amount: Math.round(booking.price * 100),
            currency: currency,
            description: `${booking.roomName} - ${formatDateForDisplay(
              booking.date
            )} (${booking.timeSlot})`,
          });
        }

        // Finalize invoice
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(
          invoice.id
        );

        // Save invoice to database
        const invoiceDoc = await new Invoice({
          userId: group.userId._id,
          stripeInvoiceId: finalizedInvoice.id,
          amount: bookings.reduce((sum, b) => sum + b.price, 0),
          currency: currency,
          paymentMethod: "stripe",
          status: "created",
          invoiceUrl: finalizedInvoice.hosted_invoice_url,
          groupId: group._id,
          period: nextMonthKey,
        }).save({ session });

        // Update monthly booking with invoice info
        monthlyBooking.stripeInvoiceId = finalizedInvoice.id;
        monthlyBooking.invoiceId = invoiceDoc._id;
        monthlyBooking.paymentStatus = "pending";
        await group.save({ session });

        // Send email notification
        try {
          const emailBody = `
            <h2>Your Invoice for ${nextMonthKey}</h2>
            <p>An invoice has been generated for your recurring bookings in ${nextMonthKey}.</p>
            <p><strong>Total Amount:</strong> ${invoiceDoc.amount} ${currency}</p>
            <p><a href="${finalizedInvoice.hosted_invoice_url}">View/Pay Invoice</a></p>
          `;

          await sendEmail(
            group.userId.email,
            `Invoice for ${nextMonthKey}`,
            emailBody
          );
        } catch (emailError) {
          console.error(
            `[Cron] Email error for group ${group._id}:`,
            emailError
          );
        }

        totalInvoicesCreated++;
        console.log(
          `[Cron] Created invoice for group ${group._id} month ${nextMonthKey}`
        );
      } catch (groupError) {
        console.error(
          `[Cron] Error processing group ${group._id}:`,
          groupError
        );
        // Continue with next group even if one fails
      }
    }

    await session.commitTransaction();
    session.endSession();
    console.log(
      `[Cron] Invoice job completed. Created ${totalInvoicesCreated} invoices.`
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("[Cron] Error in createMonthlyInvoices:", error);
  }
};

// Add this to your server setup or initialization code to schedule the cron jobs
export const setupRecurringBookingCronJobs = () => {
  // Schedule bookings on 1st of each month at 2am
  cron.schedule("0 2 1 * *", scheduleNextMonthBookings);

  // Create invoices on 16th of each month at 10am
  cron.schedule("0 10 16 * *", createMonthlyInvoices);

  console.log("Recurring booking cron jobs scheduled");
};
