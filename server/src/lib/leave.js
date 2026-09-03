import { LeaveRequest } from '../models/index.js';
import { formatDateKey } from './clock.js';

function kidIdString(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

export function leaveCoversDateKey(leave, ymd) {
  if (!ymd || !leave) return false;
  const start = formatDateKey(leave.startDate);
  const end = formatDateKey(leave.endDate);
  if (!start || !end) return false;
  return start <= ymd && ymd <= end;
}

export async function approvedLeaveIdSet(kidIds, onDate) {
  const ids = [...new Set((kidIds || []).map(kidIdString).filter(Boolean))];
  if (!ids.length) return new Set();
  const day = onDate ? new Date(onDate) : new Date();
  if (Number.isNaN(day.getTime())) return new Set();
  const ymd = formatDateKey(day);
  if (!ymd) return new Set();

  const from = new Date(day);
  from.setDate(from.getDate() - 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(day);
  to.setDate(to.getDate() + 1);
  to.setHours(23, 59, 59, 999);

  const rows = await LeaveRequest.find({
    kidId: { $in: ids },
    status: 'approved',
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .select('kidId startDate endDate')
    .lean();

  const out = new Set();
  for (const row of rows) {
    if (leaveCoversDateKey(row, ymd)) out.add(String(row.kidId));
  }
  return out;
}

export function withoutLeaveKids(kids, leaveIds) {
  if (!leaveIds?.size) return kids || [];
  return (kids || []).filter((kid) => !leaveIds.has(kidIdString(kid)));
}

export async function stripApprovedLeaveFromKids(kids, onDate) {
  const leaveIds = await approvedLeaveIdSet(kids, onDate);
  return withoutLeaveKids(kids, leaveIds);
}
