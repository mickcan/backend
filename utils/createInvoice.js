import Stripe from "stripe";
import { Invoice } from "../models/invoice.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Automatically create an invoice for a successful payment
 * @param {Object} booking - The booking object
 * @param {Object} user - The user object
 * @param {Object} room - The room object
 * @param {string} paymentId - The payment ID from Stripe or PayPal
 * @param {string} paymentMethod - The payment method (stripe/paypal)
 * @returns {Promise<Object>} - The created invoice or null if failed
 */
export const createInvoiceForPayment = async (booking, user, room, paymentId, paymentMethod = "stripe") => {
  try {
    // Check if invoice already exists for this booking
    const existingInvoice = await Invoice.findOne({ bookingId: booking._id });
    if (existingInvoice) {
      console.log(`Invoice already exists for booking ${booking._id}`);
      return existingInvoice;
    }

    // Create or get Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName || user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });
    }

    // Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      currency: "eur",
      metadata: {
        bookingId: booking._id.toString(),
        userId: user._id.toString(),
        roomName: room.name,
        paymentMethod: paymentMethod,
      },
    });

    // Add invoice items
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(booking.price * 100), // Convert to cents
      currency: "eur",
      description: `Booking for ${room.name} on ${(() => {
        try {
          // Handle different date formats
          let dateObj;
          if (booking.date && booking.date.includes('-')) {
            // Handle DD-MM-YYYY format
            const parts = booking.date.split('-');
            if (parts.length === 3) {
              const [day, month, year] = parts;
              dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else {
              // Handle MM-DD-YYYY format
              const [month, day, year] = parts;
              dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }
          } else {
            // Handle standard date format
            dateObj = new Date(booking.date);
          }
          
          if (isNaN(dateObj.getTime())) {
            console.error("Invalid date for invoice:", booking.date);
            return booking.date || "Unknown Date";
          }
          
          return dateObj.toLocaleDateString();
        } catch (error) {
          console.error("Error formatting date for invoice:", booking.date, error);
          return booking.date || "Unknown Date";
        }
      })()}${paymentMethod === "paypal" ? " (PayPal Payment)" : ""}`,
    });

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // Mark the invoice as paid in Stripe if payment is successful
    if (booking.paymentStatus === "paid" && paymentId) {
      try {
        // Mark the invoice as paid
        await stripe.invoices.pay(finalizedInvoice.id, {
          paid_out_of_band: true
        });
        console.log(`Marked Stripe invoice ${finalizedInvoice.id} as paid`);
      } catch (payError) {
        console.error(`Failed to mark invoice as paid:`, payError.message);
        // Continue with the process even if marking as paid fails
      }
    }

    // Save to database
    const invoiceRecord = new Invoice({
      bookingId: booking._id,
      userId: user._id,
      stripeInvoiceId: finalizedInvoice.id,
      amount: booking.price,
      currency: "eur",
      paymentId: paymentId,
      paymentMethod: paymentMethod,
      status: booking.paymentStatus === "paid" ? "paid" : "created",
      invoiceUrl: finalizedInvoice.hosted_invoice_url,
    });

    await invoiceRecord.save();
    console.log(`Invoice created successfully for booking ${booking._id} (${paymentMethod}) with status: ${invoiceRecord.status}`);
    
    return invoiceRecord;
  } catch (error) {
    console.error(`Failed to create invoice for booking ${booking._id}:`, error);
    return null;
  }
};

/**
 * Update invoice payment status when payment is completed
 * @param {string} bookingId - The booking ID
 * @param {string} paymentId - The payment ID
 * @returns {Promise<Object>} - The updated invoice or null if failed
 */
export const updateInvoicePaymentStatus = async (bookingId, paymentId) => {
  try {
    const invoice = await Invoice.findOne({ bookingId });
    if (invoice) {
      // Update database status
      invoice.status = "paid";
      invoice.paymentId = paymentId;
      await invoice.save();

      // Update Stripe invoice status
      try {
        await stripe.invoices.pay(invoice.stripeInvoiceId, {
          paid_out_of_band: true
        });
        console.log(`Updated Stripe invoice ${invoice.stripeInvoiceId} as paid`);
      } catch (stripeError) {
        console.error(`Failed to update Stripe invoice:`, stripeError.message);
      }

      console.log(`Updated invoice status to paid for booking ${bookingId}`);
      return invoice;
    }
    return null;
  } catch (error) {
    console.error(`Failed to update invoice status for booking ${bookingId}:`, error);
    return null;
  }
};

/**
 * Create invoices for multiple bookings (for recurring bookings)
 * @param {Array} bookings - Array of booking objects
 * @param {Object} user - The user object
 * @param {Object} room - The room object
 * @param {string} paymentId - The payment ID
 * @param {string} paymentMethod - The payment method
 * @returns {Promise<Array>} - Array of created invoices
 */
export const createInvoicesForMultipleBookings = async (bookings, user, room, paymentId, paymentMethod = "stripe") => {
  const createdInvoices = [];
  
  for (const booking of bookings) {
    try {
      const invoice = await createInvoiceForPayment(booking, user, room, paymentId, paymentMethod);
      if (invoice) {
        createdInvoices.push(invoice);
      }
    } catch (error) {
      console.error(`Failed to create invoice for booking ${booking._id}:`, error);
    }
  }
  
  return createdInvoices;
}; 