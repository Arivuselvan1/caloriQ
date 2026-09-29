import 'package:drift/drift.dart';

@DataClassName('WeightLogData')
class WeightLogs extends Table {
  IntColumn get id => integer().autoIncrement()();
  DateTimeColumn get date => dateTime()();
  RealColumn get weightKg => real()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}
