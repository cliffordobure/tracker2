import {
  Trip,
  TripSchedule,
  SchoolHoliday,
  ScheduleException,
} from '../models/index.js';
import { notifyTripAssigned } from './notifications.js';
import { getIO } from '../socket.js';
import { EDIT_SCOPES } from '@school-tracker/shared';
import { fromAppZonedDateTime } from '../lib/clock.js';
import { stripApprovedLeaveFromKids } from '../lib/leave.js';

function parseDateInput(dateInput) {
  if (dateInput == null || dateInput === '') return new Date();
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? new Date() : new Date(dateInput);
  }
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(dateInput);
  return Number.isNaN(d.getTime()) ? new Date() : d;
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

export function dateKey(d) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function normalizeClock(value, fallback = '06:30') {
  const [hh, mm] = String(value || fallback).split(':').map(Number);
  if (!Number.isFinite(hh)) return fallback;
  return `${String(hh).padStart(2, '0')}:${String(Number.isFinite(mm) ? mm : 0).padStart(2, '0')}`;
}

/** Combine serviceDate + HH:mm into a Kenya-time instant for scheduledFor. */
export function scheduledForFrom(serviceDate, scheduledTime = '06:30') {
  const ymd =
    typeof serviceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate)
      ? serviceDate
      : dateKey(serviceDate);
  const clock = normalizeClock(scheduledTime);
  const [hh, mm] = clock.split(':').map(Number);
  return fromAppZonedDateTime(ymd, hh, mm);
}

function matchesScheduleDay(schedule, date) {
  const day = date.getDay();
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

async function loadHolidayKeys(schoolId, from, to) {
  const holidays = await SchoolHoliday.find({
    schoolId,
    active: true,
    date: { $gte: startOfDay(from), $lte: endOfDay(to) },
  }).lean();
  return new Set(holidays.map((h) => dateKey(h.date)));
}

async function loadExceptionsByDate(scheduleId, from, to) {
  const rows = await ScheduleException.find({
    scheduleId,
    serviceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  }).lean();
  return new Map(rows.map((e) => [dateKey(e.serviceDate), e]));
}

function instancePayload(schedule, serviceDate, exception) {
  const time =
    exception?.type === 'OVERRIDE' && exception.scheduledTime
      ? exception.scheduledTime
      : schedule.scheduledTime;
  const busId =
    exception?.type === 'OVERRIDE' && exception.busId ? exception.busId : schedule.busId;
  const driverId =
    exception?.type === 'OVERRIDE' && exception.driverId
      ? exception.driverId
      : schedule.driverId;
  const kidIds =
    exception?.type === 'OVERRIDE' && Array.isArray(exception.kidIds) && exception.kidIds.length
      ? exception.kidIds
      : schedule.kidIds || [];

  return {
    scheduleId: schedule._id,
    schoolId: schedule.schoolId,
    routeId: schedule.routeId,
    busId,
    driverId,
    direction: schedule.direction,
    period: schedule.period,
    serviceDate: startOfDay(serviceDate),
    scheduledTime: normalizeClock(time),
    scheduledFor: scheduledForFrom(serviceDate, time),
    kidIds,
    sequence: 1,
  };
}

export async function generateInstancesForSchedule(
  scheduleId,
  { from, to, notify = true } = {}
) {
  const schedule = await TripSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  if (!schedule.active) throw new Error('Schedule is inactive');

  const dates = datesForSchedule(schedule, from, to);
  if (!dates.length) {
    return { created: [], skipped: [], conflicts: [], schedule };
  }

  const windowFrom = dates[0];
  const windowTo = dates[dates.length - 1];
  const holidayKeys = await loadHolidayKeys(schedule.schoolId, windowFrom, windowTo);
  const exceptions = await loadExceptionsByDate(schedule._id, windowFrom, windowTo);

  const created = [];
  const skipped = [];
  const conflicts = [];

  for (const serviceDate of dates) {
    const key = dateKey(serviceDate);
    if (holidayKeys.has(key)) {
      skipped.push({ serviceDate, reason: 'holiday' });
      continue;
    }

    const exception = exceptions.get(key);
    if (exception?.type === 'SKIP') {
      skipped.push({ serviceDate, reason: 'skip_exception' });
      continue;
    }

    // Do not recreate cancelled (or any existing) instance for this day
    const existing = await Trip.findOne({
      scheduleId: schedule._id,
      period: schedule.period,
      serviceDate: { $gte: startOfDay(serviceDate), $lte: endOfDay(serviceDate) },
    });
    if (existing) {
      skipped.push({
        serviceDate,
        tripId: existing._id,
        tripCode: existing.tripCode,
        reason: existing.status === 'cancelled' ? 'cancelled' : 'exists',
      });
      continue;
    }

    const payload = instancePayload(schedule, serviceDate, exception);
    payload.kidIds = await stripApprovedLeaveFromKids(payload.kidIds, serviceDate);
    const conflict = await findPeriodConflict({
      schoolId: payload.schoolId,
      busId: payload.busId,
      driverId: payload.driverId,
      serviceDate,
      period: payload.period,
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
    const trip = await Trip.create({ ...payload, tripCode, status: 'scheduled' });
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

const PROPAGATE_FIELDS = [
  'busId',
  'driverId',
  'routeId',
  'direction',
  'period',
  'kidIds',
  'scheduledTime',
];

/**
 * Apply schedule edit with scope.
 * THIS_OCCURRENCE → OVERRIDE exception + update that day's scheduled trip (no template change for ops fields).
 * THIS_AND_FUTURE / ENTIRE_SERIES → update template + scheduled trips in range.
 */
export async function applyScheduleEdit(scheduleId, body = {}) {
  const schedule = await TripSchedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');

  const scope = body.scope || EDIT_SCOPES.ENTIRE_SERIES;
  const serviceDate = body.serviceDate ? startOfDay(body.serviceDate) : null;
  const fromDate = body.fromDate ? startOfDay(body.fromDate) : serviceDate;
  const regenerate = body.regenerate !== false;

  const templateFields = [
    'name',
    'scheduleType',
    'customDays',
    'period',
    'direction',
    'routeId',
    'busId',
    'driverId',
    'scheduledTime',
    'startDate',
    'endDate',
    'kidIds',
    'active',
  ];

  const updated = [];
  const conflicts = [];
  let exception = null;

  if (scope === EDIT_SCOPES.THIS_OCCURRENCE) {
    if (!serviceDate) throw new Error('serviceDate is required for THIS_OCCURRENCE');

    exception = await ScheduleException.findOneAndUpdate(
      { scheduleId: schedule._id, serviceDate },
      {
        scheduleId: schedule._id,
        schoolId: schedule.schoolId,
        serviceDate,
        type: 'OVERRIDE',
        busId: body.busId ?? schedule.busId,
        driverId: body.driverId ?? schedule.driverId,
        kidIds: body.kidIds ?? schedule.kidIds,
        scheduledTime: body.scheduledTime ?? schedule.scheduledTime,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const trip = await Trip.findOne({
      scheduleId: schedule._id,
      period: schedule.period,
      serviceDate: { $gte: startOfDay(serviceDate), $lte: endOfDay(serviceDate) },
      status: 'scheduled',
    });

    if (trip) {
      const nextBus = exception.busId || schedule.busId;
      const nextDriver = exception.driverId || schedule.driverId;
      const conflict = await findPeriodConflict({
        schoolId: schedule.schoolId,
        busId: nextBus,
        driverId: nextDriver,
        serviceDate,
        period: schedule.period,
        excludeTripId: trip._id,
      });
      if (conflict) {
        conflicts.push({
          serviceDate,
          conflictTripCode: conflict.tripCode,
          bus: conflict.busId,
          driver: conflict.driverId,
        });
      } else {
        trip.busId = nextBus;
        trip.driverId = nextDriver;
        if (exception.kidIds?.length) trip.kidIds = exception.kidIds;
        trip.scheduledTime = normalizeClock(exception.scheduledTime || schedule.scheduledTime);
        trip.scheduledFor = scheduledForFrom(serviceDate, trip.scheduledTime);
        await trip.save();
        updated.push(trip);
      }
    }

    return { schedule, exception, updated, conflicts, generation: null };
  }

  // FUTURE / ENTIRE — update template
  for (const key of templateFields) {
    if (body[key] !== undefined) {
      if (key === 'startDate' || key === 'endDate') {
        schedule[key] = body[key] ? startOfDay(body[key]) : null;
      } else {
        schedule[key] = body[key];
      }
    }
  }
  await schedule.save();

  const tripFilter = {
    scheduleId: schedule._id,
    status: 'scheduled',
  };
  if (scope === EDIT_SCOPES.THIS_AND_FUTURE) {
    if (!fromDate) throw new Error('fromDate or serviceDate is required for THIS_AND_FUTURE');
    tripFilter.serviceDate = { $gte: fromDate };
  }

  const trips = await Trip.find(tripFilter);
  for (const trip of trips) {
    const nextBus = schedule.busId;
    const nextDriver = schedule.driverId;
    const conflict = await findPeriodConflict({
      schoolId: schedule.schoolId,
      busId: nextBus,
      driverId: nextDriver,
      serviceDate: trip.serviceDate,
      period: schedule.period,
      excludeTripId: trip._id,
    });
    if (conflict) {
      conflicts.push({
        serviceDate: trip.serviceDate,
        tripId: trip._id,
        conflictTripCode: conflict.tripCode,
        bus: conflict.busId,
        driver: conflict.driverId,
      });
      continue;
    }

    trip.busId = nextBus;
    trip.driverId = nextDriver;
    trip.routeId = schedule.routeId;
    trip.direction = schedule.direction;
    trip.period = schedule.period;
    trip.kidIds = schedule.kidIds || [];
    trip.scheduledTime = normalizeClock(schedule.scheduledTime);
    trip.scheduledFor = scheduledForFrom(trip.serviceDate, trip.scheduledTime);
    await trip.save();
    updated.push(trip);
  }

  let generation = null;
  if (regenerate && schedule.active) {
    const genFrom =
      scope === EDIT_SCOPES.THIS_AND_FUTURE && fromDate ? fromDate : schedule.startDate || new Date();
    generation = await generateInstancesForSchedule(schedule._id, {
      from: genFrom,
      notify: true,
    });
  }

  return { schedule, exception: null, updated, conflicts, generation };
}

export { PROPAGATE_FIELDS, EDIT_SCOPES };
