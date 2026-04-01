const AppointmentStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
});

const UserRole = Object.freeze({
  OWNER: 'owner',
  STAFF: 'staff',
});

const MessageType = Object.freeze({
  CONFIRMATION: 'confirmation',
  REMINDER: 'reminder',
  FOLLOW_UP: 'follow_up',
  REPLY: 'reply',
});

const MessageDirection = Object.freeze({
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
});

const JobName = Object.freeze({
  SEND_CONFIRMATION: 'sendConfirmation',
  SEND_REMINDER: 'sendReminder',
  SEND_FOLLOW_UP: 'sendFollowUp',
});

module.exports = {
  AppointmentStatus,
  UserRole,
  MessageType,
  MessageDirection,
  JobName,
};
