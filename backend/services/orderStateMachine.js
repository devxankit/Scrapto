import { ORDER_STATUS } from '../config/constants.js';

/**
 * Explicit order state machine.
 *
 *   pending ──confirm──▶ confirmed ──start──▶ in_progress ──complete──▶ completed
 *      │                    │                     │
 *      └───cancel───────────┴───cancel────────────┘            completed/cancelled are terminal
 *
 * Role permissions per transition:
 *   confirm   : scrapper (via atomic acceptOrder), admin (assign)
 *   start     : assigned scrapper, admin
 *   complete  : assigned scrapper, admin   (users cannot self-complete orders)
 *   cancel    : owner user (pending/confirmed), assigned scrapper, admin
 */
const TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: []
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

export const isTerminal = (status) =>
  status === ORDER_STATUS.COMPLETED || status === ORDER_STATUS.CANCELLED;

/**
 * Which transitions each role may trigger via the generic status endpoint.
 * Confirmation happens exclusively through acceptOrder / admin assign, so it is
 * deliberately NOT available here for scrappers or users.
 */
const ROLE_ALLOWED = {
  user: new Set([]), // users act through cancelOrder; no direct status writes
  scrapper: new Set([ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED]),
  admin: new Set(Object.values(ORDER_STATUS))
};

export const roleMayTransition = (role, to) => (ROLE_ALLOWED[role] || new Set()).has(to);

export const assertTransition = (order, to, role) => {
  if (!canTransition(order.status, to)) {
    const err = new Error(`Cannot change order from '${order.status}' to '${to}'`);
    err.statusCode = 409;
    throw err;
  }
  if (!roleMayTransition(role, to)) {
    const err = new Error(`Role '${role}' may not set order status '${to}'`);
    err.statusCode = 403;
    throw err;
  }
};
