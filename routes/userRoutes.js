// // routes/userRoutes.js

// import express from 'express';
// const router = express.Router();

// import { getUserProfile } from '../controllers/userController.js';
// import { protect } from '../middleware/authMiddleware.js';

// router.get('/me', protect, getUserProfile);

// export default router;



import express from 'express';

import { protect , adminOnly } from '../middleware/authMiddleware.js';
import {
  getAllUsers,
  getUserById,
  deleteUser,
  updateUser,
  toggleUserActive
} from '../controllers/userController.js';



import { getUserProfile } from '../controllers/userController.js';

const router = express.Router();

router.get('/me', protect, getUserProfile);
router.get('/admin/users', protect, adminOnly, getAllUsers);

router.get('/admin/users/:id', protect, adminOnly, getUserById);
router.delete('/admin/users/:id', protect, adminOnly, deleteUser);
router.put('/admin/users/:id', protect, adminOnly, updateUser);
router.patch('/admin/users/:id/toggle', protect, adminOnly, toggleUserActive);




export default router;