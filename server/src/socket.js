import jwt from 'jsonwebtoken';

let ioInstance = null;

export function getIO() {
  return ioInstance;
}

export function initSocket(io) {
  ioInstance = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    if ((socket.user.role === 'school_admin' || socket.user.role === 'staff') && socket.user.schoolId) {
      socket.join(`school:${socket.user.schoolId}`);
    }

    socket.on('trip:join', (tripId) => {
      if (tripId) socket.join(`trip:${tripId}`);
    });

    socket.on('trip:leave', (tripId) => {
      if (tripId) socket.leave(`trip:${tripId}`);
    });
  });

  return io;
}
