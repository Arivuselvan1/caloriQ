import 'package:drift/drift.dart';
import '../app_database.dart';
import '../tables/food_entries.dart';

part 'food_entry_dao.g.dart';

@DriftAccessor(tables: [FoodEntries])
class FoodEntryDao extends DatabaseAccessor<AppDatabase> with _$FoodEntryDaoMixin {
  FoodEntryDao(super.db);

  /// Streams all food entries for a specific date (ordered chronologically by createdAt)
  Stream<List<FoodEntryData>> watchEntriesForDate(DateTime date) {
    final startOfDay = DateTime(date.year, date.month, date.day);
    final endOfDay = DateTime(date.year, date.month, date.day, 23, 59, 59);

    return (select(foodEntries)
          ..where((tbl) => tbl.date.isBiggerOrEqualValue(startOfDay) & tbl.date.isSmallerOrEqualValue(endOfDay))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .watch();
  }

  /// Gets all food entries for a specific date as a Future (for CSV export or AI summaries)
  Future<List<FoodEntryData>> getEntriesForDate(DateTime date) {
    final startOfDay = DateTime(date.year, date.month, date.day);
    final endOfDay = DateTime(date.year, date.month, date.day, 23, 59, 59);

    return (select(foodEntries)
          ..where((tbl) => tbl.date.isBiggerOrEqualValue(startOfDay) & tbl.date.isSmallerOrEqualValue(endOfDay))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .get();
  }

  /// Inserts a new entry
  Future<int> insertEntry(FoodEntriesCompanion entry) {
    return into(foodEntries).insert(entry);
  }

  /// Inserts multiple approved items (e.g., from Gemini photo review)
  Future<void> insertMultipleEntries(List<FoodEntriesCompanion> entries) {
    return batch((b) {
      b.insertAll(foodEntries, entries);
    });
  }

  /// Updates an existing entry
  Future<bool> updateEntry(FoodEntryData entry) {
    return update(foodEntries).replace(entry);
  }

  /// Deletes an entry by ID
  Future<int> deleteEntry(int id) {
    return (delete(foodEntries)..where((tbl) => tbl.id.equals(id))).go();
  }
}
