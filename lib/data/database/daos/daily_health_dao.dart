import 'package:drift/drift.dart';
import '../app_database.dart';
import '../tables/daily_health.dart';

part 'daily_health_dao.g.dart';

@DriftAccessor(tables: [DailyHealth])
class DailyHealthDao extends DatabaseAccessor<AppDatabase> with _$DailyHealthDaoMixin {
  DailyHealthDao(super.db);

  /// Watches health record for a given date
  Stream<DailyHealthData?> watchHealthForDate(DateTime date) {
    final normalized = DateTime(date.year, date.month, date.day);
    return (select(dailyHealth)..where((tbl) => tbl.date.equals(normalized)))
        .watchSingleOrNull();
  }

  /// Gets health record for a given date
  Future<DailyHealthData?> getHealthForDate(DateTime date) {
    final normalized = DateTime(date.year, date.month, date.day);
    return (select(dailyHealth)..where((tbl) => tbl.date.equals(normalized)))
        .getSingleOrNull();
  }

  /// Inserts or updates health data for a given date
  Future<void> upsertHealth(DailyHealthCompanion entry) {
    return into(dailyHealth).insertOnConflictUpdate(entry);
  }
}
