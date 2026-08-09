import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

export const requireSuperAdmin = requireRole('super_admin');
export const requireSchoolStaff = requireRole('super_admin', 'school_admin');

export async function attachUser(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    req.dbUser = user;
    return next();
  } catch {
    return res.status(500).json({ error: 'Failed to load user' });
  }
}
