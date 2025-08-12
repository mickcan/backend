import cron from 'node-cron';
import updateBookingStatuses from './updateBookingStatuses.js';

/**
 * Sets up scheduled tasks for the application
 */
export const setupScheduledTasks = () => {
  // Run every 5 minutes to update booking statuses
  cron.schedule('*/17 * * * *', async () => {
    console.log('Running scheduled task: Update booking statuses');
    await updateBookingStatuses();
  });
  
  console.log('✅ Scheduled tasks have been set up');
};

export default setupScheduledTasks; 