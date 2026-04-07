require('../src/config/env'); // load + validate env vars
const { sendRenewalReminders } = require('../src/workers/subscriptionRenewalCron');

sendRenewalReminders()
  .then(() => { console.log('Done'); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
