import 'dart:math' as math;
import 'package:latlong2/latlong.dart';

List<Map<String, dynamic>> orderedStops(
  List<Map<String, dynamic>> stops,
  String? direction,
) {
  final list = [...stops];
  final school = list.where((s) => s['type'] == 'school').toList()
    ..sort((a, b) => ((a['order'] ?? 0) as num).compareTo((b['order'] ?? 0) as num));
  final homes = list.where((s) => s['type'] != 'school').toList()
    ..sort((a, b) => ((a['order'] ?? 0) as num).compareTo((b['order'] ?? 0) as num));
  // Only one school pin on the map
  final schoolOne = school.isEmpty ? <Map<String, dynamic>>[] : [school.first];
  if (direction == 'to_home') return [...schoolOne, ...homes];
  return [...homes, ...schoolOne];
}

/// Keep school + boarding/drop stops for [kids] on this trip (not every old route stop).
List<Map<String, dynamic>> stopsForTripKids(
  List<Map<String, dynamic>> stops,
  List<Map<String, dynamic>> kids,
) {
  final homeIds = <String>{};
  for (final kid in kids) {
    final raw = kid['homeStopId'];
    final id = raw is Map ? raw['_id']?.toString() : raw?.toString();
    if (id != null && id.isNotEmpty) homeIds.add(id);
  }

  final school = stops.where((s) => s['type'] == 'school').toList()
    ..sort((a, b) => ((a['order'] ?? 0) as num).compareTo((b['order'] ?? 0) as num));
  final homes = stops.where((s) {
    if (s['type'] == 'school') return false;
    final id = s['_id']?.toString();
    return id != null && homeIds.contains(id);
  }).toList()
    ..sort((a, b) => ((a['order'] ?? 0) as num).compareTo((b['order'] ?? 0) as num));

  // Dedupe homes that land on nearly the same point
  final deduped = <Map<String, dynamic>>[];
  for (final stop in homes) {
    final loc = latLngFrom(stop['location']);
    if (loc == null) continue;
    final near = deduped.any((kept) {
      final kLoc = latLngFrom(kept['location']);
      return kLoc != null && distanceMeters(kLoc, loc) < 35;
    });
    if (!near) deduped.add(stop);
  }

  return [
    if (school.isNotEmpty) school.first,
    ...deduped,
  ];
}

LatLng? latLngFrom(dynamic location) {
  if (location is! Map) return null;
  final lat = (location['lat'] as num?)?.toDouble();
  final lng = (location['lng'] as num?)?.toDouble();
  if (lat == null || lng == null) return null;
  return LatLng(lat, lng);
}

List<LatLng> stopLatLngs(List<Map<String, dynamic>> stops) {
  return stops.map((s) => latLngFrom(s['location'])).whereType<LatLng>().toList();
}

LatLng lerpLatLng(LatLng a, LatLng b, double t) {
  return LatLng(
    a.latitude + (b.latitude - a.latitude) * t,
    a.longitude + (b.longitude - a.longitude) * t,
  );
}

/// Bearing in degrees (0 = north, clockwise) from [from] to [to].
double bearingDegrees(LatLng from, LatLng to) {
  final lat1 = from.latitude * math.pi / 180;
  final lat2 = to.latitude * math.pi / 180;
  final dLng = (to.longitude - from.longitude) * math.pi / 180;
  final y = math.sin(dLng) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

double shortestAngleDelta(double from, double to) {
  var d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/// Destination point [meters] away from [from] at [bearingDegrees] (0=N).
LatLng destinationPoint(LatLng from, double bearingDegrees, double meters) {
  const R = 6371000.0;
  final brng = bearingDegrees * math.pi / 180;
  final lat1 = from.latitude * math.pi / 180;
  final lng1 = from.longitude * math.pi / 180;
  final angDist = meters / R;

  final lat2 = math.asin(
    math.sin(lat1) * math.cos(angDist) +
        math.cos(lat1) * math.sin(angDist) * math.cos(brng),
  );
  final lng2 = lng1 +
      math.atan2(
        math.sin(brng) * math.sin(angDist) * math.cos(lat1),
        math.cos(angDist) - math.sin(lat1) * math.sin(lat2),
      );

  return LatLng(lat2 * 180 / math.pi, lng2 * 180 / math.pi);
}

/// Evenly spaced points covering [meters] along [bearingDegrees].
List<LatLng> buildTestDrivePath(
  LatLng start, {
  double meters = 1000,
  double bearingDegrees = 45,
  int steps = 25,
}) {
  final points = <LatLng>[];
  for (var i = 1; i <= steps; i++) {
    final dist = meters * (i / steps);
    points.add(destinationPoint(start, bearingDegrees, dist));
  }
  return points;
}

double distanceMeters(LatLng a, LatLng b) {
  const R = 6371000.0;
  final dLat = (b.latitude - a.latitude) * math.pi / 180;
  final dLng = (b.longitude - a.longitude) * math.pi / 180;
  final lat1 = a.latitude * math.pi / 180;
  final lat2 = b.latitude * math.pi / 180;
  final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1) * math.cos(lat2) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * R * math.asin(math.sqrt(h));
}

int nearestIndexOnRoute(List<LatLng> route, LatLng point) {
  var best = 0;
  var bestDist = double.infinity;
  for (var i = 0; i < route.length; i++) {
    final d = distanceMeters(route[i], point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/// Walk ~[meters] along an existing road polyline starting near [from].
List<LatLng> walkAlongRoad(
  List<LatLng> route,
  LatLng from, {
  double meters = 1000,
}) {
  if (route.length < 2) return const [];

  var idx = nearestIndexOnRoute(route, from);
  // Prefer moving forward along the route
  if (idx >= route.length - 2) idx = 0;

  final points = <LatLng>[];
  var traveled = 0.0;
  var cursor = from;

  // First hop onto the nearest road vertex ahead
  if (distanceMeters(cursor, route[idx]) > 3) {
    points.add(route[idx]);
    traveled += distanceMeters(cursor, route[idx]);
    cursor = route[idx];
  }

  for (var i = idx; i < route.length - 1 && traveled < meters; i++) {
    final next = route[i + 1];
    final seg = distanceMeters(cursor, next);
    if (seg < 0.5) continue;

    if (traveled + seg <= meters) {
      points.add(next);
      traveled += seg;
      cursor = next;
      continue;
    }

    // Partial last segment to hit exactly ~meters
    final remain = meters - traveled;
    final t = remain / seg;
    final end = lerpLatLng(cursor, next, t);
    points.add(end);
    break;
  }

  // If we were near the end, reverse and walk the other way
  if (points.length < 3 && idx > 1) {
    points.clear();
    traveled = 0;
    cursor = from;
    for (var i = idx; i > 0 && traveled < meters; i--) {
      final next = route[i - 1];
      final seg = distanceMeters(cursor, next);
      if (seg < 0.5) continue;
      if (traveled + seg <= meters) {
        points.add(next);
        traveled += seg;
        cursor = next;
      } else {
        points.add(lerpLatLng(cursor, next, (meters - traveled) / seg));
        break;
      }
    }
  }

  return points;
}

/// Insert points every [stepMeters] so motion stays smooth around corners.
List<LatLng> densifyPath(List<LatLng> path, {double stepMeters = 12}) {
  if (path.length < 2) return path;
  final out = <LatLng>[path.first];
  for (var i = 0; i < path.length - 1; i++) {
    final a = path[i];
    final b = path[i + 1];
    final d = distanceMeters(a, b);
    if (d <= stepMeters) {
      out.add(b);
      continue;
    }
    final n = (d / stepMeters).ceil();
    for (var k = 1; k <= n; k++) {
      out.add(lerpLatLng(a, b, k / n));
    }
  }
  final cleaned = <LatLng>[out.first];
  for (var i = 1; i < out.length; i++) {
    if (distanceMeters(cleaned.last, out[i]) >= 1) cleaned.add(out[i]);
  }
  return cleaned;
}

/// True when the heading change at [i] is a noticeable corner.
bool isCorner(List<LatLng> path, int i, {double thresholdDeg = 28}) {
  if (i <= 0 || i >= path.length - 1) return false;
  final inB = bearingDegrees(path[i - 1], path[i]);
  final outB = bearingDegrees(path[i], path[i + 1]);
  return shortestAngleDelta(inB, outB).abs() >= thresholdDeg;
}

double pathLengthMeters(List<LatLng> path) {
  var total = 0.0;
  for (var i = 0; i < path.length - 1; i++) {
    total += distanceMeters(path[i], path[i + 1]);
  }
  return total;
}

/// Point at [metersAlong] along [path] from the start.
LatLng pointAtDistance(List<LatLng> path, double metersAlong) {
  if (path.isEmpty) return const LatLng(0, 0);
  if (path.length == 1 || metersAlong <= 0) return path.first;

  var remaining = metersAlong;
  for (var i = 0; i < path.length - 1; i++) {
    final seg = distanceMeters(path[i], path[i + 1]);
    if (seg < 0.01) continue;
    if (remaining <= seg) {
      return lerpLatLng(path[i], path[i + 1], remaining / seg);
    }
    remaining -= seg;
  }
  return path.last;
}

/// Bearing (degrees) at [metersAlong] along [path].
double bearingAtDistance(List<LatLng> path, double metersAlong) {
  if (path.length < 2) return 0;
  var remaining = metersAlong;
  for (var i = 0; i < path.length - 1; i++) {
    final seg = distanceMeters(path[i], path[i + 1]);
    if (seg < 0.01) continue;
    if (remaining <= seg) {
      return bearingDegrees(path[i], path[i + 1]);
    }
    remaining -= seg;
  }
  return bearingDegrees(path[path.length - 2], path.last);
}
