import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/database/app_database.dart';
import '../data/services/health_connect_service.dart';
import '../data/repositories/food_repository_impl.dart';
import '../data/repositories/user_repository_impl.dart';
import '../data/repositories/health_repository_impl.dart';
import '../data/repositories/ai_repository_impl.dart';
import '../domain/entities/food_entry.dart';
import '../domain/entities/user_profile.dart';
import '../domain/entities/health_data.dart';
import '../domain/entities/weight_entry.dart';
import '../domain/repositories/food_repository.dart';
import '../domain/repositories/user_repository.dart';
import '../domain/repositories/health_repository.dart';
import '../domain/repositories/ai_repository.dart';

// --- Database & Infrastructure Providers ---

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(() => db.close());
  return db;
});

final healthConnectServiceProvider = Provider<HealthConnectService>((ref) {
  return HealthConnectService();
});

// --- Repository Providers ---

final foodRepositoryProvider = Provider<FoodRepository>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return FoodRepositoryImpl(db);
});

final userRepositoryProvider = Provider<UserRepository>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return UserRepositoryImpl(db);
});

final healthRepositoryProvider = Provider<HealthRepository>((ref) {
  final db = ref.watch(appDatabaseProvider);
  final healthService = ref.watch(healthConnectServiceProvider);
  return HealthRepositoryImpl(db, healthService);
});

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  return AiRepositoryImpl();
});

// --- State & Stream Providers ---

/// Normalizes date to midnight
DateTime _normalizeDate(DateTime dt) => DateTime(dt.year, dt.month, dt.day);

/// Currently selected date in the Today / History view
final selectedDateProvider = StateProvider<DateTime>((ref) {
  return _normalizeDate(DateTime.now());
});

/// Reactive stream of food entries for the currently selected date
final foodEntriesForSelectedDateProvider = StreamProvider<List<FoodEntry>>((ref) {
  final date = ref.watch(selectedDateProvider);
  final repo = ref.watch(foodRepositoryProvider);
  return repo.watchEntriesForDate(date);
});

/// Daily totals summary calculated from entries of the active date
class DailyFoodTotals {
  final double calories;
  final double protein;
  final double carbs;
  final double fat;
  final double fiber;
  final double sugar;
  final double sodium;
  final int entryCount;

  const DailyFoodTotals({
    this.calories = 0.0,
    this.protein = 0.0,
    this.carbs = 0.0,
    this.fat = 0.0,
    this.fiber = 0.0,
    this.sugar = 0.0,
    this.sodium = 0.0,
    this.entryCount = 0,
  });
}

final dailyTotalsProvider = Provider<DailyFoodTotals>((ref) {
  final entriesAsync = ref.watch(foodEntriesForSelectedDateProvider);
  final entries = entriesAsync.valueOrNull ?? [];

  double cals = 0, prot = 0, carbs = 0, fat = 0, fiber = 0, sugar = 0, sodium = 0;
  for (final e in entries) {
    cals += e.calories;
    prot += e.protein;
    carbs += e.carbs;
    fat += e.fat;
    fiber += e.fiber;
    sugar += e.sugar;
    sodium += e.sodium;
  }

  return DailyFoodTotals(
    calories: (cals * 10).round() / 10,
    protein: (prot * 10).round() / 10,
    carbs: (carbs * 10).round() / 10,
    fat: (fat * 10).round() / 10,
    fiber: (fiber * 10).round() / 10,
    sugar: (sugar * 10).round() / 10,
    sodium: (sodium * 10).round() / 10,
    entryCount: entries.length,
  );
});

/// Reactive stream of user profile
final userProfileProvider = StreamProvider<UserProfile?>((ref) {
  final repo = ref.watch(userRepositoryProvider);
  return repo.watchProfile();
});

/// Reactive stream of health data for the selected date
final healthDataForSelectedDateProvider = StreamProvider<HealthData?>((ref) {
  final date = ref.watch(selectedDateProvider);
  final repo = ref.watch(healthRepositoryProvider);
  return repo.watchHealthForDate(date);
});

/// Reactive stream of weight history for trend charts
final weightLogsProvider = StreamProvider<List<WeightEntry>>((ref) {
  final repo = ref.watch(userRepositoryProvider);
  return repo.watchWeightLogs();
});

/// Identifies the active editing cell in the spreadsheet grid: (entryId, columnField)
class ActiveCellCoordinate {
  final int entryId;
  final String field;

  const ActiveCellCoordinate(this.entryId, this.field);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ActiveCellCoordinate &&
          runtimeType == other.runtimeType &&
          entryId == other.entryId &&
          field == other.field;

  @override
  int get hashCode => entryId.hashCode ^ field.hashCode;
}

final activeCellProvider = StateProvider<ActiveCellCoordinate?>((ref) => null);
