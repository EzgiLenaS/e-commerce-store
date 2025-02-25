import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";

const generateToken = (userId) => {
    // in this function we would like to create two diff tokens with "jwt"
    const accessToken = jwt.sign({userId}, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "15m",
    })

    const refreshToken = jwt.sign({userId}, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
    })
    
    return {accessToken, refreshToken};
};

const storeRefreshToken = async(userId, refreshToken) => {
    await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7 * 24 * 60 * 60); // 7 days
}

const setCookies = (res, accessToken, refreshToken) => {
    res.cookie("accessToken", accessToken, {
        httpOnly: true, // prevent XSS attacks, cross-dite scripting attacks
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", // prevent CSRF attacks, cross-site request forgery attacks
        maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true, // prevent XSS attacks, cross-dite scripting attacks
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", // prevent CSRF attacks, cross-site request forgery attacks
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
}

export const signup = async (req,res) => {
    // Desktop app => postman
    const{email, password, name} = req.body;
    try {
        const userExist = await User.findOne({email});

        if(userExist) {
            return res.status(400).json({message: "User already exists"});
        }
        const user = await User.create({name, email, password});

        // authentication
        // we used underscored id "_id" because this is how MongoDB saves it
        const {accessToken, refreshToken} = generateToken(user._id);
        await storeRefreshToken(user._id, refreshToken);

        setCookies(res, accessToken, refreshToken);


        res.status(201).json({
            _id: user._id, 
            name: user.name, 
            email: user.email,
            role: user.role,
        });
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({message: error.message});
    }
}

export const login = async (req,res) => {
    try {
        // console.log("here runs the login");
        const {email, password} = req.body;
        const user = await User.findOne({email});
        // console.log("here runs the login2");

        if (user && (await user.comparePassword(password))) {
           const {accessToken, refreshToken} = generateToken(user._id);
           // console.log("user is logged in");
           await storeRefreshToken(user._id, refreshToken);
           setCookies(res, accessToken, refreshToken);

           res.json({
                _id: user._id, 
                name: user.name, 
                email: user.email,
                role: user.role,
           })
        }
        else{
            res.status(400).json({message: "Invalid email or password"});
        }
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({message: error.message});
    }
}

export const logout = async (req,res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken){
            const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            await redis.del(`refresh_token:${decoded.userId}`);
        }

        res.clearCookie("accessToken");
        res.clearCookie("refreshToken");
        res.json({message: "Logged out successfully"});
    } catch (error) {
        console.log("Error in login controller", error.message);
        res.status(500).json({message: "Server Error", error: error.message});
    }
}

// this will refresh the access token
export const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({message: "No refresh token provided"});
        }

        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

        if (storedToken !== refreshToken) {
            return res.status(401).json({message: "Invalid refresh token"});
        }

        const accessToken = jwt.sign({userId: decoded.userId}, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: "15m"
        });

        res.cookie("accessToken", accessToken, {
            httpOnly: true, // prevent XSS attacks, cross-site scripting attacks
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict", // prevent CSRF attacks, cross-site request forgery attacks
            maxAge: 15 * 60 * 1000, // 15 minutes
        });

        res.json({accessToken, message: "Token refreshed successfully"});
    } catch (error) {
        res.status(500).json({message: "Server Error", error: error.message});
    }
};

export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};