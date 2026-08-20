const API = process.env.API_URL || 'http://localhost:4001';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status}`);
  return data;
}

async function main() {
  const health = await req('/health');
  console.log('health', health);

  const driver = await req('/auth/login', {
    method: 'POST',
    body: { email: 'driver@schooltracker.test', password: 'password123' },
  });
  console.log('driver', driver.user.name);

  const { routes } = await req('/driver/routes', { token: driver.token });
  console.log('routes', routes.length, routes[0]?.name);
  const routeId = routes[0]._id;

  // complete any existing active trip first
  const active = await req('/driver/trips/active', { token: driver.token });
  if (active.trip) {
    await req(`/trips/${active.trip._id}/complete`, { method: 'POST', token: driver.token });
    console.log('completed previous active trip');
  }

  const { trip } = await req('/trips', {
    method: 'POST',
    token: driver.token,
    body: { routeId, direction: 'to_home' },
  });
  console.log('trip', trip._id, trip.status, 'kids', trip.kidIds.length);

  const kidId = trip.kidIds[0]._id;
  await req(`/trips/${trip._id}/kids/${kidId}/check-in`, { method: 'POST', token: driver.token });
  await req(`/trips/${trip._id}/start`, { method: 'POST', token: driver.token });

  await req(`/trips/${trip._id}/location`, {
    method: 'POST',
    token: driver.token,
    body: { lat: -1.39, lng: 36.74 },
  });

  await req(`/trips/${trip._id}/kids/${kidId}/dropoff`, { method: 'POST', token: driver.token });
  await req(`/trips/${trip._id}/complete`, { method: 'POST', token: driver.token });

  const parent = await req('/auth/login', {
    method: 'POST',
    body: { email: 'parent1@schooltracker.test', password: 'password123' },
  });
  const { notifications } = await req('/parent/notifications', { token: parent.token });
  console.log(
    'parent notifications',
    notifications.length,
    notifications.slice(0, 4).map((n) => n.type)
  );

  const admin = await req('/auth/login', {
    method: 'POST',
    body: { email: 'admin@schooltracker.test', password: 'password123' },
  });
  const dash = await req('/admin/dashboard', { token: admin.token });
  console.log('admin dashboard', dash);
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
