// // import express from'express'
// // const router = express.Router();
// // import { loginUser, registerUser, forgotPassword, resetPassword,logoutUser } from '../controllers/authController.js'

// // router.post('/login', loginUser);
// // router.post('/register/:token', registerUser);
// // router.post('/forgot-password', forgotPassword);
// // router.post('/reset-password/:token', resetPassword);
// // router.post('/logout', logoutUser);

// // export default router;

// import express from 'express';
// import { registerUser, loginUser, logoutUser, getProfile } from '../controllers/authController.js';
// import { protect } from '../middleware/auth.js';

// const router = express.Router();

// // Test route
// router.get('/test', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Auth routes are working!',
//     timestamp: new Date().toISOString()
//   });
// });

// // Public routes
// router.post('/register', registerUser);
// router.post('/login', loginUser);
// router.post('/logout', logoutUser);

// // Protected routes
// router.get('/profile', protect, getProfile);

// // Debug route (remove in production)
// router.get('/debug', async (req, res) => {
//   try {
//     const User = (await import('../models/User.js')).default;
//     const admin = await User.findOne({ email: "admin1233@gmail.com" });
    
//     res.json({
//       success: true,
//       adminExists: admin ? true : false,
//       adminData: admin ? {
//         email: admin.email,
//         role: admin.role,
//         isActive: admin.isActive,
//         hasPassword: admin.password ? true : false
//       } : null,
//       jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set'
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// export default router;


import express from'express'
const router = express.Router();
import { loginUser, registerUser, forgotPassword, resetPassword, logoutUser, adminLogin } from '../controllers/authController.js'
import { protect } from '../middleware/authMiddleware.js';

router.post('/login', loginUser);
router.post('/admin/login', adminLogin);
router.post('/register/:token', registerUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/logout', logoutUser);

export default router;