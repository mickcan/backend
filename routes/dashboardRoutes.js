import express from 'express';
import { getDashboardData} from '../controllers/dashboardController.js';

import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get dashboard data - requires authentication
router.get('/',  protect, adminOnly, getDashboardData);



export default router; 