import 'package:flutter_test/flutter_test.dart';
import 'package:caloriq/core/constants.dart';
import 'package:caloriq/core/utils/tdee_calculator.dart';

void main() {
  group('TdeeCalculator Tests', () {
    test('Calculates male BMR accurately using Mifflin-St Jeor equation', () {
      // Male: 10w + 6.25h - 5a + 5
      // 80kg, 180cm, 30 years old
      // (10 * 80) + (6.25 * 180) - (5 * 30) + 5 = 800 + 1125 - 150 + 5 = 1780.0
      final bmr = TdeeCalculator.calculateBmr(
        weightKg: 80.0,
        heightCm: 180.0,
        age: 30,
        sex: 'male',
      );
      expect(bmr, equals(1780.0));
    });

    test('Calculates female BMR accurately using Mifflin-St Jeor equation', () {
      // Female: 10w + 6.25h - 5a - 161
      // 60kg, 165cm, 25 years old
      // (10 * 60) + (6.25 * 165) - (5 * 25) - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
      final bmr = TdeeCalculator.calculateBmr(
        weightKg: 60.0,
        heightCm: 165.0,
        age: 25,
        sex: 'female',
      );
      expect(bmr, equals(1345.25));
    });

    test('Calculates TDEE using activity level multipliers', () {
      const bmr = 1500.0;

      final sedentary = TdeeCalculator.calculateTdee(bmr: bmr, activityLevel: 'sedentary');
      expect(sedentary, equals(1500.0 * 1.2));

      final moderate = TdeeCalculator.calculateTdee(bmr: bmr, activityLevel: 'moderate');
      expect(moderate, equals(1500.0 * 1.55));

      final active = TdeeCalculator.calculateTdee(bmr: bmr, activityLevel: 'active');
      expect(active, equals(1500.0 * 1.725));
    });

    test('Enforces safe calorie floor on extreme weight loss deficits (Male)', () {
      // With high deficit, target could mathematically drop below 1500, but MUST be clamped to 1500
      final target = TdeeCalculator.calculateDailyTarget(
        tdee: 1800.0,
        goal: 'lose',
        rateKgPerWeek: 1.0, // 1100 kcal deficit -> 1800 - 1100 = 700 kcal raw
        sex: 'male',
      );
      expect(target, equals(AppConstants.minDailyCaloriesMale)); // 1500
    });

    test('Enforces safe calorie floor on extreme weight loss deficits (Female)', () {
      final target = TdeeCalculator.calculateDailyTarget(
        tdee: 1600.0,
        goal: 'lose',
        rateKgPerWeek: 1.0, // 1100 deficit -> 1600 - 1100 = 500 kcal raw
        sex: 'female',
      );
      expect(target, equals(AppConstants.minDailyCaloriesFemale)); // 1200
    });

    test('Calculates weight gain caloric surplus correctly', () {
      final target = TdeeCalculator.calculateDailyTarget(
        tdee: 2200.0,
        goal: 'gain',
        rateKgPerWeek: 0.5, // 0.5 * 1100 = 550 kcal surplus
        sex: 'male',
      );
      expect(target, equals(2750));
    });
  });
}
