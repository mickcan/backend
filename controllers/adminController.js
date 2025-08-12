// import User from '../models/User.js';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import  sendEmail  from '../utils/sendEmail.js';

// // Invite a user
// export const inviteUser = async (req, res) => {
//   const { fullName, email } = req.body;

//   try {
//     const existingUser = await User.findOne({ email });
//     if (existingUser) return res.status(400).json({ message: 'User already exists' });

//     const newUser = await User.create({
//       fullName,
//       email,
//       role: 'user',
//       status: 'pending',
//       isActive: false,
//       password: 'temp',
//     });

//     const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
//       expiresIn: '1d',
//     });

//     const registerUrl = `${process.env.BASE_URL}/register/${token}`;
//     const message = `
//   <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #fdfdfd;">
//     <h2 style="color: #333; text-align: center;">🎉 ${fullName}, You're Invited to Join Ease & Mind Flex Spaces</h2>

//     <p style="font-size: 16px; color: #555; line-height: 1.6;">
//       You have been invited to create an account at <strong>Ease & Mind Flex Spaces</strong>.
//       Please click the button below to complete your registration and start booking flexible coworking spaces tailored to your needs.
//     </p>

//     <div style="text-align: center; margin: 30px 0;">
//       <a href="${registerUrl}" style="background-color: #5c4631; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
//         Complete Registration
//       </a>
//     </div>

//     <p style="font-size: 14px; color: #777; text-align: center;">
//       This link will expire soon. If you weren't expecting this email, you can ignore it safely.
//     </p>

//     <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 40px;">
//       &copy; ${new Date().getFullYear()} Ease & Mind Flex Spaces
//     </p>
//   </div>
// `;

//     await sendEmail(email, 'Invitation to Register', message);

//     res.status(200).json({ message: 'Invitation email sent successfully.' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error inviting user', error: err.message });
//   }
// };

// // View all users
// export const getAllUsers = async (req, res) => {
//   try {
//     const users = await User.find({ role: 'user' }).select('-password');
//     res.status(200).json(users);
//   } catch (err) {
//     res.status(500).json({ message: 'Failed to get users', error: err.message });
//   }
// };

// // Edit user info
// export const editUser = async (req, res) => {
//   const { id } = req.params;
//   const { fullName, username, email, status, isActive, password } = req.body;

//   try {
//     const user = await User.findById(id);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     user.fullName = fullName || user.fullName;
//     user.username = username || user.username;
//     user.email = email || user.email;
//     user.status = status || user.status;
//     user.isActive = isActive !== undefined ? isActive : user.isActive;

//     if (password) {
//       const hashed = await bcrypt.hash(password, 10);
//       user.password = hashed;
//     }

//     await user.save();

//     res.status(200).json({ message: 'User updated successfully', user });
//   } catch (err) {
//     res.status(500).json({ message: 'Failed to update user', error: err.message });
//   }
// };

// // Delete user
// export const deleteUser = async (req, res) => {
//   const { id } = req.params;

//   try {
//     const user = await User.findById(id);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     await user.deleteOne();
//     res.status(200).json({ message: 'User deleted successfully' });
//   } catch (err) {
//     res.status(500).json({ message: 'Failed to delete user', error: err.message });
//   }
// };
import User from "../models/user.js";
import Booking from "../models/booking.js";
import RecurringBookingGroup from "../models/recurringBookingGroup.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sendEmail from "../utils/sendEmail.js";

// Invite a user
export const inviteUser = async (req, res) => {
  const { fullName, email } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    // Generate a temporary username based on email and timestamp
    const tempUsername = email.split("@")[0] + Date.now().toString().slice(-4);

    const newUser = await User.create({
      fullName,
      email,
      username: tempUsername, // Add temporary unique username
      role: "user",
      status: "pending",
      isActive: false,
      password: "temp",
    });

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const registerUrl = `${process.env.BASE_URL}/register/${token}`;
    const message = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #fdfdfd;">
    <h2 style="color: #333; text-align: center;">🎉 ${fullName}, You're Invited to Join Ease & Mind Flex Spaces</h2>

    <p style="font-size: 16px; color: #555; line-height: 1.6;">
      You have been invited to create an account at <strong>Ease & Mind Flex Spaces</strong>.
      Please click the button below to complete your registration and start booking flexible coworking spaces tailored to your needs.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${registerUrl}" style="background-color: #5c4631; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
        Complete Registration
      </a>
    </div>

    <p style="font-size: 14px; color: #777; text-align: center;">
      This link will expire soon. If you weren't expecting this email, you can ignore it safely.
    </p>

    <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 40px;">
      &copy; ${new Date().getFullYear()} Ease & Mind Flex Spaces
    </p>
  </div>
`;

    await sendEmail(email, "Invitation to Register", message);

    res.status(200).json({ message: "Invitation email sent successfully." });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error inviting user", error: err.message });
  }
};

// Get user bookings and revenue
export const getUserBookings = async (req, res) => {
  const { userId } = req.params;

  try {
    // First check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Find only completed bookings for the user
    const bookings = await Booking.find({
      userId,
      status: "completed", // Only get completed bookings
    })
      .populate("roomId", "name") // Get room name
      .sort({ date: -1 }); // Sort by date descending

    // Calculate total amount from completed bookings only
    const totalAmount = bookings.reduce((sum, booking) => {
      return sum + (booking.price || 0);
    }, 0);

    return res.status(200).json({
      success: true,
      bookings,
      stats: {
        totalBookings: bookings.length,
        totalAmount,
      },
    });
  } catch (error) {
    console.error("Error in getUserBookings:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user bookings",
      error: error.message,
    });
  }
};

// View all users with booking stats
export const getAllUsers = async (req, res) => {
  try {
    // Get all users
    const users = await User.find({ role: "user" }).select("-password");

    // Get bookings for all users (only completed)
    const bookings = await Booking.find({
      userId: { $in: users.map((user) => user._id) },
      status: "completed",
    });

    // Get recurring booking groups for all users
    const recurringGroups = await RecurringBookingGroup.find({
      userId: { $in: users.map((user) => user._id) },
    });

    // Calculate stats for each user
    const usersWithStats = users.map((user) => {
      const userBookings = bookings.filter(
        (booking) => booking.userId.toString() === user._id.toString()
      );
      const userRecurringCount = recurringGroups.filter(
        (group) => group.userId.toString() === user._id.toString()
      ).length;
      const totalAmount = userBookings
        .filter((booking) => booking.paymentStatus === "paid")
        .reduce((sum, booking) => sum + (booking.price || 0), 0);

      return {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        isActive: user.isActive,
        status: user.status,
        bookings: userBookings.length,
        totalAmount: totalAmount,
        recurringGroup: userRecurringCount,
      };
    });

    res.status(200).json(usersWithStats);
  } catch (err) {
    res.status(500).json({
      message: "Failed to get users",
      error: err.message,
    });
  }
};

// Edit user info
export const editUser = async (req, res) => {
  const { id } = req.params;
  const { fullName, username, email, status, isActive, password } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.fullName = fullName || user.fullName;
    user.username = username || user.username;
    user.email = email || user.email;
    user.status = status || user.status;
    user.isActive = isActive !== undefined ? isActive : user.isActive;

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      user.password = hashed;
    }

    await user.save();

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update user", error: err.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete user", error: err.message });
  }
};

export const getUserRecurringReservations = async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch user info
    const user = await User.findById(userId).select("fullName email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find all recurring groups for this user
    const groups = await RecurringBookingGroup.find({ userId })
      .populate("selectedRooms.roomId")
      .lean();

    // Flatten and format for frontend
    const reservations = groups.map((group) => {
      // Use the first selected room for display (adjust if you want to show all)
      const selectedRoom = group.selectedRooms[0];
      const roomName = selectedRoom?.roomId?.name || "Room";

      // Format start date
      const d = new Date(group.startDate);
      const day = d.toLocaleDateString("en-US", { weekday: "long" }); // "Tuesday"
      const date = d.toLocaleDateString("en-GB"); // "02/08/2025"

      // Time slot info
      const slot =
        group.timeSlot.charAt(0).toUpperCase() + group.timeSlot.slice(1);
      const startTime = group.startTime;
      const endTime = group.endTime;

      return {
        id: group._id,
        room: roomName,
        date: { day, date },
        time: { slot, start: startTime, end: endTime },
        price: group.price,
        status: group.status.charAt(0).toUpperCase() + group.status.slice(1),
      };
    });

    res.json({
      reservations,
      user: {
        fullName: user.fullName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error fetching recurring reservations:", error);
    res.status(500).json({ message: "Failed to fetch recurring reservations" });
  }
};
