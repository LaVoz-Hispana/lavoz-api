import express from "express";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import commentRoutes from "./routes/comments.js";
import authRoutes from "./routes/auth.js";
import likeRoutes from "./routes/likes.js";
import relationshipRoutes from "./routes/relationships.js";
import ratingRoutes from "./routes/ratings.js";
import notifRoutes from "./routes/notifications.js";
import messageRoutes from "./routes/messages.js";
import storyRoutes from "./routes/stories.js";
import embedRoutes from "./routes/embeds.js";
import adRoutes from "./routes/ads.js";
import projectRoutes from "./routes/projects.js";
import serviceRoutes from "./routes/services.js";
import escrowRoutes from "./routes/escrows.js";
import milestoneRoutes from "./routes/milestones.js";
import artifactRoutes from "./routes/artifacts.js";
import cors from "cors";
import multer from "multer";
import cookieParser from "cookie-parser";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"
import dotenv from 'dotenv';
import crypto from 'crypto';
import cron from 'node-cron';
import { db } from "./connect.js";
import path from "path";
import fs from "fs";
// import { convertToJpg, isImage } from "./img_process.js";
// import sharp from "sharp";
// import imagemin from "imagemin";
// import mozjpeg from "imagemin-mozjpeg";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

//middlewares
app.use((req,res,next)=>{
    res.header("Access-Control-Allow-Credentials", true);
    next();
});
app.use(express.json())

// Enable CORS for the specified origin
app.use(cors({
  origin: (origin, callback) => {
    if (isProduction) {
      const allowedProd = ["https://www.postsstation.com", "https://lavoz-client.vercel.app"];
      if (!origin || allowedProd.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS (prod)"));
      }
    } else {
      const allowedDev = [
        "http://localhost:3000",  // machine browser
        process.env.NETWORK_ADDR, // network browsing (use computer ip address | mac: ifconfig -> en0: ... inet xx.xxx.x.xxx)
      ];
      if (!origin || allowedDev.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS (dev)"));
      }
    }
  },
  methods: ["GET", "POST", "DELETE", "PUT"],
  credentials: true,
}));
app.use(cookieParser());

// OPTION 2: MULTER MEMORY STORAGE + S3 BUCKET: WORKS
dotenv.config();
const randomImageName = (filename, bytes = 32) => {
    const randomName = crypto.randomBytes(bytes).toString('hex');
    const ext = path.extname(filename).toLowerCase();
    return ext ? `${randomName}${ext}` : randomName;
};

const s3 = new S3Client({
    // accessKeyId: process.env.ACCESS_KEY,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
    region: process.env.BUCKET_REGION
});
const storage = multer.memoryStorage();
const MB = 1024 * 1024;
const uploadPost     = multer({ storage, limits: { fileSize: 10  * MB } });
const uploadArtifact = multer({ storage, limits: { fileSize: 100 * MB } });
const upload = uploadArtifact; // legacy alias used by /api/upload (artifacts)
const bucketName = 'lavozbucket';

const handleMulterError = (err, req, res, next) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `File too large. Max size is ${err.limit / MB} MB.` });
    }
    next(err);
};

// DB  CLEANUP FEATURE: DELETE POSTS > 4WKS OLD
cron.schedule('0 0 0 * * *', () => {
    const today = new Date();
    const deleteDate = new Date(today.setDate(today.getDate() - 28));
    const formattedDate = deleteDate.toISOString().split('T')[0];

    const q = "DELETE FROM posts WHERE DATE(`createdAt`) < ?";
    db.query(q, formattedDate, (err, data) => {
        if (err) console.log("Error running scheduled post cleanup.");
        else console.log("Scheduled post cleanup successful.");
    });
});

// DB  CLEANUP FEATURE: DELETE SHORTS > 4WKS OLD
cron.schedule('0 0 0 * * *', () => {
    const today = new Date();
    const deleteDate = new Date(today.setDate(today.getDate() - 28));
    const formattedDate = deleteDate.toISOString().split('T')[0];

    const q = "DELETE FROM shorts WHERE DATE(`createdAt`) < ?";
    db.query(q, formattedDate, (err, data) => {
        if (err) console.log("Error running scheduled post cleanup.");
        else console.log("Scheduled post cleanup successful.");
    });
});

// DB CLEANUP FEATURE: DELETE OLD/SEEN NOTIFICATIONS
cron.schedule('0 0 0 * * *', () => {
    const today = new Date();
    const deleteDate = new Date(today.setDate(today.getDate() - 28));
    const formattedDate = deleteDate.toISOString().split('T')[0];

    const q = "DELETE FROM notifications WHERE DATE(`createdAt`) < ? OR `new` = false";
    db.query(q, formattedDate, (err, data) => {
        if (err) console.log("Error running scheduled notification cleanup.");
        else console.log("Scheduled notification cleanup successful.");
    });
});

// FOR POSTS (DELETE EVERY 4 WEEKS)
app.post("/api/uploadPost", uploadPost.single("file"), handleMulterError, async (req, res) => {
    try {
        const file = req.file;
        const imageName = randomImageName(req.file.originalname);

        let fileBuffer = file.buffer;

        // FOR IMAGE COMPRESSION
        // if (isImage(imageName)) {
        //     const miniBuffer = await imagemin.buffer(file.buffer, {
        //         plugins: [convertToJpg, mozjpeg({ quality: 85 })]
        //     });
        //     fileBuffer = await sharp(miniBuffer)
        //         .resize({ height: 600, width: 600, fit: "inside" })
        //         .toBuffer()
        // }

        const params = {
            Bucket: bucketName,
            Key: imageName,
            Body: fileBuffer,
            ContentType: req.file.mimetype,
            Tagging: "post=true"
        };

        const command = new PutObjectCommand(params);

        await s3.send(command);

        const imageUrl = `https://${bucketName}.s3.amazonaws.com/${imageName}`;

        res.status(200).json(imageUrl);
    } catch (error) {
        console.error("Error uploading post to S3:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// FOR STORIES (delete every 48hr)
app.post("/api/uploadStory", uploadPost.single("file"), handleMulterError, async (req, res) => {
    try {
        const file = req.file;
        const imageName = randomImageName(req.file.originalname);

        let fileBuffer = file.buffer;

        const params = {
            Bucket: bucketName,
            Key: imageName,
            Body: fileBuffer,
            ContentType: req.file.mimetype,
            Tagging: "story=true"
        };

        const command = new PutObjectCommand(params);

        await s3.send(command);

        const imageUrl = `https://${bucketName}.s3.amazonaws.com/${imageName}`;

        res.status(200).json(imageUrl);
    } catch (error) {
        console.error("Error uploading story to S3:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// FOR NON-POSTS (artifacts — 100 MB limit)
app.post("/api/upload", uploadArtifact.single("file"), handleMulterError, async (req, res) => {
    try {
        const file = req.file;
        const imageName = randomImageName(req.file.originalname);

        let fileBuffer = file.buffer;

        // // FOR IMAGE COMPRESSION
        // if (isImage(imageName)) {
        //     const miniBuffer = await imagemin.buffer(file.buffer, {
        //         plugins: [convertToJpg, mozjpeg({ quality: 85 })]
        //     });
        //     fileBuffer = await sharp(miniBuffer)
        //         .resize({ height: 600, width: 600, fit: "inside" })
        //         .toBuffer()
        // }

        const params = {
            Bucket: bucketName,
            Key: imageName,
            Body: fileBuffer,
            ContentType: req.file.mimetype,
            Tagging: 'post=false'
        };

        const command = new PutObjectCommand(params);

        try {
            await s3.send(command);
        }
        catch {
            console.log("error with s3");
        }

        const imageUrl = `https://${bucketName}.s3.amazonaws.com/${imageName}`;

        res.status(200).json(imageUrl);
    } catch (error) {
        console.error("Error uploading non-post to S3:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete("/api/delete/:img", async (req, res) => {
    const imgURL = req.params.img;
    const objectKey = new URL(imgURL).pathname.substring(1);
    try {
        if (objectKey != null && objectKey != "") {
            const params = {
              Bucket: 'lavozbucket',
              Key: objectKey
            };
            const command = new DeleteObjectCommand(params);
            await s3.send(command);
            res.status(200);
        }
    } catch {
        console.error("error deleting from s3:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/posts", postRoutes)
app.use("/api/comments", commentRoutes)
app.use("/api/likes", likeRoutes)
app.use("/api/relationships", relationshipRoutes)
app.use("/api/ratings", ratingRoutes)
app.use("/api/notifications", notifRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/stories", storyRoutes)
app.use("/api/embeds", embedRoutes)
app.use("/api/ads", adRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/services", serviceRoutes)
app.use("/api/escrows", escrowRoutes)
app.use("/api/escrows/:id/milestones", milestoneRoutes)
app.use("/api/artifacts", artifactRoutes)

const PORT = process.env.PORT || 8800;
if (isProduction) {
    app.listen(PORT, () => {
        console.log(`API running on port ${PORT} (PROD)`);
});
} else {
    const HOST = '0.0.0.0';
    app.listen(PORT, HOST, () => {
        console.log(`API running at http://${HOST}:${PORT} (DEV)`);
    });
}
