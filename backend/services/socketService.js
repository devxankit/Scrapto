import { Server } from 'socket.io';
import { sendMessage, markAsRead } from './chatService.js';
import Chat from '../models/Chat.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import { verifyAccessToken } from '../utils/generateToken.js';
import logger from '../utils/logger.js';

let io = null;

/**
 * Socket security model:
 *  - every connection must present a valid ACCESS token; the account must exist,
 *    be active, and the token's tokenVersion must still match (revocation);
 *  - blocked/suspended scrappers are refused at handshake;
 *  - room membership is authorised server-side:
 *      chat_<id>     -> must be a chat participant
 *      tracking_<id> -> must be the order's user, its assigned scrapper, or admin
 *  - only the assigned scrapper may publish location for an order, and updates
 *    are coordinate-validated and rate limited;
 *  - identity always comes from the socket session, never from event payloads.
 */

const EVENT_LIMITS = {
  default: { points: 60, windowMs: 10_000 },
  scrapper_location_update: { points: 30, windowMs: 10_000 },
  send_message: { points: 30, windowMs: 10_000 }
};

const allowEvent = (socket, event) => {
  const limit = EVENT_LIMITS[event] || EVENT_LIMITS.default;
  const now = Date.now();
  socket.data.buckets = socket.data.buckets || {};
  const bucket = socket.data.buckets[event] || { count: 0, resetAt: now + limit.windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + limit.windowMs;
  }
  bucket.count += 1;
  socket.data.buckets[event] = bucket;
  if (bucket.count > limit.points) {
    socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
    return false;
  }
  return true;
};

const isValidCoordinate = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Can this socket observe / participate in tracking for the given order? */
const authorizeOrderAccess = async (socket, orderId) => {
  if (!orderId || typeof orderId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(orderId)) return null;
  const order = await Order.findById(orderId).select('user scrapper status');
  if (!order) return null;
  if (socket.userRole === 'admin') return { order, role: 'admin' };
  if (order.user?.toString() === socket.userId) return { order, role: 'user' };
  if (order.scrapper?.toString() === socket.userId) return { order, role: 'scrapper' };
  return null;
};

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (process.env.FRONTEND_URL || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim().replace(/\/$/, '')),
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6 // 1 MB
  });

  // Authentication + authorisation at handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = verifyAccessToken(token);

      const user = await User.findById(decoded.id).select('role isActive tokenVersion');
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: Account unavailable'));
      }
      if ((user.tokenVersion || 0) !== (decoded.tv ?? 0)) {
        return next(new Error('Authentication error: Session revoked'));
      }

      if (user.role === 'scrapper') {
        const scrapper = await Scrapper.findById(user._id).select('status');
        if (scrapper && scrapper.status !== 'active') {
          return next(new Error('Authentication error: Account blocked'));
        }
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.userType = user.role === 'scrapper' ? 'scrapper' : user.role === 'admin' ? 'admin' : 'user';
      socket.data = {};
      return next();
    } catch (error) {
      logger.warn('Socket authentication rejected', { reason: error.message });
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.userId} (${socket.userType})`);

    // Personal notification room only.
    socket.join(`user_${socket.userId}`);

    const handleJoinChat = async (chatId) => {
      try {
        if (!allowEvent(socket, 'join_chat')) return;
        if (!chatId || typeof chatId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(chatId)) {
          socket.emit('error', { message: 'Invalid chat id' });
          return;
        }
        const chat = await Chat.findById(chatId).select('participants user scrapper');
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        const isParticipant = chat.participants.some(
          (p) => p.userId.toString() === socket.userId && p.userType === socket.userType
        ) || chat.user?.toString() === socket.userId || chat.scrapper?.toString() === socket.userId;

        if (!isParticipant && socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Unauthorized access to chat' });
          return;
        }

        socket.join(`chat_${chatId}`);
        socket.emit('joined_chat', { chatId });
      } catch (error) {
        logger.error('Error joining chat', { error: error.message });
        socket.emit('error', { message: 'Error joining chat' });
      }
    };

    socket.on('joinChat', async (payload) => {
      await handleJoinChat(typeof payload === 'string' ? payload : payload?.chatId);
    });
    socket.on('join_chat', async (payload) => {
      await handleJoinChat(payload?.chatId);
    });

    socket.on('leaveChat', (payload) => {
      const chatId = typeof payload === 'string' ? payload : payload?.chatId;
      if (chatId) socket.leave(`chat_${chatId}`);
    });
    socket.on('leave_chat', (payload) => {
      if (payload?.chatId) socket.leave(`chat_${payload.chatId}`);
    });

    socket.on('send_message', async ({ chatId, message, attachments = [] } = {}) => {
      try {
        if (!allowEvent(socket, 'send_message')) return;
        if (typeof message !== 'string' || !message.trim()) {
          socket.emit('error', { message: 'Message is required' });
          return;
        }
        if (message.length > 5000) {
          socket.emit('error', { message: 'Message too long' });
          return;
        }

        // chatService re-verifies participation; identity comes from the socket.
        const newMessage = await sendMessage(
          chatId,
          socket.userId,
          socket.userType,
          message,
          Array.isArray(attachments) ? attachments.slice(0, 5) : []
        );

        io.to(`chat_${chatId}`).emit('newMessage', newMessage);
        io.to(`chat_${chatId}`).emit('new_message', { message: newMessage });
      } catch (error) {
        logger.error('Error sending message via socket', { error: error.message });
        socket.emit('error', { message: error.message || 'Error sending message' });
      }
    });

    socket.on('typing', ({ chatId, isTyping } = {}) => {
      if (!allowEvent(socket, 'typing')) return;
      if (!chatId || !socket.rooms.has(`chat_${chatId}`)) return;
      socket.to(`chat_${chatId}`).emit('typing', {
        userId: socket.userId,
        userType: socket.userType,
        isTyping: !!isTyping,
        chatId
      });
    });

    socket.on('mark_read', async ({ chatId } = {}) => {
      try {
        if (!allowEvent(socket, 'mark_read')) return;
        if (!chatId) return;
        await markAsRead(chatId, socket.userId, socket.userType);
        socket.to(`chat_${chatId}`).emit('messages_read', { userId: socket.userId, chatId });
      } catch (error) {
        logger.error('Error marking messages as read', { error: error.message });
        socket.emit('error', { message: 'Error marking messages as read' });
      }
    });

    // --- Order tracking: membership is authorised against the order ---
    socket.on('join_tracking', async ({ orderId } = {}) => {
      if (!allowEvent(socket, 'join_tracking')) return;
      const access = await authorizeOrderAccess(socket, orderId);
      if (!access) {
        socket.emit('error', { message: 'Not authorized to track this order' });
        return;
      }
      socket.join(`tracking_${orderId}`);
      socket.emit('joined_tracking', { orderId });
    });

    socket.on('leave_tracking', ({ orderId } = {}) => {
      if (orderId) socket.leave(`tracking_${orderId}`);
    });

    socket.on('scrapper_location_update', async (data = {}) => {
      try {
        if (!allowEvent(socket, 'scrapper_location_update')) return;
        if (socket.userRole !== 'scrapper') {
          socket.emit('error', { message: 'Only scrappers can publish location' });
          return;
        }
        const { orderId } = data;
        const lat = Number(data?.location?.lat);
        const lng = Number(data?.location?.lng);
        if (!isValidCoordinate(lat, lng)) {
          socket.emit('error', { message: 'Invalid coordinates' });
          return;
        }

        // ONLY the assigned scrapper of an active order may broadcast.
        const access = await authorizeOrderAccess(socket, orderId);
        if (!access || access.role !== 'scrapper') {
          socket.emit('error', { message: 'Not authorized to update location for this order' });
          return;
        }
        if (!['confirmed', 'in_progress'].includes(access.order.status)) {
          return; // tracking only meaningful for active orders
        }

        const payload = {
          orderId,
          location: { lat, lng },
          heading: Number.isFinite(Number(data.heading)) ? Number(data.heading) : null,
          at: new Date().toISOString()
        };

        socket.to(`tracking_${orderId}`).emit('scrapper_location_update', payload);

        // Persist last known position (bounded write frequency by the limiter).
        await Scrapper.updateOne(
          { _id: socket.userId },
          { $set: { liveLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } } }
        );
      } catch (error) {
        logger.error('Error handling location update', { error: error.message });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.userId}`);
    });
  });

  logger.info('Socket.io server initialized');
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
};

export const broadcastToChat = (chatId, event, data) => {
  if (!io) {
    logger.warn('Socket.io not initialized, cannot broadcast');
    return;
  }
  io.to(`chat_${chatId}`).emit(event, data);
};

export const notifyUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user_${userId}`).emit(event, data);
};

/** Force-disconnect every live socket for an account (used on block/revoke). */
export const disconnectUser = async (userId) => {
  if (!io) return;
  try {
    const sockets = await io.in(`user_${userId}`).fetchSockets();
    sockets.forEach((s) => s.disconnect(true));
  } catch (error) {
    logger.warn('Failed to disconnect user sockets', { error: error.message });
  }
};
