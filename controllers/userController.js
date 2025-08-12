// // controllers/userController.js

// export const getUserProfile = (req, res) => {
//   try {
//     res.status(200).json({
//       id: req.user._id,
//       email: req.user.email,
//       username: req.user.username,
//       fullName: req.user.fullName,
//       role: req.user.role,
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Failed to get profile", error: error.message });
//   }
// };

// controllers/userController.js

import User from "../models/user.js";
import Booking from "../models/booking.js";
import RecurringBookingGroup from "../models/recurringBookingGroup.js";

export const getUserProfile = (req, res) => {
  try {
    res.status(200).json({
      id: req.user._id,
      email: req.user.email,
      username: req.user.username,
      fullName: req.user.fullName,
      role: req.user.role,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to get profile", error: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -__v");
    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    res.status(500).json({
      success: false,
      message: "Server Error while fetching users",
    });
  }
};

// GET single user by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -__v");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// DELETE user
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/// UPDATE user info (email, fullName, and password)
import bcrypt from "bcryptjs";

export const updateUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const user = await User.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    // If new password is provided, hash and update
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    const updatedUser = await user.save();
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Update Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error while updating user" });
  }
};

// TOGGLE isActive
export const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User is now ${user.isActive ? "active" : "inactive"}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
