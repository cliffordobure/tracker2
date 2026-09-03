import { Notification, Kid } from '../models/index.js';
import { sendPushToUser } from './push.js';
import { NOTIFICATION_TYPES } from '@school-tracker/shared';
import { toIso } from '../lib/clock.js';

function notificationPayload(n, fallback = {}) {
  const createdAt = toIso(n?.createdAt) || new Date().toISOString();
  return {
    id: n?._id?.toString() || '',
    type: n?.type || fallback.type,
    title: n?.title || fallback.title,
    body: n?.body || fallback.body,
    tripId: (n?.tripId || fallback.tripId)?.toString() || '',
    kidId: (n?.kidId || fallback.kidId)?.toString() || '',
    read: !!n?.read,
    createdAt,
  };
}

function emitAndPush(io, userId, payload) {
  if (!userId || !payload?.title) return;
  io?.to(`user:${userId}`).emit('notification:new', payload);
  sendPushToUser(userId, {
    title: payload.title,
    body: payload.body,
    data: {
      type: payload.type || '',
      notificationId: payload.id || '',
      tripId: payload.tripId || '',
      kidId: payload.kidId || '',
      createdAt: payload.createdAt,
    },
  }).catch((err) => console.warn('[push] notify error:', err.message));
}

export async function createAndEmitNotifications(io, items) {
  if (!items.length) return [];

  const created = [];
  for (const item of items) {
    if (!item?.userId || !item?.title) continue;
    let doc = null;
    try {
      if (item.key) {
        doc = await Notification.findOneAndUpdate(
          { userId: item.userId, key: String(item.key) },
          { $setOnInsert: { ...item, key: String(item.key) } },
          { upsert: true, new: true }
        );
      } else {
        doc = await Notification.create(item);
      }
    } catch (err) {
      if (item.key) {
        doc = await Notification.findOne({ userId: item.userId, key: String(item.key) });
      }
      if (!doc) console.warn('[notify] save failed:', err.message);
    }
    const payload = notificationPayload(doc, item);
    emitAndPush(io, item.userId, payload);
    if (doc) created.push(doc);
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

export function emitChatMessage(io, userIds, payload) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '')).filter(Boolean))];
  for (const id of ids) {
    io?.to(`user:${id}`).emit('message:new', payload);
  }
}

export { NOTIFICATION_TYPES };
