import express from 'express';
import { protect, isUser } from '../middleware/auth.js';
import {
    createAddress,
    deleteAddress,
    getMyAddresses,
    setDefaultAddress,
    updateAddress
} from '../controllers/addressController.js';

const router = express.Router();

// Saved pickup address book. Users only: scrappers and admins do not own one.
router.use(protect, isUser);

router.get('/', getMyAddresses);
router.post('/', createAddress);
router.put('/:id', updateAddress);
router.patch('/:id/default', setDefaultAddress);
router.delete('/:id', deleteAddress);

export default router;
