import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js';


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
    ) {
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
        username: username.toLowerCase()
    })

    const createUser = await User.findById((user._id)).select(
        "-password -refreshToken"
    )

    if(!createUser){
        throw new ApiError(500,"Something went worng while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createUser, "User registered successfully")
    )

} )

export {registerUser}