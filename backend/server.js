import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { connectDB } from "./config/database.js";
import { configureCloudinary } from "./config/cloudinary.js";
import { validateEnv, isProduction } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { rateLimiter, webhookRateLimiter } from "./middleware/rateLimiter.js";
import { sanitizeRequest } from "./middleware/sanitize.js";
import logger from "./utils/logger.js";
import { handleRazorpayWebhook } from "./controllers/paymentController.js";
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import earningsRoutes from "./routes/earningsRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import scrapperRoutes from "./routes/scrapperRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import referralUserRoutes from "./routes/referralUserRoutes.js";
import translationRoutes from "./routes/translateRoutes.js";
import fcmTokenRoutes from "./routes/fcmTokenRoutes.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import { initializeSocket } from "./services/socketService.js";

// Validate environment variables (fatal when insecure in production)
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const buildApp = () => {
  const app = express();

  // Behind a reverse proxy / PaaS the client IP comes from X-Forwarded-For.
  // Required for correct per-IP rate limiting. Configurable for direct exposure.
  app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
  app.disable("x-powered-by");

  // Security headers. This is an API: a restrictive CSP is appropriate.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
          "media-src": ["'self'", "https://res.cloudinary.com"],
          "connect-src": ["'self'", "https://res.cloudinary.com"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS Configuration
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((url) => url.trim().replace(/\/$/, ""))
    : ["http://localhost:5173", "https://www.scrapto.com", "https://scrapto.com"];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );

  // Razorpay webhook (raw body required for signature validation).
  // Mounted BEFORE the JSON body parser so req.rawBody is the exact bytes.
  const webhookHandler = [
    webhookRateLimiter,
    express.raw({ type: "application/json", limit: "1mb" }),
    (req, res, next) => {
      req.rawBody = req.body;
      try {
        req.body = JSON.parse(req.rawBody.toString());
      } catch {
        return res.status(400).json({ success: false, message: "Invalid webhook payload" });
      }
      next();
    },
    handleRazorpayWebhook,
  ];
  app.post("/api/v1/payments/webhook", ...webhookHandler);
  app.post("/api/payments/webhook", ...webhookHandler); // legacy path, same verified raw-body pipeline

  // Body parsing. JSON APIs never need 50mb bodies — uploads go through multer.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // NoSQL-operator / prototype-pollution sanitisation
  app.use(sanitizeRequest);

  // Compression middleware
  app.use(compression());

  // HTTP access logging (skip health checks)
  if (process.env.NODE_ENV !== "test") {
    app.use(
      morgan(isProduction() ? "combined" : "dev", {
        skip: (req) => req.path === "/health",
      })
    );
  }

  // Rate limiting (global, no role bypass)
  app.use(rateLimiter);

  // NOTE: public static serving of ./uploads removed — KYC documents and other
  // sensitive files must never be exposed via an unauthenticated static mount.

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  // Route to serve app-ads.txt for app store verification
  app.get("/app-ads.txt", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/public/app-ads.txt"), (err) => {
      if (err) res.status(404).send("app-ads.txt not found");
    });
  });

  // API root
  app.get("/", (req, res) => {
    res.json({
      message: "Scrapto API Server",
      version: "1.0.0",
      endpoints: { health: "/health", api: "/api/v1" },
    });
  });

  // Version 1 API routes
  const v1Router = express.Router();
  v1Router.use("/auth", authRoutes);
  v1Router.use("/orders", orderRoutes);
  v1Router.use("/payments", paymentRoutes);
  v1Router.use("/uploads", uploadRoutes);
  v1Router.use("/kyc", kycRoutes);
  v1Router.use("/subscriptions", subscriptionRoutes);
  v1Router.use("/admin", adminRoutes);
  v1Router.use("/scrapper/earnings", earningsRoutes);
  v1Router.use("/chats", chatRoutes);
  v1Router.use("/reviews", reviewRoutes);
  v1Router.use("/scrappers", scrapperRoutes);
  v1Router.use("/banners", bannerRoutes);
  v1Router.use("/public", publicRoutes);
  v1Router.use("/support", supportRoutes);
  v1Router.use("/admin/referral-system", referralRoutes);
  v1Router.use("/wallet", walletRoutes);
v1Router.use("/addresses", addressRoutes);
v1Router.use("/notifications", notificationRoutes);
v1Router.use("/referrals", referralUserRoutes);
  v1Router.use("/translate", translationRoutes);
  v1Router.use("/fcm-tokens", fcmTokenRoutes);
  v1Router.use("/marketplace", marketplaceRoutes);

  // Mount versioned routes
  app.use("/api/v1", v1Router);

  // Legacy unversioned mount (same routers, same protections)
  app.use("/api", v1Router);

  // Error handling middleware (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

const app = buildApp();
const PORT = process.env.PORT || 7000;

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB();
    logger.info("Database connected successfully");

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        configureCloudinary();
        logger.info("Cloudinary configured successfully");
      } catch (cloudinaryError) {
        logger.warn("Cloudinary configuration failed:", cloudinaryError.message);
      }
    } else {
      logger.warn("Cloudinary credentials not provided; uploads will fail until configured");
    }

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
    });

    initializeSocket(server);
    logger.info("Socket.io initialized");
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
