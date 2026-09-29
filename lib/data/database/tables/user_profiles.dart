import 'package:drift/drift.dart';

@DataClassName('UserProfileData')
class UserProfiles extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get age => integer()();
  TextColumn get sex => text()(); // "male" or "female"
  RealColumn get heightCm => real()();
  RealColumn get weightKg => real()();
  TextColumn get activityLevel => text()();
  TextColumn get goal => text()(); // "lose", "maintain", "gain"
  RealColumn get targetRateKgPerWeek => real().withDefault(const Constant(0.5))();
  RealColumn get bmr => real()();
  RealColumn get tdee => real()();
  IntColumn get dailyCalorieTarget => integer()();
  IntColumn get proteinTargetG => integer()();
  IntColumn get carbsTargetG => integer()();
  IntColumn get fatTargetG => integer()();
  IntColumn get fiberTargetG => integer()();
  BoolColumn get onboardingComplete => boolean().withDefault(const Constant(false))();
  TextColumn get deviceId => text().withLength(min: 16, max: 64)();
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();
}
