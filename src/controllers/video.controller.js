import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js"
import {
    uploadOnCloudinary,
    deleteOnCloudinary
} from '../utils/cloudinary.js'

const publishAVideo = asyncHandler(async (req, res) => {
    const videoFileLocalPath = req.files?.video?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required");
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required");
    }

    const { title, description } = req.body;

    if (!title || !description) {
        throw new ApiError(400, "Title and Description are required");
    }

    const uploadedVideo = await uploadOnCloudinary(videoFileLocalPath, { resource_type: "video" });
    const uploadedThumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    const duration = uploadedVideo?.duration || 0;

    if (!uploadedVideo?.url) {
        throw new ApiError(400, "Error while uploading video");
    }
    if (!uploadedThumbnail?.url) {
        throw new ApiError(400, "Error while uploading thumbnail");
    }

    const video = await Video.create({
        videoFile: {
            url: uploadedVideo.url,
            public_id: uploadedVideo.public_id
        },
        thumbnail: {
            url: uploadedThumbnail.url,
            public_id: uploadedThumbnail.public_id
        },
        title,
        description,
        duration,
        isPublished: false,
        owner: req.user._id, 
    });

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            video, 
            "Video uploaded successfully"
        )
    );
});

const updateVideo = asyncHandler(async (req, res) => {
    const videoFileLocalPath = req.files?.video?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;
    const { title, description } = req.body;

    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required");
    }

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail file is required");
    }

    if (!title || !description) {
        throw new ApiError(400, "Title and description are required");
    }

    const uploadedVideo = await uploadOnCloudinary(videoFileLocalPath, { resource_type: "video" });
    const uploadedThumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    const duration = uploadedVideo?.duration || 0;

    if (!uploadedVideo?.url) {
        throw new ApiError(400, "Error while uploading video");
    }

    if (!uploadedThumbnail?.url) {
        throw new ApiError(400, "Error while uploading thumbnail");
    }

    const videoId = req.params.id;
    if (!videoId) {
        throw new ApiError(400, "Video ID is required");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Delete old video from Cloudinary
    if (video.videoFile?.public_id) {
        try {
            await deleteOnCloudinary(video.videoFile.public_id);
        } catch (error) {
            throw new ApiError(500, "Error in deleting old video");
        }
    }

    // Delete old thumbnail from Cloudinary
    if (video.thumbnail?.public_id) {
        try {
            await deleteOnCloudinary(video.thumbnail.public_id);
        } catch (error) {
            throw new ApiError(500, "Error in deleting old thumbnail");
        }
    }

    // Update video with new URL, title, description, and duration
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                videoFile: {
                    url: uploadedVideo.url,
                    public_id: uploadedVideo.public_id,
                },
                thumbnail: {
                    url: uploadedThumbnail.url,
                    public_id: uploadedThumbnail.public_id,
                },
                title,
                description,
                duration
            }
        },
        { new: true }
    );

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            updatedVideo, 
            "Video updated successfully"
        )
    );
});



export {
    publishAVideo,
    updateVideo
}