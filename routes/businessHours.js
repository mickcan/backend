import express from "express";
import { body, validationResult } from "express-validator";
import BusinessHours from "../models/businessHours.js";
import User from "../models/user.js";
import Room from "../models/room.js";
import Booking from "../models/booking.js";

const router = express.Router();

// Get current business hours configuration
router.get("/", async (req, res) => {
  try {
    const businessHours = await BusinessHours.find()
      .populate("createdBy lastModifiedBy", "username fullName")
      .sort({ displayOrder: 1 });

    // If no business hours exist, create default ones
    if (businessHours.length === 0) {
      const currentUser = await User.findOne({ username: "Fakhar87" });
      if (currentUser) {
        const defaultHours = await createDefaultBusinessHours(currentUser._id);
        return res.json({
          success: true,
          message: "Default business hours created",
          data: defaultHours,
        });
      }
    }

    const formattedHours = businessHours.map((hour) => ({
      _id: hour._id,
      sessionName: hour.sessionName,
      sessionKey: hour.sessionKey,
      startTime: hour.startTime,
      endTime: hour.endTime,
      timeRange: hour.timeRange,
      enabled: hour.enabled,
      displayOrder: hour.displayOrder,
      createdBy: hour.createdBy,
      lastModifiedBy: hour.lastModifiedBy,
      updatedAt: hour.updatedAt,
    }));

    res.json({
      success: true,
      data: formattedHours,
      currentTime: "2025-06-14 09:46:05",
      currentUser: "Fakhar87",
    });
  } catch (error) {
    console.error("Get business hours error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching business hours",
      error: error.message,
    });
  }
});

// Update business hours
router.put(
  "/update",
  [
    body("sessions").isArray().withMessage("Sessions must be an array"),
    body("sessions.*.sessionName")
      .notEmpty()
      .withMessage("Session name is required"),
    body("sessions.*.sessionKey")
      .isIn(["morning", "evening", "night"])
      .withMessage("Invalid session key"),
    body("sessions.*.startTime")
      .matches(/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/)
      .withMessage("Invalid start time format"),
    body("sessions.*.endTime")
      .matches(/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/)
      .withMessage("Invalid end time format"),
    body("sessions.*.enabled")
      .isBoolean()
      .withMessage("Enabled must be boolean"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { sessions } = req.body;
      const currentUser = await User.findOne({ username: "Fakhar87" });

      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Validate time logic
      for (const session of sessions) {
        if (!isValidTimeRange(session.startTime, session.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Invalid time range for ${session.sessionName}: End time must be after start time`,
          });
        }
      }

      // Check for overlapping sessions
      const enabledSessions = sessions.filter((s) => s.enabled);
      if (hasOverlappingSessions(enabledSessions)) {
        return res.status(400).json({
          success: false,
          message: "Sessions cannot overlap with each other",
        });
      }

      const updatedSessions = [];

      // Update or create each session
      for (let i = 0; i < sessions.length; i++) {
        const sessionData = sessions[i];

        const updatedSession = await BusinessHours.findOneAndUpdate(
          { sessionKey: sessionData.sessionKey },
          {
            sessionName: sessionData.sessionName,
            sessionKey: sessionData.sessionKey,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            enabled: sessionData.enabled,
            displayOrder: i + 1,
            lastModifiedBy: currentUser._id,
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        // Set createdBy if it's a new document
        if (!updatedSession.createdBy) {
          updatedSession.createdBy = currentUser._id;
          await updatedSession.save();
        }

        await updatedSession.populate(
          "createdBy lastModifiedBy",
          "username fullName"
        );
        updatedSessions.push(updatedSession);
      }

      // Update existing bookings if sessions are disabled
      await updateBookingsForDisabledSessions(sessions);

      res.json({
        success: true,
        message: "Business hours updated successfully",
        data: updatedSessions,
        updatedAt: "2025-06-14 09:46:05",
        updatedBy: "Fakhar87",
      });
    } catch (error) {
      console.error("Update business hours error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating business hours",
        error: error.message,
      });
    }
  }
);

// Get business hours impact report
router.get("/impact-report", async (req, res) => {
  try {
    const businessHours = await BusinessHours.find().sort({ displayOrder: 1 });

    const impact = await Promise.all(
      businessHours.map(async (session) => {
        // Count affected rooms
        const roomsCount = await Room.countDocuments({
          session: session.sessionKey,
          isActive: true,
        });

        // Count future bookings
        const futureBookingsCount = await Booking.countDocuments({
          session: session.sessionKey,
          bookingDate: { $gte: new Date("2025-06-14") },
          status: { $in: ["confirmed", "pending"] },
        });

        // Count bookings for today
        const todayBookingsCount = await Booking.countDocuments({
          session: session.sessionKey,
          bookingDate: {
            $gte: new Date("2025-06-14T00:00:00Z"),
            $lt: new Date("2025-06-15T00:00:00Z"),
          },
          status: { $in: ["confirmed", "pending"] },
        });

        return {
          sessionKey: session.sessionKey,
          sessionName: session.sessionName,
          timeRange: session.timeRange,
          enabled: session.enabled,
          affectedRooms: roomsCount,
          futureBookings: futureBookingsCount,
          todayBookings: todayBookingsCount,
        };
      })
    );

    res.json({
      success: true,
      data: impact,
      generatedAt: "2025-06-14 09:46:05",
    });
  } catch (error) {
    console.error("Impact report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating impact report",
      error: error.message,
    });
  }
});

// Reset to default business hours
router.post("/reset-default", async (req, res) => {
  try {
    const currentUser = await User.findOne({ username: "Fakhar87" });

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete existing business hours
    await BusinessHours.deleteMany({});

    // Create default business hours
    const defaultHours = await createDefaultBusinessHours(currentUser._id);

    res.json({
      success: true,
      message: "Business hours reset to default values",
      data: defaultHours,
    });
  } catch (error) {
    console.error("Reset default error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting to default business hours",
      error: error.message,
    });
  }
});

// Helper functions
async function createDefaultBusinessHours(userId) {
  const defaultSessions = [
    {
      sessionName: "Morning Session",
      sessionKey: "morning",
      startTime: "9:00 AM",
      endTime: "1:00 PM",
      enabled: true,
      displayOrder: 1,
    },
    {
      sessionName: "Evening Session",
      sessionKey: "evening",
      startTime: "2:00 PM",
      endTime: "6:00 PM",
      enabled: true,
      displayOrder: 2,
    },
    {
      sessionName: "Night Session",
      sessionKey: "night",
      startTime: "9:00 PM",
      endTime: "10:00 AM",
      enabled: false,
      displayOrder: 3,
    },
  ];

  const createdSessions = [];
  for (const sessionData of defaultSessions) {
    const session = new BusinessHours({
      ...sessionData,
      createdBy: userId,
      lastModifiedBy: userId,
    });
    await session.save();
    await session.populate("createdBy lastModifiedBy", "username fullName");
    createdSessions.push(session);
  }

  return createdSessions;
}

function isValidTimeRange(startTime, endTime) {
  const start24 = convertTo24Hour(startTime);
  const end24 = convertTo24Hour(endTime);

  // Handle overnight sessions (like 9:00 PM to 10:00 AM)
  if (end24 < start24) {
    return true; // Overnight session is valid
  }

  return end24 > start24;
}

function hasOverlappingSessions(sessions) {
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      if (sessionsOverlap(sessions[i], sessions[j])) {
        return true;
      }
    }
  }
  return false;
}

function sessionsOverlap(session1, session2) {
  const start1 = convertTo24Hour(session1.startTime);
  const end1 = convertTo24Hour(session1.endTime);
  const start2 = convertTo24Hour(session2.startTime);
  const end2 = convertTo24Hour(session2.endTime);

  // Simple overlap check (doesn't handle overnight sessions)
  return start1 < end2 && start2 < end1;
}

function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(" ");
  let [hours, minutes] = time.split(":");
  if (hours === "12") {
    hours = "00";
  }
  if (modifier === "PM") {
    hours = parseInt(hours, 10) + 12;
  }
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
}

async function updateBookingsForDisabledSessions(sessions) {
  const disabledSessions = sessions
    .filter((s) => !s.enabled)
    .map((s) => s.sessionKey);

  if (disabledSessions.length > 0) {
    // Cancel future bookings for disabled sessions
    await Booking.updateMany(
      {
        session: { $in: disabledSessions },
        bookingDate: { $gte: new Date("2025-06-14") },
        status: { $in: ["confirmed", "pending"] },
      },
      {
        status: "cancelled",
        notes: "Cancelled due to business hours change",
      }
    );
  }
}

export default router;
