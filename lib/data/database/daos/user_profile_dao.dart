import 'package:drift/drift.dart';
import '../app_database.dart';
import '../tables/user_profiles.dart';

part 'user_profile_dao.g.dart';

@DriftAccessor(tables: [UserProfiles])
class UserProfileDao extends DatabaseAccessor<AppDatabase> with _$UserProfileDaoMixin {
  UserProfileDao(super.db);

  /// Streams the user profile
  Stream<UserProfileData?> watchUserProfile() {
    return (select(userProfiles)..limit(1)).watchSingleOrNull();
  }

  /// Gets the user profile once
  Future<UserProfileData?> getUserProfile() {
    return (select(userProfiles)..limit(1)).getSingleOrNull();
  }

  /// Saves or updates the single user profile row
  Future<void> saveUserProfile(UserProfilesCompanion entry) async {
    final existing = await getUserProfile();
    if (existing == null) {
      await into(userProfiles).insert(entry);
    } else {
      await (update(userProfiles)..where((tbl) => tbl.id.equals(existing.id))).write(entry);
    }
  }

  /// Gets stored device ID or returns null if not set
  Future<String?> getDeviceId() async {
    final profile = await getUserProfile();
    return profile?.deviceId;
  }
}
