import {v2 as cloudinary} from 'cloudinary';
import fs from "fs";
import { ApiError } from './ApiError.js';

//cloudinary configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async(localFilePath) => {
    try {
        if(!localFilePath) return null
        // upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // file has been uploaded successfull
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return response;
    } catch(error) {
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
         //remove the locally saved temporary file as the upload operation is failed
        return null;
    }
}

const deleteOnCloudinary = async (publicId) => {
    try {
        if (!publicId) {
            throw new ApiError(400, 'Image is required to delete an image');
        }

        const response = await cloudinary.uploader.destroy(publicId);

        if (response.result === 'ok' || response.result === 'not found') {
            return true;
        } else {
            throw new ApiError(500, `Failed to delete the image: ${response.result}`);
        }
    } catch (error) {
        throw new ApiError(500, error.message || 'Failed to delete image');
    }
};

export { uploadOnCloudinary, deleteOnCloudinary }