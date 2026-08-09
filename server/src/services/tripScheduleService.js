import { Trip, TripSchedule } from '../models/index.js';
import { notifyTripAssigned } from './notifications.js';
import { getIO } from '../socket.js';

function parseDateInput(dateInput) {
  if (dateInput instanceof Date) return new Date(dateInput);
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateInput);
}

export function startOfDay(dateInput) {
  const d = parseDateInput(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(dateInput) {
  const d = parseDateInput(dateInput);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateKey(d) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function matchesScheduleDay(schedule, date) {
  const day = date.getDay(); // 0=Sun
  switch (schedule.scheduleType) {
    case 'ONE_TIME':
      return dateKey(date) === dateKey(schedule.startDate);
    case 'EVERY_DAY':
      return true;
    case 'WEEKDAYS':
      return day >= 1 && day <= 5;
    case 'CUSTOM_DAYS':
      return (schedule.customDays || []).includes(day);
    default:
      return false;
  }
}

export function datesForSchedule(schedule, fromInput, toInput) {
  let from = startOfDay(fromInput || schedule.startDate || new Date());
  let to = startOfDay(toInput || schedule.endDate || from);
  if (!toInput && !schedule.endDate) {
    to = startOfDay(from);
    to.setDate(to.getDate() + 14);
  }
  if (schedule.endDate && startOfDay(schedule.endDate) < to) {
    to = startOfDay(schedule.endDate);
  }
  if (schedule.startDate && startOfDay(schedule.startDate) > from) {
    from = startOfDay(schedule.startDate);
  }

  const dates = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    if (matchesScheduleDay(schedule, cursor)) {
      dates.push(startOfDay(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export async function nextTripCode() {
  const latest = await Trip.findOne({ tripCode: { $regex: /^TRIP-\d+$/ } })
    .sort({ tripCode: -1 })
    .select('tripCode')
    .lean();
  let n = 1000;
  if (latest?.tripCode) {
    const parsed = Number(String(latest.tripCode).replace('TRIP-', ''));
    if (Number.isFinite(parsed)) n = parsed + 1;
  } else {
    const count = await Trip.countDocuments();
    n = 1000 + count + 1;
  }
  return `TRIP-${n}`;
}

/** P0 conflict: same bus or driver already has scheduled/active instance for serviceDate+period. */
export async function findPeriodConflict({
  schoolId,
  busId,
  driverId,
  serviceDate,
  period,
  excludeTripId,
}) {
  const dayStart = startOfDay(serviceDate);
  const dayEnd = endOfDay(serviceDate);
  const filter = {
    schoolId,
    period,
    serviceDate: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ['scheduled', 'active'] },
    $or: [{ busId }, { driverId }],
  };
  if (excludeTripId) filter._id = { $ne: excludeTripId };
  return Trip.findOne(filter)
    .populate('busId', 'plate label')
    .populate('driverId', 'name')
    .populate('routeId', 'name');
}

export async function generateInstancesForSchedule(
  scheduleId,
  { from, to, notify = true } = {}
) {
  const schedule = await TripSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (!schedule.active) throw new Error('Schedule is inactive');

  const dates = datesForSchedule(schedule, from, to);
  const created = [];
  const skipped = [];
  const conflicts = [];

  for (const serviceDate of dates) {
    const existing = await Trip.findOne({
      scheduleId: schedule._id,
      period: schedule.period,
      serviceDate: { $gte: startOfDay(serviceDate), $lte: endOfDay(serviceDate) },
      status: { $ne: 'cancelled' },
    });
    if (existing) {
      skipped.push({ serviceDate, tripId: existing._id, tripCode: existing.tripCode });
      continue;
    }

    const conflict = await findPeriodConflict({
      schoolId: schedule.schoolId,
      busId: schedule.busId,
      driverId: schedule.driverId,
      serviceDate,
      period: schedule.period,
    });
    if (conflict) {
      conflicts.push({
        serviceDate,
        conflictTripCode: conflict.tripCode,
        bus: conflict.busId,
        driver: conflict.driverId,
      });
      continue;
    }

    const tripCode = await nextTripCode();
    const trip = await Trip.create({
      scheduleId: schedule._id,
      schoolId: schedule.schoolId,
      routeId: schedule.routeId,
      busId: schedule.busId,
      driverId: schedule.driverId,
      direction: schedule.direction,
      period: schedule.period,
      serviceDate: startOfDay(serviceDate),
      scheduledFor: startOfDay(serviceDate),
      tripCode,
      status: 'scheduled',
      kidIds: schedule.kidIds || [],
      sequence: 1,
    });
    created.push(trip);

    if (notify && isTodayOrTomorrow(serviceDate)) {
      try {
        await notifyTripAssigned(getIO(), trip);
      } catch (err) {
        console.warn('[notify] trip_assigned failed:', err.message);
      }
    }
  }

  return { created, skipped, conflicts, schedule };
}

function isTodayOrTomorrow(serviceDate) {
  const day = startOfDay(serviceDate).getTime();
  const today = startOfDay(new Date()).getTime();
  const tomorrow = startOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return day === today || day === tomorrow.getTime();
}
