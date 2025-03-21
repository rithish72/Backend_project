import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const likedAlready = await Like.findOne({
        video: videoId,
        likedBy: req.user?._id,
    }).lean();

    if (likedAlready) {
        await Like.findByIdAndDelete(likedAlready._id);

        return res.status(200).json(
            new ApiResponse(
                200,
                { isLiked: false },
                "Like removed successfully"
            )
        );
    }

    await Like.create({
        video: videoId,
        likedBy: req.user?._id,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            { isLiked: true },
            "Video liked successfully"
        )
    );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!mongoose.isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid commentId");
    }

    const likedAlready = await Like.findOne({
        comment: commentId,
        likedBy: req.user?._id,
    }).lean();

    if (likedAlready) {
        await Like.findByIdAndDelete(likedAlready._id);

        return res.status(200).json(
            new ApiResponse(
                200,
                { commentId, isLiked: false },
                "Like removed successfully"
            )
        );
    }

    await Like.create({
        comment: commentId,
        likedBy: req.user?._id,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            { commentId, isLiked: true },
            "Comment liked successfully"
        )
    );
});

const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!mongoose.isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    const likedAlready = await Like.findOne({
        tweet: tweetId,
        likedBy: req.user?._id,
    }).lean();

    if (likedAlready) {
        await Like.findByIdAndDelete(likedAlready._id);

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    tweetId,
                    isLiked: false,
                },
                "Like removed successfully"
            )
        );
    }

    await Like.create({
        tweet: tweetId,
        likedBy: req.user?._id,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                tweetId,
                isLiked: true,
            },
            "Tweet liked successfully"
        )
    );
});

const getLikedVideos = asyncHandler(async (req, res) => {
    const likedVideosAggregate = await Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(req.user?._id),
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "likedVideo",
                pipeline: [
                    {
                        $match: {
                            isPublished: true,
                        },
                    },
                    {
                        $lookup:{
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "ownerDetails",
                        }
                    }
                ]
            }
        }
    ])
})
