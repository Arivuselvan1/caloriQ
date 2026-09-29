import 'package:drift/drift.dart';
import '../app_database.dart';
import '../tables/weight_logs.dart';

part 'weight_log_dao.g.dart';

@DriftAccessor(tables: [WeightLogs])
class WeightLogDao extends DatabaseAccessor<AppDatabase> with _$WeightLogDaoMixin {
  WeightLogDao(super.db);

  /// Streams all weight records in ascending order of date for trend charts
  Stream<List<WeightLogData>> watchAllWeightLogs() {
    return (select(weightLogs)..orderBy([(t) => OrderingTerm.asc(t.date)])).watch();
  }

  /// Inserts a new weight measurement
  Future<int> insertWeightLog(WeightLogsCompanion entry) {
    return into(weightLogs).insert(entry);
  }

  /// Gets the most recent weight log
  Future<WeightLogData?> getLatestWeightLog() {
    return (select(weightLogs)
          ..orderBy([(t) => OrderingTerm.desc(t.date)])
          ..limit(1))
        .getSingleOrNull();
  }
}
