import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class ParentHomeScreen extends StatefulWidget {
  const ParentHomeScreen({super.key});

  @override
  State<ParentHomeScreen> createState() => _ParentHomeScreenState();
}

class _ParentHomeScreenState extends State<ParentHomeScreen> {
  List<Map<String, dynamic>> kids = [];
  Map<String, dynamic>? active;
  List<Map<String, dynamic>> events = [];
  List<LatLng> routePoints = [];
  LatLng? bus;
  double? busHeading;
  String? status;
  bool loading = true;
  int followNonce = 0;
  String? _boundTripId;
  bool _listenersBound = false;
  AuthState? _auth;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _auth = context.read<AuthState>();
      _bindSocketListeners();
      _load();
    });
  }

  @override
  void dispose() {
    final auth = _auth;
    if (auth != null) {
      _unbindSocketListeners(auth);
      if (_boundTripId != null) auth.sockets.leaveTrip(_boundTripId!);
    }
    super.dispose();
  }

  void _bindSocketListeners() {
    if (_listenersBound || _auth == null) return;
    final sockets = _auth!.sockets;
    sockets.on('trip:started', _onTripLifecycle);
    sockets.on('trip:completed', _onTripLifecycle);
    sockets.on('kid:picked_up', _onKidPickedUp);
    sockets.on('kid:dropped_off', _onKidDroppedOff);
    sockets.on('location:update', _onLocationUpdate);
    sockets.on('notification:new', _onNotification);
    _listenersBound = true;
  }

  void _unbindSocketListeners(AuthState auth) {
    if (!_listenersBound) return;
    auth.sockets.off('trip:started', _onTripLifecycle);
    auth.sockets.off('trip:completed', _onTripLifecycle);
    auth.sockets.off('kid:picked_up', _onKidPickedUp);
    auth.sockets.off('kid:dropped_off', _onKidDroppedOff);
    auth.sockets.off('location:update', _onLocationUpdate);
    auth.sockets.off('notification:new', _onNotification);
    _listenersBound = false;
  }

  void _onTripLifecycle(dynamic _) {
    if (!mounted) return;
    _load();
  }

  void _onKidPickedUp(dynamic data) {
    if (!mounted) return;
    setState(() => status = 'On the bus — live tracking');
    _load();
  }

  void _onKidDroppedOff(dynamic _) {
    if (!mounted) return;
    setState(() {
      status = 'Dropped off';
      bus = null;
      busHeading = null;
    });
    _load();
  }

  void _onLocationUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final tripId = _boundTripId;
    if (tripId == null || data['tripId'] != tripId) return;
    if (!_anyKidOnBus) return;

    final lat = (data['lat'] as num?)?.toDouble();
    final lng = (data['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return;

    setState(() {
      bus = LatLng(lat, lng);
      final heading = (data['heading'] as num?)?.toDouble();
      if (heading != null && heading >= 0) busHeading = heading;
      status = 'Live · tracking driver';
    });
  }

  void _onNotification(dynamic data) {
    if (!mounted || data is! Map) return;
    final title = data['title'] as String?;
    if (title != null) setState(() => status = title);
  }

  bool get _anyKidOnBus {
    if (active == null) return false;
    final myKids = List<Map<String, dynamic>>.from(active!['myKids'] as List? ?? []);
    for (final kid in myKids) {
      final id = kid['_id']?.toString();
      if (id == null) continue;
      final picked = events.any((e) {
        final kidId = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
        return kidId?.toString() == id && e['type'] == 'picked_up';
      });
      final dropped = events.any((e) {
        final kidId = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
        return kidId?.toString() == id && e['type'] == 'dropped_off';
      });
      if (picked && !dropped) return true;
    }
    return false;
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() => loading = true);
    try {
      final kidsRes = await auth.api.get('/parent/kids');
      final activeRes = await auth.api.get('/parent/trips/active');
      kids = List<Map<String, dynamic>>.from(kidsRes['kids'] as List? ?? []);
      final trips = List<Map<String, dynamic>>.from(activeRes['trips'] as List? ?? []);
      active = trips.isNotEmpty ? trips.first : null;

      if (_boundTripId != null) {
        auth.sockets.leaveTrip(_boundTripId!);
        _boundTripId = null;
      }

      if (active != null) {
        final trip = Map<String, dynamic>.from(active!['trip'] as Map);
        final allStops = List<Map<String, dynamic>>.from(active!['stops'] as List? ?? []);
        events = List<Map<String, dynamic>>.from(active!['events'] as List? ?? []);
        final tripKids = List<Map<String, dynamic>>.from(trip['kidIds'] as List? ?? []);
        final myKids = List<Map<String, dynamic>>.from(active!['myKids'] as List? ?? []);
        // Parent map: school + their kids' stops (and trip peers if populated)
        final mapStops = stopsForTripKids(allStops, tripKids.isNotEmpty ? tripKids : myKids);
        active!['stops'] = mapStops;
        final ordered = orderedStops(mapStops, trip['direction'] as String?);
        routePoints = await fetchRoadRoute(stopLatLngs(ordered));

        final tripId = trip['_id'].toString();
        _boundTripId = tripId;
        auth.sockets.joinTrip(tripId);

        if (_anyKidOnBus) {
          bus = latLngFrom(trip['latestLocation']) ??
              (routePoints.isNotEmpty ? routePoints.first : null);
          final loc = trip['latestLocation'];
          if (loc is Map && loc['heading'] != null) {
            busHeading = (loc['heading'] as num).toDouble();
          }
          status = 'Live · tracking driver';
        } else {
          bus = null;
          busHeading = null;
          status = 'Trip started — waiting for pickup';
        }
      } else {
        routePoints = [];
        bus = null;
        busHeading = null;
        events = [];
        if (status == 'Live · tracking driver' || status == 'On the bus — live tracking') {
          status = null;
        }
      }
    } catch (e) {
      status = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _kidChip(Map<String, dynamic> kid) {
    if (active == null) return 'Idle';
    final id = kid['_id']?.toString();
    final picked = events.any((e) {
      final kidId = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
      return kidId?.toString() == id && e['type'] == 'picked_up';
    });
    final dropped = events.any((e) {
      final kidId = e['kidId'] is Map ? e['kidId']['_id'] : e['kidId'];
      return kidId?.toString() == id && e['type'] == 'dropped_off';
    });
    if (dropped) return 'Dropped off';
    if (picked) return 'On the bus';
    if (active != null) return 'Waiting';
    return 'Idle';
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ?? const LatLng(-1.3965, 36.7542);
    final trip = active == null ? null : Map<String, dynamic>.from(active!['trip'] as Map);
    final stops = active == null
        ? <Map<String, dynamic>>[]
        : List<Map<String, dynamic>>.from(active!['stops'] as List? ?? []);
    final live = trip != null && _anyKidOnBus;

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
            continuous: live,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  RoundMapButton(icon: Icons.menu_rounded, onTap: auth.logout),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FloatingPill(
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: live ? AppColors.accent : AppColors.muted,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              live
                                  ? (trip['direction'] == 'to_school'
                                      ? 'Tracking to school'
                                      : 'Tracking home')
                                  : trip != null
                                      ? 'Waiting for pickup'
                                      : 'Where is the bus?',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  RoundMapButton(
                    icon: Icons.my_location_rounded,
                    onTap: () => setState(() => followNonce++),
                  ),
                ],
              ),
            ),
          ),
          RideSheet(
            child: loading
                ? const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator(color: AppColors.ink)),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  live
                                      ? 'Live tracking'
                                      : trip != null
                                          ? 'Trip in progress'
                                          : 'No active ride',
                                  style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.6,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  live
                                      ? 'Your child is on the bus — watching the driver move in real time.'
                                      : trip != null
                                          ? 'You’ll see the bus here once the driver marks pickup.'
                                          : 'You’ll be notified when the driver starts the trip.',
                                  style: const TextStyle(color: AppColors.muted, height: 1.35),
                                ),
                              ],
                            ),
                          ),
                          if (status != null) StatusChip(text: status!),
                        ],
                      ),
                      const SizedBox(height: 18),
                      if (live)
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.softBg,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: AppColors.boltGreen,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.directions_car_filled_rounded,
                                    color: AppColors.ink),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      trip['driverId'] is Map
                                          ? trip['driverId']['name'] ?? 'Driver'
                                          : 'School bus',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800, fontSize: 16),
                                    ),
                                    Text(
                                      trip['routeId'] is Map
                                          ? trip['routeId']['name'] ?? 'School route'
                                          : 'School route',
                                      style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                    ),
                                  ],
                                ),
                              ),
                              const StatusChip(text: 'LIVE', color: AppColors.accentDark),
                            ],
                          ),
                        ),
                      const SizedBox(height: 16),
                      const Text('Your kids',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 10),
                      ...kids.map(
                        (k) {
                          final chip = _kidChip(k);
                          final onBus = chip == 'On the bus';
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFE5E7EB)),
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: AppColors.accent.withValues(alpha: 0.2),
                                  child: Text(
                                    ((k['name'] as String?)?.isNotEmpty == true
                                            ? (k['name'] as String)[0]
                                            : '?')
                                        .toUpperCase(),
                                    style: const TextStyle(fontWeight: FontWeight.w800),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(k['name'] ?? 'Child',
                                          style: const TextStyle(fontWeight: FontWeight.w700)),
                                      Text(
                                        k['routeId'] is Map ? k['routeId']['name'] ?? '' : '',
                                        style: const TextStyle(
                                            color: AppColors.muted, fontSize: 13),
                                      ),
                                    ],
                                  ),
                                ),
                                StatusChip(
                                  text: chip,
                                  color: onBus ? AppColors.accentDark : AppColors.muted,
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 8),
                      BoltPrimaryButton(label: 'Refresh', onPressed: _load),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
