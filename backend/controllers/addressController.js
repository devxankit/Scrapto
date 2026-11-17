import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';

const MAX_ADDRESSES = 20;

const asString = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

const ADDRESS_TYPES = new Set(['home', 'office', 'other']);

/**
 * Builds a clean address subdocument from untrusted input.
 * Returns { error } when a required field is missing or malformed.
 */
const buildAddress = (body) => {
  const street = asString(body.street, 250);
  const city = asString(body.city, 80);
  const pincode = asString(body.pincode, 10);

  if (!street) return { error: 'Street address is required' };
  if (!city) return { error: 'City is required' };
  if (!pincode || !/^\d{6}$/.test(pincode)) return { error: 'Pincode must be 6 digits' };

  const lat = Number(body?.coordinates?.lat);
  const lng = Number(body?.coordinates?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (hasCoords && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    return { error: 'Coordinates are out of range' };
  }

  const type = ADDRESS_TYPES.has(body.type) ? body.type : 'home';

  return {
    address: {
      type,
      label: asString(body.label, 60) || type.charAt(0).toUpperCase() + type.slice(1),
      street,
      landmark: asString(body.landmark, 120),
      city,
      state: asString(body.state, 80),
      pincode,
      ...(hasCoords ? { coordinates: { lat, lng } } : {}),
      isDefault: body.isDefault === true
    }
  };
};

/** The first address a user saves is their default; only one may hold the flag. */
const normalizeDefaults = (list, preferredId) => {
  if (!list.length) return;
  let chosen = preferredId
    ? list.find((a) => String(a._id) === String(preferredId) && a.isDefault)
    : list.find((a) => a.isDefault);
  if (!chosen) chosen = list.find((a) => a.isDefault) || list[0];
  list.forEach((a) => {
    a.isDefault = String(a._id) === String(chosen._id);
  });
};

// @desc    List my saved addresses
// @route   GET /api/v1/addresses
// @access  Private (user)
export const getMyAddresses = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('addresses');
  if (!user) return sendError(res, 'User not found', 404);
  sendSuccess(res, 'Addresses fetched successfully', { addresses: user.addresses || [] });
});

// @desc    Add an address
// @route   POST /api/v1/addresses
// @access  Private (user)
export const createAddress = asyncHandler(async (req, res) => {
  const { address, error } = buildAddress(req.body || {});
  if (error) return sendError(res, error, 400);

  const user = await User.findById(req.user.id).select('addresses');
  if (!user) return sendError(res, 'User not found', 404);

  user.addresses = user.addresses || [];
  if (user.addresses.length >= MAX_ADDRESSES) {
    return sendError(res, `You can save at most ${MAX_ADDRESSES} addresses`, 400);
  }

  if (user.addresses.length === 0) address.isDefault = true;

  user.addresses.push(address);
  const created = user.addresses[user.addresses.length - 1];
  normalizeDefaults(user.addresses, address.isDefault ? created._id : undefined);
  await user.save();

  sendSuccess(
    res,
    'Address added successfully',
    { address: user.addresses.id(created._id), addresses: user.addresses },
    201
  );
});

// @desc    Update an address
// @route   PUT /api/v1/addresses/:id
// @access  Private (user)
export const updateAddress = asyncHandler(async (req, res) => {
  const { address, error } = buildAddress(req.body || {});
  if (error) return sendError(res, error, 400);

  const user = await User.findById(req.user.id).select('addresses');
  if (!user) return sendError(res, 'User not found', 404);

  const existing = user.addresses?.id(req.params.id);
  if (!existing) return sendError(res, 'Address not found', 404);

  existing.set(address);
  normalizeDefaults(user.addresses, address.isDefault ? existing._id : undefined);
  await user.save();

  sendSuccess(res, 'Address updated successfully', {
    address: user.addresses.id(existing._id),
    addresses: user.addresses
  });
});

// @desc    Delete an address
// @route   DELETE /api/v1/addresses/:id
// @access  Private (user)
export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('addresses');
  if (!user) return sendError(res, 'User not found', 404);

  const existing = user.addresses?.id(req.params.id);
  if (!existing) return sendError(res, 'Address not found', 404);

  const wasDefault = existing.isDefault;
  existing.deleteOne();
  // Promote another address when the default was removed.
  if (wasDefault && user.addresses.length) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
    user.addresses[0].isDefault = true;
  }
  await user.save();

  sendSuccess(res, 'Address deleted successfully', { addresses: user.addresses });
});

// @desc    Mark an address as the default
// @route   PATCH /api/v1/addresses/:id/default
// @access  Private (user)
export const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('addresses');
  if (!user) return sendError(res, 'User not found', 404);

  const existing = user.addresses?.id(req.params.id);
  if (!existing) return sendError(res, 'Address not found', 404);

  user.addresses.forEach((a) => {
    a.isDefault = String(a._id) === String(existing._id);
  });
  await user.save();

  sendSuccess(res, 'Default address updated successfully', {
    address: user.addresses.id(existing._id),
    addresses: user.addresses
  });
});
