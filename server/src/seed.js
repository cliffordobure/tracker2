import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  User,
  School,
  Route,
  Stop,
  Kid,
  Bus,
  DriverProfile,
  TripSchedule,
  Trip,
  TripEvent,
  LocationPing,
  Notification,
  DeviceToken,
  SchoolHoliday,
  ScheduleException,
} from './models/index.js';
import {
  generateInstancesForSchedule,
  startOfDay,
} from './services/tripScheduleService.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';

async function seed() {
  await mongoose.connect(mongoUri);
  console.log('Connected. Clearing collections...');

  await Promise.all([
    User.deleteMany({}),
    School.deleteMany({}),
    Route.deleteMany({}),
    Stop.deleteMany({}),
    Kid.deleteMany({}),
    Bus.deleteMany({}),
    DriverProfile.deleteMany({}),
    TripSchedule.deleteMany({}),
    Trip.deleteMany({}),
    TripEvent.deleteMany({}),
    LocationPing.deleteMany({}),
    Notification.deleteMany({}),
    DeviceToken.deleteMany({}),
    SchoolHoliday.deleteMany({}),
    ScheduleException.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);

  const superAdmin = await User.create({
    email: 'admin@schooltracker.test',
    passwordHash,
    name: 'System Admin',
    role: 'super_admin',
    phone: '+254700000001',
  });

  // Rongai / Nairobi area sample coordinates
  const school = await School.create({
    name: 'Rongai Primary School',
    address: 'Ongata Rongai, Kajiado',
    location: { lat: -1.3965, lng: 36.7542 },
  });

  const schoolAdmin = await User.create({
    email: 'schooladmin@schooltracker.test',
    passwordHash,
    name: 'School Admin',
    role: 'school_admin',
    phone: '+254700000002',
    schoolId: school._id,
  });

  const parent1 = await User.create({
    email: 'parent1@schooltracker.test',
    passwordHash,
    name: 'Alice Wanjiku',
    role: 'parent',
    phone: '+254700000011',
    schoolId: school._id,
  });

  const parent2 = await User.create({
    email: 'parent2@schooltracker.test',
    passwordHash,
    name: 'Brian Otieno',
    role: 'parent',
    phone: '+254700000012',
    schoolId: school._id,
  });

  const driverUser = await User.create({
    email: 'driver@schooltracker.test',
    passwordHash,
    name: 'Daniel Kamau',
    role: 'driver',
    phone: '+254700000021',
    schoolId: school._id,
  });

  const teacher = await User.create({
    email: 'teacher@schooltracker.test',
    passwordHash,
    name: 'Grace Njeri',
    role: 'teacher',
    phone: '+254700000031',
    schoolId: school._id,
  });

  const bus = await Bus.create({
    schoolId: school._id,
    plate: 'KDA 123A',
    label: 'Bus 1',
    model: 'Toyota Hiace',
    color: 'White',
    seats: 12,
  });

  const route = await Route.create({
    schoolId: school._id,
    name: 'Route A — Pipeline',
    description: 'Morning pickups along Pipeline corridor to school; evening reverse',
  });

  const schoolStop = await Stop.create({
    routeId: route._id,
    name: 'Rongai Primary Gate',
    type: 'school',
    order: 0,
    location: { lat: -1.3965, lng: 36.7542 },
  });

  const home1 = await Stop.create({
    routeId: route._id,
    name: 'Pipeline Stage',
    type: 'home',
    order: 1,
    location: { lat: -1.389, lng: 36.742 },
  });

  const home2 = await Stop.create({
    routeId: route._id,
    name: 'Tusia Area',
    type: 'home',
    order: 2,
    location: { lat: -1.402, lng: 36.738 },
  });

  await DriverProfile.create({
    userId: driverUser._id,
    vehiclePlate: bus.plate,
    vehicleModel: bus.model,
    vehicleColor: bus.color,
    busId: bus._id,
    assignedRouteIds: [route._id],
  });

  const kid1 = await Kid.create({
    name: 'Emma Wanjiku',
    schoolId: school._id,
    parentIds: [parent1._id],
    routeId: route._id,
    homeStopId: home1._id,
    grade: 'Grade 4',
  });

  const kid2 = await Kid.create({
    name: 'Leo Otieno',
    schoolId: school._id,
    parentIds: [parent2._id],
    routeId: route._id,
    homeStopId: home2._id,
    grade: 'Grade 3',
  });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  const morningSchedule = await TripSchedule.create({
    schoolId: school._id,
    name: 'Weekday morning — Route A',
    scheduleType: 'WEEKDAYS',
    period: 'morning',
    direction: 'to_school',
    routeId: route._id,
    busId: bus._id,
    driverId: driverUser._id,
    scheduledTime: '06:30',
    startDate,
    endDate,
    kidIds: [kid1._id, kid2._id],
    active: true,
  });

  // Sample holiday ~3 weekdays ahead (or next Monday if weekend)
  const holidayDate = new Date(startDate);
  holidayDate.setDate(holidayDate.getDate() + 3);
  while (holidayDate.getDay() === 0 || holidayDate.getDay() === 6) {
    holidayDate.setDate(holidayDate.getDate() + 1);
  }
  await SchoolHoliday.create({
    schoolId: school._id,
    date: startOfDay(holidayDate),
    name: 'Staff development day',
    active: true,
  });

  const generation = await generateInstancesForSchedule(morningSchedule._id, {
    notify: false,
  });

  // SKIP exception on first generated weekday instance (if any)
  const firstWeekday = await Trip.findOne({
    scheduleId: morningSchedule._id,
    status: 'scheduled',
  }).sort({ serviceDate: 1 });
  if (firstWeekday) {
    await ScheduleException.create({
      scheduleId: morningSchedule._id,
      schoolId: school._id,
      serviceDate: startOfDay(firstWeekday.serviceDate),
      type: 'SKIP',
    });
    firstWeekday.status = 'cancelled';
    await firstWeekday.save();
  }

  // Ensure a runnable instance exists on weekends too (WEEKDAYS skips Sat/Sun).
  const todaySchedule = await TripSchedule.create({
    schoolId: school._id,
    name: 'Today demo — Route A',
    scheduleType: 'ONE_TIME',
    period: 'morning',
    direction: 'to_school',
    routeId: route._id,
    busId: bus._id,
    driverId: driverUser._id,
    scheduledTime: '07:00',
    startDate,
    endDate: startDate,
    kidIds: [kid1._id, kid2._id],
    active: true,
  });
  const todayGen = await generateInstancesForSchedule(todaySchedule._id, {
    notify: false,
  });

  console.log('\nSeed complete.\n');
  console.log('Login accounts (password: password123):');
  console.log(`  Super admin:  ${superAdmin.email}`);
  console.log(`  School admin: ${schoolAdmin.email}`);
  console.log(`  Driver:       ${driverUser.email}`);
  console.log(`  Teacher:      ${teacher.email}`);
  console.log(`  Parent:       ${parent1.email} (child: ${kid1.name})`);
  console.log(`  Parent:       ${parent2.email} (child: ${kid2.name})`);
  console.log(`\nSchool: ${school.name}`);
  console.log(`Bus:    ${bus.label} (${bus.plate}) — ${bus.seats} seats`);
  console.log(`Route:  ${route.name}`);
  console.log(`Stops:  ${schoolStop.name}, ${home1.name}, ${home2.name}`);
  console.log(
    `Schedule: ${morningSchedule.name} → ${generation.created.length} instances (skipped ${generation.skipped.length}, conflicts ${generation.conflicts.length})`
  );
  console.log(`Holiday: Staff development day on ${holidayDate.toLocaleDateString()}`);
  if (firstWeekday) {
    console.log(`SKIP exception on ${new Date(firstWeekday.serviceDate).toLocaleDateString()}`);
  }
  console.log(
    `Today demo: ${todaySchedule.name} → ${todayGen.created.length} instances (conflicts ${todayGen.conflicts.length})`
  );

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
