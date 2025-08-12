// services/cloudService.js
// Centralized cloud storage service abstraction

import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadImage = async (filePath, folder = "uploads") => {
  return cloudinary.uploader.upload(filePath, { folder });
};

const deleteImage = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

export default {
  uploadImage,
  deleteImage,
  // In the future, add other providers here and switch based on config
};
