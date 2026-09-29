import '../entities/food_entry.dart';
import '../entities/health_data.dart';
import '../entities/user_profile.dart';
import '../entities/daily_summary.dart';
import '../../data/models/gemini_food_response.dart';

abstract class AiRepository {
  /// Analyzes a food photo using Gemini via Cloud Functions proxy
  Future<GeminiFoodResponse> analyzeFoodPhoto({
    required List<int> imageBytes,
    required String mimeType,
    required String deviceId,
  });

  /// Generates an end-of-day summary using Gemini via Cloud Functions proxy
  Future<DailySummary> generateDailySummary({
    required DateTime date,
    required List<FoodEntry> foodLog,
    required HealthData healthData,
    required UserProfile profile,
    required String deviceId,
  });
}
