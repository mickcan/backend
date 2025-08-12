import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// import bookingRoutes from './routes/booking.js';
// import roomRoutes from './routes/room.js';
// app.use('/api/bookings', bookingRoutes);
// app.use('/api/rooms', roomRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ message: "API is running!", timestamp: new Date().toISOString() });
});

// Vercel health check route
app.get("/api/vercel-health", (req, res) => {
  res.json({ status: "ok", vercel: true, timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// For Vercel: export the app, do not listen
export default app;
