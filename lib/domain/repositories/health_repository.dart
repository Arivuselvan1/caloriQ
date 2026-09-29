import '../entities/health_data.dart';

abstract class HealthRepository {
  Stream<HealthData?> watchHealthForDate(DateTime date);
  Future<HealthData?> getHealthForDate(DateTime date);
  Future<bool> checkAndRequestPermissions();
  Future<HealthData> syncTodayHealth({required double userBmr});

  // Step 5: Write operations via Health Connect
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
  });

  Future<bool> writeWeight({required double weightKg});

  Future<bool> writeWorkout({
    required String title,
    required int durationMinutes,
    required double activeCalories,
  });
}
