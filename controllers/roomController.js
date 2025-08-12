import Room from "../models/room.js";
import Settings from "../models/settings.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Booking from "../models/booking.js";

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new room
export const createRoom = async (req, res) => {
  try {
    const {
      name,
      capacity,
      timeSlot,
      price,
      morningPrice,
      afternoonPrice,
      nightPrice,
      amenities,
    } = req.body;

    // Validate required fields
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Room name and price are required.",
      });
    }

    // Check if room with same name already exists
    const existingRoom = await Room.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,
        message: "Room with this name already exists.",
      });
    }

    const images = req.cloudinaryUrls || [];

    // Create a single room with session-specific prices
    const room = new Room({
      name: name.trim(),
      // capacity: parseInt(capacity), // Commented out capacity for now
      // timeSlot: timeSlot || "Morning", // Remove timeSlot - room should be available for all slots
      price: parseFloat(price),
      morningPrice: morningPrice ? parseFloat(morningPrice) : parseFloat(price),
      afternoonPrice: afternoonPrice
        ? parseFloat(afternoonPrice)
        : parseFloat(price),
      nightPrice: nightPrice ? parseFloat(nightPrice) : parseFloat(price),
      amenities: amenities || "",
      images,
      totalBooking: 0,
      revenue: 0,
      createdBy: req.user?._id,
    });

    await room.save();

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: room,
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all rooms
export const getAllRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Use lean for plain JS objects
    const rooms = await Room.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Room.countDocuments({ isActive: true });

    // Aggregate bookings for these rooms
    const roomIds = rooms.map((room) => room._id);
    const bookings = await Booking.aggregate([
      {
        $match: {
          roomId: { $in: roomIds },
          status: { $ne: "cancelled" },
          paymentStatus: { $in: ["paid", "pending"] },
        },
      },
      {
        $group: {
          _id: "$roomId",
          totalBooking: { $sum: 1 },
          revenue: { $sum: "$price" },
        },
      },
    ]);

    // Map for quick lookup
    const bookingStats = {};
    bookings.forEach((b) => {
      bookingStats[b._id.toString()] = {
        totalBooking: b.totalBooking,
        revenue: b.revenue,
      };
    });

    // Attach stats to each room
    const roomsWithStats = rooms.map((room) => ({
      ...room,
      totalBooking: bookingStats[room._id.toString()]?.totalBooking || 0,
      revenue: bookingStats[room._id.toString()]?.revenue || 0,
    }));

    res.json({
      success: true,
      data: roomsWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get available rooms by time slot
export const getAvailableRoomsByTimeSlot = async (req, res) => {
  try {
    const { timeSlot, date } = req.query;
    console.log(
      "Fetching available rooms for timeSlot:",
      timeSlot,
      "date:",
      date
    );

    if (!timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Time slot is required",
      });
    }

    // Get all active rooms (regardless of timeSlot since rooms are available for all slots)
    const allRooms = await Room.find({
      isActive: true,
    });

    const totalRooms = allRooms.length;

    // If no date provided, just return total rooms
    if (!date) {
      return res.status(200).json({
        success: true,
        data: allRooms,
        totalRooms,
        availableRooms: totalRooms,
        message: `Available rooms for ${timeSlot} retrieved successfully`,
      });
    }

    // Get all bookings for this date and time slot that are not cancelled
    const bookedRooms = await Booking.find({
      date,
      timeSlot: { $regex: new RegExp(`^${timeSlot}$`, "i") }, // case-insensitive
      status: { $ne: "cancelled" },
      paymentStatus: { $in: ["paid", "pending"] },
    }).select("roomId");

    // Get array of booked room IDs
    const bookedRoomIds = bookedRooms.map((booking) =>
      booking.roomId.toString()
    );

    // Calculate available rooms
    const availableRooms = allRooms.filter(
      (room) => !bookedRoomIds.includes(room._id.toString())
    );

    res.status(200).json({
      success: true,
      data: availableRooms,
      totalRooms,
      availableRooms: availableRooms.length,
      message: `Available rooms for ${timeSlot} retrieved successfully`,
    });
  } catch (error) {
    console.error("Get available rooms error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get room by ID
export const getRoomById = async (req, res) => {
  try {
    const room = await Room.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    res.json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update room
export const updateRoom = async (req, res) => {
  try {
    const {
      name,
      capacity,
      timeSlot,
      price,
      morningPrice,
      afternoonPrice,
      nightPrice,
      amenities,
    } = req.body;
    const roomId = req.params.id;

    const room = await Room.findOne({ _id: roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Update fields
    if (name) room.name = name.trim();
    if (timeSlot) room.timeSlot = timeSlot;
    // if (capacity) room.capacity = parseInt(capacity);
    if (price) room.price = parseFloat(price);
    if (morningPrice !== undefined)
      room.morningPrice = parseFloat(morningPrice);
    if (afternoonPrice !== undefined)
      room.afternoonPrice = parseFloat(afternoonPrice);
    if (nightPrice !== undefined) room.nightPrice = parseFloat(nightPrice);
    if (amenities !== undefined) room.amenities = amenities;

    // Handle new Cloudinary image uploads
    if (req.cloudinaryUrls && req.cloudinaryUrls.length > 0) {
      room.images = req.cloudinaryUrls;
    }

    await room.save();

    res.json({
      success: true,
      message: "Room updated successfully",
      data: room,
    });
  } catch (error) {
    console.error("Update room error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete room (soft delete)
export const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ _id: req.params.id, isActive: true });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Soft delete
    room.isActive = false;
    await room.save();

    res.json({
      success: true,
      message: "Room deleted successfully",
    });
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete room image
export const deleteRoomImage = async (req, res) => {
  try {
    const { roomId, imageId } = req.params;

    const room = await Room.findOne({ _id: roomId, isActive: true });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const imageIndex = room.images.findIndex(
      (img) => img._id.toString() === imageId
    );
    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Remove image from array
    room.images.splice(imageIndex, 1);
    await room.save();

    res.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get bookings for a specific room by specific user
// export const getRoomBookingsByUser = async (req, res) => {
//   try {
//     const { roomId, userId } = req.params;

//     // Validate input
//     if (!roomId || !userId) {
//       return res.status(400).json({
//         success: false,
//         message: "Both roomId and userId are required",
//       });
//     }

//     // Find all bookings for this room and user
//     const bookings = await Booking.find({
//       roomId: roomId,
//       userId: userId,
//     })
//       .populate({
//         path: "userId",
//         select: "fullName email",
//       })
//       .populate({
//         path: "roomId",
//         select: "name",
//       })
//       .sort({ date: -1, startTime: -1 }); // Sort by date and time descending

//     return res.status(200).json({
//       success: true,
//       count: bookings.length,
//       data: bookings,
//       message: "Room bookings fetched successfully",
//     });
//   } catch (error) {
//     console.error("Error in getRoomBookingsByUser:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error fetching room bookings",
//       error: error.message,
//     });
//   }
// };

export const getRoomBookingsByUser = async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    const { recurring, groupId } = req.query;

    if (!roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Both roomId and userId are required",
      });
    }

    let bookings;
    if (recurring === "true" && groupId) {
      // Fetch recurring bookings by groupId, userId, and roomId
      bookings = await Booking.find({
        roomId: roomId,
        userId: userId,
        groupId: groupId,
      })
        .populate({ path: "userId", select: "fullName email" })
        .populate({ path: "roomId", select: "name" })
        .sort({ date: -1, startTime: -1 });
    } else {
      // Simple booking logic
      bookings = await Booking.find({
        roomId: roomId,
        userId: userId,
      })
        .populate({ path: "userId", select: "fullName email" })
        .populate({ path: "roomId", select: "name" })
        .sort({ date: -1, startTime: -1 });
    }

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
      message: "Room bookings fetched successfully",
    });
  } catch (error) {
    console.error("Error in getRoomBookingsByUser:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching room bookings",
      error: error.message,
    });
  }
};
