import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import {
    uploadOnCloudinary,
    deleteOnCloudinary
} from '../utils/cloudinary.js';
import mongoose, { isValidObjectId } from "mongoose";

const getAllVideo = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const pipeline = [];

    // Search Query
    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"], // Fixed missing quotes around "description"
                },
            },
        });
    }

    // Filter by User ID
    if (userId) {
        if (!mongoose.isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }
        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId),
            },
        });
    }

    // Filter Published Videos
    pipeline.push({
        $match: { isPublished: true },
    });

    // Sorting
    if (sortBy && sortType) {
        pipeline.push({
            $sort: { [sortBy]: sortType === "asc" ? 1 : -1 },
        });
    } else {
        pipeline.push({
            $sort: { createdAt: -1 },
        });
    }

    // Lookup Owner Details
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$ownerDetails",
                preserveNullAndEmptyArrays: true, // Allow cases where owner details might be missing
            },
        }
    );

    // Pagination Setup
    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    // Execute Aggregation with Pagination
    const videos = await Video.aggregatePaginate(Video.aggregate(pipeline), options);

    return res.status(200).json(
        new ApiResponse(200, videos, "Videos fetched successfully")
    );
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!mongoose.isValidObjectId(req.user?._id)) {
        throw new ApiError(400, "Invalid userId");
    }

    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId),
            }
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscribers"
                        }
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscribers"
                            },
                            isSubscribed: {
                                $cond: {
                                    if: {
                                        $gt: [
                                            {
                                                $size: {
                                                    $filter: {
                                                        input: "$subscribers",
                                                        as: "sub",
                                                        cond: { $eq: ["$$sub.subscriber", req.user?._id] }
                                                    }
                                                }
                                            },
                                            0
                                        ]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1,
                            subscribersCount: 1,
                            isSubscribed: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                likeCount: {
                    $size: "$likes",
                },
                owner: {
                    $first: "$owner",
                },
                isLiked: {
                    $cond: {
                        if: {
                            $in: [
                                req.user?._id,
                                "$likes.likedBy",
                            ]
                        },
                        then: true,
                        else: false,
                    }
                }
            }
        },
        {
            $project: {
                "videoFile.url": 1,
                title: 1,
                description: 1,
                views: 1,
                createdAt: 1,
                duration: 1,
                comments: 1,
                owner: 1,
                likeCount: 1,
                isLiked: 1
            }
        }
    ]);

    if (!video.length) {
        throw new ApiError(404, "Video not found");
    }

    // Update view count
    await Video.findByIdAndUpdate(
        videoId,
        { $inc: { views: 1 } }
    );

    // Add to user watch history
    await User.findByIdAndUpdate(
        req.user?._id,
        { $addToSet: { watchHistory: videoId } }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            video[0],
            "Video details fetched successfully"
        )
    );
});

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
            public_id: uploadedVideo.public_id,
        },
        thumbnail: {
            url: uploadedThumbnail.url,
            public_id: uploadedThumbnail.public_id,
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
            "Video uploaded successfully",
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
                duration,
            }
        },
        { new: true },
    );

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            updatedVideo, 
            "Video updated successfully",
        )
    );
});

const deleteVideo = asyncHandler(async (req, res) => {
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
            console.error("Failed to delete video:", error);
        }
    }

    // Delete old thumbnail from Cloudinary
    if (video.thumbnail?.public_id) {
        try {
            await deleteOnCloudinary(video.thumbnail.public_id);
        } catch (error) {
            console.error("Failed to delete thumbnail:", error);
        }
    }

    const isRemoved = await Video.findByIdAndDelete(videoId);

    if (!isRemoved) {
        throw new ApiError(500, "Error deleting video from database");
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            isRemoved, 
            "Video deleted successfully",
        )
    );
});

const togglePublicStatus = asyncHandler(async (req, res) => {
    const videoId = req.params.id;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required");
    }

    // Fetch the video first
    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Check if the user is the owner
    if (video.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not authorized to toggle publish status");
    }

    // Toggle the publish status
    video.isPublished = !video.isPublished;
    await video.save();

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            video, 
            "Video publish status toggled successfully",
        )
    );
});

export {
    publishAVideo,
    updateVideo,
    deleteVideo,
    togglePublicStatus,
    getAllVideo,
    getVideoById
}