import '../entities/user_profile.dart';
import '../entities/weight_entry.dart';

abstract class UserRepository {
  Stream<UserProfile?> watchProfile();
  Future<UserProfile?> getProfile();
  Future<void> saveProfile(UserProfile profile);
  Future<String> getOrCreateDeviceId();
  Stream<List<WeightEntry>> watchWeightLogs();
  Future<void> logWeight(double weightKg, {DateTime? date});
}
