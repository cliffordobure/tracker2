import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/auth_state.dart';
import '../services/directions.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import '../widgets/ride_map.dart';
import '../widgets/ride_sheet.dart';

class TeacherHomeScreen extends StatefulWidget {
  const TeacherHomeScreen({super.key});

  @override
  State<TeacherHomeScreen> createState() => _TeacherHomeScreenState();
}

class _TeacherHomeScreenState extends State<TeacherHomeScreen> {
  final mapController = MapController();
  Map<String, dynamic>? school;
  List<Map<String, dynamic>> kids = [];
  List<Map<String, dynamic>> activeTrips = [];
  Map<String, dynamic>? selected;
  List<LatLng> routePoints = [];
  LatLng? bus;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await auth.api.get('/teacher/overview');
      school = data['school'] == null ? null : Map<String, dynamic>.from(data['school'] as Map);
      kids = List<Map<String, dynamic>>.from(data['kids'] as List? ?? []);
      activeTrips = List<Map<String, dynamic>>.from(data['activeTrips'] as List? ?? []);
      selected = activeTrips.isNotEmpty ? activeTrips.first : null;
      await _bindSelected();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _bindSelected() async {
    final auth = context.read<AuthState>();
    if (selected == null) {
      routePoints = [];
      bus = null;
      return;
    }
    final trip = Map<String, dynamic>.from(selected!['trip'] as Map);
    final stops = List<Map<String, dynamic>>.from(selected!['stops'] as List? ?? []);
    final ordered = orderedStops(stops, trip['direction'] as String?);
    routePoints = await fetchRoadRoute(stopLatLngs(ordered));
    bus = latLngFrom(trip['latestLocation']) ??
        (routePoints.isNotEmpty ? routePoints.first : null);

    final tripId = trip['_id'] as String;
    auth.sockets.joinTrip(tripId);
    auth.sockets.socket?.off('location:update');
    auth.sockets.socket?.on('location:update', (data) {
      if (data is Map && data['tripId'] == tripId) {
        final next = LatLng((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble());
        setState(() => bus = next);
        mapController.move(next, mapController.camera.zoom);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final center = bus ?? latLngFrom(school?['location']) ?? const LatLng(-1.3965, 36.7542);
    final stops = selected == null
        ? <Map<String, dynamic>>[]
        : List<Map<String, dynamic>>.from(selected!['stops'] as List? ?? []);
    final trip = selected == null ? null : Map<String, dynamic>.from(selected!['trip'] as Map);

    return Scaffold(
      body: Stack(
        children: [
          RideMap(
            mapController: mapController,
            center: center,
            busLocation: bus,
            routePoints: routePoints,
            stops: stops,
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  _IconBtn(icon: Icons.logout_rounded, onTap: auth.logout),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 16),
                      ],
                    ),
                    child: Text(
                      school?['name'] ?? 'Teacher',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _IconBtn(icon: Icons.refresh_rounded, onTap: _load),
                ],
              ),
            ),
          ),
          RideSheet(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (error != null) ...[
                        Text(error!, style: const TextStyle(color: AppColors.danger)),
                        const SizedBox(height: 8),
                        const Text(
                          'If this fails on the hosted API, redeploy the backend with the teacher routes.',
                          style: TextStyle(color: AppColors.muted, fontSize: 12),
                        ),
                        const SizedBox(height: 12),
                      ],
                      const Text(
                        'School rides',
                        style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        trip == null
                            ? '${kids.length} kids · no active buses right now'
                            : '${trip['routeId'] is Map ? trip['routeId']['name'] : 'Route'} is live',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                      const SizedBox(height: 14),
                      if (activeTrips.length > 1)
                        Wrap(
                          spacing: 8,
                          children: activeTrips.map((t) {
                            final tr = Map<String, dynamic>.from(t['trip'] as Map);
                            final selectedId = trip?['_id'];
                            final id = tr['_id'];
                            return ChoiceChip(
                              label: Text(tr['routeId'] is Map ? tr['routeId']['name'] : 'Trip'),
                              selected: selectedId == id,
                              onSelected: (_) async {
                                setState(() => selected = t);
                                await _bindSelected();
                                setState(() {});
                              },
                            );
                          }).toList(),
                        ),
                      const SizedBox(height: 12),
                      Text('${kids.length} students on transport',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      ...kids.take(8).map(
                            (k) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                backgroundColor: AppColors.route.withValues(alpha: 0.12),
                                child: const Icon(Icons.school, color: AppColors.route, size: 18),
                              ),
                              title: Text(k['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(k['grade'] ?? ''),
                            ),
                          ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 20)),
      ),
    );
  }
}
