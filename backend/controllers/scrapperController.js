import Scrapper from '../models/Scrapper.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Bid from '../models/Bid.js';
import MarketplaceRequest from '../models/MarketplaceRequest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { ORDER_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { assertObjectId, asString } from '../utils/security.js';

export const getMyProfile = asyncHandler(async (req, res) => {
    let scrapper = await Scrapper.findById(req.user.id);

    // Auto-provision if missing
    if (!scrapper) {
        logger.info(`Scrapper profile missing for user ${req.user.id}, auto-provisioning...`);

        // Ensure we have phone/email from user
        // req.user might be partial depending on middleware, safe to fetch fresh
        const user = await User.findById(req.user.id);

        if (!user || user.role !== 'scrapper') {
            return sendError(res, 'Scrapper user not found', 404);
        }

        scrapper = await Scrapper.create({
            _id: user._id,
            phone: user.phone,
            name: user.name || 'Scrapper',
            email: user.email,
            vehicleInfo: { type: 'bike', number: 'NA', capacity: 0 }
        });

        logger.info(`Auto-provisioned scrapper profile: ${scrapper._id}`);
    }

    sendSuccess(res, 'Scrapper profile fetched successfully', { scrapper });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
    const { name, vehicleInfo, availability, isOnline, city, liveLocation } = req.body;
    const userId = req.user.id || req.user._id;

    // 1. Update Scrapper Document
    let scrapper = await Scrapper.findById(userId);

    // Auto-provision if missing (Edge case protection)
    if (!scrapper) {
        const user = await User.findById(userId);
        if (user && user.role === 'scrapper') {
            let validatedLocation = { type: 'Point', coordinates: [0, 0] };
            if (liveLocation && Array.isArray(liveLocation.coordinates) && liveLocation.coordinates.length === 2) {
                const [lng, lat] = liveLocation.coordinates.map(Number);
                if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
                    validatedLocation = { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() };
                }
            }
            scrapper = await Scrapper.create({
                _id: userId,
                phone: user.phone,
                name: user.name || name || 'Scrapper',
                email: user.email,
                vehicleInfo: vehicleInfo || { type: 'bike', number: 'NA', capacity: 0 },
                liveLocation: validatedLocation
            });
        } else {
            return sendError(res, 'Scrapper profile not found', 404);
        }
    } else {
        if (name) scrapper.name = name;
        if (vehicleInfo) scrapper.vehicleInfo = { ...scrapper.vehicleInfo, ...vehicleInfo };
        if (city !== undefined) {
            if (city === null || city.trim() === "") {
                // If they are online, they CANNOT clear the city
                if (scrapper.isOnline) {
                    return sendError(res, 'City is mandatory while you are online.', 400);
                }
                scrapper.city = null;
            } else {
                scrapper.city = city.trim();
            }
        }
        
        if (liveLocation) {
            let lng, lat;
            if (Array.isArray(liveLocation.coordinates) && liveLocation.coordinates.length === 2) {
                [lng, lat] = liveLocation.coordinates.map(Number);
            } else if (liveLocation.lat !== undefined && liveLocation.lng !== undefined) {
                lat = Number(liveLocation.lat);
                lng = Number(liveLocation.lng);
            } else if (liveLocation.latitude !== undefined && liveLocation.longitude !== undefined) {
                lat = Number(liveLocation.latitude);
                lng = Number(liveLocation.longitude);
            } else {
                return sendError(res, 'liveLocation must have coordinates [longitude, latitude] or {lat, lng}', 400);
            }

            if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                return sendError(res, 'Invalid longitude or latitude coordinates', 400);
            }
            scrapper.liveLocation = {
                type: 'Point',
                coordinates: [lng, lat],
                updatedAt: new Date()
            };
        }

        // Update Online Status
        if (availability !== undefined || isOnline !== undefined) {
            const requestedOnline = availability === true || isOnline === true;

            if (requestedOnline) {
                // 1. Subscription Check
                const now = new Date();
                const isSubscribed = scrapper.subscription &&
                    scrapper.subscription.status === 'active' &&
                    new Date(scrapper.subscription.expiryDate) > now;

                if (!isSubscribed) {
                    return sendError(res, 'Active subscription required to go online. Please subscribe first.', 403, 'SUBSCRIPTION_REQUIRED');
                }

                // 2. MANDATORY City Check
                if (!scrapper.city || scrapper.city.trim() === "") {
                    return sendError(res, 'Please set your city in profile before going online. This is mandatory for city-wise requests.', 400);
                }
            }

            if (availability !== undefined) scrapper.isOnline = availability;
            if (isOnline !== undefined) scrapper.isOnline = isOnline;
        }

        await scrapper.save();
    }

    // 2. Sync with User Document (Crucial for "har jagah update")
    if (name) {
        const user = await User.findById(userId);
        if (user) {
            user.name = name;
            await user.save();
        }
    }

    sendSuccess(res, 'Profile updated successfully', { scrapper });
});

/**
 * Public-facing scrapper profile.
 *
 * Returns ONLY fields a counterparty needs. Wallet balance, Aadhaar data, KYC
 * document references, FCM tokens, precise live location, subscription details
 * and email are never exposed here. Phone is disclosed only to a user who has
 * an active (non-terminal) order with this scrapper, or to an admin.
 */
export const getScrapperPublicProfile = asyncHandler(async (req, res) => {
    const id = assertObjectId(req.params.id, 'scrapper id');

    const scrapper = await Scrapper.findById(id)
        .select('name profilePic city services vehicleInfo.type rating totalPickups isOnline createdAt kyc.status phone')
        .lean();

    if (!scrapper) {
        return sendError(res, 'Scrapper not found', 404);
    }

    const profile = {
        _id: scrapper._id,
        name: scrapper.name,
        profilePic: scrapper.profilePic || null,
        city: scrapper.city || null,
        services: scrapper.services || [],
        vehicleType: scrapper.vehicleInfo?.type || null,
        rating: scrapper.rating || { average: 0, count: 0 },
        totalPickups: scrapper.totalPickups || 0,
        isOnline: !!scrapper.isOnline,
        isVerified: scrapper.kyc?.status === 'verified',
        memberSince: scrapper.createdAt
    };

    // Contact disclosure is tied to an actual working relationship.
    let maySeeContact = req.user.role === 'admin' || req.user.id === String(id);
    if (!maySeeContact && req.user.role === 'user') {
        maySeeContact = !!(await Order.exists({
            user: req.user.id,
            scrapper: id,
            status: { $in: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED] }
        }));
    }
    if (maySeeContact) {
        profile.phone = scrapper.phone;
    }

    sendSuccess(res, 'Scrapper fetched successfully', { scrapper: profile });
});

export const updateFcmToken = asyncHandler(async (req, res) => {
    const { token, platform = 'web' } = req.body;
    const scrapperId = req.user.id;

    if (!token) {
        return sendError(res, 'Token is required', 400);
    }

    const scrapper = await Scrapper.findById(scrapperId);
    if (!scrapper) {
        return sendError(res, 'Scrapper profile not found', 404);
    }

    // Update Scrapper model
    if (platform === 'web') {
        if (!scrapper.fcmTokens) scrapper.fcmTokens = [];
        if (!scrapper.fcmTokens.includes(token)) {
            scrapper.fcmTokens.push(token);
            if (scrapper.fcmTokens.length > 10) scrapper.fcmTokens = scrapper.fcmTokens.slice(-10);
        }
    } else if (platform === 'app') {
        if (!scrapper.fcmTokenApp) scrapper.fcmTokenApp = [];
        if (!scrapper.fcmTokenApp.includes(token)) {
            scrapper.fcmTokenApp.push(token);
            if (scrapper.fcmTokenApp.length > 10) scrapper.fcmTokenApp = scrapper.fcmTokenApp.slice(-10);
        }
    }
    await scrapper.save();

    // Sync with User model (optional but recommended since auth is shared)
    try {
        const user = await User.findById(scrapperId);
        if (user) {
            if (platform === 'web') {
                if (!user.fcmTokens) user.fcmTokens = [];
                if (!user.fcmTokens.includes(token)) {
                    user.fcmTokens.push(token);
                    if (user.fcmTokens.length > 10) user.fcmTokens = user.fcmTokens.slice(-10);
                }
            } else if (platform === 'app') {
                if (!user.fcmTokenApp) user.fcmTokenApp = [];
                if (!user.fcmTokenApp.includes(token)) {
                    user.fcmTokenApp.push(token);
                    if (user.fcmTokenApp.length > 10) user.fcmTokenApp = user.fcmTokenApp.slice(-10);
                }
            }
            await user.save();
        }
    } catch (error) {
        logger.warn('Failed to sync FCM token to User model:', error.message);
    }

    sendSuccess(res, 'FCM token updated successfully');
});

export const getScrapperStats = asyncHandler(async (req, res) => {
    const scrapperId = req.user.id;

    // 1. Upcoming Pickups (Assigned but not completed/cancelled)
    // We use CONFIRMED and IN_PROGRESS as active states
    const upcomingPickups = await Order.countDocuments({
        scrapper: scrapperId,
        status: { $in: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.IN_PROGRESS] }
    });

    // 2. Collectors (Unique users served)
    const distinctUsers = await Order.find({
        scrapper: scrapperId,
        status: ORDER_STATUS.COMPLETED
    }).distinct('user');
    const collectorsCount = distinctUsers.length;

    // 3. Total Completed Orders
    const completedOrdersCount = await Order.countDocuments({
        scrapper: scrapperId,
        status: ORDER_STATUS.COMPLETED
    });

    // 4. Under Negotiation (Pending bids on marketplace)
    const underNegotiation = await Bid.countDocuments({
        scrapperId: scrapperId,
        status: 'pending'
    });

    // 5. Open Items (marketplace requests visible to THIS scrapper, i.e. own city)
    const scrapperDoc = req.scrapper || await Scrapper.findById(scrapperId).select('city rating');
    const openItemsFilter = { status: { $in: ['open', 'bidding'] } };
    const city = scrapperDoc?.city?.trim();
    if (city) {
        openItemsFilter['location.city'] = /^(gurugram|gurgaon)$/i.test(city)
            ? { $regex: /gurugram|gurgaon/i }
            : new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const openItems = city ? await MarketplaceRequest.countDocuments(openItemsFilter) : 0;

    // 6. Weekly Performance & 7-Day Trend
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const startOf14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentOrders = await Order.find({
        scrapper: scrapperId,
        status: ORDER_STATUS.COMPLETED,
        $or: [
            { completedDate: { $gte: startOf14Days } },
            { updatedAt: { $gte: startOf14Days } }
        ]
    }).select('totalAmount paidAmount completedDate updatedAt');

    let week = 0;
    let weekPickups = 0;
    let previousWeek = 0;

    for (const ord of recentOrders) {
        const amount = ord.paidAmount || ord.totalAmount || 0;
        const orderDate = new Date(ord.completedDate || ord.updatedAt);
        if (orderDate >= sevenDaysAgo) {
            week += amount;
            weekPickups += 1;
        } else {
            previousWeek += amount;
        }
    }

    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayLabel = dayNames[d.getDay()][0]; // First letter ('M', 'T', 'W', etc.)
        const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const endDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

        let dayAmount = 0;
        for (const ord of recentOrders) {
            const ordDate = new Date(ord.completedDate || ord.updatedAt);
            if (ordDate >= startDay && ordDate < endDay) {
                dayAmount += (ord.paidAmount || ord.totalAmount || 0);
            }
        }
        days.push({ day: dayLabel, amount: Math.round(dayAmount) });
    }

    const ratingVal = scrapperDoc?.rating?.average ? Number(scrapperDoc.rating.average.toFixed(1)) : 5.0;

    sendSuccess(res, 'Scrapper stats fetched successfully', {
        stats: {
            upcomingPickups,
            collectors: collectorsCount,
            completedOrders: completedOrdersCount,
            underNegotiation,
            openItems,
            myOpenBids: underNegotiation,
            openLots: openItems,
            rating: ratingVal,
            week: Math.round(week),
            weekPickups,
            previousWeek: Math.round(previousWeek),
            days
        }
    });
});
