import 'package:geolocator/geolocator.dart';

// Product policy approved for SOS; this is not a medical threshold.
const sosLocationMaxAge = Duration(minutes: 2);
const sosLocationMaxAccuracyMeters = 100.0;

bool isUsableSosPosition(Position position, {DateTime? now}) {
  final age = (now ?? DateTime.now()).difference(position.timestamp);
  return position.latitude.isFinite &&
      position.longitude.isFinite &&
      position.latitude.abs() <= 90 &&
      position.longitude.abs() <= 180 &&
      position.accuracy.isFinite &&
      position.accuracy > 0 &&
      position.accuracy <= sosLocationMaxAccuracyMeters &&
      !age.isNegative &&
      age <= sosLocationMaxAge;
}
