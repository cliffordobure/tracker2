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
  if (direction == 'to_home') return [...school, ...homes];
  return [...homes, ...school];
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
