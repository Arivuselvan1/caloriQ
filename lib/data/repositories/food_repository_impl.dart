import 'package:drift/drift.dart';
import '../../domain/entities/food_entry.dart';
import '../../domain/repositories/food_repository.dart';
import '../database/app_database.dart';

class FoodRepositoryImpl implements FoodRepository {
  final AppDatabase _db;

  FoodRepositoryImpl(this._db);

  FoodEntry _mapToEntity(FoodEntryData data) {
    return FoodEntry(
      id: data.id,
      date: data.date,
      time: data.time,
      mealType: data.mealType,
      foodName: data.foodName,
      quantity: data.quantity,
      quantityUnit: data.quantityUnit,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      fiber: data.fiber,
      sugar: data.sugar,
      sodium: data.sodium,
      source: data.source,
      confidence: data.confidence,
      createdAt: data.createdAt,
    );
  }

  FoodEntriesCompanion _mapToCompanion(FoodEntry entity) {
    return FoodEntriesCompanion(
      date: Value(DateTime(entity.date.year, entity.date.month, entity.date.day)),
      time: Value(entity.time),
      mealType: Value(entity.mealType),
      foodName: Value(entity.foodName),
      quantity: Value(entity.quantity),
      quantityUnit: Value(entity.quantityUnit),
      calories: Value(entity.calories),
      protein: Value(entity.protein),
      carbs: Value(entity.carbs),
      fat: Value(entity.fat),
      fiber: Value(entity.fiber),
      sugar: Value(entity.sugar),
      sodium: Value(entity.sodium),
      source: Value(entity.source),
      confidence: Value(entity.confidence),
    );
  }

  @override
  Stream<List<FoodEntry>> watchEntriesForDate(DateTime date) {
    return _db.foodEntryDao.watchEntriesForDate(date).map(
          (rows) => rows.map(_mapToEntity).toList(),
        );
  }

  @override
  Future<List<FoodEntry>> getEntriesForDate(DateTime date) async {
    final rows = await _db.foodEntryDao.getEntriesForDate(date);
    return rows.map(_mapToEntity).toList();
  }

  @override
  Future<void> addEntry(FoodEntry entry) async {
    await _db.foodEntryDao.insertEntry(_mapToCompanion(entry));
  }

  @override
  Future<void> addMultipleEntries(List<FoodEntry> entries) async {
    final companions = entries.map(_mapToCompanion).toList();
    await _db.foodEntryDao.insertMultipleEntries(companions);
  }

  @override
  Future<void> updateEntry(FoodEntry entry) async {
    final data = FoodEntryData(
      id: entry.id,
      date: entry.date,
      time: entry.time,
      mealType: entry.mealType,
      foodName: entry.foodName,
      quantity: entry.quantity,
      quantityUnit: entry.quantityUnit,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      fiber: entry.fiber,
      sugar: entry.sugar,
      sodium: entry.sodium,
      source: entry.source,
      confidence: entry.confidence,
      createdAt: entry.createdAt,
    );
    await _db.foodEntryDao.updateEntry(data);
  }

  @override
  Future<void> deleteEntry(int id) async {
    await _db.foodEntryDao.deleteEntry(id);
  }
}
