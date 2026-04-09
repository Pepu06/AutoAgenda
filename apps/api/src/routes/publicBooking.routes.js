const { Router } = require('express');
const ctrl = require('../controllers/publicBooking.controller');
const { bookingLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.get('/book/:slug',                              ctrl.getPublicProfile);
router.get('/book/:slug/types/:typeId',                ctrl.getPublicType);
router.get('/book/:slug/types/:typeId/slots',          ctrl.getAvailableSlots);
router.post('/book/:slug/types/:typeId/book', bookingLimiter, ctrl.createBooking);

module.exports = router;
