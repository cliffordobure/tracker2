import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import driverRoutes from './routes/driver.js';
import parentRoutes from './routes/parent.js';
import teacherRoutes from './routes/teacher.js';
import tripRoutes from './routes/trips.js';

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Vite often picks 5173/5174/5175 when ports are busy
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});
initSocket(io);

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'school-kids-tracker-api' });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/driver', driverRoutes);
app.use('/parent', parentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/trips', tripRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 4001);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_kids_tracker';

async function start() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
