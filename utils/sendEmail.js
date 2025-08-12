import nodemailer from 'nodemailer';

const sendEmail = async (to, subject, html) => {
  try {
    console.log('📧 Starting email sending process...');
    console.log('📧 Email configuration check:');
    console.log('  - EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Not set');
    console.log('  - EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ Not set');
    console.log('  - Recipient:', to);
    console.log('  - Subject:', subject);

    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      const error = 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS in .env file';
      console.error('❌', error);
      throw new Error(error);
    }

    // Create transporter with proper Gmail settings
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      secure: true,
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log('📧 Transporter created, verifying connection...');

    // Verify connection
    await transporter.verify();
    console.log('✅ Email connection verified successfully');

    // Prepare email options
    const mailOptions = {
      from: {
        name: 'Booking System',
        address: process.env.EMAIL_USER
      },
      to: to,
      subject: subject,
      html: html,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'X-Priority': '1'
      }
    };

    console.log('📧 Sending email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', result.messageId);
    console.log('📧 Response:', result.response);
    
    return result;
  } catch (error) {
    console.error('❌ Email sending failed!');
    console.error('📧 Error details:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    
    // Provide specific error messages for common issues
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Please check your EMAIL_USER and EMAIL_PASS in .env file');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Email connection failed. Please check your internet connection');
    } else if (error.message.includes('Invalid login')) {
      throw new Error('Invalid email credentials. Please check your EMAIL_USER and EMAIL_PASS');
    } else {
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }
};

export default sendEmail;
