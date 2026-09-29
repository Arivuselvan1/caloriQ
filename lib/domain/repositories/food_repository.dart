import '../entities/food_entry.dart';

abstract class FoodRepository {
  Stream<List<FoodEntry>> watchEntriesForDate(DateTime date);
  Future<List<FoodEntry>> getEntriesForDate(DateTime date);
  Future<void> addEntry(FoodEntry entry);
  Future<void> addMultipleEntries(List<FoodEntry> entries);
  Future<void> updateEntry(FoodEntry entry);
  Future<void> deleteEntry(int id);
}
