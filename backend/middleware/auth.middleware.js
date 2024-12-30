import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
    try {
        const accessToken = req.cookies.accessToken;

        if (!accessToken) {
            return res.status(401).json({message: "Unauthorized - No access token provided"});
        }

        try {
            const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
            const user = await User.findById(decoded.userId).select("-password");

            if (!user) {
                return res.status(401).json({message: "Unauthorized - User not found"});
            }

            req.user = user;
            // this next() will go to the next middleware
            // which is adminRoute in the product.route.js
            next();
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                return res.status(401).json({message: "Unauthorized - Access token expired"});
            }
            throw error;
        }
    } catch (error) {
        console.log("Error in auth middleware", error.message);
        return res.status(401).json({message: "Unauthorized - Invalid access token"});
    }
}

export const adminRoute = async (req, res, next) => {
    if (req.user && req.user.role === "admin") {
        next();
    }
    else {
        return res.status(403).json({message: "Access denied - Admin only"});
    }
}