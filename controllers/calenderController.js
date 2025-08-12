import Calendar from "../models/calender.js";
import Room from "../models/room.js";
import DayTimeSlot from "../models/daytimeslot.js";
import User from "../models/user.js";

// Create calendar entry
const createCalendarEntry = async (req, res) => {
  try {
    const { timeSlot, room, totalCapacity, seatsBooked, bookedBy } = req.body;

    // Validate required fields
    if (!timeSlot || !room) {
      return res.status(400).json({
        success: false,
        message: "Time slot and room are required",
      });
    }

    // Check if room exists
    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if time slot exists
    const timeSlotExists = await DayTimeSlot.findById(timeSlot);
    if (!timeSlotExists) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found",
      });
    }

    // Check if calendar entry already exists
    const existingEntry = await Calendar.findOne({ timeSlot, room });
    if (existingEntry) {
      return res.status(409).json({
        success: false,
        message: "Calendar entry already exists for this room and time slot",
      });
    }

    // Create calendar entry
    const calendarEntry = new Calendar({
      timeSlot,
      room,
      totalCapacity: totalCapacity || roomExists.roomCapacity,
      seatsBooked: seatsBooked || 0,
      bookedBy: bookedBy || [],
    });

    await calendarEntry.save();

    // Populate the saved entry
    const populatedEntry = await Calendar.findById(calendarEntry._id)
      .populate("room", "roomName roomCapacity roomStatus")
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email");

    res.status(201).json({
      success: true,
      data: populatedEntry,
      message: "Calendar entry created successfully",
    });
  } catch (error) {
    console.error("Create calendar entry error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllCalendarEntries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await Calendar.countDocuments();

    // Fetch calendar entries with pagination and sorting
    const calendarEntries = await Calendar.find()
      .populate(
        "room",
        "roomName roomCapacity roomStatus pricePerSession amenities"
      )
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Calculate overall statistics
    const totalBookedSeats = await Calendar.aggregate([
      { $group: { _id: null, total: { $sum: "$seatsBooked" } } },
    ]);

    const totalAvailableSeats = await Calendar.aggregate([
      { $group: { _id: null, total: { $sum: "$roomAvailable" } } },
    ]);

    // Format and return the response
    res.status(200).json({
      success: true,
      data: {
        entries: calendarEntries,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
        stats: {
          totalEntries: total,
          totalBookedSeats:
            totalBookedSeats.length > 0 ? totalBookedSeats[0].total : 0,
          totalAvailableSeats:
            totalAvailableSeats.length > 0 ? totalAvailableSeats[0].total : 0,
        },
      },
      message: `Retrieved ${calendarEntries.length} calendar entries`,
    });
  } catch (error) {
    console.error("Get all calendar entries error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get calendar entries by date
const getCalendarByDate = async (req, res) => {
  try {
    const { date, dayTime } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required (YYYY-MM-DD format)",
      });
    }

    // Find time slots for the date
    const timeSlotQuery = {
      date: new Date(date),
    };

    if (dayTime) {
      timeSlotQuery.dayTime = dayTime;
    }

    const timeSlots = await DayTimeSlot.find(timeSlotQuery);

    if (timeSlots.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No time slots found for ${date}${
          dayTime ? ` and session ${dayTime}` : ""
        }`,
      });
    }

    const timeSlotIds = timeSlots.map((slot) => slot._id);

    // Get calendar entries for these time slots
    const calendarEntries = await Calendar.find({
      timeSlot: { $in: timeSlotIds },
    })
      .populate(
        "room",
        "roomName roomCapacity roomStatus pricePerSession amenities"
      )
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email");

    // Group entries by day time (Morning, Afternoon, Evening)
    const groupedEntries = {};
    timeSlots.forEach((slot) => {
      if (!groupedEntries[slot.dayTime]) {
        groupedEntries[slot.dayTime] = [];
      }
    });

    calendarEntries.forEach((entry) => {
      const dayTime = entry.timeSlot.dayTime;
      if (!groupedEntries[dayTime]) {
        groupedEntries[dayTime] = [];
      }
      groupedEntries[dayTime].push(entry);
    });

    // Calculate summary statistics
    const totalBookedSeats = calendarEntries.reduce(
      (total, entry) => total + entry.seatsBooked,
      0
    );
    const totalAvailableSeats = calendarEntries.reduce(
      (total, entry) => total + entry.roomAvailable,
      0
    );

    res.json({
      success: true,
      data: {
        date: date,
        groupedEntries,
        summary: {
          totalEntries: calendarEntries.length,
          totalBookedSeats,
          totalAvailableSeats,
        },
      },
      message: `Calendar entries for ${date}${
        dayTime ? ` and session ${dayTime}` : ""
      } retrieved successfully`,
    });
  } catch (error) {
    console.error("Get calendar by date error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Helper function to convert 12-hour AM/PM to 24-hour format
const convertTo24Hour = (time12) => {
  if (!time12.includes("AM") && !time12.includes("PM")) {
    return time12; // Already in 24-hour format
  }

  const [timePart, period] = time12.split(/\s+/);
  const [hours, minutes] = timePart.split(":");
  let hour24 = parseInt(hours);

  if (period.toUpperCase() === "PM" && hour24 !== 12) {
    hour24 += 12;
  } else if (period.toUpperCase() === "AM" && hour24 === 12) {
    hour24 = 0;
  }

  return `${hour24.toString().padStart(2, "0")}:${minutes}`;
};

// Get calendar entries filtered by session and time range
const getCalendarBySessionwithtimerange = async (req, res) => {
  try {
    const { dayTime, startTime, endTime, date } = req.query;

    if (!dayTime) {
      return res.status(400).json({
        success: false,
        message:
          "Session type (dayTime) is required (Morning/Afternoon/Evening)",
      });
    }

    // Build query for time slots
    const timeSlotQuery = {
      dayTime: dayTime,
    };

    if (date) {
      timeSlotQuery.date = new Date(date);
    }

    // Find time slots matching the criteria
    const timeSlots = await DayTimeSlot.find(timeSlotQuery);

    if (timeSlots.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No time slots found for ${dayTime} session${
          date ? ` on ${date}` : ""
        }`,
      });
    }

    // Filter by time range if provided
    let filteredTimeSlots = timeSlots;
    if (startTime && endTime) {
      filteredTimeSlots = timeSlots.filter((slot) => {
        // Convert all times to minutes for comparison
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(":");
          return parseInt(hours) * 60 + parseInt(minutes);
        };

        const slotStartMinutes = timeToMinutes(slot.startTime);
        const slotEndMinutes = timeToMinutes(slot.endTime);
        const filterStartMinutes = timeToMinutes(convertTo24Hour(startTime));
        const filterEndMinutes = timeToMinutes(convertTo24Hour(endTime));

        return (
          (slotStartMinutes >= filterStartMinutes &&
            slotStartMinutes < filterEndMinutes) ||
          (slotEndMinutes > filterStartMinutes &&
            slotEndMinutes <= filterEndMinutes) ||
          (slotStartMinutes <= filterStartMinutes &&
            slotEndMinutes >= filterEndMinutes)
        );
      });
    }

    const timeSlotIds = filteredTimeSlots.map((slot) => slot._id);

    // Get calendar entries for filtered time slots
    const calendarEntries = await Calendar.find({
      timeSlot: { $in: timeSlotIds },
    })
      .populate(
        "room",
        "roomName roomCapacity roomStatus pricePerSession amenities"
      )
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email");

    // Calculate summary statistics
    const totalBookedSeats = calendarEntries.reduce(
      (total, entry) => total + entry.seatsBooked,
      0
    );
    const totalAvailableSeats = calendarEntries.reduce(
      (total, entry) => total + entry.roomAvailable,
      0
    );

    res.json({
      success: true,
      data: {
        session: dayTime,
        timeRange:
          startTime && endTime ? `${startTime} - ${endTime}` : "All times",
        date: date || "All dates",
        entries: calendarEntries,
        summary: {
          totalEntries: calendarEntries.length,
          totalBookedSeats,
          totalAvailableSeats,
        },
      },
      message: `Calendar entries for ${dayTime} session${
        startTime && endTime ? ` between ${startTime} - ${endTime}` : ""
      }${date ? ` on ${date}` : ""} retrieved successfully`,
    });
  } catch (error) {
    console.error("Get calendar by session error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Book seats in a calendar entry
const bookSeats = async (req, res) => {
  try {
    const { calendarId } = req.params;
    const { userId, seats } = req.body;

    if (!userId || !seats || seats < 1) {
      return res.status(400).json({
        success: false,
        message: "User ID and number of seats (minimum 1) are required",
      });
    }

    const calendarEntry = await Calendar.findById(calendarId);
    if (!calendarEntry) {
      return res.status(404).json({
        success: false,
        message: "Calendar entry not found",
      });
    }

    // Check if enough seats are available
    if (calendarEntry.roomAvailable < seats) {
      return res.status(400).json({
        success: false,
        message: `Not enough seats available. Only ${calendarEntry.roomAvailable} seats left.`,
      });
    }

    // Add booking
    calendarEntry.bookedBy.push({
      user: userId,
      seats: seats,
      bookingDate: new Date(),
    });

    // Update seats booked
    calendarEntry.seatsBooked += seats;

    await calendarEntry.save();

    // Populate the updated entry
    const updatedEntry = await Calendar.findById(calendarId)
      .populate("room", "roomName roomCapacity roomStatus")
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email");

    res.status(200).json({
      success: true,
      data: updatedEntry,
      message: `Successfully booked ${seats} seat(s)`,
    });
  } catch (error) {
    console.error("Book seats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Cancel booking in a calendar entry
const cancelBooking = async (req, res) => {
  try {
    const { calendarId, bookingId } = req.params;

    const calendarEntry = await Calendar.findById(calendarId);
    if (!calendarEntry) {
      return res.status(404).json({
        success: false,
        message: "Calendar entry not found",
      });
    }

    // Find the booking
    const bookingIndex = calendarEntry.bookedBy.findIndex(
      (booking) => booking._id.toString() === bookingId
    );

    if (bookingIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Get number of seats to release
    const seatsToRelease = calendarEntry.bookedBy[bookingIndex].seats;

    // Remove booking
    calendarEntry.bookedBy.splice(bookingIndex, 1);

    // Update seats booked
    calendarEntry.seatsBooked = Math.max(
      0,
      calendarEntry.seatsBooked - seatsToRelease
    );

    await calendarEntry.save();

    // Populate the updated entry
    const updatedEntry = await Calendar.findById(calendarId)
      .populate("room", "roomName roomCapacity roomStatus")
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email");

    res.status(200).json({
      success: true,
      data: updatedEntry,
      message: `Successfully cancelled booking and released ${seatsToRelease} seat(s)`,
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get user's bookings
const getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    const bookings = await Calendar.find({
      "bookedBy.user": userId,
    })
      .populate(
        "room",
        "roomName roomCapacity roomStatus pricePerSession amenities"
      )
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .sort({ "timeSlot.date": 1 });

    // Format bookings for easy display
    const formattedBookings = bookings.map((booking) => {
      // Find this user's specific booking details
      const userBooking = booking.bookedBy.find(
        (b) => b.user.toString() === userId
      );

      return {
        bookingId: userBooking._id,
        calendarId: booking._id,
        date: booking.timeSlot.date,
        day: booking.timeSlot.day,
        dayTime: booking.timeSlot.dayTime,
        slotName: booking.timeSlot.slotName,
        timeRange: `${booking.timeSlot.startTime} - ${booking.timeSlot.endTime}`,
        roomName: booking.room.roomName,
        seats: userBooking.seats,
        pricePerSession: booking.room.pricePerSession,
        totalPrice: userBooking.seats * booking.room.pricePerSession,
        bookingDate: userBooking.bookingDate,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        bookings: formattedBookings,
        totalBookings: formattedBookings.length,
      },
      message: `Retrieved ${formattedBookings.length} bookings for user`,
    });
  } catch (error) {
    console.error("Get user bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
const getAllBookingsWithDetails = async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      session,
      roomId,
      userId,
      page = 1,
      limit = 10,
      sortBy = "timeSlot.date",
      sortOrder = "asc",
    } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query for bookings with filter options
    const query = {};

    // Filter by date range
    if (startDate || endDate) {
      query["timeSlot.date"] = {};
      if (startDate) {
        query["timeSlot.date"].$gte = new Date(startDate);
      }
      if (endDate) {
        query["timeSlot.date"].$lte = new Date(endDate);
      }
    }

    // Filter by session (Morning, Afternoon, Evening)
    if (session) {
      query["timeSlot.dayTime"] = session;
    }

    // Filter by room
    if (roomId) {
      query.room = roomId;
    }

    // Filter by specific user
    if (userId) {
      query["bookedBy.user"] = userId;
    }

    // Only include entries that have bookings
    query.seatsBooked = { $gt: 0 };

    // Get current date for status filtering
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Apply status filter if provided
    if (status) {
      switch (status.toLowerCase()) {
        case "upcoming":
          query["timeSlot.date"] = { $gt: currentDate };
          break;
        case "completed":
          query["timeSlot.date"] = { $lt: currentDate };
          break;
        case "today":
          const todayEnd = new Date(currentDate);
          todayEnd.setHours(23, 59, 59, 999);
          query["timeSlot.date"] = {
            $gte: currentDate,
            $lte: todayEnd,
          };
          break;
        case "pending": // Bookings in the future
          query["timeSlot.date"] = { $gt: currentDate };
          break;
        case "fulfilled": // Bookings that happened today or in the past
          query["timeSlot.date"] = { $lte: currentDate };
          break;
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const calendarEntries = await Calendar.find(query)
      .populate(
        "room",
        "roomName roomCapacity roomStatus pricePerSession amenities"
      )
      .populate("timeSlot", "date day dayTime slotName startTime endTime")
      .populate("bookedBy.user", "name email profileImage")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await Calendar.countDocuments(query);

    // Format bookings for clear display
    const formattedBookings = [];

    calendarEntries.forEach((entry) => {
      entry.bookedBy.forEach((booking) => {
        // Determine booking status based on date
        let bookingStatus = "Pending";
        const bookingDate = new Date(entry.timeSlot.date);
        bookingDate.setHours(0, 0, 0, 0);

        if (bookingDate < currentDate) {
          bookingStatus = "Completed";
        } else if (bookingDate.getTime() === currentDate.getTime()) {
          bookingStatus = "Today";
        }

        // Get time range
        const startTime = entry.timeSlot.startTime || "";
        const endTime = entry.timeSlot.endTime || "";
        const timeRange =
          startTime && endTime ? `${startTime} - ${endTime}` : "Not specified";

        formattedBookings.push({
          bookingId: booking._id,
          calendarId: entry._id,
          roomName: entry.room?.roomName || "Room not found",
          roomStatus: entry.room?.roomStatus || "unknown",
          userName: booking.user?.name || "User not found",
          userEmail: booking.user?.email || "Email not available",
          userProfileImage: booking.user?.profileImage || null,
          date: entry.timeSlot?.date,
          day: entry.timeSlot?.day,
          session: entry.timeSlot?.dayTime,
          timeRange: timeRange,
          slotName: entry.timeSlot?.slotName || "",
          seats: booking.seats,
          pricePerSession: entry.room?.pricePerSession || 0,
          totalPrice: booking.seats * (entry.room?.pricePerSession || 0),
          bookingDate: booking.bookingDate,
          status: bookingStatus,
        });
      });
    });

    // Apply client-side sort for formatted bookings if needed
    if (sortBy === "status") {
      formattedBookings.sort((a, b) => {
        const statusOrder = { Today: 0, Pending: 1, Completed: 2 };
        return sortOrder === "asc"
          ? statusOrder[a.status] - statusOrder[b.status]
          : statusOrder[b.status] - statusOrder[a.status];
      });
    }

    res.status(200).json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
        summary: {
          totalBookings: formattedBookings.length,
          upcomingBookings: formattedBookings.filter(
            (b) => b.status === "Pending" || b.status === "Today"
          ).length,
          completedBookings: formattedBookings.filter(
            (b) => b.status === "Completed"
          ).length,
          todayBookings: formattedBookings.filter((b) => b.status === "Today")
            .length,
        },
      },
      message: `Retrieved ${formattedBookings.length} bookings`,
    });
  } catch (error) {
    console.error("Get all bookings with details error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
const getAllBookingsSimple = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Parse pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Find all calendar entries that have bookings
    const calendarEntries = await Calendar.find({ seatsBooked: { $gt: 0 } })
      .populate("room", "roomName roomCapacity roomStatus pricePerSession")
      .populate("timeSlot", "date day dayTime startTime endTime")
      .populate("bookedBy.user", "name email")
      .sort({ "timeSlot.date": 1, "timeSlot.startTime": 1 })
      .skip(skip)
      .limit(limitNum);

    // Count total bookings for pagination
    const totalCalendarEntries = await Calendar.countDocuments({
      seatsBooked: { $gt: 0 },
    });

    // Calculate total actual bookings (each calendar entry can have multiple bookings)
    let totalBookings = 0;
    calendarEntries.forEach((entry) => {
      totalBookings += entry.bookedBy.length;
    });

    // Get current date for status determination
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Format all bookings into a flat array
    const allBookings = [];

    calendarEntries.forEach((entry) => {
      entry.bookedBy.forEach((booking) => {
        // Determine booking status based on date
        let bookingStatus = "Upcoming";
        const bookingDate = new Date(entry.timeSlot.date);
        bookingDate.setHours(0, 0, 0, 0);

        if (bookingDate < currentDate) {
          bookingStatus = "Completed";
        } else if (bookingDate.getTime() === currentDate.getTime()) {
          bookingStatus = "Today";
        }

        allBookings.push({
          id: booking._id,
          calendarId: entry._id,
          user: booking.user
            ? {
                id: booking.user._id,
                name: booking.user.name,
                email: booking.user.email,
              }
            : "User not available",
          room: entry.room
            ? {
                id: entry.room._id,
                name: entry.room.roomName,
                status: entry.room.roomStatus,
              }
            : "Room not available",
          session: {
            date: entry.timeSlot.date,
            day: entry.timeSlot.day,
            time: entry.timeSlot.dayTime,
            hours: `${entry.timeSlot.startTime || ""} - ${
              entry.timeSlot.endTime || ""
            }`,
          },
          booking: {
            seats: booking.seats,
            price: entry.room ? booking.seats * entry.room.pricePerSession : 0,
            bookingDate: booking.bookingDate,
            status: bookingStatus,
          },
        });
      });
    });

    res.status(200).json({
      success: true,
      data: {
        bookings: allBookings,
        pagination: {
          totalEntries: totalCalendarEntries,
          totalBookings: totalBookings,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCalendarEntries / limitNum),
        },
        counts: {
          total: allBookings.length,
          upcoming: allBookings.filter((b) => b.booking.status === "Upcoming")
            .length,
          today: allBookings.filter((b) => b.booking.status === "Today").length,
          completed: allBookings.filter((b) => b.booking.status === "Completed")
            .length,
        },
      },
      message: `Retrieved all ${allBookings.length} bookings`,
    });
  } catch (error) {
    console.error("Get all bookings simple error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
export {
  createCalendarEntry,
  getCalendarByDate,
  getCalendarBySessionwithtimerange,
  bookSeats,
  getAllBookingsWithDetails,
  getAllCalendarEntries,
  getAllBookingsSimple,
  cancelBooking,
  getUserBookings,
};
