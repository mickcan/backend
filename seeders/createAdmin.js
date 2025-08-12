import mongoose from "mongoose";
import User from "../models/user.js"; // Adjust the path as necessary

require("dotenv").config();

const createAdmin = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/room_booking"
    );

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      console.log("Admin user already exists:", existingAdmin.email);
      process.exit(0);
    }

    // Create admin user
    const admin = new User({
      username: "admin",
      email: "admin@example.com",
      password: "admin123", // Change this to a secure password
      role: "admin",
      profile: {
        firstName: "Admin",
        lastName: "User",
      },
    });

    await admin.save();
    console.log("Admin user created successfully:");
    console.log("Email: admin@example.com");
    console.log("Password: admin123");
    console.log("Please change the password after first login!");

    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
};

createAdmin();
