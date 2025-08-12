import dotenv from 'dotenv';
import sendEmail from './utils/sendEmail.js';

// Load environment variables
dotenv.config();

const testEmail = async () => {
  try {
    console.log('🧪 Testing email functionality...');
    console.log('📧 Email configuration:');
    console.log('  - EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Not set');
    console.log('  - EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ Not set');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('❌ Email credentials not configured!');
      console.error('📧 Add to your .env file:');
      console.error('   EMAIL_USER=your-email@gmail.com');
      console.error('   EMAIL_PASS=your-app-password');
      return;
    }

    const testEmail = process.env.EMAIL_USER; // Send to yourself for testing
    const subject = 'Test Email from Invoice System';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Test Email</h2>
        <p>This is a test email to verify email functionality.</p>
        <p>If you receive this email, the email system is working correctly.</p>
        <p>Time sent: ${new Date().toLocaleString()}</p>
      </div>
    `;

    console.log('📧 Sending test email to:', testEmail);
    await sendEmail(testEmail, subject, html);
    console.log('✅ Test email sent successfully!');
    console.log('📧 Check your inbox for the test email.');
    
  } catch (error) {
    console.error('❌ Test email failed:', error);
  }
};

testEmail(); 