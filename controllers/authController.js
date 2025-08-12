// // authController.js (ES6 module style)

// import User from '../models/User.js';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import sendEmail from '../utils/sendEmail.js'; // assuming you have this helper

// export const loginUser = async (req, res) => {
//   const { email, password, rememberMe } = req.body;

//   try {
//     const user = await User.findOne({ email });
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     if (!user.isActive) {
//       return res.status(403).json({ message: 'Account not active yet' });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//       expiresIn: '1d',
//     });

//     const cookieOptions = {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'strict',
//       maxAge: rememberMe
//         ? 30 * 24 * 60 * 60 * 1000
//         : 24 * 60 * 60 * 1000,
//     };

//     res
//       .cookie('token', token, cookieOptions)
//       .status(200)
//       .json({
//         message: 'Login successful',
//         user: {
//           id: user._id,
//           email: user.email,
//           role: user.role,
//           fullName: user.fullName,
//         },
//       });

//   } catch (err) {
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// };

// export const registerUser = async (req, res) => {
//   const token = req.params.token;
//   const {  password, confirmPassword } = req.body;

//   if (password !== confirmPassword) {
//     return res.status(400).json({ message: "Passwords do not match" });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id);

//     if (!user || user.isActive) {
//       return res.status(400).json({ message: "Invalid or expired token" });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);

//     user.password = hashedPassword;
//     user.status = "active";
//     user.isActive = true;

//     await user.save();

//     res.status(200).json({ message: "Registration successful. You can now login." });
//   } catch (err) {
//     res.status(500).json({ message: "Registration failed", error: err.message });
//   }
// };

// export const forgotPassword = async (req, res) => {
//   const { email } = req.body;

//   try {
//     const user = await User.findOne({ email });
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//       expiresIn: "15m",
//     });

//     const resetUrl = `${process.env.BASE_URL}/reset-password/${token}`;
//     const message = `
//   <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
//     <h2 style="color: #333; text-align: center;">🔒 Password Reset Request</h2>
//     <p style="font-size: 16px; color: #555;">
//       Hello,<br><br>
//       We received a request to reset your password. Click the button below to set a new password:
//     </p>
//     <div style="text-align: center; margin: 30px 0;">
//       <a href="${resetUrl}" style="background-color: #5c4631; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
//         Reset Password
//       </a>
//     </div>
//     <p style="font-size: 14px; color: #888; text-align: center;">
//       If you didn't request this, you can safely ignore this email.
//     </p>
//     <p style="font-size: 12px; color: #bbb; text-align: center; margin-top: 40px;">
//       &copy; ${new Date().getFullYear()} Ease & Mind Flex Spaces
//     </p>
//   </div>
// `;

//     await sendEmail(user.email, "Reset Your Password", message);
//     res.status(200).json({ message: "Password reset email sent." });
//   } catch (err) {
//     res.status(500).json({ message: "Reset email failed", error: err.message });
//   }
// };

// export const resetPassword = async (req, res) => {
//   const token = req.params.token;
//   const { password, confirmPassword } = req.body;

//   if (password !== confirmPassword) {
//     return res.status(400).json({ message: "Passwords do not match" });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id);
//     if (!user) return res.status(400).json({ message: "Invalid token" });

//     const hashedPassword = await bcrypt.hash(password, 10);
//     user.password = hashedPassword;
//     user.isActive = true;
//     await user.save();

//     res.status(200).json({ message: "Password has been reset successfully." });
//   } catch (err) {
//     res.status(500).json({ message: "Reset failed", error: err.message });
//   }
// };

// export const logoutUser = (req, res) => {
//   res.clearCookie('token', {
//     httpOnly: true,
//     sameSite: 'strict',
//     secure: process.env.NODE_ENV === 'production',
//   });

//   res.status(200).json({ message: 'Logged out successfully' });
// };

import User from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sendEmail from "../utils/sendEmail.js"; // assuming you have this helper

export const loginUser = async (req, res) => {
  const { email, password, rememberMe } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isActive) {
      return res.status(403).json({ message: "Account not active yet" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: rememberMe ? "30d" : "1d",
      }
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    };

    res
      .cookie("token", token, cookieOptions)
      .status(200)
      .json({
        message: "Login successful",
        token: token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
        },
      });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const registerUser = async (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.isActive) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.status = "active";
    user.isActive = true;

    await user.save();

    res
      .status(200)
      .json({ message: "Registration successful. You can now login." });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Registration failed", error: err.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const resetUrl = `${process.env.BASE_URL}/reset-password/${token}`;
    const message = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
    <h2 style="color: #333; text-align: center;">🔒 Password Reset Request</h2>
    <p style="font-size: 16px; color: #555;">
      Hello,<br><br>
      We received a request to reset your password. Click the button below to set a new password:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #5c4631; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Reset Password
      </a>
    </div>
    <p style="font-size: 14px; color: #888; text-align: center;">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="font-size: 12px; color: #bbb; text-align: center; margin-top: 40px;">
      &copy; ${new Date().getFullYear()} Ease & Mind Flex Spaces
    </p>
  </div>
`;

    await sendEmail(user.email, "Reset Your Password", message);
    res.status(200).json({ message: "Password reset email sent." });
  } catch (err) {
    res.status(500).json({ message: "Reset email failed", error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(400).json({ message: "Invalid token" });

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.isActive = true;
    await user.save();

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (err) {
    res.status(500).json({ message: "Reset failed", error: err.message });
  }
};

export const logoutUser = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  res.status(200).json({ message: "Logged out successfully" });
};

export const adminLogin = async (req, res) => {
  const { email, password, rememberMe } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isActive) {
      return res.status(403).json({ message: "Account not active yet" });
    }

    // Check if user is an admin
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: rememberMe ? "30d" : "1d",
      }
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    };

    res
      .cookie("token", token, cookieOptions)
      .status(200)
      .json({
        message: "Admin login successful",
        token: token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          fullName: user.fullName,
        },
      });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const changeAdmin = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  try {
    // Validate input
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin user
    const newAdmin = await User.create({
      email,
      password: hashedPassword,
      role: "admin",
      isActive: true,
      status: "active",
      fullName: "Admin",
      username: email.split("@")[0],
    });

    res.status(201).json({ message: "New admin created successfully" });
  } catch (error) {
    console.error("Error creating admin:", error);
    res
      .status(500)
      .json({ message: "Failed to create admin", error: error.message });
  }
};

export const adminForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Find admin user specifically
    const admin = await User.findOne({ email, role: "admin" });
    if (!admin) {
      return res.status(404).json({ message: "Admin account not found" });
    }

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    // Use ADMIN_URL from environment variables with a fallback
    const adminUrl = process.env.ADMIN_URL || "http://localhost:5173";
    const resetUrl = `${adminUrl}/reset-password/${token}`;

    const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #333; text-align: center;">🔒 Admin Password Reset Request</h2>
      <p style="font-size: 16px; color: #555;">
        Hello Admin,<br><br>
        We received a request to reset your admin password. Click the button below to set a new password:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #5c4631; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Reset Admin Password
        </a>
      </div>
      <p style="font-size: 14px; color: #888; text-align: center;">
        If you didn't request this, please contact support immediately.
      </p>
      <p style="font-size: 12px; color: #bbb; text-align: center; margin-top: 40px;">
        &copy; ${new Date().getFullYear()} Ease & Mind Flex Spaces
      </p>
    </div>
    `;

    await sendEmail(admin.email, "Reset Admin Password", message);
    res
      .status(200)
      .json({ message: "Password reset email sent to admin email." });
  } catch (err) {
    console.error("Admin password reset error:", err);
    res
      .status(500)
      .json({ message: "Failed to send reset email", error: err.message });
  }
};

export const adminResetPassword = async (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findOne({ _id: decoded.id, role: "admin" });

    if (!admin) {
      return res
        .status(400)
        .json({ message: "Invalid token or not an admin account" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    admin.password = hashedPassword;
    await admin.save();

    res
      .status(200)
      .json({ message: "Admin password has been reset successfully" });
  } catch (err) {
    console.error("Admin password reset error:", err);
    res
      .status(500)
      .json({ message: "Password reset failed", error: err.message });
  }
};
