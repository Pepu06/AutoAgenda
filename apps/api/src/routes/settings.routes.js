const { Router } = require('express');
const auth = require('../middleware/auth');
const { getSettings, updateSettings, deleteAccount, getOnboarding, updateOnboarding, triggerDailyReport } = require('../controllers/settings.controller');

const router = Router();
router.use(auth);

router.get('/', getSettings);
router.put('/', updateSettings);
router.delete('/account', deleteAccount);
router.get('/onboarding', getOnboarding);
router.put('/onboarding', updateOnboarding);
router.post('/send-daily-report', triggerDailyReport);

module.exports = router;
