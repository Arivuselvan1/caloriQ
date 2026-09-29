package com.caloriq.caloriq

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * MainActivity implementing the complete 5 Developer Steps for Android Health Connect:
 * 1. Health Connect SDK dependency (connect-client:1.1.0-alpha11).
 * 2. Manifest declaration of package visibility and read/write permissions.
 * 3. Client availability check via HealthConnectClient.getSdkStatus.
 * 4. Runtime permission requests via PermissionController.createRequestPermissionResultContract.
 * 5. Read and Write operations using the HealthConnectClient API.
 */
class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "com.caloriq/health_connect"

    private var permissionLauncher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermissionResult: MethodChannel.Result? = null

    private val healthPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getWritePermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getWritePermission(NutritionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class)
    )

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)

        // Step 4: Register permission contract using createRequestPermissionResultContract
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            permissionLauncher = registerForActivityResult(contract) { grantedPermissions ->
                val allGranted = grantedPermissions.containsAll(healthPermissions)
                pendingPermissionResult?.success(
                    mapOf(
                        "allGranted" to allGranted,
                        "granted" to grantedPermissions.toList(),
                        "count" to grantedPermissions.size
                    )
                )
                pendingPermissionResult = null
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            val scope = CoroutineScope(Dispatchers.Main)

            when (call.method) {
                // Step 3: Check for client availability using getSdkStatus
                "getSdkStatus" -> {
                    val status = HealthConnectClient.getSdkStatus(this)
                    val statusStr = when (status) {
                        HealthConnectClient.SDK_AVAILABLE -> "available"
                        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
                        else -> "unavailable"
                    }
                    result.success(
                        mapOf(
                            "statusCode" to status,
                            "status" to statusStr,
                            "isAvailable" to (status == HealthConnectClient.SDK_AVAILABLE)
                        )
                    )
                }

                // Step 4: Request runtime permissions via createRequestPermissionResultContract
                "requestPermissions" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.error("UNAVAILABLE", "Health Connect is not available on this device", null)
                        return@setMethodCallHandler
                    }

                    pendingPermissionResult = result
                    permissionLauncher?.launch(healthPermissions) ?: run {
                        result.error("LAUNCHER_ERROR", "Permission launcher not initialized", null)
                    }
                }

                // Check which permissions are already granted
                "checkPermissions" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.success(mapOf("hasPermissions" to false, "granted" to emptyList<String>()))
                        return@setMethodCallHandler
                    }

                    val client = HealthConnectClient.getOrCreate(this)
                    scope.launch(Dispatchers.IO) {
                        try {
                            val granted = client.permissionController.getGrantedPermissions()
                            withContext(Dispatchers.Main) {
                                result.success(
                                    mapOf(
                                        "hasPermissions" to granted.containsAll(healthPermissions),
                                        "granted" to granted.toList(),
                                        "count" to granted.size
                                    )
                                )
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("PERMISSION_CHECK_FAILED", e.message, null)
                            }
                        }
                    }
                }

                // Step 5: READ operations using HealthConnectClient API
                "readTodayMetrics" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.error("UNAVAILABLE", "Health Connect is not available", null)
                        return@setMethodCallHandler
                    }

                    val client = HealthConnectClient.getOrCreate(this)
                    val zone = ZoneId.systemDefault()
                    val startOfDay = LocalDate.now(zone).atStartOfDay(zone).toInstant()
                    val now = Instant.now()

                    scope.launch(Dispatchers.IO) {
                        try {
                            val response = client.aggregate(
                                AggregateRequest(
                                    metrics = setOf(
                                        StepsRecord.COUNT_TOTAL,
                                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                                    ),
                                    timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
                                )
                            )

                            val steps = response[StepsRecord.COUNT_TOTAL] ?: 0L
                            val activeEnergy = response[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0

                            withContext(Dispatchers.Main) {
                                result.success(
                                    mapOf(
                                        "steps" to steps.toInt(),
                                        "activeCalories" to activeEnergy,
                                        "basalCalories" to 0.0, // Handled by Mifflin-St Jeor fallback if null
                                        "totalCalories" to activeEnergy
                                    )
                                )
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("READ_FAILED", e.message, null)
                            }
                        }
                    }
                }

                // Step 5: WRITE operations (Nutrition Record)
                "writeNutritionRecord" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.error("UNAVAILABLE", "Health Connect is not available", null)
                        return@setMethodCallHandler
                    }

                    val client = HealthConnectClient.getOrCreate(this)
                    val foodName = call.argument<String>("foodName") ?: "Meal"
                    val calories = call.argument<Double>("calories") ?: 0.0
                    val protein = call.argument<Double>("protein") ?: 0.0
                    val carbs = call.argument<Double>("carbs") ?: 0.0
                    val fat = call.argument<Double>("fat") ?: 0.0
                    val fiber = call.argument<Double>("fiber") ?: 0.0
                    val sugar = call.argument<Double>("sugar") ?: 0.0
                    val sodium = call.argument<Double>("sodium") ?: 0.0
                    val mealTypeStr = call.argument<String>("mealType") ?: "snack"

                    val mealType = when (mealTypeStr.lowercase()) {
                        "breakfast" -> NutritionRecord.MEAL_TYPE_BREAKFAST
                        "lunch" -> NutritionRecord.MEAL_TYPE_LUNCH
                        "dinner" -> NutritionRecord.MEAL_TYPE_DINNER
                        else -> NutritionRecord.MEAL_TYPE_SNACK
                    }

                    val zone = ZoneId.systemDefault()
                    val now = ZonedDateTime.now(zone)
                    val startTime = now.minusMinutes(15).toInstant()
                    val endTime = now.toInstant()
                    val zoneOffset = now.offset

                    val record = NutritionRecord(
                        name = foodName,
                        energy = Energy.kilocalories(calories),
                        totalCarbohydrates = Mass.grams(carbs),
                        protein = Mass.grams(protein),
                        totalFat = Mass.grams(fat),
                        dietaryFiber = Mass.grams(fiber),
                        sugar = Mass.grams(sugar),
                        sodium = Mass.milligrams(sodium),
                        mealType = mealType,
                        startTime = startTime,
                        endTime = endTime,
                        startZoneOffset = zoneOffset,
                        endZoneOffset = zoneOffset,
                        metadata = Metadata.manualEntry()
                    )

                    scope.launch(Dispatchers.IO) {
                        try {
                            val insertResponse = client.insertRecords(listOf(record))
                            withContext(Dispatchers.Main) {
                                result.success(
                                    mapOf(
                                        "success" to true,
                                        "recordIds" to insertResponse.recordIdsList
                                    )
                                )
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("WRITE_NUTRITION_FAILED", e.message, null)
                            }
                        }
                    }
                }

                // Step 5: WRITE operations (Weight Record)
                "writeWeightRecord" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.error("UNAVAILABLE", "Health Connect is not available", null)
                        return@setMethodCallHandler
                    }

                    val client = HealthConnectClient.getOrCreate(this)
                    val weightKg = call.argument<Double>("weightKg") ?: 70.0
                    val zone = ZoneId.systemDefault()
                    val now = ZonedDateTime.now(zone)

                    val record = WeightRecord(
                        time = now.toInstant(),
                        zoneOffset = now.offset,
                        weight = Mass.kilograms(weightKg),
                        metadata = Metadata.manualEntry()
                    )

                    scope.launch(Dispatchers.IO) {
                        try {
                            val insertResponse = client.insertRecords(listOf(record))
                            withContext(Dispatchers.Main) {
                                result.success(
                                    mapOf(
                                        "success" to true,
                                        "recordIds" to insertResponse.recordIdsList
                                    )
                                )
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("WRITE_WEIGHT_FAILED", e.message, null)
                            }
                        }
                    }
                }

                // Step 5: WRITE operations (Exercise / Workout Session Record)
                "writeExerciseSession" -> {
                    if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
                        result.error("UNAVAILABLE", "Health Connect is not available", null)
                        return@setMethodCallHandler
                    }

                    val client = HealthConnectClient.getOrCreate(this)
                    val title = call.argument<String>("title") ?: "Workout"
                    val durationMins = call.argument<Int>("durationMinutes") ?: 30
                    val activeCalories = call.argument<Double>("activeCalories") ?: (durationMins * 7.0)

                    val zone = ZoneId.systemDefault()
                    val now = ZonedDateTime.now(zone)
                    val startTime = now.minusMinutes(durationMins.toLong()).toInstant()
                    val endTime = now.toInstant()
                    val zoneOffset = now.offset

                    val exerciseRecord = ExerciseSessionRecord(
                        startTime = startTime,
                        endTime = endTime,
                        startZoneOffset = zoneOffset,
                        endZoneOffset = zoneOffset,
                        exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
                        title = title,
                        metadata = Metadata.manualEntry()
                    )

                    val caloriesRecord = ActiveCaloriesBurnedRecord(
                        startTime = startTime,
                        endTime = endTime,
                        startZoneOffset = zoneOffset,
                        endZoneOffset = zoneOffset,
                        energy = Energy.kilocalories(activeCalories),
                        metadata = Metadata.manualEntry()
                    )

                    scope.launch(Dispatchers.IO) {
                        try {
                            val insertResponse = client.insertRecords(listOf(exerciseRecord, caloriesRecord))
                            withContext(Dispatchers.Main) {
                                result.success(
                                    mapOf(
                                        "success" to true,
                                        "recordIds" to insertResponse.recordIdsList
                                    )
                                )
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("WRITE_EXERCISE_FAILED", e.message, null)
                            }
                        }
                    }
                }

                // Open Health Connect Settings or App
                "openSettings" -> {
                    try {
                        val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        try {
                            val intent = Intent(android.provider.Settings.ACTION_SETTINGS)
                            startActivity(intent)
                            result.success(true)
                        } catch (e2: Exception) {
                            result.error("CANNOT_OPEN_SETTINGS", e2.message, null)
                        }
                    }
                }

                // Open Google Play Store for Health Connect Standalone APK
                "openPlayStore" -> {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            data = Uri.parse("market://details?id=com.google.android.apps.healthdata")
                            setPackage("com.android.vending")
                        }
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        val webIntent = Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")
                        )
                        startActivity(webIntent)
                        result.success(true)
                    }
                }

                else -> result.notImplemented()
            }
        }
    }
}
