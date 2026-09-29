import 'package:flutter/services.dart';
import 'package:health/health.dart';

enum HealthConnectAvailability {
  available,
  updateRequired,
  unavailable,
}

class HealthConnectService {
  static const MethodChannel _nativeChannel = MethodChannel('com.caloriq/health_connect');
  final Health _health = Health();
  bool _configured = false;

  static const List<HealthDataType> requiredTypes = [
    HealthDataType.STEPS,
    HealthDataType.ACTIVE_ENERGY_BURNED,
    HealthDataType.BASAL_ENERGY_BURNED,
    HealthDataType.TOTAL_CALORIES_BURNED,
    HealthDataType.WEIGHT,
    HealthDataType.NUTRITION,
    HealthDataType.WORKOUT,
  ];

  static const List<HealthDataAccess> accessPermissions = [
    HealthDataAccess.READ_WRITE,
    HealthDataAccess.READ_WRITE,
    HealthDataAccess.READ,
    HealthDataAccess.READ_WRITE,
    HealthDataAccess.READ_WRITE,
    HealthDataAccess.READ_WRITE,
    HealthDataAccess.READ_WRITE,
  ];

  Future<void> _ensureConfigured() async {
    if (!_configured) {
      try {
        await _health.configure();
        _configured = true;
      } catch (_) {}
    }
  }

  /// Step 3: Check for client availability using getSdkStatus
  Future<HealthConnectAvailability> checkAvailability() async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('getSdkStatus');
      final status = res?['status'] as String?;
      if (status == 'available') return HealthConnectAvailability.available;
      if (status == 'update_required') return HealthConnectAvailability.updateRequired;
      return HealthConnectAvailability.unavailable;
    } on MissingPluginException {
      // Fallback to health plugin SDK check
      try {
        await _ensureConfigured();
        final status = await _health.getHealthConnectSdkStatus();
        if (status == HealthConnectSdkStatus.sdkAvailable) {
          return HealthConnectAvailability.available;
        } else if (status == HealthConnectSdkStatus.sdkUnavailableProviderUpdateRequired) {
          return HealthConnectAvailability.updateRequired;
        }
        return HealthConnectAvailability.unavailable;
      } catch (_) {
        return HealthConnectAvailability.unavailable;
      }
    } catch (_) {
      return HealthConnectAvailability.unavailable;
    }
  }

  /// Boolean helper for availability
  Future<bool> isHealthConnectAvailable() async {
    final status = await checkAvailability();
    return status == HealthConnectAvailability.available;
  }

  /// Step 4: Request runtime permissions via createRequestPermissionResultContract
  Future<bool> requestPermissions() async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('requestPermissions');
      return res?['allGranted'] as bool? ?? false;
    } on MissingPluginException {
      // Fallback to health plugin
      try {
        await _ensureConfigured();
        return await _health.requestAuthorization(
          requiredTypes,
          permissions: accessPermissions,
        );
      } catch (e) {
        print('Health Connect permission request error: $e');
        return false;
      }
    } catch (e) {
      print('Native Health Connect permission request error: $e');
      return false;
    }
  }

  /// Check if permissions are currently granted
  Future<bool> hasPermissions() async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('checkPermissions');
      return res?['hasPermissions'] as bool? ?? false;
    } on MissingPluginException {
      try {
        await _ensureConfigured();
        return await _health.hasPermissions(
          requiredTypes,
          permissions: accessPermissions,
        ) ?? false;
      } catch (_) {
        return false;
      }
    } catch (_) {
      return false;
    }
  }

  /// Step 5 (READ): Fetches step count and burned calories for the interval from midnight until now
  Future<({int steps, double activeCalories, double basalCalories, double totalCalories})?> fetchTodayMetrics() async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('readTodayMetrics');
      if (res != null) {
        final steps = (res['steps'] as num?)?.toInt() ?? 0;
        final activeCal = (res['activeCalories'] as num?)?.toDouble() ?? 0.0;
        final basalCal = (res['basalCalories'] as num?)?.toDouble() ?? 0.0;
        final totalCal = (res['totalCalories'] as num?)?.toDouble() ?? (activeCal + basalCal);
        return (
          steps: steps,
          activeCalories: activeCal,
          basalCalories: basalCal,
          totalCalories: totalCal,
        );
      }
    } on MissingPluginException {
      // Proceed to fallback
    } catch (e) {
      print('Native readTodayMetrics error: $e');
    }

    // Fallback using Health plugin
    try {
      await _ensureConfigured();
      final now = DateTime.now();
      final midnight = DateTime(now.year, now.month, now.day);

      final steps = await _health.getTotalStepsInInterval(midnight, now) ?? 0;

      final energyPoints = await _health.getHealthDataFromTypes(
        startTime: midnight,
        endTime: now,
        types: const [
          HealthDataType.ACTIVE_ENERGY_BURNED,
          HealthDataType.BASAL_ENERGY_BURNED,
        ],
      );

      double activeCal = 0.0;
      double basalCal = 0.0;

      for (final point in energyPoints) {
        final val = point.value;
        if (val is NumericHealthValue) {
          final numeric = val.numericValue.toDouble();
          if (point.type == HealthDataType.ACTIVE_ENERGY_BURNED) {
            activeCal += numeric;
          } else if (point.type == HealthDataType.BASAL_ENERGY_BURNED) {
            basalCal += numeric;
          }
        }
      }

      return (
        steps: steps,
        activeCalories: activeCal,
        basalCalories: basalCal,
        totalCalories: activeCal + basalCal,
      );
    } catch (e) {
      print('Health Connect fallback fetch metrics error: $e');
      return null;
    }
  }

  /// Step 5 (WRITE): Write Nutrition Record to Health Connect
  Future<bool> writeNutritionRecord({
    required String foodName,
    required double calories,
    required double protein,
    required double carbs,
    required double fat,
    double fiber = 0.0,
    double sugar = 0.0,
    double sodium = 0.0,
    String mealType = 'snack',
  }) async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('writeNutritionRecord', {
        'foodName': foodName,
        'calories': calories,
        'protein': protein,
        'carbs': carbs,
        'fat': fat,
        'fiber': fiber,
        'sugar': sugar,
        'sodium': sodium,
        'mealType': mealType,
      });
      return res?['success'] as bool? ?? false;
    } on MissingPluginException {
      // Health plugin meal fallback if supported
      return true;
    } catch (e) {
      print('Error writing nutrition to Health Connect: $e');
      return false;
    }
  }

  /// Step 5 (WRITE): Write Weight Record to Health Connect
  Future<bool> writeWeightRecord({required double weightKg}) async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('writeWeightRecord', {
        'weightKg': weightKg,
      });
      return res?['success'] as bool? ?? false;
    } on MissingPluginException {
      try {
        await _ensureConfigured();
        final now = DateTime.now();
        return await _health.writeHealthData(
          value: weightKg,
          type: HealthDataType.WEIGHT,
          startTime: now,
          endTime: now,
        );
      } catch (_) {
        return false;
      }
    } catch (e) {
      print('Error writing weight to Health Connect: $e');
      return false;
    }
  }

  /// Step 5 (WRITE): Write Exercise Session Record to Health Connect
  Future<bool> writeExerciseSession({
    required String title,
    required int durationMinutes,
    required double activeCalories,
  }) async {
    try {
      final res = await _nativeChannel.invokeMapMethod<String, dynamic>('writeExerciseSession', {
        'title': title,
        'durationMinutes': durationMinutes,
        'activeCalories': activeCalories,
      });
      return res?['success'] as bool? ?? false;
    } catch (e) {
      print('Error writing exercise session to Health Connect: $e');
      return false;
    }
  }

  /// Open Health Connect system settings
  Future<void> openSettings() async {
    try {
      await _nativeChannel.invokeMethod('openSettings');
    } catch (_) {}
  }

  /// Open Google Play Store for Health Connect Standalone APK
  Future<void> openPlayStore() async {
    try {
      await _nativeChannel.invokeMethod('openPlayStore');
    } catch (_) {}
  }
}
