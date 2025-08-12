
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    // Delete existing admin first
    await User.deleteMany({ role: "admin" });
    console.log("Existing admin deleted.");

    const hashedPassword = await bcrypt.hash("admin1233", 10);

    await User.create({
      fullName: "Admin  New User",
      username: "admin123",
      email: "admin123@gmail.com",
      password: hashedPassword,
      role: "admin",
      status: "active",
      isActive: true,
    });

    console.log("New admin user created successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
