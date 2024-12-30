import cloudinary from "../lib/cloudinary.js";
import { redis } from "../lib/redis.js";
import Product from "../models/product.model.js";

export const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find({}); // {} means find all products
        res.json({products});
    } catch (error) {
        console.log("Error in product controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
};

export const getFeaturedProducts = async (req, res) => {
    try {
        let featuredProducts = await redis.get("featuredProducts");
        if (featuredProducts) {
            return res.json(JSON.parse(featuredProducts));
        }

        // if not in redis cache, get from mingodb
        // .lean() is gonna return a plain js object instead of a mongodb doc
        // which is good for performance
        featuredProducts = await Product.find({isFeatured: true}).lean();
        
        if( !featuredProducts ) {
            return res.status(404).json({message: "No featured products found"});
        }

        // store in redis for future quick access
        await redis.set("featuredProducts", JSON.stringify(featuredProducts));

        res.json({featuredProducts});
    } catch (error) {
        console.log("Error in product controller/ getFeaturedProducts controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
}

export const createProduct = async (req, res) => {
    try {
        const {name, description, price, image, category} = req.body;
        let cloudinaryResponse = null;
        if (image) {
            cloudinaryResponse= await cloudinary.uploader.upload(image, {folder: "products"})
        }

        const product = await Product.create({
            name,
            description,
            price,
            image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
            category
        });

        res.status(201).json({product});
    } catch (error) {
        console.log("Error in product controller/ createProduct controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
}

export const deleteProduct = async (req, res) => {
    try {
        // we delete not only from database but also cloudinary
        const {id} = req.params;
        const product = await Product.findById(id); // this "id" name comes from product.route.js /:id

        if (!product) {
            return res.status(404).json({message: "Product not found"});
        }

        // here we delete the product from cloudinary
        if (product.image) {
            // this will get the id of the image
            const publicId = product.image.split("/").pop().split(".")[0];
            try {
                await cloudinary.uploader.destroy(`products/${publicId}`);
                console.log("Image deleted from cloudinary")
            } catch (error) {
                
            }
        }

        // here we delete the product from database
        await Product.findByIdAndDelete(id);
        res.json({message: "Product deleted"});
    } catch (error) {
        console.log("Error in product controller/ deleteProduct controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
}

export const getRecommendedProducts = async (req, res) => {
    try {
        const products = await Product.aggregate([
            {
                $sample: {size:3}
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    image: 1,
                    price: 1,
                }
            }
        ])

        res.json(products);
    } catch (error) {
        console.log("Error in product controller/ getRecommendedProducts controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
}

export const getProductsByCategory = async (req, res) => {
    const {category} = req.params;
    try {
        const products = await Product.find({category});
        res.json({products});
    } catch (error) {
        console.log("Error in product controller/ getProductsByCategory controller", error.message);
        res.status(500).json({message: "Server error", error: error.message});
    }
}

export const toggleFeaturedProduct = async (req, res) => {
	try {
		const product = await Product.findById(req.params.id);
		if (product) {
			product.isFeatured = !product.isFeatured;
			const updatedProduct = await product.save();
            // this await updates the cache/ redis
			await updateFeaturedProductsCache();
			res.json(updatedProduct);
		} else {
			res.status(404).json({ message: "Product not found" });
		}
	} catch (error) {
		console.log("Error in toggleFeaturedProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

async function updateFeaturedProductsCache() {
	try {
		// The lean() method  is used to return plain JavaScript objects instead 
        // of full Mongoose documents. This can significantly improve performance

		const featuredProducts = await Product.find({ isFeatured: true }).lean();
		await redis.set("featured_products", JSON.stringify(featuredProducts));
	} catch (error) {
		console.log("error in update cache function");
	}
}
