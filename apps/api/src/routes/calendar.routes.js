const { Router } = require('express');
const auth = require('../middleware/auth');
const { calendarStatus, connect, disconnect, events, createEvent, updateEventStatus, remindEvent, getDefaultCalendar, setDefaultCalendar } = require('../controllers/calendar.controller');

const router = Router();

router.use(auth);

router.get('/status',        calendarStatus);
router.post('/connect',      connect);
router.post('/disconnect',   disconnect);
router.get('/default',       getDefaultCalendar);
router.put('/default',       setDefaultCalendar);
router.get('/events',                  events);
router.post('/events',                 createEvent);
router.patch('/events/:eventId/status', updateEventStatus);
router.post('/remind/:eventId',         remindEvent);

module.exports = router;
