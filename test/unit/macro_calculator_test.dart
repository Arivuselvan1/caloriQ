import 'package:flutter_test/flutter_test.dart';
import 'package:caloriq/core/utils/macro_calculator.dart';

void main() {
  group('MacroCalculator Tests', () {
    test('Calculates higher protein per kg for weight loss muscle preservation', () {
      final macros = MacroCalculator.calculateMacros(
        dailyCalories: 2000,
        weightKg: 70.0,
        goal: 'lose',
      );
      // 70 * 1.8 = 126g protein
      expect(macros.proteinG, equals(126));
      expect(macros.fatG, greaterThan(0));
      expect(macros.carbsG, greaterThan(0));
      expect(macros.fiberG, greaterThan(20));
    });

    test('Calculates 2.0g/kg protein for weight gain hypertrophy goal', () {
      final macros = MacroCalculator.calculateMacros(
        dailyCalories: 2800,
        weightKg: 80.0,
        goal: 'gain',
      );
      // 80 * 2.0 = 160g protein
      expect(macros.proteinG, equals(160));
    });

    test('Sum of macro calories approximates daily calorie target', () {
      const targetCalories = 2200;
      final macros = MacroCalculator.calculateMacros(
        dailyCalories: targetCalories,
        weightKg: 75.0,
        goal: 'maintain',
      );

      // (protein * 4) + (carbs * 4) + (fat * 9) should closely match target
      final calculatedTotal = macros.totalCalories;
      expect((calculatedTotal - targetCalories).abs(), lessThan(50));
    });
  });
}
