import 'dart:async';
import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';

import '../../domain/entities/daily_summary.dart';
import '../../domain/entities/food_entry.dart';
import '../../domain/entities/health_data.dart';
import '../../domain/entities/user_profile.dart';
import '../../domain/repositories/ai_repository.dart';
import '../models/gemini_food_response.dart';
import '../models/gemini_summary_response.dart';

class AiRepositoryImpl implements AiRepository {
  final FirebaseFunctions _functions;

  AiRepositoryImpl({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-central1');

  @override
  Future<GeminiFoodResponse> analyzeFoodPhoto({
    required List<int> imageBytes,
    required String mimeType,
    required String deviceId,
  }) async {
    final base64Image = base64Encode(imageBytes);

    try {
      final callable = _functions.httpsCallable(
        'analyzeFood',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 40)),
      );

      final response = await callable.call<Map<String, dynamic>>({
        'imageBase64': base64Image,
        'mimeType': mimeType,
        'deviceId': deviceId,
      });

      final data = response.data;
      return GeminiFoodResponse.fromJson(data);
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'resource-exhausted') {
        throw Exception('Daily analysis limit reached. Please try again later.');
      } else if (e.code == 'unavailable' || e.code == 'deadline-exceeded') {
        throw Exception('Network timeout or offline. Check your internet connection.');
      } else {
        throw Exception(e.message ?? 'Food analysis failed. Please try manual entry.');
      }
    } on TimeoutException {
      throw Exception('Analysis request timed out. Please check your connection and retry.');
    } catch (e) {
      if (e is FormatException) {
        throw Exception('Could not parse AI response. Please try taking another photo.');
      }
      rethrow;
    }
  }

  @override
  Future<DailySummary> generateDailySummary({
    required DateTime date,
    required List<FoodEntry> foodLog,
    required HealthData healthData,
    required UserProfile profile,
    required String deviceId,
  }) async {
    final foodListJson = foodLog.map((e) => {
          'time': e.time,
          'meal': e.mealType,
          'food': e.foodName,
          'quantity': '${e.quantity} ${e.quantityUnit}',
          'calories': e.calories,
          'protein': e.protein,
          'carbs': e.carbs,
          'fat': e.fat,
          'fiber': e.fiber,
          'sugar': e.sugar,
          'sodium': e.sodium,
        }).toList();

    try {
      final callable = _functions.httpsCallable(
        'generateSummary',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
      );

      final response = await callable.call<Map<String, dynamic>>({
        'deviceId': deviceId,
        'date': date.toIso8601String(),
        'foodLog': foodListJson,
        'healthData': {
          'steps': healthData.steps,
          'totalCaloriesBurned': healthData.totalCaloriesBurned,
          'activeCalories': healthData.activeCaloriesBurned,
        },
        'profile': {
          'goal': profile.goal,
          'sex': profile.sex,
          'age': profile.age,
          'tdee': profile.tdee,
          'dailyCalorieTarget': profile.dailyCalorieTarget,
        },
      });

      final parsed = GeminiSummaryResponse.fromJson(response.data);
      return DailySummary.fromGeminiResponse(date, parsed);
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'resource-exhausted') {
        throw Exception('Daily summary limit reached for today.');
      }
      throw Exception(e.message ?? 'Failed to generate AI summary.');
    } catch (e) {
      rethrow;
    }
  }
}
