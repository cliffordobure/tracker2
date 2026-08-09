import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

String _periodLabel(Map<String, dynamic> t) {
  final period = t['period'] as String?;
  if (period == 'morning' || period == 'afternoon' || period == 'evening') {
    return period!;
  }
  return t['direction'] == 'to_school' ? 'morning' : 'evening';
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  List<Map<String, dynamic>> routes = [];
  List<Map<String, dynamic>> todayTrips = [];
  Map<String, dynamic>? trip;
  List<Map<String, dynamic>> kids = [];
  List<Map<String, dynamic>> stops = [];
  List<Map<String, dynamic>> events = [];
  List<LatLng> routePoints = [];
  LatLng? bus;
  double? busHeading;
  int followNonce = 0;
  bool loading = true;
  bool sharingLocation = false;
  String? message;
  StreamSubscription<Position>? gpsSub;
  Timer? _gpsHeartbeat;
  Position? _lastGps;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _gpsHeartbeat?.cancel();
    gpsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() => loading = true);
    try {
      final data = await auth.api.get('/driver/routes');
      routes = List<Map<String, dynamic>>.from(data['routes'] as List? ?? []);
      final today = await auth.api.get('/driver/trips/today');
      todayTrips = List<Map<String, dynamic>>.from(today['trips'] as List? ?? []);
      Map<String, dynamic>? activeFromToday;
      for (final t in todayTrips) {
        if (t['status'] == 'active') {
          activeFromToday = t;
          break;
        }
      }
      final active = await auth.api.get('/driver/trips/active');
      if (activeFromToday != null) {
        await _openTrip(Map<String, dynamic>.from(activeFromToday));
      } else if (active['trip'] != null) {
        await _openTrip(Map<String, dynamic>.from(active['trip'] as Map));
      }
    } catch (e) {
      message = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _openTrip(Map<String, dynamic> t) async {
    final auth = context.read<AuthState>();
    final detail = await auth.api.get('/trips/${t['_id']}');
    trip = Map<String, dynamic>.from(detail['trip'] as Map);
    final allStops = List<Map<String, dynamic>>.from(detail['stops'] as List? ?? []);
    events = List<Map<String, dynamic>>.from(detail['events'] as List? ?? []);
    kids = List<Map<String, dynamic>>.from(trip!['kidIds'] as List? ?? []);
    stops = stopsForTripKids(allStops, kids);
    final ordered = orderedStops(stops, trip!['direction'] as String?);
    routePoints = await fetchRoadRoute(stopLatLngs(ordered));
    bus = latLngFrom(trip!['latestLocation']) ??
        (routePoints.isNotEmpty ? routePoints.first : null);
    await _startGps();
    setState(() {});
  }

  Future<void> _startTrip(String routeId, String direction) async {
    final auth = context.read<AuthState>();
    try {
      final created = await auth.api.post('/trips', {
        'routeId': routeId,
        'direction': direction,
      });
      await _openTrip(Map<String, dynamic>.from(created['trip'] as Map));
      setState(() => message = 'Trip started — sharing live GPS');
    } catch (e) {
      setState(() => message = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _startScheduled(String tripId) async {
    final auth = context.read<AuthState>();
    try {
      final body = <String, dynamic>{};
      if (_lastGps != null) {
        body['lat'] = _lastGps!.latitude;
        body['lng'] = _lastGps!.longitude;
        body['heading'] = _lastGps!.heading;
        body['speed'] = _lastGps!.speed;
      }
      final started = await auth.api.post('/trips/$tripId/start', body);
      await _openTrip(Map<String, dynamic>.from(started['trip'] as Map));
      setState(() => message = 'Trip started — sharing live GPS');
    } catch (e) {
      setState(() => message = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _pushLocation(double lat, double lng, {double? heading, double? speed}) async {
    if (trip == null) return;
    final auth = context.read<AuthState>();
    try {
      await auth.api.post('/trips/${trip!['_id']}/location', {
        'lat': lat,
        'lng': lng,
        if (heading != null) 'heading': heading,
        if (speed != null) 'speed': speed,
      });
    } catch (_) {}
  }

  Future<void> _startGps() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) {
        setState(() {
          sharingLocation = false;
          message = 'Turn on location services to share live GPS';
        });
      }
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) {
        setState(() {
          sharingLocation = false;
          message = 'Location permission needed for parents to track you';
        });
      }
      return;
    }

    await gpsSub?.cancel();
    _gpsHeartbeat?.cancel();

    try {
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      _lastGps = current;
      if (mounted) {
        setState(() {
          bus = LatLng(current.latitude, current.longitude);
          if (current.heading >= 0) busHeading = current.heading;
          sharingLocation = true;
          message = 'Sharing live location with parents';
          followNonce++;
        });
        await _pushLocation(
          current.latitude,
          current.longitude,
          heading: current.heading,
          speed: current.speed,
        );
      }
    } catch (_) {}

    gpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 4,
      ),
    ).listen((pos) async {
      if (!mounted || trip == null) return;
      _lastGps = pos;
      setState(() {
        bus = LatLng(pos.latitude, pos.longitude);
        if (pos.heading >= 0) busHeading = pos.heading;
        sharingLocation = true;
      });
      await _pushLocation(
        pos.latitude,
        pos.longitude,
        heading: pos.heading,
        speed: pos.speed,
      );
    });

    _gpsHeartbeat = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!mounted || trip == null || _lastGps == null) return;
      await _pushLocation(
        _lastGps!.latitude,
        _lastGps!.longitude,
        heading: _lastGps!.heading,
        speed: _lastGps!.speed,
      );
    });

    if (mounted) {
      setState(() {
        sharingLocation = true;
        message = 'Sharing live location with parents';
      });
    }
  }

  bool _hasEvent(String kidId, String type) => events.any((e) {
        final id = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
        return id == kidId && e['type'] == type;
      });

  Future<void> _pickup(String kidId) async {
    final auth = context.read<AuthState>();
    final res = await auth.api.post('/trips/${trip!['_id']}/kids/$kidId/pickup');
    events.add(Map<String, dynamic>.from(res['event'] as Map));
    setState(() => message = 'Picked up — parent can now track live');
  }

  Future<void> _dropoff(String kidId) async {
    final auth = context.read<AuthState>();
    final res = await auth.api.post('/trips/${trip!['_id']}/kids/$kidId/dropoff');
    events.add(Map<String, dynamic>.from(res['event'] as Map));
    setState(() => message = 'Dropped off');
  }

  Future<void> _complete() async {
    final auth = context.read<AuthState>();
    _gpsHeartbeat?.cancel();
    try {
      final body = <String, dynamic>{};
      if (_lastGps != null) {
        body['lat'] = _lastGps!.latitude;
        body['lng'] = _lastGps!.longitude;
      } else if (bus != null) {
        body['lat'] = bus!.latitude;
        body['lng'] = bus!.longitude;
      }
      await auth.api.post('/trips/${trip!['_id']}/complete', body);
      await gpsSub?.cancel();
      setState(() {
        trip = null;
        kids = [];
        stops = [];
        events = [];
        routePoints = [];
        bus = null;
        sharingLocation = false;
        message = 'Trip completed';
      });
      await _load();
    } catch (e) {
      setState(() => message = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ?? const LatLng(-1.3965, 36.7542);
    final liveMap = trip != null && sharingLocation;

    return Scaffold(
      body: Stack(
        children: [
          RideMap(
            center: center,
            busLocation: bus,
            busHeading: busHeading,
            routePoints: routePoints,
            stops: stops,
            followNonce: followNonce,
            continuous: liveMap,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  RoundMapButton(icon: Icons.close_rounded, onTap: auth.logout),
                  const Spacer(),
                  FloatingPill(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: sharingLocation ? AppColors.accent : AppColors.muted,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          trip == null
                              ? 'Driver offline'
                              : sharingLocation
                                  ? 'Live GPS on'
                                  : 'GPS off',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  RoundMapButton(
                    icon: Icons.my_location_rounded,
                    onTap: () => setState(() => followNonce++),
                  ),
                ],
              ),
            ),
          ),
          RideSheet(
            initialSize: trip == null ? 0.42 : 0.4,
            maxSize: 0.8,
            child: loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.ink))
                : trip == null
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Today\'s trips',
                            style: TextStyle(
                                fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Start your assigned instance — GPS updates parents once kids are onboard.',
                            style: TextStyle(color: AppColors.muted),
                          ),
                          if (message != null) ...[
                            const SizedBox(height: 10),
                            StatusChip(text: message!),
                          ],
                          const SizedBox(height: 18),
                          if (todayTrips.where((t) => t['status'] == 'scheduled').isNotEmpty) ...[
                            ...todayTrips.where((t) => t['status'] == 'scheduled').map((st) {
                              final label = _periodLabel(st);
                              final code = st['tripCode'] ?? 'Trip';
                              final routeName = st['routeId'] is Map
                                  ? st['routeId']['name']
                                  : 'Route';
                              final kidCount = (st['kidIds'] as List?)?.length ?? 0;
                              return Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: AppColors.softBg,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '$code · $routeName',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800, fontSize: 17),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '$kidCount students · $label',
                                      style: const TextStyle(color: AppColors.muted),
                                    ),
                                    const SizedBox(height: 12),
                                    BoltPrimaryButton(
                                      label: 'Start $label trip',
                                      onPressed: () =>
                                          _startScheduled(st['_id'].toString()),
                                    ),
                                  ],
                                ),
                              );
                            }),
                            const SizedBox(height: 8),
                          ],
                          ...routes.map((r) {
                            return Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.softBg,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    r['name'] ?? 'Route',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800, fontSize: 17),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${(r['kids'] as List?)?.length ?? 0} kids · ad-hoc fallback',
                                    style: const TextStyle(color: AppColors.muted),
                                  ),
                                  const SizedBox(height: 14),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: BoltPrimaryButton(
                                          label: 'Morning',
                                          onPressed: () =>
                                              _startTrip(r['_id'], 'to_school'),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: OutlinedButton(
                                          onPressed: () =>
                                              _startTrip(r['_id'], 'to_home'),
                                          child: const Text('Evening'),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  trip!['routeId'] is Map
                                      ? trip!['routeId']['name']
                                      : 'Active trip',
                                  style: const TextStyle(
                                      fontSize: 24, fontWeight: FontWeight.w800),
                                ),
                              ),
                              StatusChip(
                                text: trip!['direction'] == 'to_school'
                                    ? 'To school'
                                    : 'To home',
                              ),
                            ],
                          ),
                          if (message != null) ...[
                            const SizedBox(height: 8),
                            StatusChip(text: message!),
                          ],
                          const SizedBox(height: 14),
                          if (!sharingLocation)
                            BoltPrimaryButton(
                              label: 'Enable live GPS',
                              onPressed: _startGps,
                            )
                          else
                            const StatusChip(
                              text: 'Live GPS sharing',
                              color: AppColors.accentDark,
                            ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: _complete,
                            child: Text(
                              'Complete ${_periodLabel(trip!)} trip',
                            ),
                          ),
                          const SizedBox(height: 18),
                          const Text('Passengers',
                              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          const SizedBox(height: 10),
                          ...kids.map((kid) {
                            final id = kid['_id'] as String? ?? kid.toString();
                            final name = kid['name'] as String? ?? 'Kid';
                            final picked = _hasEvent(id, 'picked_up');
                            final dropped = _hasEvent(id, 'dropped_off');
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                border: Border.all(color: const Color(0xFFE5E7EB)),
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(name,
                                            style: const TextStyle(fontWeight: FontWeight.w700)),
                                        Text(
                                          dropped
                                              ? 'Dropped off'
                                              : picked
                                                  ? 'On the bus · parent tracking'
                                                  : 'Waiting at stop',
                                          style: const TextStyle(
                                              color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: picked ? null : () => _pickup(id),
                                    child: const Text('Pick up'),
                                  ),
                                  TextButton(
                                    onPressed: (!picked || dropped) ? null : () => _dropoff(id),
                                    child: const Text('Drop'),
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}
