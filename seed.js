import mongoose from "mongoose";
import Room from "../backend/models/room";
const Booking = require("../backend/models/booking");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/booking_system"
    );
    console.log("MongoDB Connected for seeding");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    // Clear existing data
    await Room.deleteMany({});
    await Booking.deleteMany({});

    // Create rooms
    const rooms = await Room.create([
      {
        name: "Conference Room A",
        capacity: 10,
        amenities: ["Projector", "Whiteboard", "WiFi", "Air Conditioning"],
        description: "Large conference room with modern amenities",
      },
      {
        name: "Meeting Room B",
        capacity: 6,
        amenities: ["TV Screen", "WiFi", "Coffee Machine"],
        description: "Cozy meeting room for small teams",
      },
      {
        name: "Boardroom C",
        capacity: 12,
        amenities: ["Conference Phone", "Projector", "WiFi", "Catering"],
        description: "Executive boardroom for important meetings",
      },
      {
        name: "Creative Space D",
        capacity: 8,
        amenities: ["Whiteboard", "WiFi", "Bean Bags", "Gaming Console"],
        description: "Creative space for brainstorming sessions",
      },
      {
        name: "Quiet Room E",
        capacity: 4,
        amenities: ["WiFi", "Soundproof", "Library"],
        description: "Quiet room for focused work",
      },
    ]);

    console.log("Rooms created:", rooms.length);

    // Create some sample bookings
    const today = new Date();
    const bookings = [];

    // Generate bookings for next 2 weeks
    for (let i = 0; i < 14; i++) {
      const bookingDate = new Date(today);
      bookingDate.setDate(today.getDate() + i);

      // Skip weekends
      if (bookingDate.getDay() === 0 || bookingDate.getDay() === 6) continue;

      // Random bookings for each day
      const numBookings = Math.floor(Math.random() * 4) + 1; // 1-4 bookings per day

      for (let j = 0; j < numBookings; j++) {
        const randomRoom = rooms[Math.floor(Math.random() * rooms.length)];
        const timeSlot = Math.random() > 0.5 ? "Morning" : "Evening";

        // Check if this combination already exists
        const exists = bookings.some(
          (b) =>
            b.roomId.toString() === randomRoom._id.toString() &&
            b.date.toDateString() === bookingDate.toDateString() &&
            b.timeSlot === timeSlot
        );

        if (!exists) {
          bookings.push({
            roomId: randomRoom._id,
            date: bookingDate,
            timeSlot,
            timeSlotDetails:
              timeSlot === "Morning"
                ? { start: "08:00", end: "12:30" }
                : { start: "12:30", end: "18:30" },
            status: "booked",
            bookedBy: {
              name: `User ${Math.floor(Math.random() * 100)}`,
              email: `user${Math.floor(Math.random() * 100)}@example.com`,
              phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            },
            notes: "Sample booking for testing",
          });
        }
      }
    }

    await Booking.create(bookings);
    console.log("Bookings created:", bookings.length);

    console.log("Seed data created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
};

// Run seeding
connectDB().then(() => {
  seedData();
});
