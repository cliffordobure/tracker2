import { Notification } from '../models/index.js';

export async function createAndEmitNotifications(io, items) {
  if (!items.length) return [];

  const created = await Notification.insertMany(items);
  for (const n of created) {
    io?.to(`user:${n.userId}`).emit('notification:new', {
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      body: n.body,
      tripId: n.tripId?.toString(),
      kidId: n.kidId?.toString(),
      read: n.read,
      createdAt: n.createdAt,
    });
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
