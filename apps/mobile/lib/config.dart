class AppConfig {
  /// Hosted SchoolKids Tracker API
  static const apiBase = 'https://tracker2-j8vr.onrender.com';

  /// Pass at run/build time, e.g.:
  /// flutter run --dart-define=MAPBOX_TOKEN=pk.your_token
  static const mapboxToken = String.fromEnvironment('MAPBOX_TOKEN');

  /// Colorful streets map (not gray light style)
  static const mapStyleId = 'mapbox/streets-v12';

  static bool get hasMapboxToken => mapboxToken.isNotEmpty;

  static String mapTileUrl(int z, int x, int y) =>
      'https://api.mapbox.com/styles/v1/$mapStyleId/tiles/512/$z/$x/$y@2x'
      '?access_token=$mapboxToken';

  static String directionsUrl(List<String> lngLatPairs) =>
      'https://api.mapbox.com/directions/v5/mapbox/driving/${lngLatPairs.join(';')}'
      '?geometries=geojson&overview=full&access_token=$mapboxToken';
}
