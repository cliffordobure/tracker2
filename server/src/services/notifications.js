import { Notification, Kid } from '../models/index.js';
import { sendPushToUser } from './push.js';
import { NOTIFICATION_TYPES } from '@school-tracker/shared';

export async function createAndEmitNotifications(io, items) {
  if (!items.length) return [];

  const created = await Notification.insertMany(items);
  for (const n of created) {
    const payload = {
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      body: n.body,
      tripId: n.tripId?.toString(),
      kidId: n.kidId?.toString(),
      read: n.read,
      createdAt: n.createdAt,
    };
    io?.to(`user:${n.userId}`).emit('notification:new', payload);
    sendPushToUser(n.userId, {
      title: n.title,
      body: n.body,
      data: {
        type: n.type,
        notificationId: n._id.toString(),
        tripId: n.tripId?.toString() || '',
        kidId: n.kidId?.toString() || '',
      },
    }).catch((err) => console.warn('[push] notify error:', err.message));
  }
  return created;
}

export async function notifyParentsOfKids(io, { parentIdsByKid, type, titleFor, bodyFor, tripId }) {
  const items = [];
  for (const [kidId, parentIds] of Object.entries(parentIdsByKid)) {
    for (const parentId of parentIds) {
      items.push({
        userId: parentId,
        type,
        title: titleFor(kidId),
        body: bodyFor(kidId),
        tripId,
        kidId,
      });
    }
  }
  return createAndEmitNotifications(io, items);
}

/** Notify each parent linked to kids on a trip. */
export async function notifyParentsForTrip(io, trip, { type, titleFor, bodyFor }) {
  const kids = await Kid.find({ _id: { $in: trip.kidIds || [] }, active: true });
  const items = [];
  for (const kid of kids) {
    for (const parentId of kid.parentIds || []) {
      items.push({
        userId: parentId,
        type,
        title: titleFor(kid),
        body: bodyFor(kid),
        tripId: trip._id,
        kidId: kid._id,
      });
    }
  }
  return createAndEmitNotifications(io, items);
}

export async function notifyTripCancelled(io, trip) {
  const code = trip.tripCode || 'Trip';
  return notifyParentsForTrip(io, trip, {
    type: NOTIFICATION_TYPES.TRIP_CANCELLED,
    titleFor: () => 'Trip cancelled',
    bodyFor: (kid) =>
      `${kid.name}'s ${trip.period || ''} trip (${code}) has been cancelled.`.replace(/\s+/g, ' ').trim(),
  });
}

export async function notifyTripAssigned(io, trip) {
  const code = trip.tripCode || 'Trip';
  const when = trip.serviceDate
    ? new Date(trip.serviceDate).toLocaleDateString()
    : 'soon';
  return notifyParentsForTrip(io, trip, {
    type: NOTIFICATION_TYPES.TRIP_ASSIGNED,
    titleFor: () => 'Trip assigned',
    bodyFor: (kid) =>
      `${kid.name} is scheduled on ${code} (${trip.period || 'trip'}) for ${when}.`,
  });
}

export { NOTIFICATION_TYPES };
