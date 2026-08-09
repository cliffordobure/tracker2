import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import '../utils/geo.dart';
import 'bolt_car_marker.dart';

/// Bolt-style map with smoothly animated vehicle + camera follow.
class RideMap extends StatefulWidget {
  const RideMap({
    super.key,
    required this.center,
    this.busLocation,
    this.busHeading,
    this.routePoints = const [],
    this.stops = const [],
    this.zoom = 18.1,
    this.followBus = true,
    this.followNonce = 0,
    this.continuous = false,
    this.mapController,
  });

  /// Close street zoom so road movement is obvious (Bolt-like).
  static const streetZoom = 18.1;

  final LatLng center;
  final LatLng? busLocation;
  final double? busHeading;
  final List<LatLng> routePoints;
  final List<Map<String, dynamic>> stops;
  final double zoom;
  final bool followBus;
  final int followNonce;
  /// When true, apply positions every frame (no stepped hop animation).
  final bool continuous;
  final MapController? mapController;

  @override
  State<RideMap> createState() => _RideMapState();
}

class _RideMapState extends State<RideMap> with TickerProviderStateMixin {
  late final MapController _controller;
  late final AnimationController _moveCtrl;
  late final AnimationController _pulseCtrl;

  LatLng? _displayBus;
  LatLng? _from;
  LatLng? _to;
  double _bearing = 0;
  double _fromBearing = 0;
  double _toBearing = 0;
  bool _userPanning = false;

  @override
  void initState() {
    super.initState();
    _controller = widget.mapController ?? MapController();
    _displayBus = widget.busLocation ?? widget.center;

    _moveCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 750),
    )..addListener(_onMoveTick);

    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();

    if (widget.busLocation != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _controller.move(widget.busLocation!, _followZoom);
      });
    }
  }

  double get _followZoom =>
      widget.zoom < RideMap.streetZoom ? RideMap.streetZoom : widget.zoom;

  @override
  void didUpdateWidget(covariant RideMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.followNonce != oldWidget.followNonce) {
      _userPanning = false;
      final bus = _displayBus ?? widget.busLocation;
      if (bus != null) {
        _controller.move(bus, _followZoom);
      }
    }
    final next = widget.busLocation;
    if (next == null) return;

    if (oldWidget.busLocation == null || _displayBus == null) {
      setState(() {
        _displayBus = next;
        if (widget.busHeading != null) _bearing = widget.busHeading!;
      });
      _controller.move(next, _followZoom);
      return;
    }

    if ((next.latitude - _displayBus!.latitude).abs() < 1e-7 &&
        (next.longitude - _displayBus!.longitude).abs() < 1e-7) {
      return;
    }

    // Continuous test-drive / live stream: glide every frame, no stepped hops
    if (widget.continuous) {
      _moveCtrl.stop();
      setState(() {
        if (widget.busHeading != null) {
          _bearing = widget.busHeading!;
        } else if (_displayBus != null) {
          _bearing = bearingDegrees(_displayBus!, next);
        }
        _displayBus = next;
      });
      if (widget.followBus && !_userPanning) {
        _controller.move(next, _followZoom);
      }
      return;
    }

    _animateTo(next);
  }

  void _animateTo(LatLng next) {
    _from = _displayBus ?? next;
    _to = next;
    _fromBearing = _bearing;
    _toBearing = bearingDegrees(_from!, _to!);

    final dist = distanceMeters(_from!, _to!);
    final turn = shortestAngleDelta(_fromBearing, _toBearing).abs();
    // Slow down on corners / short segments so it eases around bends
    final ms = turn > 25
        ? 1100
        : dist < 18
            ? 900
            : 750;

    _moveCtrl
      ..duration = Duration(milliseconds: ms)
      ..forward(from: 0);
  }

  void _onMoveTick() {
    if (_from == null || _to == null) return;
    // Linear = constant road speed (Bolt-like), not ease that rushes corners
    final t = _moveCtrl.value;
    final pos = lerpLatLng(_from!, _to!, t);
    final bearing = _fromBearing + shortestAngleDelta(_fromBearing, _toBearing) * t;
    setState(() {
      _displayBus = pos;
      _bearing = bearing;
    });
    if (widget.followBus && !_userPanning) {
      _controller.move(pos, _followZoom);
    }
  }

  @override
  void dispose() {
    _moveCtrl.dispose();
    _pulseCtrl.dispose();
    if (widget.mapController == null) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bus = _displayBus;

    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: bus ?? widget.center,
        initialZoom: _followZoom,
        minZoom: 12,
        maxZoom: 19.5,
        onPositionChanged: (pos, hasGesture) {
          if (hasGesture) _userPanning = true;
        },
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
      ),
      children: [
        // Standard 256 Mapbox raster tiles (512/@2x often 401s on some tokens/devices → gray map)
        if (AppConfig.hasMapboxToken)
          TileLayer(
            urlTemplate:
                'https://api.mapbox.com/styles/v1/${AppConfig.mapStyleId}/tiles/256/{z}/{x}/{y}?access_token=${AppConfig.mapboxToken}',
            userAgentPackageName: 'com.schoolkids.school_kids_tracker',
            maxZoom: 22,
            tileDimension: 256,
          )
        else
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.schoolkids.school_kids_tracker',
            maxZoom: 19,
          ),
        if (widget.routePoints.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: widget.routePoints,
                strokeWidth: 12,
                color: AppColors.routeGlow.withValues(alpha: 0.22),
              ),
              Polyline(
                points: widget.routePoints,
                strokeWidth: 5.5,
                color: AppColors.route,
                borderStrokeWidth: 1.5,
                borderColor: Colors.white.withValues(alpha: 0.85),
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            for (final stop in widget.stops)
              if (latLngFrom(stop['location']) != null)
                Marker(
                  width: 36,
                  height: 36,
                  point: latLngFrom(stop['location'])!,
                  child: _StopDot(school: stop['type'] == 'school'),
                ),
            if (bus != null)
              Marker(
                width: 88,
                height: 88,
                point: bus,
                child: AnimatedBuilder(
                  animation: _pulseCtrl,
                  builder: (_, _) => BoltCarMarker(
                    bearing: _bearing,
                    pulse: _pulseCtrl.value,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _StopDot extends StatelessWidget {
  const _StopDot({required this.school});
  final bool school;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: school ? AppColors.accentDark : Colors.white,
        shape: BoxShape.circle,
        border: Border.all(
          color: school ? Colors.white : AppColors.ink,
          width: 2.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Icon(
        school ? Icons.school_rounded : Icons.circle,
        size: school ? 14 : 8,
        color: school ? Colors.white : AppColors.ink,
      ),
    );
  }
}
