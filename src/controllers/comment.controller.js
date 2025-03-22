import mongoose, { Schema }  from "mongoose";
import { Comment } from "../models/comment.model.js"
import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getVideoComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const videoExists = await Video.exists({ _id: videoId });

    if (!videoExists) {
        throw new ApiError(404, "Video not found");
    }

    const videoObjectId = new mongoose.Types.ObjectId(videoId);
    const userId = req.user?._id ? new mongoose.Types.ObjectId(req.user?._id) : null;

    const commentsAggregate = Comment.aggregate([
        {
            $match: {
                video: videoObjectId,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "comment",
                as: "likes",
            },
        },
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                owner: { $first: "$owner" },
                isLiked: userId
                    ? {
                          $in: [userId, "$likes.likedBy"],
                      }
                    : false,
            },
        },
        {
            $sort: { createdAt: -1 },
        },
        {
            $project: {
                content: 1,
                createdAt: 1,
                likesCount: 1,
                isLiked: 1,
                owner: {
                    username: 1,
                    fullName: 1,
                    "avatar.url": 1,
                },
            },
        },
    ]);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const comments = await Comment.aggregatePaginate(commentsAggregate, options);

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            comments, 
            "Comments fetched successfully"
        )
    );
});

const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { content } = req.body;

    if (!content) {
        throw new ApiError(400, "Content is required");
    }

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    try {
        const video = await Video.findById(videoId).lean();

        if (!video) {
            throw new ApiError(404, "Video not found");
        }

        const comment = await Comment.create({
            content,
            video: videoId,
            owner: req.user?._id,
        });

        if (!comment) {
            throw new ApiError(500, "Failed to add comment, please try again");
        }

        return res
        .status(201)
        .json(
            new ApiResponse(
                201, 
                comment, 
                "Comment added successfully",
            )
        );
    } catch (error) {
        throw new ApiError(500, "Internal Server Error");
    }
});

const updateComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
        throw new ApiError(400, "Content is required");
    }

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid commentId");
    }

    const comment = await Comment.findById(commentId).lean();

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "Only the comment owner can edit their comment");
    }

    const updatedComment = await Comment.findByIdAndUpdate(
        commentId,
        { $set: { content } },
        { new: true, runValidators: true }
    );

    if (!updatedComment) {
        throw new ApiError(500, "Failed to update comment, please try again");
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            updatedComment, 
            "Comment updated successfully",
        )
    );
});

const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid commentId");
    }

    const comment = await Comment.findById(commentId).lean();

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "Only the comment owner can delete this comment");
    }

    await Comment.findByIdAndDelete(commentId);

    // Delete all likes associated with the comment
    await Like.deleteMany({ comment: commentId });

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            { 
                commentId 
            }, 
            "Comment deleted successfully",
        )
    );
});

export {
    getVideoComment,
    addComment,
    updateComment,
    deleteComment
}
