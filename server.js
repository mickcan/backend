// server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import User from "./models/user.js";
// import { handleInvoiceStatusWebhook } from "./controllers/webhookController.js";
// Import routes
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import roomRoutes from "./routes/roomRoute.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import recurringBookingRoutes from "./routes/recurringBookingRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import weekdaysRoutes from "./routes/weekdaysRoute.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import { setupRecurringBookingCronJobs } from "./controllers/recurringModalController.js";

// ES module fix for path issues (for __dirname if needed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Only create uploads directory in non-production (local/dev) environments
if (process.env.NODE_ENV !== "production") {
  const uploadsDir = path.join(__dirname, "uploads/rooms");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

// Stripe webhook route (must use raw body, before express.json for this route only)
import { handleInvoiceStatusWebhook } from "./controllers/webhookController.js";
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.post(
  "/api/stripe/payments/webhook",
  express.raw({ type: "application/json" }),
  handleInvoiceStatusWebhook
);

// Regular middleware
app.use(express.json());
app.use(cookieParser());

// Configure CORS with dynamic origin validation
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map(s => s.trim());
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        var msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  })
);

// Serve static files (for uploaded images)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/recurring-bookings", recurringBookingRoutes);
// app.use('/api/calendar', calendarRoutes);
// app.use('/api/day-time-slots', dayTimeSlotRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/weekdays", weekdaysRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Test route to verify DB users (for debugging only)
app.get("/test-users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: err.message });
  }
});

// Import scheduled tasks
import setupScheduledTasks from "./utils/scheduleTasks.js";

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    app.listen(process.env.PORT, () => {
      console.log(`🚀 Server running on port ${process.env.PORT}`);
      // Set up scheduled tasks
      setupScheduledTasks();

      // Start recurring booking/invoice cron jobs
      setupRecurringBookingCronJobs();
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Error handling middleware
app.use((err, req, res, next) => {
  if (
    err.message ===
    "The CORS policy for this site does not allow access from the specified Origin."
  ) {
    res.status(403).json({
      success: false,
      message: err.message,
    });
    return;
  }
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Request logging in development
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}
