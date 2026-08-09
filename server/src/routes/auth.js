import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      schoolId: user.schoolId?.toString?.() || user.schoolId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/register', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'school_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can register users' });
    }

    const { email, password, name, role, phone, schoolId } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name, and role are required' });
    }

    const allowed =
      req.user.role === 'super_admin'
        ? ['super_admin', 'school_admin', 'driver', 'parent', 'teacher']
        : ['driver', 'parent', 'teacher'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    let resolvedSchoolId = schoolId || null;
    if (req.user.role === 'school_admin') {
      resolvedSchoolId = req.user.schoolId;
    }
    if (['school_admin', 'driver', 'parent', 'teacher'].includes(role) && !resolvedSchoolId) {
      return res.status(400).json({ error: 'schoolId is required for this role' });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
      phone: phone || '',
      schoolId: resolvedSchoolId,
    });

    return res.status(201).json({ user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
