import Booking from '../models/booking.js';
import Room from '../models/room.js';
import User from '../models/user.js';

/**
 * Format time to 12-hour format with AM/PM
 */
function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
}

/**
 * Get dashboard statistics and data
 * GET /api/dashboard
 * Matches exactly the structure from dashboardSlice.js
 */
export const getDashboardData = async (req, res) => {
    try {
        // Get current date and time for filtering
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        // Calculate total revenue, active bookings, and total bookings
        const bookingStats = await Booking.aggregate([
            {
                $facet: {
                    'revenue': [
                        { 
                            $match: { 
                                paymentStatus: 'paid',
                                status: { $ne: 'cancelled' } // Exclude cancelled bookings from revenue
                            } 
                        },
                        { $group: { _id: null, total: { $sum: '$price' } } }
                    ],
                    'activeBookings': [
                        { 
                            $match: { 
                                status: 'upcoming',
                                paymentStatus: 'paid'
                            }
                        },
                        { $count: 'count' }
                    ],
                    'totalBookings': [
                        { 
                            $match: { 
                                status: { $in: ['upcoming', 'completed'] },
                                paymentStatus: 'paid'
                            }
                        },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        // Calculate average booking price for paid bookings
        const avgBookingStats = await Booking.aggregate([
            { 
                $match: { 
                    paymentStatus: 'paid',
                    status: { $in: ['upcoming', 'completed'] }
                }
            },
            { 
                $group: { 
                    _id: null, 
                    avgBooking: { $avg: '$price' }
                }
            }
        ]);

        // Get popular rooms (most bookings, excluding cancelled)
        const popularRooms = await Booking.aggregate([
            { 
                $match: { 
                    status: { $ne: 'cancelled' },
                    paymentStatus: 'paid'
                }
            },
            { 
                $group: {
                    _id: '$roomId',
                    bookings: { $sum: 1 }
                }
            },
            { $sort: { bookings: -1 } },
            { $limit: 3 },
            {
                $lookup: {
                    from: 'rooms',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            { $unwind: '$roomDetails' },
            {
                $project: {
                    name: '$roomDetails.name',
                    bookings: 1,
                    _id: 0
                }
            }
        ]);

        // Calculate room utilization for non-deleted rooms
        const roomUtilization = await Room.aggregate([
            {
                $match: {
                    $and: [
                        { isDeleted: { $ne: true } },
                        { isActive: true },
                        { name: { $exists: true, $ne: '' } }
                    ]
                }
            },
            // Remove duplicates by room name
            {
                $group: {
                    _id: '$name',
                    roomId: { $first: '$_id' },
                    name: { $first: '$name' },
                    isActive: { $first: '$isActive' }
                }
            },
            {
                $match: {
                    isActive: true
                }
            },
            {
                $lookup: {
                    from: 'bookings',
                    let: { roomId: '$roomId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$roomId', '$$roomId'] },
                                status: { $ne: 'cancelled' },
                                paymentStatus: 'paid'
                            }
                        }
                    ],
                    as: 'validBookings'
                }
            },
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'roomId',
                    foreignField: 'roomId',
                    as: 'allBookings'
                }
            },
            {
                $project: {
                    name: 1,
                    validBookingsCount: { $size: '$validBookings' },
                    totalBookingsCount: { $size: '$allBookings' },
                    utilization: {
                        $cond: [
                            { $eq: [{ $size: '$allBookings' }, 0] },
                            0,
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            { $size: '$validBookings' },
                                            { $size: '$allBookings' }
                                        ]
                                    },
                                    100
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    utilization: { $round: ['$utilization', 1] },
                    _id: 0
                }
            },
            { $sort: { utilization: -1 } }
        ]);

        // Get recent activity
        const recentBookings = await Booking.aggregate([
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'rooms',
                    localField: 'roomId',
                    foreignField: '_id',
                    as: 'roomDetails'
                }
            },
            { $unwind: '$userDetails' },
            { $unwind: '$roomDetails' },
            {
                $project: {
                    user: '$userDetails.fullName',
                    action: {
                        $switch: {
                            branches: [
                                { case: { $eq: ['$status', 'upcoming'] }, then: 'Booked' },
                                { case: { $eq: ['$status', 'completed'] }, then: 'Completed' },
                                { case: { $eq: ['$status', 'cancelled'] }, then: 'Cancelled' }
                            ],
                            default: 'Unknown'
                        }
                    },
                    room: '$roomDetails.name',
                    createdAt: 1,
                    _id: 0
                }
            }
        ]);

        // Format recent activity to match frontend format
        const recentActivityData = recentBookings.map(booking => ({
            user: booking.user,
            action: booking.action,
            room: booking.room,
            date: new Date(booking.createdAt).toLocaleDateString('en-US', { 
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }),
            time: formatTime(new Date(booking.createdAt))
        }));

        // Format stats data to exactly match frontend slice structure
        const statsData = {
            totalRevenue: bookingStats[0]?.revenue[0]?.total || 0,
            bookingsScheduled: bookingStats[0]?.totalBookings[0]?.count || 0,
            activeBookings: bookingStats[0]?.activeBookings[0]?.count || 0,
            avgBooking: Math.round(avgBookingStats[0]?.avgBooking || 0)
        };

        // Return data in exact format expected by frontend slice
        return res.status(200).json({
            success: true,
            data: {
                statsData,
                popularRooms,
                roomUtilizationData: roomUtilization,
                recentActivityData
            }
        });

    } catch (error) {
        console.error('Dashboard data error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data',
            error: error.message
        });
    }
};

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
    try {
        // First, let's check how many rooms we actually have
        const allRooms = await Room.find({});
        console.log('Total rooms in database:', allRooms.length);
        
        // Check non-deleted rooms
        const activeRooms = await Room.find({ 
            isDeleted: { $ne: true },
            isActive: true,
            name: { $exists: true, $ne: '' }
        });
        console.log('Active non-deleted rooms:', activeRooms.length);
        console.log('Active rooms:', activeRooms.map(r => ({ id: r._id, name: r.name, status: r.status, isDeleted: r.isDeleted })));

        // Calculate room utilization for non-deleted rooms
        const roomUtilization = await Room.aggregate([
            {
                $match: {
                    $and: [
                        { isDeleted: { $ne: true } },
                        { isActive: true },
                        { name: { $exists: true, $ne: '' } }
                    ]
                }
            },
            // Remove duplicates by room name
            {
                $group: {
                    _id: '$name',
                    roomId: { $first: '$_id' },
                    name: { $first: '$name' },
                    isActive: { $first: '$isActive' }
                }
            },
            {
                $match: {
                    isActive: true
                }
            },
            {
                $lookup: {
                    from: 'bookings',
                    let: { roomId: '$roomId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$roomId', '$$roomId'] },
                                status: { $ne: 'cancelled' },
                                paymentStatus: 'paid'
                            }
                        }
                    ],
                    as: 'validBookings'
                }
            },
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'roomId',
                    foreignField: 'roomId',
                    as: 'allBookings'
                }
            },
            {
                $project: {
                    name: 1,
                    validBookingsCount: { $size: '$validBookings' },
                    totalBookingsCount: { $size: '$allBookings' },
                    utilization: {
                        $cond: [
                            { $eq: [{ $size: '$allBookings' }, 0] },
                            0,
                            {
                                $multiply: [
                                    {
                                        $divide: [
                                            { $size: '$validBookings' },
                                            { $size: '$allBookings' }
                                        ]
                                    },
                                    100
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    utilization: { $round: ['$utilization', 1] },
                    _id: 0
                }
            },
            { $sort: { utilization: -1 } }
        ]);

        console.log('Room utilization results:', roomUtilization);

        // Get total users (excluding deleted)
        const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });

        // Get total bookings
        const totalBookings = await Booking.countDocuments({
            roomId: { $in: await Room.find({ isDeleted: { $ne: true } }).distinct('_id') }
        });

        // Calculate average bookings per room
        const avgBookingsPerRoom = activeRooms.length > 0 ? (totalBookings / activeRooms.length).toFixed(1) : 0;

        // Get today's date at start and end
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get today's bookings (only for non-deleted rooms)
        const todayBookings = await Booking.countDocuments({
            date: {
                $gte: today.toISOString().split('T')[0],
                $lt: tomorrow.toISOString().split('T')[0]
            },
            roomId: { $in: await Room.find({ isDeleted: { $ne: true } }).distinct('_id') }
        });

        // Get recent bookings (only for non-deleted rooms)
        const recentBookings = await Booking.find({
            roomId: { $in: await Room.find({ isDeleted: { $ne: true } }).distinct('_id') }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({
            path: 'roomId',
            select: 'name'
        })
        .populate({
            path: 'userId',
            select: 'name email'
        });

        // Format recent bookings
        const formattedRecentBookings = recentBookings.map(booking => ({
            id: booking._id,
            room: booking.roomId?.name || 'Unknown Room',
            user: booking.userId?.name || 'Unknown User',
            date: booking.date,
            status: booking.status,
            amount: booking.price
        }));

        // Send response
        res.status(200).json({
            success: true,
            data: {
                totalRooms: activeRooms.length, // Use the accurate count
                totalUsers,
                totalBookings,
                avgBookingsPerRoom,
                todayBookings,
                roomUtilization,
                recentBookings: formattedRecentBookings
            }
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics'
        });
    }
};

