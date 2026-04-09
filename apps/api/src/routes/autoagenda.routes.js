const { Router } = require('express');
const ctrl = require('../controllers/autoagenda.controller');
const authenticate = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// Profile
router.get('/profile',        ctrl.getProfile);
router.put('/profile',        ctrl.updateProfile);
router.post('/profile/image', ctrl.uploadProfileImage);

// Google Calendars
router.get('/google-calendars', ctrl.getGoogleCalendars);

// Schedules
router.get('/schedules',        ctrl.listSchedules);
router.post('/schedules',       ctrl.createSchedule);
router.get('/schedules/:id',    ctrl.getSchedule);
router.put('/schedules/:id',    ctrl.updateSchedule);
router.delete('/schedules/:id', ctrl.deleteSchedule);

// Types
router.get('/types',        ctrl.listTypes);
router.post('/types',       ctrl.createType);
router.get('/types/:id',    ctrl.getType);
router.put('/types/:id',    ctrl.updateType);
router.delete('/types/:id', ctrl.deleteType);

module.exports = router;
