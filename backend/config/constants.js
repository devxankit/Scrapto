// Application Constants

export const USER_ROLES = {
  USER: 'user',
  SCRAPPER: 'scrapper',
  ADMIN: 'admin'
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

export const SCRAP_CATEGORIES = {
  METAL: 'metal',
  PLASTIC: 'plastic',
  PAPER: 'paper',
  ELECTRONIC: 'electronic',
  GLASS: 'glass',
  VEHICLES: 'vehicles',
  EDUCATIONAL: 'educational',
  DOLLS: 'dolls',
  BLOCKS: 'blocks',
  SOFT_TOYS: 'soft toys',
  ROLE_PLAY: 'role play',
  MUSICAL: 'musical',
  FIGURES: 'figures',
  ACTION_TOYS: 'action toys',
  OUTDOOR: 'outdoor',
  PUZZLE: 'puzzle',
  OTHER: 'other',

  // Categories used by the user and partner apps (src/data/catalog.ts).
  // Values are lowercase; every comparison normalises with normalizeCategory().
  NEWSPAPER: 'newspaper',
  CARDBOARD: 'cardboard',
  COPPER: 'copper',
  BRASS: 'brass',
  ALUMINIUM: 'aluminium',
  IRON: 'iron',
  STEEL: 'steel',
  WIRE_CABLE: 'wire & cable',
  E_WASTE: 'e-waste',
  BATTERY: 'battery',
  SPLIT_AC: 'split ac',
  REFRIGERATOR: 'refrigerator',
  WASHING_MACHINE: 'washing machine',
  COOLER: 'cooler',
  CEILING_FAN: 'ceiling fan',
  GEYSER: 'geyser',
  MICROWAVE: 'microwave',
  TV_MONITOR: 'tv / monitor',
  TYRES: 'tyres',
  OLD_VEHICLE: 'old vehicle',
  WOODEN_FURNITURE: 'wooden furniture'
};

/** Case/whitespace-insensitive category key ("  Copper " -> "copper"). */
export const normalizeCategory = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : null;

export const FILE_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'],
  DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  VIDEO: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm']
};

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10
};

export const ORDER_TYPES = {
  SCRAP_SELL: 'scrap_sell',
  CLEANING_SERVICE: 'cleaning_service'
};

export const PRICE_TYPES = {
  MATERIAL: 'material',
  // SERVICE: 'service'
};

/* 
export const SERVICE_CATEGORIES = {
  HOME_CLEANING: 'home_cleaning',
  OFFICE_CLEANING: 'office_cleaning',
  DEBRIS_REMOVAL: 'debris_removal',
  GARAGE_CLEANING: 'garage_cleaning'
};
*/

export const NOTIFICATION_TYPES = {
  ORDER_UPDATE: 'order_update',
  PAYMENT: 'payment',
  SYSTEM: 'system',
  PROMOTION: 'promotion'
};
