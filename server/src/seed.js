import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  User,
  School,
  Route,
  Stop,
  Kid,
  DriverProfile,
  Trip,
  TripEvent,
  LocationPing,
  Notification,
} from './models/index.js';

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
    DriverProfile.deleteMany({}),
    Trip.deleteMany({}),
    TripEvent.deleteMany({}),
    LocationPing.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await User.create({
    email: 'admin@schooltracker.test',
    passwordHash,
    name: 'System Admin',
    role: 'admin',
    phone: '+254700000001',
  });

  const parent1 = await User.create({
    email: 'parent1@schooltracker.test',
    passwordHash,
    name: 'Alice Wanjiku',
    role: 'parent',
    phone: '+254700000011',
  });

  const parent2 = await User.create({
    email: 'parent2@schooltracker.test',
    passwordHash,
    name: 'Brian Otieno',
    role: 'parent',
    phone: '+254700000012',
  });

  const driverUser = await User.create({
    email: 'driver@schooltracker.test',
    passwordHash,
    name: 'Daniel Kamau',
    role: 'driver',
    phone: '+254700000021',
  });

  // Rongai / Nairobi area sample coordinates
  const school = await School.create({
    name: 'Rongai Primary School',
    address: 'Ongata Rongai, Kajiado',
    location: { lat: -1.3965, lng: 36.7542 },
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
    vehiclePlate: 'KDA 123A',
    vehicleModel: 'Toyota Hiace',
    vehicleColor: 'White',
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

  console.log('\nSeed complete.\n');
  console.log('Login accounts (password: password123):');
  console.log(`  Admin:  ${admin.email}`);
  console.log(`  Driver: ${driverUser.email}`);
  console.log(`  Parent: ${parent1.email} (child: ${kid1.name})`);
  console.log(`  Parent: ${parent2.email} (child: ${kid2.name})`);
  console.log(`\nSchool: ${school.name}`);
  console.log(`Route:  ${route.name}`);
  console.log(`Stops:  ${schoolStop.name}, ${home1.name}, ${home2.name}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
