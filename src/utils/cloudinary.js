import {v2 as cloudinary} from cloudinary;
import fs from "fs"
import { response } from "express";

//cloudinary configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCLoudinary = async(localFilePath) => {
    try {
        if(!localFilePath) return null
        // upload the file on cloudinary
        const rasponce = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // file has been uploaded successfull
        console.log("Fill is uploaded on cloudinary", response.url);
        return response
    } catch(error) {
        fs.unlinkSync(localFilePath) //remove the locally saved temporary file as the upload operation is failed
        return null;
    }
}

export {uploadOnCLoudinary}