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

router.put('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      user.name = name.slice(0, 80);
    }
    if (req.body.phone !== undefined) user.phone = String(req.body.phone || '').trim().slice(0, 40);
    if (req.body.photoUrl !== undefined) user.photoUrl = String(req.body.photoUrl || '').trim();
    if (req.body.photoPublicId !== undefined) user.photoPublicId = String(req.body.photoPublicId || '').trim();
    if (req.body.aboutMe !== undefined) user.aboutMe = String(req.body.aboutMe || '').trim().slice(0, 800);
    if (req.body.dateOfBirth !== undefined) {
      const raw = req.body.dateOfBirth;
      user.dateOfBirth = raw ? new Date(raw) : null;
    }
    if (req.body.gender !== undefined) {
      const gender = String(req.body.gender || '').trim().toLowerCase();
      user.gender = ['female', 'male', 'other'].includes(gender) ? gender : '';
    }
    if (req.body.nationality !== undefined) user.nationality = String(req.body.nationality || '').trim().slice(0, 60);
    if (req.body.idNumber !== undefined) user.idNumber = String(req.body.idNumber || '').trim().slice(0, 40);
    if (req.body.yearsOfService !== undefined) {
      const n = Number(req.body.yearsOfService);
      user.yearsOfService = Number.isFinite(n) ? Math.max(0, Math.min(60, Math.round(n))) : 0;
    }
    if (req.body.jobTitle !== undefined) user.jobTitle = String(req.body.jobTitle || 'Class Teacher').trim().slice(0, 80);
    if (req.body.twoFactorEnabled !== undefined) user.twoFactorEnabled = req.body.twoFactorEnabled === true;
    if (req.body.language !== undefined) user.language = String(req.body.language || 'English').trim().slice(0, 40);
    if (req.body.theme !== undefined) {
      const theme = String(req.body.theme || 'system').trim().toLowerCase();
      user.theme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
    }
    if (req.body.preferences && typeof req.body.preferences === 'object') {
      const next = req.body.preferences;
      user.preferences = user.preferences || {};
      for (const key of [
        'notifyTrips',
        'notifyDiary',
        'notifyAnnouncements',
        'notifyMessages',
        'notifyLeave',
        'emailUpdates',
        'smsUpdates',
        'calendarSync',
        'quietHours',
      ]) {
        if (typeof next[key] === 'boolean') user.preferences[key] = next[key];
      }
      if (next.quietHoursStart !== undefined) {
        const v = String(next.quietHoursStart || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(v)) user.preferences.quietHoursStart = v.length === 4 ? `0${v}` : v;
      }
      if (next.quietHoursEnd !== undefined) {
        const v = String(next.quietHoursEnd || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(v)) user.preferences.quietHoursEnd = v.length === 4 ? `0${v}` : v;
      }
      if (next.distanceUnit !== undefined) {
        user.preferences.distanceUnit = String(next.distanceUnit) === 'mi' ? 'mi' : 'km';
      }
      if (next.timeFormat !== undefined) {
        user.preferences.timeFormat = String(next.timeFormat) === '24' ? '24' : '12';
      }
      user.markModified('preferences');
    }

    await user.save();
    return res.json({ user: user.toSafeJSON() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/password', authenticate, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
