import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';
import '../../domain/entities/user_profile.dart';
import '../../domain/entities/weight_entry.dart';
import '../../domain/repositories/user_repository.dart';
import '../database/app_database.dart';

class UserRepositoryImpl implements UserRepository {
  final AppDatabase _db;

  UserRepositoryImpl(this._db);

  UserProfile _mapProfileToEntity(UserProfileData data) {
    return UserProfile(
      id: data.id,
      age: data.age,
      sex: data.sex,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      activityLevel: data.activityLevel,
      goal: data.goal,
      targetRateKgPerWeek: data.targetRateKgPerWeek,
      bmr: data.bmr,
      tdee: data.tdee,
      dailyCalorieTarget: data.dailyCalorieTarget,
      proteinTargetG: data.proteinTargetG,
      carbsTargetG: data.carbsTargetG,
      fatTargetG: data.fatTargetG,
      fiberTargetG: data.fiberTargetG,
      onboardingComplete: data.onboardingComplete,
      deviceId: data.deviceId,
      updatedAt: data.updatedAt,
    );
  }

  @override
  Stream<UserProfile?> watchProfile() {
    return _db.userProfileDao.watchUserProfile().map(
          (data) => data != null ? _mapProfileToEntity(data) : null,
        );
  }

  @override
  Future<UserProfile?> getProfile() async {
    final data = await _db.userProfileDao.getUserProfile();
    return data != null ? _mapProfileToEntity(data) : null;
  }

  @override
  Future<void> saveProfile(UserProfile profile) async {
    final companion = UserProfilesCompanion(
      age: Value(profile.age),
      sex: Value(profile.sex),
      heightCm: Value(profile.heightCm),
      weightKg: Value(profile.weightKg),
      activityLevel: Value(profile.activityLevel),
      goal: Value(profile.goal),
      targetRateKgPerWeek: Value(profile.targetRateKgPerWeek),
      bmr: Value(profile.bmr),
      tdee: Value(profile.tdee),
      dailyCalorieTarget: Value(profile.dailyCalorieTarget),
      proteinTargetG: Value(profile.proteinTargetG),
      carbsTargetG: Value(profile.carbsTargetG),
      fatTargetG: Value(profile.fatTargetG),
      fiberTargetG: Value(profile.fiberTargetG),
      onboardingComplete: Value(profile.onboardingComplete),
      deviceId: Value(profile.deviceId),
      updatedAt: Value(DateTime.now()),
    );
    await _db.userProfileDao.saveUserProfile(companion);
  }

  @override
  Future<String> getOrCreateDeviceId() async {
    final existing = await _db.userProfileDao.getDeviceId();
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final newId = const Uuid().v4();
    return newId;
  }

  @override
  Stream<List<WeightEntry>> watchWeightLogs() {
    return _db.weightLogDao.watchAllWeightLogs().map(
          (rows) => rows
              .map(
                (r) => WeightEntry(
                  id: r.id,
                  date: r.date,
                  weightKg: r.weightKg,
                  createdAt: r.createdAt,
                ),
              )
              .toList(),
        );
  }

  @override
  Future<void> logWeight(double weightKg, {DateTime? date}) async {
    final logDate = date ?? DateTime.now();
    await _db.weightLogDao.insertWeightLog(
      WeightLogsCompanion(
        date: Value(logDate),
        weightKg: Value(weightKg),
      ),
    );

    // Also update weight in user profile if present
    final currentProfile = await getProfile();
    if (currentProfile != null) {
      await saveProfile(currentProfile.copyWith(weightKg: weightKg));
    }
  }
}
