import 'package:drift/drift.dart';

@DataClassName('DailyHealthData')
class DailyHealth extends Table {
  IntColumn get id => integer().autoIncrement()();
  DateTimeColumn get date => dateTime().unique()(); // One health record per calendar date
  IntColumn get steps => integer().withDefault(const Constant(0))();
  RealColumn get activeCaloriesBurned => real().withDefault(const Constant(0.0))();
  RealColumn get basalCaloriesBurned => real().withDefault(const Constant(0.0))();
  RealColumn get totalCaloriesBurned => real().withDefault(const Constant(0.0))();
  BoolColumn get isEstimated => boolean().withDefault(const Constant(false))();
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();
}
