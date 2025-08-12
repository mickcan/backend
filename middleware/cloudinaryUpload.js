import cloudinary from '../config/cloudinary.js';

export const handleCloudinaryUpload = async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return next();
        }

        const uploadPromises = req.files.map(async (file) => {
            // Convert the buffer to base64
            const b64 = Buffer.from(file.buffer).toString('base64');
            const dataURI = `data:${file.mimetype};base64,${b64}`;
            
            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(dataURI, {
                resource_type: 'auto',
                folder: 'rooms', // This will create a folder in Cloudinary
            });

            return result.secure_url;
        });

        // Wait for all uploads to complete
        const uploadedUrls = await Promise.all(uploadPromises);
        
        // Add the Cloudinary URLs to the request object
        req.cloudinaryUrls = uploadedUrls;
        
        next();
    } catch (error) {
        console.error('Cloudinary Upload Error:', error);
        res.status(500).json({ message: 'Error uploading images', error: error.message });
    }
}; 