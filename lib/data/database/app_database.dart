import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'tables/food_entries.dart';
import 'tables/user_profiles.dart';
import 'tables/weight_logs.dart';
import 'tables/daily_health.dart';
import 'daos/food_entry_dao.dart';
import 'daos/daily_health_dao.dart';
import 'daos/weight_log_dao.dart';
import 'daos/user_profile_dao.dart';

part 'app_database.g.dart';

@DriftDatabase(
  tables: [FoodEntries, UserProfiles, WeightLogs, DailyHealth],
  daos: [FoodEntryDao, DailyHealthDao, WeightLogDao, UserProfileDao],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  static QueryExecutor _openConnection() {
    return driftDatabase(
      name: 'caloriq_db',
      native: const DriftNativeOptions(
        shareAcrossIsolates: true,
      ),
    );
  }
}
