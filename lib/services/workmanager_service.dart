import 'package:drift/drift.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import '../data/database/app_database.dart';
import '../data/services/health_connect_service.dart';

const String healthSyncTaskName = 'com.caloriq.healthSync';
const String endOfDaySummaryTaskName = 'com.caloriq.endOfDaySummary';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();

    if (taskName == healthSyncTaskName) {
      try {
        final db = AppDatabase();
        final healthService = HealthConnectService();

        final metrics = await healthService.fetchTodayMetrics();
        if (metrics != null) {
          final now = DateTime.now();
          final today = DateTime(now.year, now.month, now.day);

          await db.dailyHealthDao.upsertHealth(
            DailyHealthCompanion(
              date: Value(today),
              steps: Value(metrics.steps),
              activeCaloriesBurned: Value(metrics.activeCalories),
              basalCaloriesBurned: Value(metrics.basalCalories),
              totalCaloriesBurned: Value(metrics.totalCalories),
              isEstimated: const Value(false),
              lastSyncedAt: Value(now),
            ),
          );
        }
        await db.close();
      } catch (e) {
        print('WorkManager background sync failed: $e');
        return Future.value(false);
      }
    }

    return Future.value(true);
  });
}

class WorkmanagerService {
  /// Initializes background workers and registers 20-minute periodic Health Connect sync
  static Future<void> initialize() async {
    try {
      await Workmanager().initialize(
        callbackDispatcher,
        isInDebugMode: false,
      );

      // Register periodic health sync (20 minutes interval; Android WorkManager minimum is 15m)
      await Workmanager().registerPeriodicTask(
        'caloriq-20min-health-sync',
        healthSyncTaskName,
        frequency: const Duration(minutes: 20),
        constraints: Constraints(
          networkType: NetworkType.not_required,
          requiresBatteryNotLow: true,
        ),
        existingWorkPolicy: ExistingWorkPolicy.replace,
        backoffPolicy: BackoffPolicy.exponential,
        backoffPolicyDelay: const Duration(minutes: 1),
      );
    } catch (e) {
      print('Could not initialize WorkManager: $e');
    }
  }
}
