import express from "express";
import {
  createSingleInvoice,
  sendInvoice,
  createBulkInvoices,
  sendBulkInvoices,
  getInvoices,
  getInvoice,
  deleteInvoice,
  getInvoiceStats,
  getUserBillingData,
  sendInvoiceForBooking,
  getInvoiceForBooking,
  testEmail,
  autoCreateInvoice,
} from "../controllers/invoiceController.js";
// import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Auto-create invoice for successful payment
router.post("/auto-create", autoCreateInvoice);

// Create single invoice
router.post("/create",  createSingleInvoice);

// Send single invoice
router.post("/send/:invoiceId",  sendInvoice);

// Create bulk invoices
router.post("/bulk/create",  createBulkInvoices);

// Send bulk invoices
router.post("/bulk/send",  sendBulkInvoices);

// Get all invoices with filters
router.get("/",  getInvoices);

// Get invoice statistics
router.get("/stats/summary", getInvoiceStats);

// Get user billing data with booking summaries
router.get("/billing/users", getUserBillingData);

// Get invoice for specific booking
router.get("/booking/:bookingId", getInvoiceForBooking);

// Test email functionality
router.post("/test-email", testEmail);

// Send invoice for specific booking
router.post("/send-booking/:userId/:bookingId", sendInvoiceForBooking);

// Get single invoice
router.get("/:invoiceId",  getInvoice);

// Delete invoice
router.delete("/:invoiceId", deleteInvoice);

export default router;
