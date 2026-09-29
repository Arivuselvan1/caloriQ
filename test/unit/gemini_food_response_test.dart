import 'package:flutter_test/flutter_test.dart';
import 'package:caloriq/data/models/gemini_food_response.dart';

void main() {
  group('GeminiFoodResponse Parsing Tests', () {
    test('Parses valid Gemini JSON response with multiple food items', () {
      final json = {
        'items': [
          {
            'name': 'Grilled Chicken Breast',
            'estimated_grams': 150.0,
            'calories': 247.5,
            'protein': 46.5,
            'carbs': 0.0,
            'fat': 5.4,
            'fiber': 0.0,
            'sugar': 0.0,
            'sodium': 111.0,
            'confidence': 0.92,
          },
          {
            'name': 'Steamed Broccoli',
            'estimated_grams': 85.0,
            'calories': 29.8,
            'protein': 2.4,
            'carbs': 6.0,
            'fat': 0.3,
            'fiber': 2.2,
            'sugar': 1.4,
            'sodium': 28.0,
            'confidence': 0.85,
          }
        ]
      };

      final response = GeminiFoodResponse.fromJson(json);

      expect(response.hasError, isFalse);
      expect(response.items.length, equals(2));
      expect(response.items.first.name, equals('Grilled Chicken Breast'));
      expect(response.items.first.calories, equals(247.5));
      expect(response.items.first.protein, equals(46.5));
      expect(response.items.first.confidence, equals(0.92));
    });

    test('Parses non-food photo response correctly', () {
      final json = {
        'error': 'no_food_detected',
        'message': 'No food items could be identified in this image.',
        'items': []
      };

      final response = GeminiFoodResponse.fromJson(json);

      expect(response.isNoFoodDetected, isTrue);
      expect(response.hasError, isTrue);
      expect(response.items, isEmpty);
      expect(response.message, contains('No food items'));
    });

    test('Throws FormatException when items key is missing', () {
      final invalidJson = {'data': []};
      expect(() => GeminiFoodResponse.fromJson(invalidJson), throwsFormatException);
    });

    test('Throws FormatException when item name is missing', () {
      final invalidJson = {
        'items': [
          {
            'estimated_grams': 100,
            'calories': 200,
          }
        ]
      };
      expect(() => GeminiFoodResponse.fromJson(invalidJson), throwsFormatException);
    });

    test('Clamps confidence values between 0.0 and 1.0', () {
      final json = {
        'items': [
          {
            'name': 'Apple',
            'estimated_grams': 120.0,
            'calories': 62.0,
            'protein': 0.3,
            'carbs': 16.0,
            'fat': 0.2,
            'fiber': 2.8,
            'sugar': 12.0,
            'sodium': 1.0,
            'confidence': 1.85, // Out of bounds
          }
        ]
      };

      final response = GeminiFoodResponse.fromJson(json);
      expect(response.items.first.confidence, equals(1.0));
    });

    test('Recalculates macros proportionally when portion size in grams is modified', () {
      const original = GeminiFoodItem(
        name: 'Brown Rice',
        estimatedGrams: 100.0,
        calories: 111.0,
        protein: 2.6,
        carbs: 23.0,
        fat: 0.9,
        fiber: 1.8,
        sugar: 0.4,
        sodium: 5.0,
        confidence: 0.9,
      );

      // User doubles portion to 200g
      final updated = original.recalculateForPortion(200.0);

      expect(updated.estimatedGrams, equals(200.0));
      expect(updated.calories, equals(222.0));
      expect(updated.protein, equals(5.2));
      expect(updated.carbs, equals(46.0));
      expect(updated.fat, equals(1.8));
    });
  });
}
