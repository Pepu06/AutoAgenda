const AppointmentStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  NOTIFIED: 'notified',
  SIN_ENVIAR: 'sin_enviar',
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
  SEND_FOLLOW_UP: 'sendFollowUp',
});

module.exports = {
  AppointmentStatus,
  UserRole,
  MessageType,
  MessageDirection,
  JobName,
};
