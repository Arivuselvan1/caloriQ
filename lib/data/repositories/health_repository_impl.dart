import 'package:drift/drift.dart';
import '../../core/utils/calorie_estimator.dart';
import '../../domain/entities/health_data.dart';
import '../../domain/repositories/health_repository.dart';
import '../database/app_database.dart';
import '../services/health_connect_service.dart';

class HealthRepositoryImpl implements HealthRepository {
  final AppDatabase _db;
  final HealthConnectService _healthService;

  HealthRepositoryImpl(this._db, this._healthService);

  HealthData _mapToEntity(DailyHealthData data) {
    return HealthData(
      date: data.date,
      steps: data.steps,
      activeCaloriesBurned: data.activeCaloriesBurned,
      basalCaloriesBurned: data.basalCaloriesBurned,
      totalCaloriesBurned: data.totalCaloriesBurned,
      isEstimated: data.isEstimated,
      lastSyncedAt: data.lastSyncedAt,
    );
  }

  @override
  Stream<HealthData?> watchHealthForDate(DateTime date) {
    return _db.dailyHealthDao.watchHealthForDate(date).map(
          (data) => data != null ? _mapToEntity(data) : null,
        );
  }

  @override
  Future<HealthData?> getHealthForDate(DateTime date) async {
    final data = await _db.dailyHealthDao.getHealthForDate(date);
    return data != null ? _mapToEntity(data) : null;
  }

  @override
  Future<bool> checkAndRequestPermissions() async {
    return await _healthService.requestPermissions();
  }

  @override
  Future<HealthData> syncTodayHealth({required double userBmr}) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final metrics = await _healthService.fetchTodayMetrics();

    int steps = 0;
    double activeCalories = 0.0;
    double basalCalories = 0.0;
    double totalCalories = 0.0;
    bool isEstimated = false;

    if (metrics != null && (metrics.steps > 0 || metrics.totalCalories > 0)) {
      steps = metrics.steps;
      activeCalories = metrics.activeCalories;
      basalCalories = metrics.basalCalories;
      totalCalories = metrics.totalCalories;

      // If active was recorded but basal wasn't available from Health Connect,
      // supplement with user's BMR
      if (totalCalories == 0 && (activeCalories > 0 || steps > 0)) {
        totalCalories = CalorieEstimator.estimateTotalCaloriesBurned(
          steps: steps,
          bmr: userBmr,
        );
        isEstimated = true;
      }
    } else {
      // Fallback: estimate from steps (if available) + BMR
      steps = metrics?.steps ?? 0;
      totalCalories = CalorieEstimator.estimateTotalCaloriesBurned(
        steps: steps,
        bmr: userBmr,
      );
      isEstimated = true;
    }

    // Persist into Drift SQLite
    await _db.dailyHealthDao.upsertHealth(
      DailyHealthCompanion(
        date: Value(today),
        steps: Value(steps),
        activeCaloriesBurned: Value(activeCalories),
        basalCaloriesBurned: Value(basalCalories),
        totalCaloriesBurned: Value(totalCalories),
        isEstimated: Value(isEstimated),
        lastSyncedAt: Value(now),
      ),
    );

    return HealthData(
      date: today,
      steps: steps,
      activeCaloriesBurned: activeCalories,
      basalCaloriesBurned: basalCalories,
      totalCaloriesBurned: totalCalories,
      isEstimated: isEstimated,
      lastSyncedAt: now,
    );
  }

  @override
  Future<bool> writeMealNutrition({
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
    return await _healthService.writeNutritionRecord(
      foodName: foodName,
      calories: calories,
      protein: protein,
      carbs: carbs,
      fat: fat,
      fiber: fiber,
      sugar: sugar,
      sodium: sodium,
      mealType: mealType,
    );
  }

  @override
  Future<bool> writeWeight({required double weightKg}) async {
    return await _healthService.writeWeightRecord(weightKg: weightKg);
  }

  @override
  Future<bool> writeWorkout({
    required String title,
    required int durationMinutes,
    required double activeCalories,
  }) async {
    return await _healthService.writeExerciseSession(
      title: title,
      durationMinutes: durationMinutes,
      activeCalories: activeCalories,
    );
  }
}
