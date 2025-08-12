import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Ensure we have a valid MongoDB URI
    const mongoURI =
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/spaces";

    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Database connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
