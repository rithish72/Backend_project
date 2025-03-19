import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { 
    uploadOnCloudinary,
    deleteOnCloudinary
} from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from "jsonwebtoken";
import mongoose from 'mongoose';

const generateAccessAndRefreshToken = async (userId) => {
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    }
    catch(error){
        throw new ApiError(500, "Something went worng while generating refresh and access token")
    }
}

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend 
    // validation given details
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response 

    const {fullname, email, username, password } = req.body;
    //console.log("Email: ", email);

    if (
        [fullname, email, username, password].some((field) => field?.trim() === "")
    ) 
    {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUser) {
        throw new ApiError(409, "User with email or username is already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverLocalPath = req.files?.coverImage[0]?.path;

    let coverLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverLocalPath);
    
    if(!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        email,
        coverImage: coverImage?.url || "",
        password,
        username: (username ?? "").toLowerCase()
    })

    const createUser = await User.findById((user._id)).select(
        "-password -refreshToken"
    )

    if(!createUser){
        throw new ApiError(500,"Something went worng while registering the user")
    }

    return res
    .status(201)
    .json(
        new ApiResponse(
            200,
            createUser, 
            "User registered successfully"
        )
    )

} )

const loginUser = asyncHandler( async (req, res)=>{
    // req body --> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send token as cookies
    
    const {email, username, password} = req.body;
    if(!username && !email){
        throw new ApiError(400, "username or password is required");
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if(!existedUser){
        throw new ApiError(404, "User does not exits")
    }

    const isPasswordValid = await existedUser.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(existedUser._id)

    const loggedInUser = await User.findById(existedUser._id).select(" -password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken, options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )


} )

const logoutUser = asyncHandler(async (req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(
        200,
        {},
        "User logged Out"
    ))
}) 

const refrehAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorizeed request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if( incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refresh"
            )
        )
    
    
    } catch (error) {
        throw new ApiError(
            401,
            error?.message || "Invalid refresh token"
        )
    }
})

const changeCurrentPassword = asyncHandler (async(req, res) =>{
    const {oldPassword, newPassword} = req.body

    // if(newPassword !== conformPassword){
    //     throw new ApiError(400, "Password not matched")
    // }

    const user = await User.findById(req.user?._id)

    const isValidPassword = await user.isPasswordCorrect(oldPassword)

    if(!isValidPassword){
        throw new ApiError(400, "Invalid password")
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json( 
        new ApiResponse(
            200, 
            {}, 
            "Password Changed Successfully"
        )
    )
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(
        200, 
        req.user, 
        "current user fetched successfully"
    )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName, email} = req.body;

    if(!fullName || !email){
        throw new ApiError(
            400, 
            "All fields are required"
        )
    }

    const user = User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            user, 
            "Account details updated successfully"
    ))
})

const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    //upload the new avatar on Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    // Find the user to get the current avatar URL
    if (!req.user || !req.user._id) {
        throw new ApiError(401, "User not authenticated");
    }

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(401, "User not found");
    }
    
    // Delete the old avatar from Cloudinary if it exists
    if(user.avatar) {
        const avatarId = user.avatar.split('/').pop().split('.')[0];
        await deleteOnCloudinary(avatarId)
    }

    // Update the user's avatar with the new one
    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                avatar: avatar.url,
            },
        },
        { new: true }
    ).select("-password");

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            updatedUser, 
            "Update Avatar"
        )
    )

})

const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image is missing")
    }

    const cover = await uploadOnCloudinary(coverImageLocalPath)

    if(!cover.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    // Find the user to get the current avatar URL
    const user = await User.findById(req.user._id);
    if(!user){
        throw new ApiError(401,"User not found")
    }
        
    // Delete the old avatar from Cloudinary if it exists
    if(user.coverImage) {
        const coverId = user.coverImage.split('/').pop().split('.')[0];
        await deleteOnCloudinary(coverId)
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                cover: cover.url
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(
        new ApiResponse(
            200, 
            updatedUser, 
            "Update Cover Image"
        )
    )
    
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const { username } = req.params
    if(!username?.trim()){
        throw new ApiError(400, "username is missing")
    }

    const channel = await User.aggregate([{
        $match: {
            username: username?.toLowerCase()
        }
    },
    {
        $lookup: {
            from: "subcriptions",
            localField: "_id",
            foreignField:"channel",
            as: "subscribers"
        }
    },{
        $lookup:{
            from: "subcriptions",
            localField: "_id",
            foreignField: "subcriber",
            as: "subcribedTo"
        }
    },{
        $addFields: {
           subcribersCount: {
            $size: "subcribers"
           },
           channelSubscribedToCount: {
            $size: "subcribedTo"
           },
           isSubcribed:{
            $cond: {
                if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                then: true,
                else: false
            }
           }
        }
    },{
        $project: {
            fullname: 1,
            username: 1,
            subcribersCount: 1,
            channelSubscribedToCount: 1,
            isSubcribed: 1,
            avatar: 1,
            coverImage: 1,
            email: 1
        }
    }])

    if(!channel?.length){
        throw new ApiError(404, "Channel does not exist")
    }

    return res.
    status(200)
    .json(
        new ApiResponse(
            200,
            channel[0], 
            "User channel fetched successfully"
        )
    )
    
})

const getWatchHistory = asyncHandler( async(req,res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },{
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from: "users",
                            localField: "owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },{
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }

        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "watch history fetch successfully"
        )
    )
})

const removeUser = asyncHandler( async(req,res) => {
    const user = await User.findById( req.user._id )

    if(!user){
        throw ApiError (404, "User not found");
    }

    if(user.avatar){
        const avatarId = user.split('/').pop().split('.')[0];
        await deleteOnCloudinary(avatarId)
    }

    if(user.cover){
        const coverId = user.split('/').pop().split('.')[0];
        await deleteOnCloudinary(coverId)
    }

    const isRemoved = await User.findByIdAndDelete(req.user._id);

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            isRemoved,
            "User removed successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refrehAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
    removeUser
}
