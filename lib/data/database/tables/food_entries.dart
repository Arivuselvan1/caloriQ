import 'package:drift/drift.dart';

@DataClassName('FoodEntryData')
class FoodEntries extends Table {
  IntColumn get id => integer().autoIncrement()();
  DateTimeColumn get date => dateTime()(); // Midnight-normalized
  TextColumn get time => text()(); // "08:30 AM"
  TextColumn get mealType => text()(); // breakfast/lunch/dinner/snack
  TextColumn get foodName => text()();
  RealColumn get quantity => real().withDefault(const Constant(1.0))();
  TextColumn get quantityUnit => text().withDefault(const Constant('g'))();
  RealColumn get calories => real()();
  RealColumn get protein => real().withDefault(const Constant(0.0))();
  RealColumn get carbs => real().withDefault(const Constant(0.0))();
  RealColumn get fat => real().withDefault(const Constant(0.0))();
  RealColumn get fiber => real().withDefault(const Constant(0.0))();
  RealColumn get sugar => real().withDefault(const Constant(0.0))();
  RealColumn get sodium => real().withDefault(const Constant(0.0))(); // mg
  TextColumn get source => text().withDefault(const Constant('manual'))(); // 'ai' or 'manual'
  RealColumn get confidence => real().nullable()(); // 0.0 to 1.0 (null for manual)
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
}
