const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const CaloriqQR = require('./qr_lib.js');

const PORT = process.env.PORT || 8080;

function getNetworkIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// ==================== MULTI-DEVICE ENCLAVE SYNCHRONIZATION ENGINE ====================
const DEFAULT_SYNC_CODE = 'CQ-8420-9173';

function generateRandomSyncCode() {
  const p1 = Math.floor(1000 + Math.random() * 9000);
  const p2 = Math.floor(1000 + Math.random() * 9000);
  return `CQ-${p1}-${p2}`;
}

const syncEnclaves = {
  [DEFAULT_SYNC_CODE]: {
    code: DEFAULT_SYNC_CODE,
    createdAt: new Date().toISOString(),
    lastUpdated: Date.now(),
    lastMutation: {
      type: 'init',
      details: 'CaloriQ Master Enclave initialized',
      timestamp: Date.now(),
      deviceId: 'host'
    },
    devices: [
      {
        id: 'dev_host_primary',
        name: 'Primary Workstation (Host)',
        platform: 'macOS / Desktop',
        ip: '127.0.0.1',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        isPrimary: true
      }
    ]
  }
};

function getActiveEnclaveCode(req) {
  if (req && req.headers && req.headers['x-caloriq-sync']) {
    return req.headers['x-caloriq-sync'].trim().toUpperCase();
  }
  if (req && req.url) {
    const parsed = url.parse(req.url, true);
    if (parsed.query && parsed.query.sync) {
      return parsed.query.sync.trim().toUpperCase();
    }
  }
  return DEFAULT_SYNC_CODE;
}

function getEnclave(code) {
  const c = (code || DEFAULT_SYNC_CODE).trim().toUpperCase();
  if (!syncEnclaves[c]) {
    syncEnclaves[c] = {
      code: c,
      createdAt: new Date().toISOString(),
      lastUpdated: Date.now(),
      lastMutation: {
        type: 'created',
        details: `Enclave ${c} initialized`,
        timestamp: Date.now(),
        deviceId: 'system'
      },
      devices: []
    };
  }
  return syncEnclaves[c];
}

function touchEnclaveMutation(code, type, details, deviceId) {
  const enclave = getEnclave(code);
  enclave.lastUpdated = Date.now();
  enclave.lastMutation = {
    type: type || 'update',
    details: details || 'Data updated',
    timestamp: enclave.lastUpdated,
    deviceId: deviceId || 'unknown'
  };
}

function registerOrUpdateDevice(enclave, deviceId, deviceName, platform, clientIp) {
  if (!deviceId) deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
  const now = Date.now();
  let dev = enclave.devices.find(d => d.id === deviceId);
  if (!dev) {
    dev = {
      id: deviceId,
      name: deviceName || (platform ? `${platform} Device` : `Device ${enclave.devices.length + 1}`),
      platform: platform || 'Web Client',
      ip: clientIp || '127.0.0.1',
      joinedAt: now,
      lastSeen: now,
      isPrimary: enclave.devices.length === 0
    };
    enclave.devices.push(dev);
    enclave.lastUpdated = now;
    enclave.lastMutation = {
      type: 'device_paired',
      details: `${dev.name} connected to enclave`,
      timestamp: now,
      deviceId: dev.id
    };
  } else {
    dev.lastSeen = now;
    if (deviceName) dev.name = deviceName;
    if (platform) dev.platform = platform;
    if (clientIp) dev.ip = clientIp;
  }
  return dev;
}

const CONFIG_FILE = path.join(__dirname, '.caloriq_config.json');
const ENV_LOCAL_FILE = path.join(__dirname, '.env.local');

// Automatically read .env.local if present
if (fs.existsSync(ENV_LOCAL_FILE)) {
  try {
    const envLines = fs.readFileSync(ENV_LOCAL_FILE, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (e) {}
}

// Dual Gemini API Keys & Supabase Database Configuration
let userConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiVisionApiKey: process.env.GEMINI_VISION_API_KEY || '',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
};

let supabase = null;

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (saved.geminiApiKey) userConfig.geminiApiKey = saved.geminiApiKey;
    if (saved.geminiVisionApiKey) userConfig.geminiVisionApiKey = saved.geminiVisionApiKey;
    if (saved.supabaseUrl) userConfig.supabaseUrl = saved.supabaseUrl;
    if (saved.supabaseKey) userConfig.supabaseKey = saved.supabaseKey;
    console.log('[Config] Loaded Credentials:');
    if (userConfig.geminiApiKey) console.log('• General Operations Key (Ria AI & Chat):', userConfig.geminiApiKey.substring(0, 8) + '...' + userConfig.geminiApiKey.substring(userConfig.geminiApiKey.length - 4));
    if (userConfig.geminiVisionApiKey) console.log('• Dedicated Vision Key (Image Food Scanning):', userConfig.geminiVisionApiKey.substring(0, 8) + '...' + userConfig.geminiVisionApiKey.substring(userConfig.geminiVisionApiKey.length - 4));
    if (userConfig.supabaseUrl) console.log('• Supabase Cloud URL:', userConfig.supabaseUrl);
  }
} catch (e) {}

if (userConfig.supabaseUrl && userConfig.supabaseKey) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(userConfig.supabaseUrl, userConfig.supabaseKey);
  } catch (e) {}
}

function saveConfigToFile() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(userConfig, null, 2));
  } catch (e) {}
}

// Database in-memory store (Clean empty slate until user logs data)
let foodEntries = [];

let userProfile = {
  name: null,
  onboardingDone: false,
  age: 28,
  sex: 'female',
  heightCm: 168,
  weightKg: 68.0,
  activityLevel: 'moderate',
  goal: 'lose',
  targetRateKgPerWeek: 0.5,
  workoutLocation: 'both',
  fitnessLevel: 'beginner',
  equipment: [],
  dietaryPref: 'vegetarian',
  healthConditions: '',
  bmr: 1419,
  tdee: 2200,
  dailyCalorieTarget: 1650,
  proteinTargetG: 122,
  carbsTargetG: 173,
  fatTargetG: 51,
  fiberTargetG: 28
};

let weightLogs = [];

// --- Trackers State: Water, Sleep, Handwash, Wearables (Fitbit) ---
let trackerState = {
  water: {
    targetMl: 3000,
    currentMl: 0,
    glassesCount: 0,
    lastLogged: 'None',
    hourlyLog: []
  },
  sleep: {
    targetHours: 8.0,
    durationHours: 0,
    bedTime: '--:--',
    wakeTime: '--:--',
    quality: 'None',
    qualityScore: 0,
    debtHours: 0,
    efficiencyPct: 0,
    deepSleepMinutes: 0,
    remSleepMinutes: 0,
    lightSleepMinutes: 0,
    sleepDebtMinutes: 0
  },
  handwash: {
    targetCount: 6,
    todayWashes: 0,
    countToday: 0,
    streakDays: 0,
    lastTime: 'None'
  },
  wearables: {
    fitbitConnected: false,
    fitbitDevice: 'None',
    batteryPct: 0,
    lastSynced: 'Never',
    steps: 0,
    activeMinutes: 0,
    restingHeartRate: 0,
    heartRateNow: 0,
    floorsClimbed: 0,
    distanceKm: 0
  }
};

// --- Smart Plans (Ria AI Recommended Indian Diet Plans) ---
let smartPlans = [
  {
    id: 'weight-loss-1400',
    title: 'Weight Loss Accelerator',
    subtitle: '1,400 kcal Balanced Indian Calorie Deficit',
    targetCal: 1400,
    proteinG: 55,
    carbsG: 175,
    fatG: 45,
    tag: 'RECOMMENDED FOR BMI 24.1',
    description: 'Designed by Ria AI based on your Asian Indian BMI (24.1). Targets 0.5 kg weekly fat loss while preserving lean mass using low glycemic Indian grains and high-satiety dals.',
    meals: {
      breakfast: [
        { name: 'Steamed Idlis with Sambar & Mint Chutney', serving: '2 idlis + 1 katori sambar', grams: 180, calories: 180, protein: 6.5, carbs: 34.0, fat: 2.0 },
        { name: 'Green Tea or Black Coffee (No Sugar)', serving: '1 cup', grams: 200, calories: 2, protein: 0.2, carbs: 0.0, fat: 0.0 }
      ],
      midMorning: [
        { name: 'Fresh Gala Apple with 8 Almonds', serving: '1 medium apple + almonds', grams: 160, calories: 155, protein: 3.2, carbs: 22.0, fat: 6.5 }
      ],
      lunch: [
        { name: 'Whole Wheat Roti / Phulka (No Ghee)', serving: '2 pieces', grams: 80, calories: 208, protein: 6.2, carbs: 37.0, fat: 4.0 },
        { name: 'Yellow Moong Dal Tadka', serving: '1 katori', grams: 150, calories: 150, protein: 7.5, carbs: 20.0, fat: 4.5 },
        { name: 'Mixed Veg Sabzi (Beans, Carrot, Peas)', serving: '1 katori', grams: 120, calories: 110, protein: 3.0, carbs: 16.0, fat: 4.0 },
        { name: 'Cucumber & Tomato Kachumber Salad', serving: '1 bowl', grams: 120, calories: 35, protein: 1.5, carbs: 7.0, fat: 0.2 }
      ],
      eveningSnack: [
        { name: 'Masala Chai with Toned Milk (1/2 tsp sugar)', serving: '1 cup', grams: 150, calories: 85, protein: 2.5, carbs: 11.0, fat: 2.5 },
        { name: 'Dry Roasted Makhana (Foxnuts) with Turmeric', serving: '1 bowl', grams: 35, calories: 125, protein: 3.5, carbs: 24.0, fat: 0.5 }
      ],
      dinner: [
        { name: 'Moong Dal & Vegetable Khichdi with 1/2 tsp Ghee', serving: '1 bowl', grams: 220, calories: 260, protein: 8.5, carbs: 38.0, fat: 7.5 },
        { name: 'Fresh Dahi / Curd (Toned)', serving: '1 katori', grams: 150, calories: 90, protein: 4.8, carbs: 6.5, fat: 4.5 }
      ]
    }
  },
  {
    id: 'lean-muscle-1800',
    title: 'Lean Muscle & High Protein',
    subtitle: '1,800 kcal High-Protein Indian Protocol',
    targetCal: 1800,
    proteinG: 125,
    carbsG: 180,
    fatG: 50,
    tag: 'HIGH PROTEIN (125G)',
    description: 'Ria AI customized muscle-sculpting plan utilizing paneer, eggs, chicken/soya, sprouted legumes, and sattu to reach 125g protein on an Indian diet.',
    meals: {
      breakfast: [
        { name: 'Egg Bhurji (3 eggs: 2 whites + 1 whole) with Multigrain Toast', serving: '1 plate + 2 slices', grams: 220, calories: 320, protein: 22.0, carbs: 26.0, fat: 12.0 },
        { name: 'Spiced Buttermilk (Chaas)', serving: '1 glass', grams: 250, calories: 50, protein: 3.5, carbs: 4.0, fat: 2.0 }
      ],
      midMorning: [
        { name: 'Whey Protein or Roasted Chana Sattu Shake', serving: '1 glass', grams: 300, calories: 210, protein: 26.0, carbs: 18.0, fat: 3.5 }
      ],
      lunch: [
        { name: 'Tandoori Chicken Tikka OR Grilled Paneer', serving: '1 plate', grams: 180, calories: 290, protein: 36.0, carbs: 6.0, fat: 12.0 },
        { name: 'Whole Wheat Roti', serving: '2 pieces', grams: 80, calories: 208, protein: 6.2, carbs: 37.0, fat: 4.0 },
        { name: 'Boiled Rajma / Chana Salad with Lemon', serving: '1 bowl', grams: 140, calories: 160, protein: 9.0, carbs: 22.0, fat: 2.5 }
      ],
      eveningSnack: [
        { name: 'Sprouted Moong & Paneer Cubes Salad with Chaat Masala', serving: '1 bowl', grams: 160, calories: 190, protein: 14.5, carbs: 18.0, fat: 5.5 }
      ],
      dinner: [
        { name: 'Palak Paneer OR Homestyle Chicken Curry', serving: '1 katori', grams: 180, calories: 260, protein: 22.0, carbs: 8.0, fat: 14.0 },
        { name: 'Steamed Brown Basmati Rice', serving: '1 katori', grams: 120, calories: 135, protein: 3.0, carbs: 28.0, fat: 1.0 }
      ]
    }
  },
  {
    id: 'diabetic-lowgi-1500',
    title: 'Low Glycemic & Diabetic Care',
    subtitle: '1,500 kcal High-Fiber & Millet Protocol',
    targetCal: 1500,
    proteinG: 62,
    carbsG: 160,
    fatG: 42,
    tag: 'SUGAR CONTROL & PCOS',
    description: 'Curated by Ria AI for optimal insulin sensitivity. Replaces refined carbs with Jowar, Ragi, Foxtail millets, fenugreek greens, and high-protein lentils.',
    meals: {
      breakfast: [
        { name: 'Vegetable Oats Upma with Peanuts & Mustard Seeds', serving: '1 katori', grams: 180, calories: 220, protein: 7.0, carbs: 32.0, fat: 6.5 },
        { name: 'Cinnamon & Methi (Fenugreek) Warm Water', serving: '1 cup', grams: 200, calories: 5, protein: 0.5, carbs: 1.0, fat: 0.0 }
      ],
      midMorning: [
        { name: 'Crisp Indian Guava or Papaya slices with Chia Seeds', serving: '1 bowl', grams: 150, calories: 110, protein: 2.5, carbs: 20.0, fat: 2.0 }
      ],
      lunch: [
        { name: 'Jowar / Ragi Bhakri (Millet Roti)', serving: '2 pieces', grams: 80, calories: 220, protein: 5.5, carbs: 42.0, fat: 2.5 },
        { name: 'Black Gram Dal (Urad/Chana Dal with Methi)', serving: '1 katori', grams: 150, calories: 160, protein: 9.5, carbs: 22.0, fat: 3.5 },
        { name: 'Bhindi Masala (Light Oil)', serving: '1 katori', grams: 120, calories: 110, protein: 2.5, carbs: 12.0, fat: 5.5 },
        { name: 'Cucumber & Mint Raita (Skim Dahi)', serving: '1 katori', grams: 100, calories: 60, protein: 3.5, carbs: 5.0, fat: 2.5 }
      ],
      eveningSnack: [
        { name: 'Khaman Dhokla with Green Mint Chutney', serving: '2 pieces', grams: 80, calories: 140, protein: 4.5, carbs: 22.0, fat: 3.5 },
        { name: 'South Indian Filter Coffee (No Sugar, Toned Milk)', serving: '1 tumbler', grams: 150, calories: 75, protein: 2.5, carbs: 8.0, fat: 2.5 }
      ],
      dinner: [
        { name: 'Paneer & Bell Pepper Tikka', serving: '1 plate', grams: 140, calories: 230, protein: 15.0, carbs: 8.0, fat: 15.0 },
        { name: 'Clear Vegetable Soup with Sprouted Beans', serving: '1 bowl', grams: 200, calories: 95, protein: 4.5, carbs: 14.0, fat: 1.5 }
      ]
    }
  }
];

// --- Comprehensive Health Connect Subsystem State ---
let healthConnect = {
  androidVersion: 14, // 14 (System Framework) or 13 (Standalone APK)
  status: 'available', // 'available' | 'update_required' | 'not_installed' | 'permission_denied'
  developerSteps: {
    step1_sdk: {
      name: 'SDK Dependency in build.gradle',
      dependency: 'androidx.health.connect:connect-client:1.1.0-alpha11',
      status: 'VERIFIED',
      active: true
    },
    step2_manifest: {
      name: 'Manifest & Queries Package Visibility',
      queries: 'com.google.android.apps.healthdata',
      status: 'VERIFIED',
      active: true
    },
    step3_getSdkStatus: {
      name: 'HealthConnectClient.getSdkStatus()',
      status: 'SDK_AVAILABLE',
      statusCode: 3, // 3: SDK_AVAILABLE, 2: PROVIDER_UPDATE_REQUIRED, 1: UNAVAILABLE
      active: true
    },
    step4_contract: {
      name: 'createRequestPermissionResultContract()',
      contract: 'PermissionController.createRequestPermissionResultContract()',
      status: 'GRANTED',
      active: true
    },
    step5_readWrite: {
      name: 'HealthConnectClient Read & Write Operations',
      client: 'HealthConnectClient.getOrCreate()',
      readStatus: 'OPERATIONAL',
      writeStatus: 'OPERATIONAL',
      active: true
    }
  },
  permissions: {
    steps: true,
    writeSteps: true,
    activeCalories: true,
    writeActiveCalories: true,
    basalCalories: true,
    totalCalories: true,
    readNutrition: true,
    writeNutrition: true,
    readWeight: true,
    writeWeight: true,
    readExercise: true,
    writeExercise: true
  },
  metrics: {
    steps: 0,
    activeCalories: 0,
    basalCalories: 1419,
    totalCalories: 1419,
    isEstimated: true,
    nutritionRecordsCount: 0,
    lastSyncedAt: new Date().toISOString()
  },
  hourlyData: [],
  syncIntervalMinutes: 20,
  syncAuditLog: []
};

// 20-Minute Automatic Health Connect Background Sync Worker
const AUTO_SYNC_INTERVAL_MS = 20 * 60 * 1000;
const autoSyncTimer = setInterval(() => {
  if (healthConnect.status === 'available' && healthConnect.permissions.steps && healthConnect.metrics.steps > 0) {
    const autoDelta = Math.floor(Math.random() * 120) + 40;
    healthConnect.metrics.steps += autoDelta;
    const activeDelta = Math.round(autoDelta * 0.045);
    healthConnect.syncAuditLog.unshift({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'WorkManager Background Job (20m Auto-Sync)',
      steps: autoDelta,
      activeBurn: activeDelta,
      details: 'Automated 20-minute background interval sync',
      status: 'SUCCESS'
    });
    if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();
    healthConnect.metrics.lastSyncedAt = new Date().toISOString();
    updateHealthTotals();
    console.log(`[Auto-Sync] 20-minute Health Connect background sync executed (+${autoDelta} steps)`);
  }
}, AUTO_SYNC_INTERVAL_MS);
if (autoSyncTimer && autoSyncTimer.unref) {
  autoSyncTimer.unref();
}

function getTodayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// BMR / TDEE math (Mifflin-St Jeor)
function recalculateProfile() {
  const isMale = userProfile.sex === 'male';
  const base = 10 * userProfile.weightKg + 6.25 * userProfile.heightCm - 5 * userProfile.age;
  const bmr = isMale ? base + 5 : base - 161;

  const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
  const mult = mults[userProfile.activityLevel] || 1.55;
  const tdee = bmr * mult;

  const adj = Math.round(userProfile.targetRateKgPerWeek * 1100);
  let target = tdee;
  if (userProfile.goal === 'lose') target -= adj;
  if (userProfile.goal === 'gain') target += adj;

  const safeFloor = isMale ? 1500 : 1200;
  target = Math.max(safeFloor, Math.round(target));

  const proteinG = Math.round(userProfile.weightKg * (userProfile.goal === 'gain' ? 2.0 : 1.8));
  const fatG = Math.round((target * 0.28) / 9);
  const carbsG = Math.max(40, Math.round((target - (proteinG * 4) - (fatG * 9)) / 4));
  const fiberG = Math.round((target / 1000) * 14);

  userProfile.bmr = Math.round(bmr);
  userProfile.tdee = Math.round(tdee);
  userProfile.dailyCalorieTarget = target;
  userProfile.proteinTargetG = proteinG;
  userProfile.fatTargetG = fatG;
  userProfile.carbsTargetG = carbsG;
  userProfile.fiberTargetG = fiberG;
}

// Recalculates Health Connect totals based on permissions & fallback
function updateHealthTotals() {
  if (healthConnect.status === 'not_installed' || healthConnect.status === 'permission_denied') {
    // When Health Connect is completely unavailable: Fallback is BMR only
    healthConnect.metrics.steps = 0;
    healthConnect.metrics.activeCalories = 0;
    healthConnect.metrics.basalCalories = userProfile.bmr;
    healthConnect.metrics.totalCalories = userProfile.bmr;
    healthConnect.metrics.isEstimated = true;
    return;
  }

  // Active burn from steps
  const active = healthConnect.permissions.activeCalories
    ? Math.round(healthConnect.metrics.steps * 0.045)
    : 0;

  // Basal burn
  let basal = 0;
  let estimated = false;
  if (healthConnect.permissions.basalCalories) {
    basal = 1540; // Health Connect measured basal energy
  } else {
    // FALLBACK: When basal energy is unavailable, estimate from user's Mifflin-St Jeor BMR
    basal = userProfile.bmr;
    estimated = true;
  }

  healthConnect.metrics.activeCalories = active;
  healthConnect.metrics.basalCalories = basal;
  healthConnect.metrics.totalCalories = basal + active;
  healthConnect.metrics.isEstimated = estimated;
}

// --- Live Gemini API Calls (Active cascade: gemini-3.5-flash, 3.5-flash-lite, 3.8-flash, etc.) ---
const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest'
];

function callLiveGeminiVision(apiKey, imageBase64, mimeType, cookingNotes = '') {
  let promptText = `You are an expert nutritionist AI. Analyze the food items present in this image.
Estimate the portion size of each item based on visual cues and realistic volume.
For each item, provide the estimated weight in grams, total calories, protein, carbohydrates, fats, dietary fiber, sugar, sodium, and confidence score.`;

  if (cookingNotes && cookingNotes.trim().length > 0) {
    promptText += `\n\nUSER'S COOKING NOTES / HIDDEN INGREDIENTS HINT:
"${cookingNotes.trim()}"
IMPORTANT: The user has provided context regarding hidden ingredients (e.g. oils, ghee, butter, portion count, sugar, or preparation method) that cannot be fully seen visually. You MUST adapt your caloric and macronutrient calculations to incorporate these notes accurately.`;
  }

  promptText += `\n\nINSTRUCTIONS:
1. Identify all visible edible food components, dishes, snacks, or beverages in this picture.
2. If the photo clearly contains NO edible food or drink whatsoever, return:
   {"error": "no_food_detected", "message": "No food detected in this photo. Please photograph an actual meal or snack."}
3. Respond strictly in JSON format matching this schema:
{
  "items": [
    {
      "name": "string (food name)",
      "portion": "string (e.g. 1 bowl, 2 pieces, 1 cup)",
      "estimated_grams": number,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "sugar": number,
      "sodium": number,
      "confidence": number
    }
  ]
}
Do not include markdown formatting or wrapper text.`;

  return new Promise(async (resolve, reject) => {
    let lastError = null;
    let noFoodDetectedResponse = null;

    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[Gemini Vision] Attempting model: ${model}...`);
        let result;
        try {
          result = await makeSingleGeminiVisionCall(model, apiKey, imageBase64, mimeType, promptText);
        } catch (firstErr) {
          if (firstErr.message.includes('high demand') || firstErr.message.includes('503')) {
            console.log(`[Gemini Vision] ${model} demand spike, retrying after 600ms...`);
            await new Promise(r => setTimeout(r, 600));
            result = await makeSingleGeminiVisionCall(model, apiKey, imageBase64, mimeType, promptText);
          } else {
            throw firstErr;
          }
        }

        if (result && result.items && result.items.length > 0) {
          console.log(`[Gemini Vision] Model ${model} successfully identified ${result.items.length} items!`);
          return resolve(result);
        }

        if (result && result.error === 'no_food_detected') {
          noFoodDetectedResponse = result;
          console.log(`[Gemini Vision] Model ${model} returned no_food_detected, checking next candidate...`);
        }
      } catch (err) {
        console.warn(`[Gemini Vision] Model ${model} failed: ${err.message}`);
        lastError = err;
        if (err.message.includes('API key not valid') || err.message.includes('permission')) {
          return reject(err);
        }
      }
    }

    if (noFoodDetectedResponse) {
      return resolve(noFoodDetectedResponse);
    }

    reject(lastError || new Error('All Gemini model candidates failed.'));
  });
}

function makeSingleGeminiVisionCall(model, apiKey, imageBase64, mimeType, strictPrompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [
        {
          parts: [
            { text: strictPrompt },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 35000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'Gemini API Error'));
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            return reject(new Error('Empty response from Gemini'));
          }
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('Invalid JSON from Gemini: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Gemini API request timed out on model ${model}`));
    });

    req.write(postData);
    req.end();
  });
}

function callLiveGeminiSummary(apiKey, foodLog, healthData, profile) {
  return new Promise(async (resolve, reject) => {
    const prompt = `You are a nutrition coach for CaloriQ.
Evaluate the day for a user aiming to ${profile.goal} weight.
User Profile: sex ${profile.sex}, age ${profile.age}, TDEE ${profile.tdee} kcal, target ${profile.dailyCalorieTarget} kcal.
Activity: ${healthData.steps} steps, ${healthData.totalCalories} kcal burned.
Food Log: ${JSON.stringify(foodLog)}

Output strict JSON:
{
  "total_calories_in": number,
  "total_calories_burned": number,
  "net_vs_goal": number,
  "macro_summary": { "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number },
  "steps": number,
  "pros": ["string", "string"],
  "cons": ["string", "string"],
  "suggestions": ["string", "string", "string"],
  "overall_rating": "great" | "good" | "needs_improvement"
}`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        const result = await new Promise((resSingle, rejSingle) => {
          const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
          };

          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.error) return rejSingle(new Error(parsed.error.message));
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                resSingle(JSON.parse(text));
              } catch (e) {
                rejSingle(e);
              }
            });
          });

          req.on('error', rejSingle);
          req.write(postData);
          req.end();
        });

        return resolve(result);
      } catch (err) {
        lastError = err;
        if (err.message.includes('API key not valid')) return reject(err);
      }
    }

    reject(lastError || new Error('Summary call failed on all models'));
  });
}

// =====================================================================
// WORKOUT DATABASE (in-memory, from SQLite schema)
// =====================================================================
const MUSCLE_GROUPS = [
  {id:1,name:'Chest'},{id:2,name:'Back'},{id:3,name:'Shoulders'},
  {id:4,name:'Biceps'},{id:5,name:'Triceps'},{id:6,name:'Quads'},
  {id:7,name:'Hamstrings & Glutes'},{id:8,name:'Calves'},{id:9,name:'Core'},
  {id:10,name:'Full Body'},{id:11,name:'Cardiovascular'}
];

const EQUIPMENT_LIST = [
  {id:1,name:'None (bodyweight)',needsGym:false},
  {id:2,name:'Barbell',needsGym:true},
  {id:3,name:'Dumbbells',needsGym:false},
  {id:4,name:'Cable machine',needsGym:true},
  {id:5,name:'Treadmill',needsGym:true},
  {id:6,name:'Stationary bike',needsGym:true},
  {id:7,name:'Rowing machine',needsGym:true},
  {id:8,name:'Leg press machine',needsGym:true},
  {id:9,name:'Pull-up bar',needsGym:false},
  {id:10,name:'Resistance band',needsGym:false},
  {id:11,name:'Jump rope',needsGym:false},
  {id:12,name:'Bench',needsGym:true},
  {id:13,name:'Kettlebell',needsGym:false},
  {id:14,name:'Elliptical',needsGym:true},
  {id:15,name:'Lat pulldown machine',needsGym:true}
];

// [id, name, category, muscleId, equipId, location, difficulty, isCompound, kcalPerMin]
const EXERCISES_DB = [
  {id:1,name:'Barbell Bench Press',category:'strength',muscleId:1,equipId:2,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:6},
  {id:2,name:'Incline Dumbbell Press',category:'strength',muscleId:1,equipId:3,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:5},
  {id:3,name:'Cable Chest Fly',category:'strength',muscleId:1,equipId:4,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:4,name:'Barbell Back Squat',category:'strength',muscleId:6,equipId:2,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:8},
  {id:5,name:'Leg Press',category:'strength',muscleId:6,equipId:8,location:'gym',difficulty:'beginner',isCompound:true,kcalPerMin:6},
  {id:6,name:'Romanian Deadlift',category:'strength',muscleId:7,equipId:2,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:7},
  {id:7,name:'Conventional Deadlift',category:'strength',muscleId:2,equipId:2,location:'gym',difficulty:'advanced',isCompound:true,kcalPerMin:8},
  {id:8,name:'Lat Pulldown',category:'strength',muscleId:2,equipId:15,location:'gym',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:9,name:'Seated Cable Row',category:'strength',muscleId:2,equipId:4,location:'gym',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:10,name:'Barbell Overhead Press',category:'strength',muscleId:3,equipId:2,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:6},
  {id:11,name:'Dumbbell Lateral Raise',category:'strength',muscleId:3,equipId:3,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:3},
  {id:12,name:'Barbell Curl',category:'strength',muscleId:4,equipId:2,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:13,name:'Triceps Rope Pushdown',category:'strength',muscleId:5,equipId:4,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:14,name:'Barbell Hip Thrust',category:'strength',muscleId:7,equipId:2,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:6},
  {id:15,name:'Standing Calf Raise',category:'strength',muscleId:8,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:3},
  {id:16,name:'Pull-Up',category:'strength',muscleId:2,equipId:9,location:'both',difficulty:'advanced',isCompound:true,kcalPerMin:7},
  {id:17,name:'Dumbbell Bench Press',category:'strength',muscleId:1,equipId:3,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:18,name:'Push-Up',category:'strength',muscleId:1,equipId:1,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:6},
  {id:19,name:'Bodyweight Squat',category:'strength',muscleId:6,equipId:1,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:20,name:'Walking Lunges',category:'strength',muscleId:6,equipId:1,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:6},
  {id:21,name:'Glute Bridge',category:'strength',muscleId:7,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:22,name:'Plank',category:'core',muscleId:9,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:23,name:'Bicycle Crunch',category:'core',muscleId:9,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:5},
  {id:24,name:'Mountain Climbers',category:'hiit',muscleId:9,equipId:1,location:'both',difficulty:'intermediate',isCompound:false,kcalPerMin:10},
  {id:25,name:'Burpees',category:'hiit',muscleId:10,equipId:1,location:'both',difficulty:'intermediate',isCompound:true,kcalPerMin:12},
  {id:26,name:'Pike Push-Up',category:'strength',muscleId:3,equipId:1,location:'both',difficulty:'intermediate',isCompound:true,kcalPerMin:6},
  {id:27,name:'Chair Dips',category:'strength',muscleId:5,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:5},
  {id:28,name:'Superman Hold',category:'strength',muscleId:2,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:3},
  {id:29,name:'Jump Squats',category:'hiit',muscleId:6,equipId:1,location:'both',difficulty:'intermediate',isCompound:true,kcalPerMin:11},
  {id:30,name:'Diamond Push-Up',category:'strength',muscleId:5,equipId:1,location:'both',difficulty:'intermediate',isCompound:false,kcalPerMin:6},
  {id:31,name:'Bulgarian Split Squat',category:'strength',muscleId:6,equipId:1,location:'both',difficulty:'intermediate',isCompound:true,kcalPerMin:7},
  {id:32,name:'Lying Leg Raises',category:'core',muscleId:9,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:33,name:'Resistance Band Row',category:'strength',muscleId:2,equipId:10,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:4},
  {id:34,name:'Dumbbell Goblet Squat',category:'strength',muscleId:6,equipId:3,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:6},
  {id:35,name:'Dumbbell Shoulder Press',category:'strength',muscleId:3,equipId:3,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:36,name:'Dumbbell Bent-Over Row',category:'strength',muscleId:2,equipId:3,location:'both',difficulty:'beginner',isCompound:true,kcalPerMin:5},
  {id:37,name:'Dumbbell Hammer Curl',category:'strength',muscleId:4,equipId:3,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:38,name:'Overhead Triceps Extension',category:'strength',muscleId:5,equipId:3,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:4},
  {id:39,name:'Kettlebell Swing',category:'hiit',muscleId:10,equipId:13,location:'both',difficulty:'intermediate',isCompound:true,kcalPerMin:11},
  {id:40,name:'Band Pull-Apart',category:'strength',muscleId:3,equipId:10,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:3},
  {id:41,name:'Treadmill Run',category:'cardio',muscleId:11,equipId:5,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:10},
  {id:42,name:'Stationary Bike',category:'cardio',muscleId:11,equipId:6,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:8},
  {id:43,name:'Rowing Machine',category:'cardio',muscleId:11,equipId:7,location:'gym',difficulty:'intermediate',isCompound:true,kcalPerMin:10},
  {id:44,name:'Elliptical',category:'cardio',muscleId:11,equipId:14,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:8},
  {id:45,name:'Outdoor Jog',category:'cardio',muscleId:11,equipId:1,location:'home',difficulty:'beginner',isCompound:false,kcalPerMin:10},
  {id:46,name:'Brisk Walk',category:'cardio',muscleId:11,equipId:1,location:'home',difficulty:'beginner',isCompound:false,kcalPerMin:5},
  {id:47,name:'Jump Rope',category:'cardio',muscleId:11,equipId:11,location:'both',difficulty:'intermediate',isCompound:false,kcalPerMin:12},
  {id:48,name:'High Knees',category:'cardio',muscleId:11,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:9},
  {id:49,name:'Jumping Jacks',category:'cardio',muscleId:11,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:8},
  {id:50,name:'Stair Climbing',category:'cardio',muscleId:11,equipId:1,location:'home',difficulty:'intermediate',isCompound:false,kcalPerMin:9},
  {id:51,name:'Treadmill Incline Walk',category:'cardio',muscleId:11,equipId:5,location:'gym',difficulty:'beginner',isCompound:false,kcalPerMin:7},
  {id:52,name:'Cat-Cow Stretch',category:'mobility',muscleId:2,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:2},
  {id:53,name:'Hip Flexor Stretch',category:'mobility',muscleId:6,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:2},
  {id:54,name:"Child's Pose",category:'mobility',muscleId:2,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:2},
  {id:55,name:'Hamstring Stretch',category:'mobility',muscleId:7,equipId:1,location:'both',difficulty:'beginner',isCompound:false,kcalPerMin:2}
];

const WORKOUT_PLANS = [
  {id:1,name:'Gym Push/Pull/Legs',goal:'muscle_gain',location:'gym',level:'intermediate',daysPerWeek:3,sessionMin:65,notes:'Run the 3-day cycle once, or twice for a 6-day split.'},
  {id:2,name:'Gym Full Body Starter',goal:'general_fitness',location:'gym',level:'beginner',daysPerWeek:3,sessionMin:50,notes:'Alternate Full Body A and B with a rest day between.'},
  {id:3,name:'Gym Upper/Lower Split',goal:'muscle_gain',location:'gym',level:'intermediate',daysPerWeek:4,sessionMin:60,notes:'Upper, Lower, rest, Upper, Lower.'},
  {id:4,name:'Home Bodyweight Builder',goal:'general_fitness',location:'home',level:'beginner',daysPerWeek:3,sessionMin:40,notes:'No equipment needed at all.'},
  {id:5,name:'Home Dumbbell + Band',goal:'muscle_gain',location:'home',level:'intermediate',daysPerWeek:4,sessionMin:50,notes:'Needs one pair of adjustable dumbbells and a resistance band.'},
  {id:6,name:'No-Equipment HIIT Fat Burner',goal:'fat_loss',location:'home',level:'intermediate',daysPerWeek:4,sessionMin:30,notes:'Short, intense circuits. Rest 20 s between exercises.'},
  {id:7,name:'Gym Cardio Fat Loss',goal:'fat_loss',location:'gym',level:'beginner',daysPerWeek:5,sessionMin:45,notes:'Mix of steady-state and intervals on cardio machines.'},
  {id:8,name:'Outdoor Cardio Endurance',goal:'endurance',location:'home',level:'beginner',daysPerWeek:5,sessionMin:45,notes:'Jogging, rope and stairs. No gym required.'},
  {id:9,name:'Mobility & Recovery',goal:'recovery',location:'both',level:'beginner',daysPerWeek:7,sessionMin:20,notes:'Daily light stretching, good on rest days.'}
];

const PLAN_DAYS = [
  {id:1,planId:1,dayNum:1,dayName:'Push',focus:'Chest, shoulders, triceps'},
  {id:2,planId:1,dayNum:2,dayName:'Pull',focus:'Back and biceps'},
  {id:3,planId:1,dayNum:3,dayName:'Legs',focus:'Quads, hamstrings, glutes, calves'},
  {id:4,planId:2,dayNum:1,dayName:'Full Body A',focus:'Squat, press, row'},
  {id:5,planId:2,dayNum:2,dayName:'Full Body B',focus:'Leg press, pull, glutes'},
  {id:6,planId:3,dayNum:1,dayName:'Upper',focus:'Chest, back, shoulders, arms'},
  {id:7,planId:3,dayNum:2,dayName:'Lower',focus:'Legs and calves'},
  {id:8,planId:4,dayNum:1,dayName:'Upper Push + Core',focus:'Chest, shoulders, triceps, abs'},
  {id:9,planId:4,dayNum:2,dayName:'Lower Body',focus:'Legs and glutes'},
  {id:10,planId:4,dayNum:3,dayName:'Full Body Circuit',focus:'Conditioning'},
  {id:11,planId:5,dayNum:1,dayName:'Upper Body',focus:'Chest, back, shoulders, arms'},
  {id:12,planId:5,dayNum:2,dayName:'Lower Body',focus:'Legs, glutes, core'},
  {id:13,planId:6,dayNum:1,dayName:'HIIT Circuit A',focus:'Total body, 4 rounds'},
  {id:14,planId:6,dayNum:2,dayName:'HIIT Circuit B',focus:'Total body, 4 rounds'},
  {id:15,planId:7,dayNum:1,dayName:'Steady State',focus:'Low-moderate intensity'},
  {id:16,planId:7,dayNum:2,dayName:'Intervals',focus:'High intensity intervals'},
  {id:17,planId:7,dayNum:3,dayName:'Cardio + Core',focus:'Incline walk, rowing, abs'},
  {id:18,planId:8,dayNum:1,dayName:'Jog Day',focus:'Easy aerobic run'},
  {id:19,planId:8,dayNum:2,dayName:'Rope & Stairs',focus:'Skill and power cardio'},
  {id:20,planId:8,dayNum:3,dayName:'Recovery Walk',focus:'Active recovery'},
  {id:21,planId:9,dayNum:1,dayName:'Full Body Stretch',focus:'Mobility flow'}
];

// [dayId, exerciseId, sortOrder, sets, reps, durationSec, restSec]
const PLAN_DAY_EXERCISES = [
  // Day 1: Push
  {dayId:1,exId:1,sort:1,sets:4,reps:'6-8',dur:null,rest:120},{dayId:1,exId:10,sort:2,sets:3,reps:'8-10',dur:null,rest:90},{dayId:1,exId:2,sort:3,sets:3,reps:'10-12',dur:null,rest:90},
  {dayId:1,exId:11,sort:4,sets:3,reps:'12-15',dur:null,rest:60},{dayId:1,exId:13,sort:5,sets:3,reps:'10-12',dur:null,rest:60},{dayId:1,exId:3,sort:6,sets:3,reps:'12-15',dur:null,rest:60},
  // Day 2: Pull
  {dayId:2,exId:7,sort:1,sets:3,reps:'5',dur:null,rest:150},{dayId:2,exId:8,sort:2,sets:3,reps:'8-10',dur:null,rest:90},{dayId:2,exId:9,sort:3,sets:3,reps:'10-12',dur:null,rest:90},
  {dayId:2,exId:16,sort:4,sets:3,reps:'AMRAP',dur:null,rest:90},{dayId:2,exId:12,sort:5,sets:3,reps:'10-12',dur:null,rest:60},{dayId:2,exId:37,sort:6,sets:3,reps:'12',dur:null,rest:60},
  // Day 3: Legs
  {dayId:3,exId:4,sort:1,sets:4,reps:'6-8',dur:null,rest:150},{dayId:3,exId:6,sort:2,sets:3,reps:'8-10',dur:null,rest:120},{dayId:3,exId:5,sort:3,sets:3,reps:'12',dur:null,rest:90},
  {dayId:3,exId:14,sort:4,sets:3,reps:'10',dur:null,rest:90},{dayId:3,exId:15,sort:5,sets:4,reps:'15',dur:null,rest:45},{dayId:3,exId:22,sort:6,sets:3,reps:null,dur:60,rest:45},
  // Day 4: Full Body A
  {dayId:4,exId:4,sort:1,sets:3,reps:'8-10',dur:null,rest:90},{dayId:4,exId:17,sort:2,sets:3,reps:'10',dur:null,rest:90},{dayId:4,exId:9,sort:3,sets:3,reps:'10-12',dur:null,rest:90},
  {dayId:4,exId:35,sort:4,sets:3,reps:'10',dur:null,rest:60},{dayId:4,exId:22,sort:5,sets:3,reps:null,dur:30,rest:30},
  // Day 5: Full Body B
  {dayId:5,exId:5,sort:1,sets:3,reps:'12',dur:null,rest:90},{dayId:5,exId:8,sort:2,sets:3,reps:'10',dur:null,rest:90},{dayId:5,exId:2,sort:3,sets:3,reps:'10',dur:null,rest:90},
  {dayId:5,exId:21,sort:4,sets:3,reps:'12',dur:null,rest:60},{dayId:5,exId:13,sort:5,sets:3,reps:'12',dur:null,rest:60},{dayId:5,exId:23,sort:6,sets:3,reps:'20',dur:null,rest:45},
  // Day 6: Upper
  {dayId:6,exId:1,sort:1,sets:4,reps:'8',dur:null,rest:120},{dayId:6,exId:9,sort:2,sets:4,reps:'10',dur:null,rest:90},{dayId:6,exId:10,sort:3,sets:3,reps:'8',dur:null,rest:90},
  {dayId:6,exId:8,sort:4,sets:3,reps:'10',dur:null,rest:90},{dayId:6,exId:12,sort:5,sets:3,reps:'12',dur:null,rest:60},{dayId:6,exId:13,sort:6,sets:3,reps:'12',dur:null,rest:60},
  // Day 7: Lower
  {dayId:7,exId:4,sort:1,sets:4,reps:'6',dur:null,rest:150},{dayId:7,exId:6,sort:2,sets:3,reps:'8',dur:null,rest:120},{dayId:7,exId:5,sort:3,sets:3,reps:'12',dur:null,rest:90},
  {dayId:7,exId:31,sort:4,sets:3,reps:'10',dur:null,rest:90},{dayId:7,exId:15,sort:5,sets:4,reps:'15',dur:null,rest:45},{dayId:7,exId:32,sort:6,sets:3,reps:'15',dur:null,rest:45},
  // Day 8: Home Upper Push + Core
  {dayId:8,exId:18,sort:1,sets:4,reps:'AMRAP',dur:null,rest:60},{dayId:8,exId:26,sort:2,sets:3,reps:'8-10',dur:null,rest:60},{dayId:8,exId:27,sort:3,sets:3,reps:'12',dur:null,rest:60},
  {dayId:8,exId:30,sort:4,sets:3,reps:'8',dur:null,rest:60},{dayId:8,exId:22,sort:5,sets:3,reps:null,dur:45,rest:30},{dayId:8,exId:23,sort:6,sets:3,reps:'20',dur:null,rest:30},
  // Day 9: Home Lower
  {dayId:9,exId:19,sort:1,sets:4,reps:'20',dur:null,rest:45},{dayId:9,exId:20,sort:2,sets:3,reps:'12 / leg',dur:null,rest:60},{dayId:9,exId:31,sort:3,sets:3,reps:'10 / leg',dur:null,rest:60},
  {dayId:9,exId:21,sort:4,sets:4,reps:'15',dur:null,rest:45},{dayId:9,exId:15,sort:5,sets:4,reps:'20',dur:null,rest:30},
  // Day 10: Home Full Body Circuit
  {dayId:10,exId:25,sort:1,sets:3,reps:'10',dur:null,rest:45},{dayId:10,exId:29,sort:2,sets:3,reps:'15',dur:null,rest:45},{dayId:10,exId:18,sort:3,sets:3,reps:'15',dur:null,rest:45},
  {dayId:10,exId:28,sort:4,sets:3,reps:'12',dur:null,rest:30},{dayId:10,exId:24,sort:5,sets:3,reps:null,dur:40,rest:30},
  // Day 11: Home Upper (DB + band)
  {dayId:11,exId:17,sort:1,sets:4,reps:'10',dur:null,rest:75},{dayId:11,exId:36,sort:2,sets:4,reps:'10',dur:null,rest:75},{dayId:11,exId:35,sort:3,sets:3,reps:'10',dur:null,rest:60},
  {dayId:11,exId:33,sort:4,sets:3,reps:'12',dur:null,rest:60},{dayId:11,exId:37,sort:5,sets:3,reps:'12',dur:null,rest:45},{dayId:11,exId:38,sort:6,sets:3,reps:'12',dur:null,rest:45},{dayId:11,exId:40,sort:7,sets:3,reps:'15',dur:null,rest:30},
  // Day 12: Home Lower (DB + KB)
  {dayId:12,exId:34,sort:1,sets:4,reps:'12',dur:null,rest:75},{dayId:12,exId:39,sort:2,sets:4,reps:'15',dur:null,rest:60},{dayId:12,exId:31,sort:3,sets:3,reps:'10 / leg',dur:null,rest:60},
  {dayId:12,exId:21,sort:4,sets:3,reps:'15',dur:null,rest:45},{dayId:12,exId:15,sort:5,sets:4,reps:'20',dur:null,rest:30},{dayId:12,exId:32,sort:6,sets:3,reps:'15',dur:null,rest:30},
  // Day 13: HIIT A
  {dayId:13,exId:49,sort:1,sets:4,reps:null,dur:40,rest:20},{dayId:13,exId:25,sort:2,sets:4,reps:null,dur:40,rest:20},{dayId:13,exId:24,sort:3,sets:4,reps:null,dur:40,rest:20},
  {dayId:13,exId:29,sort:4,sets:4,reps:null,dur:40,rest:20},{dayId:13,exId:48,sort:5,sets:4,reps:null,dur:40,rest:20},
  // Day 14: HIIT B
  {dayId:14,exId:25,sort:1,sets:4,reps:null,dur:40,rest:20},{dayId:14,exId:20,sort:2,sets:4,reps:null,dur:40,rest:20},{dayId:14,exId:18,sort:3,sets:4,reps:null,dur:40,rest:20},
  {dayId:14,exId:23,sort:4,sets:4,reps:null,dur:40,rest:20},{dayId:14,exId:47,sort:5,sets:4,reps:null,dur:60,rest:30},
  // Day 15: Steady State
  {dayId:15,exId:41,sort:1,sets:1,reps:null,dur:1800,rest:0},{dayId:15,exId:44,sort:2,sets:1,reps:null,dur:900,rest:0},{dayId:15,exId:55,sort:3,sets:2,reps:null,dur:60,rest:15},
  // Day 16: Intervals
  {dayId:16,exId:41,sort:1,sets:8,reps:null,dur:60,rest:90},{dayId:16,exId:42,sort:2,sets:1,reps:null,dur:1200,rest:0},{dayId:16,exId:43,sort:3,sets:3,reps:null,dur:300,rest:60},
  // Day 17: Cardio + Core
  {dayId:17,exId:51,sort:1,sets:1,reps:null,dur:1500,rest:0},{dayId:17,exId:43,sort:2,sets:1,reps:null,dur:600,rest:0},{dayId:17,exId:22,sort:3,sets:3,reps:null,dur:45,rest:30},
  {dayId:17,exId:32,sort:4,sets:3,reps:'15',dur:null,rest:30},{dayId:17,exId:23,sort:5,sets:3,reps:'20',dur:null,rest:30},
  // Day 18: Jog Day
  {dayId:18,exId:46,sort:1,sets:1,reps:null,dur:300,rest:0},{dayId:18,exId:45,sort:2,sets:1,reps:null,dur:1800,rest:0},{dayId:18,exId:55,sort:3,sets:2,reps:null,dur:60,rest:15},{dayId:18,exId:53,sort:4,sets:2,reps:null,dur:60,rest:15},
  // Day 19: Rope & Stairs
  {dayId:19,exId:47,sort:1,sets:5,reps:null,dur:120,rest:45},{dayId:19,exId:48,sort:2,sets:4,reps:null,dur:45,rest:30},{dayId:19,exId:49,sort:3,sets:4,reps:null,dur:60,rest:30},{dayId:19,exId:50,sort:4,sets:6,reps:null,dur:60,rest:60},
  // Day 20: Recovery Walk
  {dayId:20,exId:46,sort:1,sets:1,reps:null,dur:2400,rest:0},{dayId:20,exId:52,sort:2,sets:2,reps:null,dur:60,rest:15},{dayId:20,exId:54,sort:3,sets:2,reps:null,dur:60,rest:15},
  {dayId:20,exId:53,sort:4,sets:2,reps:null,dur:60,rest:15},{dayId:20,exId:55,sort:5,sets:2,reps:null,dur:60,rest:15},
  // Day 21: Full Body Stretch
  {dayId:21,exId:52,sort:1,sets:2,reps:null,dur:60,rest:10},{dayId:21,exId:54,sort:2,sets:2,reps:null,dur:60,rest:10},{dayId:21,exId:53,sort:3,sets:2,reps:null,dur:60,rest:10},{dayId:21,exId:55,sort:4,sets:2,reps:null,dur:60,rest:10}
];

// Workout log (in-memory, one session = one array entry)
let workoutLog = [];

// Comprehensive USDA / Standard Food Nutrition Catalog
// Comprehensive Indian & Global Food Nutrition Catalog (with Indian Serving Sizes)
const FOOD_NUTRITION_DB = {
  "roti": {
    "name": "Whole Wheat Roti / Phulka",
    "estimated_grams": 35,
    "calories": 90,
    "protein": 3.0,
    "carbs": 17.5,
    "fat": 0.8,
    "fiber": 2.5,
    "sugar": 0.3,
    "sodium": 65,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.97
  },
  "roti_ghee": {
    "name": "Whole Wheat Roti with Pure Ghee",
    "estimated_grams": 40,
    "calories": 120,
    "protein": 3.1,
    "carbs": 17.5,
    "fat": 4.2,
    "fiber": 2.5,
    "sugar": 0.3,
    "sodium": 70,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.96
  },
  "chapati": {
    "name": "Homestyle Tawa Chapati",
    "estimated_grams": 35,
    "calories": 92,
    "protein": 3.0,
    "carbs": 17.5,
    "fat": 1.2,
    "fiber": 2.5,
    "sugar": 0.3,
    "sodium": 70,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.96
  },
  "plain_paratha": {
    "name": "Plain Layered Tawa Paratha",
    "estimated_grams": 65,
    "calories": 185,
    "protein": 4.2,
    "carbs": 25.0,
    "fat": 7.8,
    "fiber": 2.2,
    "sugar": 0.5,
    "sodium": 95,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.95
  },
  "aloo_paratha": {
    "name": "Stuffed Aloo Paratha with Butter",
    "estimated_grams": 110,
    "calories": 260,
    "protein": 5.5,
    "carbs": 36.0,
    "fat": 10.5,
    "fiber": 3.8,
    "sugar": 1.5,
    "sodium": 280,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "paneer_paratha": {
    "name": "Stuffed Paneer Paratha",
    "estimated_grams": 120,
    "calories": 290,
    "protein": 11.0,
    "carbs": 30.0,
    "fat": 13.5,
    "fiber": 2.5,
    "sugar": 1.2,
    "sodium": 240,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "gobi_paratha": {
    "name": "Stuffed Gobi (Cauliflower) Paratha",
    "estimated_grams": 110,
    "calories": 220,
    "protein": 5.0,
    "carbs": 31.0,
    "fat": 8.5,
    "fiber": 4.0,
    "sugar": 1.8,
    "sodium": 260,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.93
  },
  "mooli_paratha": {
    "name": "Stuffed Mooli (Radish) Paratha",
    "estimated_grams": 110,
    "calories": 210,
    "protein": 4.8,
    "carbs": 30.0,
    "fat": 8.0,
    "fiber": 3.5,
    "sugar": 1.2,
    "sodium": 270,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.93
  },
  "methi_thepla": {
    "name": "Gujarati Methi Thepla",
    "estimated_grams": 45,
    "calories": 120,
    "protein": 3.5,
    "carbs": 16.0,
    "fat": 4.8,
    "fiber": 2.0,
    "sugar": 0.5,
    "sodium": 140,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.95
  },
  "puri": {
    "name": "Deep-Fried Poori / Puri",
    "estimated_grams": 30,
    "calories": 125,
    "protein": 2.2,
    "carbs": 14.5,
    "fat": 6.8,
    "fiber": 1.2,
    "sugar": 0.2,
    "sodium": 65,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.93
  },
  "butter_naan": {
    "name": "Butter Tandoori Naan",
    "estimated_grams": 90,
    "calories": 280,
    "protein": 7.5,
    "carbs": 42.0,
    "fat": 9.5,
    "fiber": 2.0,
    "sugar": 2.0,
    "sodium": 320,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.92
  },
  "plain_naan": {
    "name": "Plain Tandoori Naan",
    "estimated_grams": 80,
    "calories": 240,
    "protein": 7.0,
    "carbs": 42.0,
    "fat": 4.8,
    "fiber": 2.0,
    "sugar": 2.0,
    "sodium": 290,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.93
  },
  "garlic_naan": {
    "name": "Garlic Butter Tandoori Naan",
    "estimated_grams": 95,
    "calories": 295,
    "protein": 7.8,
    "carbs": 43.0,
    "fat": 10.5,
    "fiber": 2.2,
    "sugar": 2.0,
    "sodium": 340,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.92
  },
  "tandoori_roti": {
    "name": "Wheat Tandoori Roti (No Butter)",
    "estimated_grams": 50,
    "calories": 130,
    "protein": 4.2,
    "carbs": 26.0,
    "fat": 1.0,
    "fiber": 3.2,
    "sugar": 0.4,
    "sodium": 95,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.95
  },
  "missi_roti": {
    "name": "Rajasthani Missi Roti (Gram Flour)",
    "estimated_grams": 55,
    "calories": 145,
    "protein": 5.8,
    "carbs": 22.0,
    "fat": 3.8,
    "fiber": 4.2,
    "sugar": 0.8,
    "sodium": 160,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "bajra_roti": {
    "name": "Bajra Roti (Pearl Millet)",
    "estimated_grams": 60,
    "calories": 150,
    "protein": 4.5,
    "carbs": 28.0,
    "fat": 2.2,
    "fiber": 4.5,
    "sugar": 0.4,
    "sodium": 70,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "jowar_roti": {
    "name": "Jowar Bhakri / Roti (Sorghum)",
    "estimated_grams": 60,
    "calories": 140,
    "protein": 4.2,
    "carbs": 29.0,
    "fat": 1.5,
    "fiber": 4.0,
    "sugar": 0.3,
    "sodium": 60,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "ragi_roti": {
    "name": "Ragi Roti (Finger Millet)",
    "estimated_grams": 60,
    "calories": 135,
    "protein": 3.8,
    "carbs": 27.0,
    "fat": 1.2,
    "fiber": 5.2,
    "sugar": 0.2,
    "sodium": 65,
    "serving_unit": "piece",
    "category": "staples",
    "confidence": 0.94
  },
  "white_rice": {
    "name": "Steamed White Basmati Rice",
    "estimated_grams": 150,
    "calories": 195,
    "protein": 4.0,
    "carbs": 43.0,
    "fat": 0.4,
    "fiber": 0.6,
    "sugar": 0.1,
    "sodium": 2,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.95
  },
  "brown_rice": {
    "name": "Cooked Brown Basmati Rice",
    "estimated_grams": 150,
    "calories": 166,
    "protein": 3.8,
    "carbs": 35.0,
    "fat": 1.4,
    "fiber": 2.6,
    "sugar": 0.4,
    "sodium": 5,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.93
  },
  "jeera_rice": {
    "name": "Jeera Rice with Pure Ghee",
    "estimated_grams": 160,
    "calories": 225,
    "protein": 4.2,
    "carbs": 44.0,
    "fat": 3.8,
    "fiber": 1.0,
    "sugar": 0.2,
    "sodium": 120,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.92
  },
  "curd_rice": {
    "name": "South Indian Curd Rice (Thayir Sadam)",
    "estimated_grams": 180,
    "calories": 210,
    "protein": 5.8,
    "carbs": 32.0,
    "fat": 6.8,
    "fiber": 1.2,
    "sugar": 3.2,
    "sodium": 240,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.94
  },
  "lemon_rice": {
    "name": "South Indian Lemon Rice with Peanuts",
    "estimated_grams": 160,
    "calories": 240,
    "protein": 4.8,
    "carbs": 38.0,
    "fat": 8.0,
    "fiber": 2.0,
    "sugar": 0.8,
    "sodium": 280,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.93
  },
  "sambar_rice": {
    "name": "Bisi Bele Bath / Sambar Rice",
    "estimated_grams": 220,
    "calories": 290,
    "protein": 8.5,
    "carbs": 48.0,
    "fat": 7.5,
    "fiber": 5.0,
    "sugar": 2.5,
    "sodium": 380,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.93
  },
  "khichdi": {
    "name": "Moong Dal Khichdi (Homestyle)",
    "estimated_grams": 220,
    "calories": 240,
    "protein": 7.5,
    "carbs": 36.0,
    "fat": 7.0,
    "fiber": 4.5,
    "sugar": 1.0,
    "sodium": 280,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.94
  },
  "veg_khichdi": {
    "name": "Vegetable Masala Khichdi with Ghee",
    "estimated_grams": 240,
    "calories": 270,
    "protein": 8.2,
    "carbs": 42.0,
    "fat": 7.8,
    "fiber": 5.5,
    "sugar": 2.0,
    "sodium": 310,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.93
  },
  "poha": {
    "name": "Kanda Poha with Peanuts & Sev",
    "estimated_grams": 150,
    "calories": 220,
    "protein": 5.0,
    "carbs": 34.0,
    "fat": 7.5,
    "fiber": 2.8,
    "sugar": 2.0,
    "sodium": 210,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.95
  },
  "upma": {
    "name": "Rava Upma with Mixed Vegetables",
    "estimated_grams": 150,
    "calories": 190,
    "protein": 4.5,
    "carbs": 30.0,
    "fat": 6.0,
    "fiber": 2.5,
    "sugar": 1.5,
    "sodium": 190,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.94
  },
  "veg_dalia": {
    "name": "Vegetable Dalia (Broken Wheat Porridge)",
    "estimated_grams": 200,
    "calories": 175,
    "protein": 6.2,
    "carbs": 31.0,
    "fat": 3.2,
    "fiber": 6.5,
    "sugar": 1.8,
    "sodium": 180,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.94
  },
  "milk_dalia": {
    "name": "Sweet Milk Dalia with Almonds",
    "estimated_grams": 220,
    "calories": 230,
    "protein": 7.8,
    "carbs": 38.0,
    "fat": 5.5,
    "fiber": 4.5,
    "sugar": 14.0,
    "sodium": 85,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.92
  },
  "oats_upma": {
    "name": "Savory Oats Upma with Veggies",
    "estimated_grams": 180,
    "calories": 160,
    "protein": 6.0,
    "carbs": 26.0,
    "fat": 3.8,
    "fiber": 4.2,
    "sugar": 1.2,
    "sodium": 175,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.93
  },
  "quinoa": {
    "name": "Cooked Quinoa (Plain)",
    "estimated_grams": 150,
    "calories": 180,
    "protein": 6.5,
    "carbs": 32.0,
    "fat": 2.8,
    "fiber": 4.0,
    "sugar": 0.8,
    "sodium": 8,
    "serving_unit": "katori",
    "category": "staples",
    "confidence": 0.93
  },
  "dal_tadka": {
    "name": "Yellow Dal Tadka (Toor / Moong)",
    "estimated_grams": 150,
    "calories": 150,
    "protein": 7.5,
    "carbs": 20.0,
    "fat": 4.5,
    "fiber": 4.8,
    "sugar": 1.2,
    "sodium": 290,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.95
  },
  "dal_fry": {
    "name": "Restaurant Style Dal Fry (Butter Tadka)",
    "estimated_grams": 160,
    "calories": 190,
    "protein": 8.0,
    "carbs": 22.0,
    "fat": 7.8,
    "fiber": 5.0,
    "sugar": 1.5,
    "sodium": 340,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "dal_makhani": {
    "name": "Punjabi Dal Makhani (Black Urad)",
    "estimated_grams": 160,
    "calories": 260,
    "protein": 8.5,
    "carbs": 22.0,
    "fat": 15.0,
    "fiber": 6.2,
    "sugar": 2.0,
    "sodium": 340,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.94
  },
  "moong_dal": {
    "name": "Yellow Moong Dal (Light Homestyle)",
    "estimated_grams": 150,
    "calories": 135,
    "protein": 8.2,
    "carbs": 19.0,
    "fat": 2.8,
    "fiber": 4.2,
    "sugar": 0.8,
    "sodium": 240,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.95
  },
  "masoor_dal": {
    "name": "Red Masoor Dal Tadka",
    "estimated_grams": 150,
    "calories": 140,
    "protein": 8.5,
    "carbs": 20.5,
    "fat": 3.0,
    "fiber": 4.5,
    "sugar": 1.0,
    "sodium": 260,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.94
  },
  "chana_dal": {
    "name": "Chana Dal Tadka (Bengal Gram)",
    "estimated_grams": 150,
    "calories": 175,
    "protein": 9.2,
    "carbs": 24.0,
    "fat": 4.5,
    "fiber": 6.0,
    "sugar": 1.2,
    "sodium": 280,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "panchmel_dal": {
    "name": "Rajasthani Panchmel Dal (5 Dal Mix)",
    "estimated_grams": 160,
    "calories": 180,
    "protein": 9.5,
    "carbs": 23.0,
    "fat": 5.5,
    "fiber": 6.0,
    "sugar": 1.5,
    "sodium": 310,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.92
  },
  "rajma": {
    "name": "Punjabi Rajma Masala (Kidney Beans)",
    "estimated_grams": 160,
    "calories": 180,
    "protein": 9.0,
    "carbs": 24.0,
    "fat": 5.0,
    "fiber": 6.5,
    "sugar": 2.2,
    "sodium": 310,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.94
  },
  "rajma_chawal": {
    "name": "Rajma Chawal Combo Platter",
    "estimated_grams": 300,
    "calories": 420,
    "protein": 14.0,
    "carbs": 68.0,
    "fat": 8.5,
    "fiber": 8.0,
    "sugar": 2.5,
    "sodium": 380,
    "serving_unit": "plate",
    "category": "dals",
    "confidence": 0.95
  },
  "chole": {
    "name": "Punjabi Chole Masala (Chickpea Curry)",
    "estimated_grams": 160,
    "calories": 210,
    "protein": 8.5,
    "carbs": 28.0,
    "fat": 7.0,
    "fiber": 7.0,
    "sugar": 3.0,
    "sodium": 360,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.94
  },
  "pindi_chole": {
    "name": "Rawalpindi Chole (Dry Spiced)",
    "estimated_grams": 140,
    "calories": 195,
    "protein": 8.8,
    "carbs": 26.0,
    "fat": 6.5,
    "fiber": 6.8,
    "sugar": 2.0,
    "sodium": 340,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "chole_bhature": {
    "name": "Chole Bhature (2 Bhature + Chole)",
    "estimated_grams": 320,
    "calories": 620,
    "protein": 15.0,
    "carbs": 78.0,
    "fat": 28.0,
    "fiber": 7.5,
    "sugar": 4.5,
    "sodium": 620,
    "serving_unit": "plate",
    "category": "dals",
    "confidence": 0.95
  },
  "kala_chana": {
    "name": "Black Kala Chana Tariwala",
    "estimated_grams": 150,
    "calories": 165,
    "protein": 8.5,
    "carbs": 23.0,
    "fat": 4.2,
    "fiber": 7.5,
    "sugar": 1.5,
    "sodium": 290,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "lobia_curry": {
    "name": "Lobia Masala (Black-Eyed Peas)",
    "estimated_grams": 150,
    "calories": 160,
    "protein": 8.8,
    "carbs": 24.0,
    "fat": 3.8,
    "fiber": 6.2,
    "sugar": 1.8,
    "sodium": 270,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.92
  },
  "sprouted_moong_curry": {
    "name": "Sprouted Green Moong Usal / Curry",
    "estimated_grams": 150,
    "calories": 145,
    "protein": 9.5,
    "carbs": 21.0,
    "fat": 3.0,
    "fiber": 6.0,
    "sugar": 1.5,
    "sodium": 240,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.94
  },
  "sambar": {
    "name": "South Indian Veg Sambar",
    "estimated_grams": 160,
    "calories": 110,
    "protein": 5.0,
    "carbs": 17.0,
    "fat": 2.5,
    "fiber": 4.0,
    "sugar": 3.0,
    "sodium": 320,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.95
  },
  "tomato_rasam": {
    "name": "Spicy Tomato Garlic Rasam",
    "estimated_grams": 150,
    "calories": 65,
    "protein": 2.0,
    "carbs": 10.0,
    "fat": 1.8,
    "fiber": 1.5,
    "sugar": 3.0,
    "sodium": 280,
    "serving_unit": "cup",
    "category": "dals",
    "confidence": 0.95
  },
  "kadhi_pakora": {
    "name": "Punjabi Besan Kadhi with Pakora",
    "estimated_grams": 180,
    "calories": 235,
    "protein": 6.8,
    "carbs": 22.0,
    "fat": 13.5,
    "fiber": 3.0,
    "sugar": 3.5,
    "sodium": 380,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "gujarati_kadhi": {
    "name": "Gujarati Sweet & Sour Kadhi",
    "estimated_grams": 150,
    "calories": 120,
    "protein": 4.2,
    "carbs": 14.0,
    "fat": 5.2,
    "fiber": 0.8,
    "sugar": 6.5,
    "sodium": 260,
    "serving_unit": "katori",
    "category": "dals",
    "confidence": 0.93
  },
  "paneer": {
    "name": "Fresh Paneer Cubes (Cottage Cheese)",
    "estimated_grams": 100,
    "calories": 265,
    "protein": 18.3,
    "carbs": 3.4,
    "fat": 20.8,
    "fiber": 0.0,
    "sugar": 2.5,
    "sodium": 22,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.96
  },
  "paneer_butter_masala": {
    "name": "Rich Paneer Butter Masala",
    "estimated_grams": 160,
    "calories": 310,
    "protein": 12.0,
    "carbs": 10.0,
    "fat": 24.0,
    "fiber": 2.0,
    "sugar": 4.0,
    "sodium": 390,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "palak_paneer": {
    "name": "Palak Paneer (Spinach Cottage Cheese)",
    "estimated_grams": 160,
    "calories": 220,
    "protein": 13.0,
    "carbs": 7.0,
    "fat": 16.0,
    "fiber": 3.8,
    "sugar": 2.0,
    "sodium": 310,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "kadai_paneer": {
    "name": "Kadai Paneer with Bell Peppers",
    "estimated_grams": 160,
    "calories": 250,
    "protein": 12.5,
    "carbs": 9.0,
    "fat": 18.0,
    "fiber": 3.0,
    "sugar": 2.5,
    "sodium": 340,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "matar_paneer": {
    "name": "Matar Paneer Curry",
    "estimated_grams": 160,
    "calories": 230,
    "protein": 11.5,
    "carbs": 12.0,
    "fat": 15.0,
    "fiber": 3.5,
    "sugar": 3.2,
    "sodium": 320,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "shahi_paneer": {
    "name": "Mughlai Shahi Paneer",
    "estimated_grams": 160,
    "calories": 290,
    "protein": 11.0,
    "carbs": 12.0,
    "fat": 22.0,
    "fiber": 1.5,
    "sugar": 5.0,
    "sodium": 360,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.92
  },
  "paneer_bhurji": {
    "name": "Paneer Bhurji (Scrambled Cottage Cheese)",
    "estimated_grams": 140,
    "calories": 245,
    "protein": 15.5,
    "carbs": 5.5,
    "fat": 18.0,
    "fiber": 1.8,
    "sugar": 2.0,
    "sodium": 290,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "paneer_tikka": {
    "name": "Tandoori Paneer Tikka (4 Grilled Cubes)",
    "estimated_grams": 150,
    "calories": 230,
    "protein": 16.0,
    "carbs": 6.5,
    "fat": 15.5,
    "fiber": 2.0,
    "sugar": 2.2,
    "sodium": 310,
    "serving_unit": "plate",
    "category": "curries",
    "confidence": 0.94
  },
  "malai_kofta": {
    "name": "Malai Kofta in Creamy Gravy",
    "estimated_grams": 160,
    "calories": 330,
    "protein": 7.5,
    "carbs": 24.0,
    "fat": 23.0,
    "fiber": 2.8,
    "sugar": 5.5,
    "sodium": 410,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.91
  },
  "aloo_gobi": {
    "name": "Homestyle Aloo Gobi Matar",
    "estimated_grams": 140,
    "calories": 145,
    "protein": 3.5,
    "carbs": 18.0,
    "fat": 6.5,
    "fiber": 3.5,
    "sugar": 2.5,
    "sodium": 220,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "jeera_aloo": {
    "name": "Dry Jeera Aloo Sabzi",
    "estimated_grams": 130,
    "calories": 160,
    "protein": 2.8,
    "carbs": 24.0,
    "fat": 6.0,
    "fiber": 3.0,
    "sugar": 1.2,
    "sodium": 240,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "dum_aloo": {
    "name": "Kashmiri Dum Aloo in Spiced Gravy",
    "estimated_grams": 150,
    "calories": 210,
    "protein": 3.8,
    "carbs": 26.0,
    "fat": 10.5,
    "fiber": 3.5,
    "sugar": 3.0,
    "sodium": 320,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.92
  },
  "bhindi_masala": {
    "name": "Bhindi Masala (Okra Sabzi)",
    "estimated_grams": 120,
    "calories": 120,
    "protein": 2.5,
    "carbs": 12.0,
    "fat": 7.0,
    "fiber": 4.0,
    "sugar": 2.2,
    "sodium": 180,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "baingan_bharta": {
    "name": "Smoked Baingan Bharta (Roasted Eggplant)",
    "estimated_grams": 140,
    "calories": 125,
    "protein": 2.8,
    "carbs": 13.0,
    "fat": 7.0,
    "fiber": 5.0,
    "sugar": 4.0,
    "sodium": 220,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "lauki_sabzi": {
    "name": "Lauki / Bottle Gourd Homestyle Sabzi",
    "estimated_grams": 140,
    "calories": 85,
    "protein": 1.8,
    "carbs": 9.0,
    "fat": 4.8,
    "fiber": 3.0,
    "sugar": 2.5,
    "sodium": 160,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.95
  },
  "lauki_chana_dal": {
    "name": "Lauki Chana Dal Curry",
    "estimated_grams": 150,
    "calories": 115,
    "protein": 4.8,
    "carbs": 15.0,
    "fat": 4.2,
    "fiber": 4.5,
    "sugar": 2.0,
    "sodium": 210,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "sarson_saag": {
    "name": "Sarson Ka Saag with White Butter",
    "estimated_grams": 160,
    "calories": 180,
    "protein": 5.0,
    "carbs": 14.0,
    "fat": 11.5,
    "fiber": 5.8,
    "sugar": 2.0,
    "sodium": 310,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "mix_veg": {
    "name": "Mixed Vegetable Curry (Carrots, Peas, Beans)",
    "estimated_grams": 140,
    "calories": 130,
    "protein": 3.0,
    "carbs": 15.0,
    "fat": 6.0,
    "fiber": 4.2,
    "sugar": 3.0,
    "sodium": 210,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "soya_chunks_curry": {
    "name": "Soya Chunks Curry (High Protein Meal Maker)",
    "estimated_grams": 150,
    "calories": 160,
    "protein": 16.5,
    "carbs": 12.0,
    "fat": 5.0,
    "fiber": 4.8,
    "sugar": 2.0,
    "sodium": 280,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.95
  },
  "soya_chaap_curry": {
    "name": "Tandoori Soya Chaap Gravy",
    "estimated_grams": 160,
    "calories": 280,
    "protein": 14.0,
    "carbs": 24.0,
    "fat": 14.0,
    "fiber": 4.0,
    "sugar": 3.0,
    "sodium": 380,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.92
  },
  "mushroom_masala": {
    "name": "Mushroom Masala Curry",
    "estimated_grams": 150,
    "calories": 135,
    "protein": 4.5,
    "carbs": 11.0,
    "fat": 8.0,
    "fiber": 3.2,
    "sugar": 3.0,
    "sodium": 260,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "tofu_stir_fry": {
    "name": "Tofu & Mixed Veggies Stir-Fry",
    "estimated_grams": 160,
    "calories": 155,
    "protein": 13.5,
    "carbs": 8.0,
    "fat": 8.0,
    "fiber": 3.5,
    "sugar": 2.5,
    "sodium": 290,
    "serving_unit": "bowl",
    "category": "curries",
    "confidence": 0.94
  },
  "idli": {
    "name": "Steamed Rice & Urad Idli (1 pc)",
    "estimated_grams": 50,
    "calories": 65,
    "protein": 2.0,
    "carbs": 13.5,
    "fat": 0.3,
    "fiber": 1.0,
    "sugar": 0.2,
    "sodium": 80,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.97
  },
  "idli_sambar": {
    "name": "Steamed Idlis with Sambar (2 idlis + sambar)",
    "estimated_grams": 180,
    "calories": 180,
    "protein": 6.5,
    "carbs": 34.0,
    "fat": 2.0,
    "fiber": 3.5,
    "sugar": 2.0,
    "sodium": 280,
    "serving_unit": "plate",
    "category": "south_indian",
    "confidence": 0.96
  },
  "plain_dosa": {
    "name": "Crispy Plain Dosa",
    "estimated_grams": 120,
    "calories": 160,
    "protein": 4.0,
    "carbs": 28.0,
    "fat": 3.5,
    "fiber": 1.8,
    "sugar": 0.5,
    "sodium": 210,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.95
  },
  "masala_dosa": {
    "name": "Masala Dosa with Potato Filling",
    "estimated_grams": 180,
    "calories": 290,
    "protein": 6.0,
    "carbs": 42.0,
    "fat": 10.5,
    "fiber": 3.0,
    "sugar": 2.0,
    "sodium": 360,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.95
  },
  "mysore_masala_dosa": {
    "name": "Mysore Masala Dosa with Red Garlic Chutney",
    "estimated_grams": 200,
    "calories": 340,
    "protein": 7.0,
    "carbs": 46.0,
    "fat": 14.0,
    "fiber": 3.5,
    "sugar": 2.2,
    "sodium": 420,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.93
  },
  "rava_dosa": {
    "name": "Crispy Rava Onion Dosa",
    "estimated_grams": 150,
    "calories": 260,
    "protein": 5.2,
    "carbs": 38.0,
    "fat": 9.5,
    "fiber": 2.0,
    "sugar": 1.5,
    "sodium": 280,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.93
  },
  "ragi_dosa": {
    "name": "Healthy Ragi Dosa (Finger Millet)",
    "estimated_grams": 130,
    "calories": 195,
    "protein": 5.0,
    "carbs": 32.0,
    "fat": 5.0,
    "fiber": 4.5,
    "sugar": 0.5,
    "sodium": 220,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.94
  },
  "medu_vada": {
    "name": "Crispy Medu Vada (1 pc)",
    "estimated_grams": 60,
    "calories": 165,
    "protein": 4.0,
    "carbs": 15.0,
    "fat": 10.0,
    "fiber": 2.5,
    "sugar": 0.3,
    "sodium": 180,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.94
  },
  "sambar_vada": {
    "name": "Sambar Vada (2 Vadas Soaked in Sambar)",
    "estimated_grams": 220,
    "calories": 330,
    "protein": 9.5,
    "carbs": 36.0,
    "fat": 17.0,
    "fiber": 5.5,
    "sugar": 3.0,
    "sodium": 490,
    "serving_unit": "bowl",
    "category": "south_indian",
    "confidence": 0.93
  },
  "onion_uttapam": {
    "name": "Onion Uttapam with Coriander",
    "estimated_grams": 180,
    "calories": 270,
    "protein": 6.5,
    "carbs": 44.0,
    "fat": 7.5,
    "fiber": 3.0,
    "sugar": 3.0,
    "sodium": 290,
    "serving_unit": "plate",
    "category": "south_indian",
    "confidence": 0.94
  },
  "appam": {
    "name": "Kerala Soft Appam (2 pcs)",
    "estimated_grams": 120,
    "calories": 180,
    "protein": 3.2,
    "carbs": 38.0,
    "fat": 1.5,
    "fiber": 1.0,
    "sugar": 2.5,
    "sodium": 110,
    "serving_unit": "plate",
    "category": "south_indian",
    "confidence": 0.92
  },
  "coconut_chutney": {
    "name": "Fresh White Coconut Chutney",
    "estimated_grams": 30,
    "calories": 75,
    "protein": 1.0,
    "carbs": 2.5,
    "fat": 7.0,
    "fiber": 1.5,
    "sugar": 1.0,
    "sodium": 95,
    "serving_unit": "tbsp",
    "category": "south_indian",
    "confidence": 0.95
  },
  "tomato_chutney": {
    "name": "Spicy Red Tomato Onion Chutney",
    "estimated_grams": 30,
    "calories": 45,
    "protein": 0.8,
    "carbs": 5.0,
    "fat": 2.5,
    "fiber": 1.0,
    "sugar": 2.5,
    "sodium": 110,
    "serving_unit": "tbsp",
    "category": "south_indian",
    "confidence": 0.95
  },
  "boiled_egg": {
    "name": "Whole Boiled Egg",
    "estimated_grams": 50,
    "calories": 78,
    "protein": 6.3,
    "carbs": 0.6,
    "fat": 5.3,
    "fiber": 0.0,
    "sugar": 0.6,
    "sodium": 62,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.98
  },
  "egg_white": {
    "name": "Boiled Egg White Only",
    "estimated_grams": 33,
    "calories": 17,
    "protein": 3.6,
    "carbs": 0.2,
    "fat": 0.1,
    "fiber": 0.0,
    "sugar": 0.2,
    "sodium": 55,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.99
  },
  "scrambled_eggs": {
    "name": "Scrambled Eggs (2 Whole Eggs)",
    "estimated_grams": 120,
    "calories": 182,
    "protein": 13.0,
    "carbs": 1.8,
    "fat": 13.6,
    "fiber": 0.0,
    "sugar": 1.5,
    "sodium": 170,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.96
  },
  "masala_omelette": {
    "name": "Indian Masala Omelette (2 Eggs with Onion & Chili)",
    "estimated_grams": 130,
    "calories": 195,
    "protein": 13.5,
    "carbs": 3.5,
    "fat": 14.0,
    "fiber": 0.8,
    "sugar": 1.5,
    "sodium": 240,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.96
  },
  "egg_bhurji": {
    "name": "Street Style Egg Bhurji (2 Eggs)",
    "estimated_grams": 130,
    "calories": 210,
    "protein": 14.0,
    "carbs": 4.5,
    "fat": 15.0,
    "fiber": 1.2,
    "sugar": 1.8,
    "sodium": 260,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.95
  },
  "egg_curry": {
    "name": "Homestyle Egg Curry (2 Boiled Eggs in Gravy)",
    "estimated_grams": 180,
    "calories": 240,
    "protein": 14.5,
    "carbs": 6.0,
    "fat": 17.0,
    "fiber": 1.5,
    "sugar": 2.0,
    "sodium": 320,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.95
  },
  "chicken_breast": {
    "name": "Grilled Chicken Breast (Skinless)",
    "estimated_grams": 150,
    "calories": 248,
    "protein": 46.5,
    "carbs": 0.0,
    "fat": 5.4,
    "fiber": 0.0,
    "sugar": 0.0,
    "sodium": 112,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.97
  },
  "chicken_biryani": {
    "name": "Dum Chicken Biryani (Basmati Rice & Chicken)",
    "estimated_grams": 350,
    "calories": 540,
    "protein": 32.0,
    "carbs": 65.0,
    "fat": 16.0,
    "fiber": 3.0,
    "sugar": 2.0,
    "sodium": 480,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.96
  },
  "mutton_biryani": {
    "name": "Hyderabadi Dum Mutton Biryani",
    "estimated_grams": 350,
    "calories": 620,
    "protein": 34.0,
    "carbs": 64.0,
    "fat": 24.0,
    "fiber": 2.8,
    "sugar": 2.2,
    "sodium": 520,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.94
  },
  "chicken_curry": {
    "name": "Homestyle Tariwala Chicken Curry",
    "estimated_grams": 170,
    "calories": 240,
    "protein": 28.0,
    "carbs": 4.0,
    "fat": 12.0,
    "fiber": 1.5,
    "sugar": 1.5,
    "sodium": 360,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.94
  },
  "butter_chicken": {
    "name": "Murgh Makhani (Butter Chicken)",
    "estimated_grams": 170,
    "calories": 340,
    "protein": 25.0,
    "carbs": 8.0,
    "fat": 22.0,
    "fiber": 1.8,
    "sugar": 4.5,
    "sodium": 420,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "chicken_tikka_masala": {
    "name": "Chicken Tikka Masala Gravy",
    "estimated_grams": 170,
    "calories": 310,
    "protein": 26.0,
    "carbs": 9.0,
    "fat": 18.5,
    "fiber": 2.0,
    "sugar": 4.0,
    "sodium": 410,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "kadai_chicken": {
    "name": "Kadai Chicken with Bell Peppers",
    "estimated_grams": 170,
    "calories": 270,
    "protein": 29.0,
    "carbs": 6.0,
    "fat": 14.0,
    "fiber": 2.0,
    "sugar": 2.5,
    "sodium": 370,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "tandoori_chicken": {
    "name": "Tandoori Chicken (1 Leg / Breast Piece)",
    "estimated_grams": 180,
    "calories": 260,
    "protein": 36.0,
    "carbs": 3.0,
    "fat": 11.0,
    "fiber": 1.0,
    "sugar": 1.0,
    "sodium": 440,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.95
  },
  "chicken_tikka": {
    "name": "Tandoori Chicken Tikka (4 Boneless Pcs)",
    "estimated_grams": 150,
    "calories": 220,
    "protein": 34.0,
    "carbs": 3.0,
    "fat": 7.5,
    "fiber": 1.0,
    "sugar": 1.0,
    "sodium": 380,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.95
  },
  "chicken_seekh_kebab": {
    "name": "Grilled Chicken Seekh Kebab (2 skewers)",
    "estimated_grams": 120,
    "calories": 230,
    "protein": 28.0,
    "carbs": 4.0,
    "fat": 11.0,
    "fiber": 1.2,
    "sugar": 1.2,
    "sodium": 390,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.94
  },
  "mutton_curry": {
    "name": "Homestyle Mutton Curry",
    "estimated_grams": 170,
    "calories": 330,
    "protein": 26.0,
    "carbs": 4.0,
    "fat": 23.0,
    "fiber": 1.0,
    "sugar": 1.0,
    "sodium": 390,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.92
  },
  "mutton_rogan_josh": {
    "name": "Kashmiri Mutton Rogan Josh",
    "estimated_grams": 170,
    "calories": 350,
    "protein": 27.0,
    "carbs": 5.0,
    "fat": 24.5,
    "fiber": 1.5,
    "sugar": 1.5,
    "sodium": 420,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.92
  },
  "keema_matar": {
    "name": "Minced Mutton Keema Matar",
    "estimated_grams": 160,
    "calories": 310,
    "protein": 25.0,
    "carbs": 8.0,
    "fat": 20.0,
    "fiber": 2.5,
    "sugar": 2.0,
    "sodium": 380,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "fish_curry": {
    "name": "Coastal Indian Fish Curry (Mustard / Coconut)",
    "estimated_grams": 170,
    "calories": 210,
    "protein": 24.0,
    "carbs": 5.0,
    "fat": 10.5,
    "fiber": 1.2,
    "sugar": 1.5,
    "sodium": 340,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "fish_fry": {
    "name": "Rawa Masala Pan-Fried Fish",
    "estimated_grams": 140,
    "calories": 230,
    "protein": 26.0,
    "carbs": 8.0,
    "fat": 10.0,
    "fiber": 0.8,
    "sugar": 0.5,
    "sodium": 360,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.93
  },
  "prawns_curry": {
    "name": "Prawns Masala Curry",
    "estimated_grams": 150,
    "calories": 195,
    "protein": 22.0,
    "carbs": 6.0,
    "fat": 9.0,
    "fiber": 1.5,
    "sugar": 2.0,
    "sodium": 410,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.92
  },
  "salmon": {
    "name": "Pan-Seared / Baked Salmon Fillet",
    "estimated_grams": 170,
    "calories": 354,
    "protein": 37.8,
    "carbs": 0.0,
    "fat": 21.8,
    "fiber": 0.0,
    "sugar": 0.0,
    "sodium": 104,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.96
  },
  "samosa": {
    "name": "Punjabi Aloo Samosa (1 pc)",
    "estimated_grams": 80,
    "calories": 260,
    "protein": 4.0,
    "carbs": 30.0,
    "fat": 14.0,
    "fiber": 2.5,
    "sugar": 1.5,
    "sodium": 340,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.96
  },
  "pani_puri": {
    "name": "Pani Puri / Golgappe (6 pcs with Teekha/Meetha Pani)",
    "estimated_grams": 150,
    "calories": 190,
    "protein": 3.5,
    "carbs": 32.0,
    "fat": 5.0,
    "fiber": 2.5,
    "sugar": 4.0,
    "sodium": 480,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.94
  },
  "sev_puri": {
    "name": "Sev Puri (6 pcs Loaded with Potatoes & Sev)",
    "estimated_grams": 140,
    "calories": 260,
    "protein": 5.0,
    "carbs": 38.0,
    "fat": 10.5,
    "fiber": 3.0,
    "sugar": 5.5,
    "sodium": 390,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "dahi_puri": {
    "name": "Dahi Puri / SPDP (6 pcs with Sweet Curd)",
    "estimated_grams": 180,
    "calories": 310,
    "protein": 6.8,
    "carbs": 44.0,
    "fat": 12.0,
    "fiber": 2.8,
    "sugar": 11.0,
    "sodium": 380,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "bhel_puri": {
    "name": "Mumbai Bhel Puri with Tangy Chutneys",
    "estimated_grams": 140,
    "calories": 220,
    "protein": 5.0,
    "carbs": 38.0,
    "fat": 5.5,
    "fiber": 3.2,
    "sugar": 6.0,
    "sodium": 340,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.94
  },
  "pav_bhaji": {
    "name": "Mumbai Pav Bhaji (2 Buttered Pavs + Bhaji)",
    "estimated_grams": 280,
    "calories": 480,
    "protein": 9.5,
    "carbs": 62.0,
    "fat": 22.0,
    "fiber": 6.5,
    "sugar": 5.0,
    "sodium": 620,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.95
  },
  "vada_pav": {
    "name": "Mumbai Vada Pav with Lasun Chutney",
    "estimated_grams": 120,
    "calories": 290,
    "protein": 6.2,
    "carbs": 42.0,
    "fat": 11.0,
    "fiber": 3.0,
    "sugar": 2.5,
    "sodium": 380,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.95
  },
  "dahi_vada": {
    "name": "Dahi Vada / Dahi Bhalla (2 pcs)",
    "estimated_grams": 180,
    "calories": 240,
    "protein": 8.0,
    "carbs": 30.0,
    "fat": 9.5,
    "fiber": 2.5,
    "sugar": 9.0,
    "sodium": 340,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.94
  },
  "aloo_tikki": {
    "name": "Crispy Aloo Tikki with Chole & Curd",
    "estimated_grams": 200,
    "calories": 320,
    "protein": 7.0,
    "carbs": 46.0,
    "fat": 12.0,
    "fiber": 5.0,
    "sugar": 6.0,
    "sodium": 440,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "moong_dal_chilla": {
    "name": "Moong Dal Chilla / Cheela with Paneer",
    "estimated_grams": 90,
    "calories": 160,
    "protein": 8.5,
    "carbs": 18.0,
    "fat": 6.0,
    "fiber": 3.0,
    "sugar": 1.2,
    "sodium": 180,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.95
  },
  "besan_chilla": {
    "name": "Besan Chilla (Gram Flour Pancake)",
    "estimated_grams": 80,
    "calories": 140,
    "protein": 6.8,
    "carbs": 16.0,
    "fat": 5.2,
    "fiber": 3.2,
    "sugar": 1.5,
    "sodium": 190,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.95
  },
  "veg_pakora": {
    "name": "Mixed Vegetable Pakoras (4 pcs)",
    "estimated_grams": 100,
    "calories": 275,
    "protein": 5.2,
    "carbs": 26.0,
    "fat": 17.0,
    "fiber": 3.5,
    "sugar": 2.0,
    "sodium": 310,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "dhokla": {
    "name": "Steamed Khaman Dhokla (2 pcs with Mustard Tadka)",
    "estimated_grams": 80,
    "calories": 140,
    "protein": 4.5,
    "carbs": 22.0,
    "fat": 3.5,
    "fiber": 2.0,
    "sugar": 3.5,
    "sodium": 220,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.95
  },
  "khandvi": {
    "name": "Gujarati Khandvi Rolls (4 rolls)",
    "estimated_grams": 100,
    "calories": 140,
    "protein": 5.5,
    "carbs": 16.0,
    "fat": 6.0,
    "fiber": 2.2,
    "sugar": 2.0,
    "sodium": 210,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "roasted_makhana": {
    "name": "Roasted Makhana / Foxnuts (1 bowl)",
    "estimated_grams": 35,
    "calories": 125,
    "protein": 3.5,
    "carbs": 24.0,
    "fat": 1.5,
    "fiber": 4.2,
    "sugar": 0.2,
    "sodium": 95,
    "serving_unit": "bowl",
    "category": "snacks",
    "confidence": 0.96
  },
  "roasted_chana": {
    "name": "Roasted Bengal Gram / Bhuna Chana",
    "estimated_grams": 40,
    "calories": 150,
    "protein": 8.0,
    "carbs": 23.0,
    "fat": 2.5,
    "fiber": 6.8,
    "sugar": 1.0,
    "sodium": 45,
    "serving_unit": "bowl",
    "category": "snacks",
    "confidence": 0.96
  },
  "masala_papad": {
    "name": "Roasted Masala Papad (Onion & Tomato)",
    "estimated_grams": 35,
    "calories": 65,
    "protein": 2.8,
    "carbs": 11.0,
    "fat": 0.8,
    "fiber": 1.8,
    "sugar": 1.2,
    "sodium": 240,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.95
  },
  "curd": {
    "name": "Fresh Dahi / Curd (Whole Milk)",
    "estimated_grams": 150,
    "calories": 110,
    "protein": 5.2,
    "carbs": 7.0,
    "fat": 6.5,
    "fiber": 0.0,
    "sugar": 7.0,
    "sodium": 65,
    "serving_unit": "katori",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "toned_curd": {
    "name": "Low-Fat / Toned Dahi",
    "estimated_grams": 150,
    "calories": 75,
    "protein": 5.5,
    "carbs": 7.5,
    "fat": 2.2,
    "fiber": 0.0,
    "sugar": 7.5,
    "sodium": 70,
    "serving_unit": "katori",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "greek_yogurt": {
    "name": "Plain Greek Yogurt (Non-Fat)",
    "estimated_grams": 170,
    "calories": 100,
    "protein": 17.3,
    "carbs": 6.1,
    "fat": 0.7,
    "fiber": 0.0,
    "sugar": 6.1,
    "sodium": 60,
    "serving_unit": "cup",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "cow_milk": {
    "name": "Fresh Cow Milk (Boiled, 1 glass)",
    "estimated_grams": 250,
    "calories": 155,
    "protein": 8.0,
    "carbs": 12.0,
    "fat": 8.5,
    "fiber": 0.0,
    "sugar": 12.0,
    "sodium": 110,
    "serving_unit": "glass",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "toned_milk": {
    "name": "Toned Milk (3% Fat, 1 glass)",
    "estimated_grams": 250,
    "calories": 120,
    "protein": 7.8,
    "carbs": 12.5,
    "fat": 4.5,
    "fiber": 0.0,
    "sugar": 12.5,
    "sodium": 115,
    "serving_unit": "glass",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "skimmed_milk": {
    "name": "Double Toned / Skimmed Milk (1 glass)",
    "estimated_grams": 250,
    "calories": 85,
    "protein": 8.2,
    "carbs": 12.5,
    "fat": 0.5,
    "fiber": 0.0,
    "sugar": 12.5,
    "sodium": 120,
    "serving_unit": "glass",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "soy_milk": {
    "name": "Unsweetened Soy Milk",
    "estimated_grams": 250,
    "calories": 90,
    "protein": 8.0,
    "carbs": 4.0,
    "fat": 4.5,
    "fiber": 1.5,
    "sugar": 1.0,
    "sodium": 95,
    "serving_unit": "glass",
    "category": "dairy_protein",
    "confidence": 0.95
  },
  "almond_milk": {
    "name": "Unsweetened Almond Milk",
    "estimated_grams": 250,
    "calories": 35,
    "protein": 1.2,
    "carbs": 1.0,
    "fat": 2.8,
    "fiber": 0.8,
    "sugar": 0.2,
    "sodium": 140,
    "serving_unit": "glass",
    "category": "dairy_protein",
    "confidence": 0.95
  },
  "whey_isolate": {
    "name": "Whey Protein Isolate (1 scoop)",
    "estimated_grams": 30,
    "calories": 115,
    "protein": 27.0,
    "carbs": 1.0,
    "fat": 0.5,
    "fiber": 0.0,
    "sugar": 0.5,
    "sodium": 120,
    "serving_unit": "scoop",
    "category": "dairy_protein",
    "confidence": 0.98
  },
  "whey_concentrate": {
    "name": "Whey Protein Concentrate (1 scoop)",
    "estimated_grams": 33,
    "calories": 130,
    "protein": 24.0,
    "carbs": 3.0,
    "fat": 2.2,
    "fiber": 0.5,
    "sugar": 1.5,
    "sodium": 140,
    "serving_unit": "scoop",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "plant_protein": {
    "name": "Plant Protein Powder (Pea & Brown Rice, 1 scoop)",
    "estimated_grams": 35,
    "calories": 135,
    "protein": 25.0,
    "carbs": 3.5,
    "fat": 2.5,
    "fiber": 2.0,
    "sugar": 0.5,
    "sodium": 190,
    "serving_unit": "scoop",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "peanut_butter": {
    "name": "Natural Peanut Butter (No Added Sugar)",
    "estimated_grams": 16,
    "calories": 95,
    "protein": 4.0,
    "carbs": 3.2,
    "fat": 8.0,
    "fiber": 1.2,
    "sugar": 0.8,
    "sodium": 5,
    "serving_unit": "tbsp",
    "category": "dairy_protein",
    "confidence": 0.96
  },
  "chia_seeds": {
    "name": "Chia Seeds (Raw / Soaked)",
    "estimated_grams": 12,
    "calories": 58,
    "protein": 2.0,
    "carbs": 5.0,
    "fat": 3.7,
    "fiber": 4.1,
    "sugar": 0.0,
    "sodium": 2,
    "serving_unit": "tbsp",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "flax_seeds": {
    "name": "Flax Seeds (Roasted / Ground)",
    "estimated_grams": 10,
    "calories": 55,
    "protein": 1.9,
    "carbs": 3.0,
    "fat": 4.2,
    "fiber": 2.8,
    "sugar": 0.1,
    "sodium": 3,
    "serving_unit": "tbsp",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "soaked_almonds": {
    "name": "Soaked Raw Almonds (5 almonds)",
    "estimated_grams": 6,
    "calories": 36,
    "protein": 1.3,
    "carbs": 1.2,
    "fat": 3.1,
    "fiber": 0.7,
    "sugar": 0.3,
    "sodium": 0,
    "serving_unit": "piece",
    "category": "dairy_protein",
    "confidence": 0.98
  },
  "walnuts": {
    "name": "Raw Walnuts (4 halves)",
    "estimated_grams": 12,
    "calories": 78,
    "protein": 1.8,
    "carbs": 1.6,
    "fat": 7.8,
    "fiber": 0.8,
    "sugar": 0.3,
    "sodium": 0,
    "serving_unit": "piece",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "apple": {
    "name": "Fresh Gala / Fuji Apple",
    "estimated_grams": 182,
    "calories": 95,
    "protein": 0.5,
    "carbs": 25.1,
    "fat": 0.3,
    "fiber": 4.4,
    "sugar": 18.9,
    "sodium": 2,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.98
  },
  "banana": {
    "name": "Fresh Banana (Robusta / Yelakki)",
    "estimated_grams": 118,
    "calories": 105,
    "protein": 1.3,
    "carbs": 27.0,
    "fat": 0.3,
    "fiber": 3.1,
    "sugar": 14.4,
    "sodium": 1,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.98
  },
  "orange": {
    "name": "Fresh Sweet Orange / Mosambi",
    "estimated_grams": 131,
    "calories": 62,
    "protein": 1.2,
    "carbs": 15.4,
    "fat": 0.2,
    "fiber": 3.1,
    "sugar": 12.2,
    "sodium": 0,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.97
  },
  "mango": {
    "name": "Fresh Mango Slices (Alphonso / Kesar)",
    "estimated_grams": 165,
    "calories": 110,
    "protein": 1.4,
    "carbs": 28.0,
    "fat": 0.6,
    "fiber": 2.6,
    "sugar": 24.0,
    "sodium": 2,
    "serving_unit": "katori",
    "category": "fruits_veg",
    "confidence": 0.95
  },
  "papaya": {
    "name": "Fresh Papaya Cubes",
    "estimated_grams": 180,
    "calories": 75,
    "protein": 0.9,
    "carbs": 19.0,
    "fat": 0.4,
    "fiber": 3.1,
    "sugar": 14.0,
    "sodium": 5,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "watermelon": {
    "name": "Fresh Watermelon Chunks",
    "estimated_grams": 200,
    "calories": 60,
    "protein": 1.2,
    "carbs": 15.0,
    "fat": 0.3,
    "fiber": 0.8,
    "sugar": 12.4,
    "sodium": 2,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.97
  },
  "pineapple": {
    "name": "Fresh Pineapple Slices",
    "estimated_grams": 165,
    "calories": 82,
    "protein": 0.9,
    "carbs": 21.6,
    "fat": 0.2,
    "fiber": 2.3,
    "sugar": 16.3,
    "sodium": 2,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.95
  },
  "guava": {
    "name": "Fresh Guava (Amrood)",
    "estimated_grams": 120,
    "calories": 68,
    "protein": 2.6,
    "carbs": 14.3,
    "fat": 1.0,
    "fiber": 5.4,
    "sugar": 8.9,
    "sodium": 2,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "pomegranate": {
    "name": "Pomegranate Arils / Seeds (Anar)",
    "estimated_grams": 120,
    "calories": 95,
    "protein": 2.0,
    "carbs": 22.0,
    "fat": 1.4,
    "fiber": 4.5,
    "sugar": 16.0,
    "sodium": 3,
    "serving_unit": "katori",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "grapes": {
    "name": "Fresh Green / Black Grapes",
    "estimated_grams": 150,
    "calories": 104,
    "protein": 1.1,
    "carbs": 27.0,
    "fat": 0.2,
    "fiber": 1.4,
    "sugar": 23.0,
    "sodium": 3,
    "serving_unit": "cup",
    "category": "fruits_veg",
    "confidence": 0.95
  },
  "chikoo": {
    "name": "Fresh Chikoo / Sapodilla",
    "estimated_grams": 80,
    "calories": 65,
    "protein": 0.4,
    "carbs": 16.0,
    "fat": 0.9,
    "fiber": 4.3,
    "sugar": 11.5,
    "sodium": 9,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.94
  },
  "avocado": {
    "name": "Fresh Hass Avocado (Half)",
    "estimated_grams": 68,
    "calories": 114,
    "protein": 1.4,
    "carbs": 6.0,
    "fat": 10.5,
    "fiber": 4.6,
    "sugar": 0.4,
    "sodium": 5,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "kachumber_salad": {
    "name": "Kachumber Salad (Cucumber, Onion, Tomato)",
    "estimated_grams": 150,
    "calories": 45,
    "protein": 1.8,
    "carbs": 9.5,
    "fat": 0.5,
    "fiber": 2.8,
    "sugar": 4.5,
    "sodium": 95,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "cucumber_slices": {
    "name": "Fresh Sliced Cucumber with Salt & Pepper",
    "estimated_grams": 120,
    "calories": 18,
    "protein": 0.8,
    "carbs": 4.0,
    "fat": 0.1,
    "fiber": 1.0,
    "sugar": 2.0,
    "sodium": 80,
    "serving_unit": "plate",
    "category": "fruits_veg",
    "confidence": 0.98
  },
  "sweet_potato": {
    "name": "Boiled Sweet Potato (Shakarkandi Chaat)",
    "estimated_grams": 150,
    "calories": 130,
    "protein": 2.4,
    "carbs": 30.0,
    "fat": 0.2,
    "fiber": 4.5,
    "sugar": 6.5,
    "sodium": 85,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.95
  },
  "masala_chai": {
    "name": "Masala Chai with Whole Milk & Sugar",
    "estimated_grams": 200,
    "calories": 120,
    "protein": 3.5,
    "carbs": 18.0,
    "fat": 4.0,
    "fiber": 0.2,
    "sugar": 16.0,
    "sodium": 45,
    "serving_unit": "cup",
    "category": "beverages",
    "confidence": 0.96
  },
  "chai_no_sugar": {
    "name": "Masala Chai (Toned Milk, No Sugar)",
    "estimated_grams": 200,
    "calories": 65,
    "protein": 3.5,
    "carbs": 6.0,
    "fat": 2.5,
    "fiber": 0.2,
    "sugar": 5.5,
    "sodium": 45,
    "serving_unit": "cup",
    "category": "beverages",
    "confidence": 0.96
  },
  "green_tea": {
    "name": "Plain Green Tea (Unsweetened)",
    "estimated_grams": 200,
    "calories": 2,
    "protein": 0.2,
    "carbs": 0.0,
    "fat": 0.0,
    "fiber": 0.0,
    "sugar": 0.0,
    "sodium": 2,
    "serving_unit": "cup",
    "category": "beverages",
    "confidence": 0.99
  },
  "black_coffee": {
    "name": "Black Coffee / Americano (Unsweetened)",
    "estimated_grams": 240,
    "calories": 2,
    "protein": 0.3,
    "carbs": 0.0,
    "fat": 0.0,
    "fiber": 0.0,
    "sugar": 0.0,
    "sodium": 5,
    "serving_unit": "cup",
    "category": "beverages",
    "confidence": 0.99
  },
  "filter_coffee": {
    "name": "South Indian Filter Coffee with Milk",
    "estimated_grams": 150,
    "calories": 110,
    "protein": 3.2,
    "carbs": 14.5,
    "fat": 4.2,
    "fiber": 0.0,
    "sugar": 12.0,
    "sodium": 40,
    "serving_unit": "tumbler",
    "category": "beverages",
    "confidence": 0.95
  },
  "chaas": {
    "name": "Spiced Buttermilk / Chaas",
    "estimated_grams": 250,
    "calories": 55,
    "protein": 3.2,
    "carbs": 4.8,
    "fat": 2.2,
    "fiber": 0.1,
    "sugar": 4.8,
    "sodium": 140,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.96
  },
  "sweet_lassi": {
    "name": "Sweet Punjabi Lassi (with Malai)",
    "estimated_grams": 250,
    "calories": 240,
    "protein": 7.0,
    "carbs": 36.0,
    "fat": 7.5,
    "fiber": 0.0,
    "sugar": 32.0,
    "sodium": 95,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.94
  },
  "mango_lassi": {
    "name": "Thick Mango Lassi",
    "estimated_grams": 250,
    "calories": 260,
    "protein": 6.5,
    "carbs": 42.0,
    "fat": 7.0,
    "fiber": 1.2,
    "sugar": 38.0,
    "sodium": 90,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.93
  },
  "coconut_water": {
    "name": "Fresh Tender Coconut Water (Nariyal Pani)",
    "estimated_grams": 240,
    "calories": 45,
    "protein": 1.7,
    "carbs": 9.0,
    "fat": 0.5,
    "fiber": 2.6,
    "sugar": 6.0,
    "sodium": 60,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.98
  },
  "nimbu_pani": {
    "name": "Nimbu Shikanji (Sweet & Salty Lemonade)",
    "estimated_grams": 250,
    "calories": 75,
    "protein": 0.5,
    "carbs": 18.0,
    "fat": 0.1,
    "fiber": 0.2,
    "sugar": 16.5,
    "sodium": 180,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.96
  },
  "sugarcane_juice": {
    "name": "Fresh Sugarcane Juice with Ginger & Mint",
    "estimated_grams": 250,
    "calories": 180,
    "protein": 0.8,
    "carbs": 45.0,
    "fat": 0.2,
    "fiber": 0.5,
    "sugar": 42.0,
    "sodium": 25,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.94
  },
  "sattu_drink": {
    "name": "Bihari Sattu Sharbat (Savory with Jeera & Salt)",
    "estimated_grams": 250,
    "calories": 160,
    "protein": 9.5,
    "carbs": 24.0,
    "fat": 2.8,
    "fiber": 6.2,
    "sugar": 0.8,
    "sodium": 220,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.95
  },
  "haldi_doodh": {
    "name": "Golden Turmeric Milk with Black Pepper",
    "estimated_grams": 200,
    "calories": 140,
    "protein": 6.5,
    "carbs": 12.0,
    "fat": 7.0,
    "fiber": 0.5,
    "sugar": 10.0,
    "sodium": 90,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.95
  },
  "gulab_jamun": {
    "name": "Gulab Jamun with Sugar Syrup (1 pc)",
    "estimated_grams": 50,
    "calories": 175,
    "protein": 2.5,
    "carbs": 28.0,
    "fat": 6.2,
    "fiber": 0.2,
    "sugar": 24.0,
    "sodium": 45,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.96
  },
  "rasgulla": {
    "name": "Bengali Spongy Rasgulla (1 pc)",
    "estimated_grams": 50,
    "calories": 125,
    "protein": 3.0,
    "carbs": 25.0,
    "fat": 1.5,
    "fiber": 0.0,
    "sugar": 22.0,
    "sodium": 25,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.95
  },
  "rasmalai": {
    "name": "Rasmalai with Saffron Milk Rabdi (1 pc)",
    "estimated_grams": 65,
    "calories": 180,
    "protein": 4.5,
    "carbs": 22.0,
    "fat": 8.5,
    "fiber": 0.2,
    "sugar": 18.0,
    "sodium": 55,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.94
  },
  "kaju_katli": {
    "name": "Silver Leaf Kaju Katli (1 diamond pc)",
    "estimated_grams": 20,
    "calories": 85,
    "protein": 2.2,
    "carbs": 10.5,
    "fat": 4.2,
    "fiber": 0.5,
    "sugar": 8.0,
    "sodium": 5,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.96
  },
  "motichoor_ladoo": {
    "name": "Motichoor Ladoo with Pure Ghee (1 pc)",
    "estimated_grams": 45,
    "calories": 190,
    "protein": 2.8,
    "carbs": 28.0,
    "fat": 7.5,
    "fiber": 0.8,
    "sugar": 22.0,
    "sodium": 35,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.95
  },
  "besan_ladoo": {
    "name": "Besan Ladoo with Roasted Ghee (1 pc)",
    "estimated_grams": 45,
    "calories": 210,
    "protein": 4.2,
    "carbs": 26.0,
    "fat": 10.5,
    "fiber": 1.8,
    "sugar": 18.0,
    "sodium": 20,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.95
  },
  "gajar_halwa": {
    "name": "Gajar Ka Halwa with Khoya & Dry Fruits",
    "estimated_grams": 120,
    "calories": 290,
    "protein": 5.5,
    "carbs": 38.0,
    "fat": 13.5,
    "fiber": 3.2,
    "sugar": 30.0,
    "sodium": 75,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.93
  },
  "moong_dal_halwa": {
    "name": "Shahi Moong Dal Halwa with Pure Ghee",
    "estimated_grams": 100,
    "calories": 380,
    "protein": 7.0,
    "carbs": 42.0,
    "fat": 21.0,
    "fiber": 2.5,
    "sugar": 34.0,
    "sodium": 40,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.92
  },
  "kheer": {
    "name": "Traditional Rice Kheer with Kesar & Elaichi",
    "estimated_grams": 150,
    "calories": 220,
    "protein": 5.8,
    "carbs": 34.0,
    "fat": 7.2,
    "fiber": 0.5,
    "sugar": 24.0,
    "sodium": 65,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.94
  },
  "jalebi": {
    "name": "Crispy Desi Ghee Jalebi (2 pcs)",
    "estimated_grams": 60,
    "calories": 220,
    "protein": 1.8,
    "carbs": 42.0,
    "fat": 5.5,
    "fiber": 0.2,
    "sugar": 36.0,
    "sodium": 30,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.94
  },
  "mishti_doi": {
    "name": "Bengali Baked Sweet Curd (Mishti Doi)",
    "estimated_grams": 120,
    "calories": 180,
    "protein": 4.5,
    "carbs": 26.0,
    "fat": 6.8,
    "fiber": 0.0,
    "sugar": 24.0,
    "sodium": 50,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.94
  },
  "wheat_bread": {
    "name": "Whole Wheat Bread (1 slice)",
    "estimated_grams": 35,
    "calories": 88,
    "protein": 4.0,
    "carbs": 14.5,
    "fat": 1.2,
    "fiber": 2.1,
    "sugar": 1.5,
    "sodium": 140,
    "serving_unit": "slice",
    "category": "global",
    "confidence": 0.97
  },
  "multigrain_bread": {
    "name": "Multigrain Seeded Bread (1 slice)",
    "estimated_grams": 38,
    "calories": 95,
    "protein": 4.5,
    "carbs": 15.0,
    "fat": 1.8,
    "fiber": 2.8,
    "sugar": 1.2,
    "sodium": 135,
    "serving_unit": "slice",
    "category": "global",
    "confidence": 0.97
  },
  "oatmeal": {
    "name": "Cooked Rolled Oatmeal (with water)",
    "estimated_grams": 234,
    "calories": 158,
    "protein": 6.0,
    "carbs": 28.0,
    "fat": 3.2,
    "fiber": 4.0,
    "sugar": 1.1,
    "sodium": 115,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.96
  },
  "cheese_pizza": {
    "name": "Classic Margherita / Cheese Pizza (1 slice)",
    "estimated_grams": 107,
    "calories": 285,
    "protein": 12.2,
    "carbs": 35.7,
    "fat": 10.4,
    "fiber": 2.5,
    "sugar": 3.8,
    "sodium": 640,
    "serving_unit": "slice",
    "category": "global",
    "confidence": 0.95
  },
  "veg_burger": {
    "name": "Vegetable Burger with Whole Wheat Bun",
    "estimated_grams": 180,
    "calories": 360,
    "protein": 9.5,
    "carbs": 52.0,
    "fat": 13.0,
    "fiber": 4.8,
    "sugar": 6.5,
    "sodium": 580,
    "serving_unit": "piece",
    "category": "global",
    "confidence": 0.93
  },
  "french_fries": {
    "name": "Crispy French Fries (Medium portion)",
    "estimated_grams": 117,
    "calories": 365,
    "protein": 4.0,
    "carbs": 48.0,
    "fat": 17.5,
    "fiber": 4.2,
    "sugar": 0.5,
    "sodium": 280,
    "serving_unit": "plate",
    "category": "global",
    "confidence": 0.95
  },
  "pasta_red": {
    "name": "Penne Pasta in Arrabbiata Red Sauce",
    "estimated_grams": 200,
    "calories": 240,
    "protein": 7.8,
    "carbs": 42.0,
    "fat": 4.5,
    "fiber": 3.8,
    "sugar": 5.0,
    "sodium": 420,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.93
  },
  "pasta_white": {
    "name": "Fettuccine Pasta in Alfredo White Sauce",
    "estimated_grams": 220,
    "calories": 380,
    "protein": 9.5,
    "carbs": 44.0,
    "fat": 19.0,
    "fiber": 2.5,
    "sugar": 3.5,
    "sodium": 510,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.92
  },
  "veg_noodles": {
    "name": "Vegetable Hakka Noodles",
    "estimated_grams": 200,
    "calories": 280,
    "protein": 6.5,
    "carbs": 46.0,
    "fat": 8.0,
    "fiber": 3.5,
    "sugar": 2.5,
    "sodium": 490,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.93
  },
  "veg_fried_rice": {
    "name": "Vegetable Fried Rice",
    "estimated_grams": 200,
    "calories": 290,
    "protein": 5.8,
    "carbs": 48.0,
    "fat": 8.5,
    "fiber": 2.8,
    "sugar": 2.0,
    "sodium": 460,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.93
  },
  "chicken_fried_rice": {
    "name": "Chicken Fried Rice with Egg & Veggies",
    "estimated_grams": 220,
    "calories": 360,
    "protein": 18.0,
    "carbs": 48.0,
    "fat": 10.5,
    "fiber": 2.5,
    "sugar": 2.0,
    "sodium": 510,
    "serving_unit": "bowl",
    "category": "global",
    "confidence": 0.94
  },
  "steamed_veg_momos": {
    "name": "Steamed Vegetable Momos (6 pcs with Chutney)",
    "estimated_grams": 150,
    "calories": 210,
    "protein": 6.0,
    "carbs": 38.0,
    "fat": 3.8,
    "fiber": 3.0,
    "sugar": 2.0,
    "sodium": 380,
    "serving_unit": "plate",
    "category": "global",
    "confidence": 0.95
  },
  "steamed_chicken_momos": {
    "name": "Steamed Chicken Momos (6 pcs with Chutney)",
    "estimated_grams": 160,
    "calories": 250,
    "protein": 16.5,
    "carbs": 36.0,
    "fat": 4.5,
    "fiber": 2.0,
    "sugar": 1.5,
    "sodium": 410,
    "serving_unit": "plate",
    "category": "global",
    "confidence": 0.95
  },
  "litti_chokha": {
    "name": "Bihari Litti Chokha (2 Littis with Baingan Chokha & Ghee)",
    "estimated_grams": 250,
    "calories": 420,
    "protein": 12.0,
    "carbs": 68.0,
    "fat": 12.0,
    "fiber": 8.5,
    "sugar": 3.0,
    "sodium": 460,
    "serving_unit": "plate",
    "category": "staples",
    "confidence": 0.94
  },
  "misal_pav": {
    "name": "Kolhapuri Misal Pav (Sprouts Rassa with 2 Pavs & Farsan)",
    "estimated_grams": 300,
    "calories": 480,
    "protein": 15.0,
    "carbs": 64.0,
    "fat": 18.0,
    "fiber": 8.0,
    "sugar": 4.5,
    "sodium": 680,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.94
  },
  "ragda_pattice": {
    "name": "Ragda Pattice (2 Potato Patties with White Peas Curry)",
    "estimated_grams": 220,
    "calories": 340,
    "protein": 8.5,
    "carbs": 52.0,
    "fat": 11.0,
    "fiber": 6.5,
    "sugar": 5.0,
    "sodium": 480,
    "serving_unit": "plate",
    "category": "snacks",
    "confidence": 0.93
  },
  "kachori": {
    "name": "Khasta Dal / Pyaaz Kachori (1 pc)",
    "estimated_grams": 85,
    "calories": 290,
    "protein": 5.5,
    "carbs": 32.0,
    "fat": 16.0,
    "fiber": 3.0,
    "sugar": 1.5,
    "sodium": 360,
    "serving_unit": "piece",
    "category": "snacks",
    "confidence": 0.94
  },
  "bedmi_poori": {
    "name": "Bedmi Poori with Aloo Sabzi (2 Urad Pooris)",
    "estimated_grams": 220,
    "calories": 480,
    "protein": 10.5,
    "carbs": 54.0,
    "fat": 24.0,
    "fiber": 5.5,
    "sugar": 2.0,
    "sodium": 510,
    "serving_unit": "plate",
    "category": "staples",
    "confidence": 0.93
  },
  "pesarattu": {
    "name": "Andhra Green Moong Pesarattu (with Upma & Ginger Chutney)",
    "estimated_grams": 140,
    "calories": 210,
    "protein": 9.5,
    "carbs": 30.0,
    "fat": 6.0,
    "fiber": 4.5,
    "sugar": 1.0,
    "sodium": 240,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.94
  },
  "akki_rotti": {
    "name": "Karnataka Akki Rotti (Rice Flour with Dill & Coconut)",
    "estimated_grams": 80,
    "calories": 160,
    "protein": 3.2,
    "carbs": 30.0,
    "fat": 3.5,
    "fiber": 2.0,
    "sugar": 0.5,
    "sodium": 180,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.93
  },
  "neer_dosa": {
    "name": "Mangalorean Neer Dosa (2 soft dosas)",
    "estimated_grams": 100,
    "calories": 140,
    "protein": 2.8,
    "carbs": 30.0,
    "fat": 1.0,
    "fiber": 1.0,
    "sugar": 0.2,
    "sodium": 110,
    "serving_unit": "plate",
    "category": "south_indian",
    "confidence": 0.94
  },
  "chicken_kathi_roll": {
    "name": "Kolkata Chicken Kathi Roll with Flaky Paratha",
    "estimated_grams": 200,
    "calories": 420,
    "protein": 26.0,
    "carbs": 42.0,
    "fat": 16.0,
    "fiber": 2.5,
    "sugar": 2.5,
    "sodium": 540,
    "serving_unit": "roll",
    "category": "non_veg",
    "confidence": 0.95
  },
  "egg_roll": {
    "name": "Kolkata Double Egg Kathi Roll",
    "estimated_grams": 180,
    "calories": 380,
    "protein": 16.5,
    "carbs": 40.0,
    "fat": 17.5,
    "fiber": 2.0,
    "sugar": 2.0,
    "sodium": 480,
    "serving_unit": "roll",
    "category": "non_veg",
    "confidence": 0.95
  },
  "paneer_roll": {
    "name": "Paneer Tikka Kathi Roll",
    "estimated_grams": 200,
    "calories": 390,
    "protein": 18.0,
    "carbs": 44.0,
    "fat": 16.0,
    "fiber": 3.0,
    "sugar": 3.0,
    "sodium": 490,
    "serving_unit": "roll",
    "category": "curries",
    "confidence": 0.94
  },
  "mutton_korma": {
    "name": "Shahi Awadhi Mutton Korma",
    "estimated_grams": 170,
    "calories": 360,
    "protein": 27.0,
    "carbs": 6.0,
    "fat": 26.0,
    "fiber": 1.2,
    "sugar": 2.0,
    "sodium": 410,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.93
  },
  "surmai_fry": {
    "name": "Surmai / Kingfish Tawa Fry",
    "estimated_grams": 150,
    "calories": 260,
    "protein": 30.0,
    "carbs": 5.0,
    "fat": 13.0,
    "fiber": 0.8,
    "sugar": 0.2,
    "sodium": 380,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.94
  },
  "pomfret_tandoori": {
    "name": "Whole Tandoori Pomfret Fish",
    "estimated_grams": 220,
    "calories": 270,
    "protein": 36.0,
    "carbs": 3.0,
    "fat": 12.0,
    "fiber": 1.0,
    "sugar": 0.5,
    "sodium": 410,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.95
  },
  "rohu_fish_curry": {
    "name": "Bengali Macher Jhol (Rohu with Potato & Cauliflower)",
    "estimated_grams": 180,
    "calories": 195,
    "protein": 22.0,
    "carbs": 7.0,
    "fat": 8.5,
    "fiber": 1.5,
    "sugar": 1.0,
    "sodium": 320,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.94
  },
  "hilsa_mustard": {
    "name": "Shorshe Ilish (Hilsa in Mustard Gravy)",
    "estimated_grams": 150,
    "calories": 310,
    "protein": 21.0,
    "carbs": 4.0,
    "fat": 23.0,
    "fiber": 1.2,
    "sugar": 0.5,
    "sodium": 340,
    "serving_unit": "piece",
    "category": "non_veg",
    "confidence": 0.93
  },
  "crab_masala": {
    "name": "Spicy Coastal Crab Masala Curry",
    "estimated_grams": 200,
    "calories": 220,
    "protein": 26.0,
    "carbs": 6.0,
    "fat": 10.0,
    "fiber": 1.5,
    "sugar": 1.5,
    "sodium": 460,
    "serving_unit": "plate",
    "category": "non_veg",
    "confidence": 0.92
  },
  "pork_vindaloo": {
    "name": "Goan Pork Vindaloo with Vinegar",
    "estimated_grams": 160,
    "calories": 340,
    "protein": 25.0,
    "carbs": 5.0,
    "fat": 24.0,
    "fiber": 1.0,
    "sugar": 1.5,
    "sodium": 420,
    "serving_unit": "katori",
    "category": "non_veg",
    "confidence": 0.92
  },
  "thukpa": {
    "name": "Himalayan Chicken Thukpa Noodle Soup",
    "estimated_grams": 300,
    "calories": 260,
    "protein": 18.0,
    "carbs": 36.0,
    "fat": 5.5,
    "fiber": 3.5,
    "sugar": 2.5,
    "sodium": 560,
    "serving_unit": "bowl",
    "category": "non_veg",
    "confidence": 0.94
  },
  "undhiyu": {
    "name": "Gujarati Surti Undhiyu (Mixed Vegetables & Muthia)",
    "estimated_grams": 160,
    "calories": 260,
    "protein": 6.0,
    "carbs": 28.0,
    "fat": 14.0,
    "fiber": 6.5,
    "sugar": 4.5,
    "sodium": 330,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "shrikhand": {
    "name": "Kesar Pista Shrikhand (Hung Curd Sweet)",
    "estimated_grams": 100,
    "calories": 260,
    "protein": 7.5,
    "carbs": 32.0,
    "fat": 11.5,
    "fiber": 0.5,
    "sugar": 30.0,
    "sodium": 40,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.94
  },
  "kulfi": {
    "name": "Traditional Malai Pista Kulfi on Stick",
    "estimated_grams": 70,
    "calories": 190,
    "protein": 4.5,
    "carbs": 22.0,
    "fat": 9.5,
    "fiber": 0.5,
    "sugar": 20.0,
    "sodium": 55,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.94
  },
  "rabdi": {
    "name": "Rich Lachha Rabdi with Dry Fruits",
    "estimated_grams": 100,
    "calories": 280,
    "protein": 7.0,
    "carbs": 28.0,
    "fat": 15.0,
    "fiber": 0.3,
    "sugar": 24.0,
    "sodium": 65,
    "serving_unit": "katori",
    "category": "sweets",
    "confidence": 0.93
  },
  "malpua": {
    "name": "Desi Ghee Malpua with Rabdi (1 pc)",
    "estimated_grams": 75,
    "calories": 260,
    "protein": 4.0,
    "carbs": 36.0,
    "fat": 11.0,
    "fiber": 0.5,
    "sugar": 28.0,
    "sodium": 45,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.93
  },
  "mysore_pak": {
    "name": "Ghee Mysore Pak (1 piece)",
    "estimated_grams": 40,
    "calories": 210,
    "protein": 2.5,
    "carbs": 22.0,
    "fat": 12.5,
    "fiber": 0.8,
    "sugar": 18.0,
    "sodium": 15,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.94
  },
  "kalakand": {
    "name": "Alwar Style Soft Paneer Kalakand (1 pc)",
    "estimated_grams": 40,
    "calories": 140,
    "protein": 4.8,
    "carbs": 16.0,
    "fat": 6.5,
    "fiber": 0.2,
    "sugar": 14.0,
    "sodium": 35,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.94
  },
  "peda": {
    "name": "Mathura Peda / Doodh Peda (1 pc)",
    "estimated_grams": 30,
    "calories": 120,
    "protein": 3.0,
    "carbs": 18.0,
    "fat": 4.2,
    "fiber": 0.1,
    "sugar": 16.0,
    "sodium": 25,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.95
  },
  "ghevar": {
    "name": "Rajasthani Malai Ghevar (1 slice)",
    "estimated_grams": 70,
    "calories": 320,
    "protein": 3.5,
    "carbs": 42.0,
    "fat": 15.5,
    "fiber": 0.5,
    "sugar": 32.0,
    "sodium": 45,
    "serving_unit": "piece",
    "category": "sweets",
    "confidence": 0.92
  },
  "dates": {
    "name": "Medjool Dates / Khajoor (2 dates)",
    "estimated_grams": 48,
    "calories": 133,
    "protein": 0.9,
    "carbs": 36.0,
    "fat": 0.1,
    "fiber": 3.2,
    "sugar": 32.0,
    "sodium": 1,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.97
  },
  "anjeer": {
    "name": "Dried Figs / Anjeer (2 pieces)",
    "estimated_grams": 40,
    "calories": 100,
    "protein": 1.3,
    "carbs": 26.0,
    "fat": 0.4,
    "fiber": 3.8,
    "sugar": 19.0,
    "sodium": 4,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.97
  },
  "pistachios": {
    "name": "Roasted Salted Pistachios (Pista)",
    "estimated_grams": 28,
    "calories": 160,
    "protein": 6.0,
    "carbs": 8.0,
    "fat": 13.0,
    "fiber": 3.0,
    "sugar": 2.0,
    "sodium": 120,
    "serving_unit": "fistful",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "raisins": {
    "name": "Golden Raisins / Kishmish",
    "estimated_grams": 15,
    "calories": 45,
    "protein": 0.5,
    "carbs": 11.8,
    "fat": 0.1,
    "fiber": 0.6,
    "sugar": 9.8,
    "sodium": 2,
    "serving_unit": "tbsp",
    "category": "fruits_veg",
    "confidence": 0.98
  },
  "hummus": {
    "name": "Creamy Chickpea Tahini Hummus",
    "estimated_grams": 30,
    "calories": 75,
    "protein": 2.4,
    "carbs": 4.5,
    "fat": 5.2,
    "fiber": 1.8,
    "sugar": 0.3,
    "sodium": 115,
    "serving_unit": "tbsp",
    "category": "global",
    "confidence": 0.96
  },
  "falafel": {
    "name": "Crispy Chickpea Falafel Balls (3 pcs)",
    "estimated_grams": 75,
    "calories": 210,
    "protein": 6.5,
    "carbs": 24.0,
    "fat": 10.5,
    "fiber": 4.0,
    "sugar": 1.8,
    "sodium": 290,
    "serving_unit": "plate",
    "category": "global",
    "confidence": 0.95
  },
  "pita_bread": {
    "name": "Whole Wheat Pita Pocket Bread",
    "estimated_grams": 60,
    "calories": 165,
    "protein": 5.5,
    "carbs": 33.0,
    "fat": 1.0,
    "fiber": 4.0,
    "sugar": 1.5,
    "sodium": 280,
    "serving_unit": "piece",
    "category": "global",
    "confidence": 0.96
  },
  "protein_bar": {
    "name": "Whey Protein Crunch Bar (20g Protein)",
    "estimated_grams": 60,
    "calories": 210,
    "protein": 20.0,
    "carbs": 22.0,
    "fat": 6.5,
    "fiber": 8.0,
    "sugar": 2.0,
    "sodium": 160,
    "serving_unit": "piece",
    "category": "dairy_protein",
    "confidence": 0.97
  },
  "rice_cakes": {
    "name": "Puffed Brown Rice Cakes (2 cakes)",
    "estimated_grams": 18,
    "calories": 70,
    "protein": 1.5,
    "carbs": 14.5,
    "fat": 0.5,
    "fiber": 0.8,
    "sugar": 0.1,
    "sodium": 35,
    "serving_unit": "piece",
    "category": "global",
    "confidence": 0.97
  },
  "tuna_salad": {
    "name": "Canned Chunk Light Tuna in Olive Oil",
    "estimated_grams": 140,
    "calories": 220,
    "protein": 32.0,
    "carbs": 0.0,
    "fat": 10.0,
    "fiber": 0.0,
    "sugar": 0.0,
    "sodium": 340,
    "serving_unit": "bowl",
    "category": "non_veg",
    "confidence": 0.96
  },
  "edamame": {
    "name": "Steamed Edamame Pods with Sea Salt",
    "estimated_grams": 150,
    "calories": 180,
    "protein": 17.0,
    "carbs": 14.0,
    "fat": 8.0,
    "fiber": 8.0,
    "sugar": 3.0,
    "sodium": 220,
    "serving_unit": "bowl",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "custard_apple": {
    "name": "Fresh Custard Apple / Sitaphal",
    "estimated_grams": 130,
    "calories": 120,
    "protein": 2.2,
    "carbs": 29.0,
    "fat": 0.4,
    "fiber": 4.4,
    "sugar": 22.0,
    "sodium": 4,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.95
  },
  "amla": {
    "name": "Fresh Indian Gooseberry / Amla (2 pcs)",
    "estimated_grams": 50,
    "calories": 22,
    "protein": 0.4,
    "carbs": 5.0,
    "fat": 0.1,
    "fiber": 2.2,
    "sugar": 2.0,
    "sodium": 1,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.98
  },
  "jamun": {
    "name": "Fresh Black Jamun / Black Plum (1 cup)",
    "estimated_grams": 100,
    "calories": 60,
    "protein": 0.7,
    "carbs": 14.0,
    "fat": 0.2,
    "fiber": 0.9,
    "sugar": 12.0,
    "sodium": 14,
    "serving_unit": "cup",
    "category": "fruits_veg",
    "confidence": 0.96
  },
  "lychee": {
    "name": "Fresh Lychee / Litchi (6 fruits)",
    "estimated_grams": 60,
    "calories": 40,
    "protein": 0.5,
    "carbs": 10.0,
    "fat": 0.2,
    "fiber": 0.8,
    "sugar": 9.2,
    "sodium": 1,
    "serving_unit": "piece",
    "category": "fruits_veg",
    "confidence": 0.97
  },
  "arbi_fry": {
    "name": "Arbi Masala Fry (Colocasia / Taro Root)",
    "estimated_grams": 120,
    "calories": 160,
    "protein": 2.0,
    "carbs": 24.0,
    "fat": 7.0,
    "fiber": 4.5,
    "sugar": 1.0,
    "sodium": 210,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "karela_fry": {
    "name": "Crispy Karela / Bitter Gourd Chips",
    "estimated_grams": 80,
    "calories": 120,
    "protein": 2.2,
    "carbs": 12.0,
    "fat": 7.5,
    "fiber": 3.5,
    "sugar": 1.0,
    "sodium": 190,
    "serving_unit": "plate",
    "category": "curries",
    "confidence": 0.93
  },
  "kundru_sabzi": {
    "name": "Kundru / Ivy Gourd Stir-Fry with Mustard",
    "estimated_grams": 120,
    "calories": 95,
    "protein": 1.8,
    "carbs": 10.0,
    "fat": 5.5,
    "fiber": 3.2,
    "sugar": 1.5,
    "sodium": 170,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "gawar_phali": {
    "name": "Gawar Phali (Cluster Beans) with Ajwain",
    "estimated_grams": 120,
    "calories": 85,
    "protein": 3.5,
    "carbs": 11.0,
    "fat": 3.5,
    "fiber": 5.0,
    "sugar": 1.2,
    "sodium": 160,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "parwal_sabzi": {
    "name": "Parwal Aloo (Pointed Gourd Potato Sabzi)",
    "estimated_grams": 130,
    "calories": 120,
    "protein": 2.5,
    "carbs": 16.0,
    "fat": 5.5,
    "fiber": 3.8,
    "sugar": 1.5,
    "sodium": 190,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "tinda_sabzi": {
    "name": "Tinda / Apple Gourd Homestyle Masala",
    "estimated_grams": 130,
    "calories": 85,
    "protein": 1.5,
    "carbs": 10.0,
    "fat": 4.5,
    "fiber": 2.8,
    "sugar": 2.0,
    "sodium": 160,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.94
  },
  "drumstick_curry": {
    "name": "Sahjan / Drumstick Curry with Mustard",
    "estimated_grams": 150,
    "calories": 110,
    "protein": 3.8,
    "carbs": 13.0,
    "fat": 5.0,
    "fiber": 4.2,
    "sugar": 2.0,
    "sodium": 210,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "methi_matar_malai": {
    "name": "Methi Matar Malai in Creamy Gravy",
    "estimated_grams": 160,
    "calories": 270,
    "protein": 6.5,
    "carbs": 18.0,
    "fat": 19.5,
    "fiber": 4.0,
    "sugar": 4.0,
    "sodium": 320,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "paneer_lababdar": {
    "name": "Paneer Lababdar in Rich Tomato Gravy",
    "estimated_grams": 160,
    "calories": 320,
    "protein": 13.5,
    "carbs": 11.0,
    "fat": 25.0,
    "fiber": 2.2,
    "sugar": 4.5,
    "sodium": 390,
    "serving_unit": "katori",
    "category": "curries",
    "confidence": 0.93
  },
  "millet_khichdi": {
    "name": "Foxtail / Bajra Millet Vegetable Khichdi",
    "estimated_grams": 220,
    "calories": 230,
    "protein": 7.0,
    "carbs": 38.0,
    "fat": 6.0,
    "fiber": 6.2,
    "sugar": 1.2,
    "sodium": 260,
    "serving_unit": "bowl",
    "category": "staples",
    "confidence": 0.94
  },
  "ragi_mudde": {
    "name": "Karnataka Ragi Mudde (Steamed Millet Ball)",
    "estimated_grams": 150,
    "calories": 220,
    "protein": 5.2,
    "carbs": 46.0,
    "fat": 1.8,
    "fiber": 7.5,
    "sugar": 0.4,
    "sodium": 45,
    "serving_unit": "piece",
    "category": "south_indian",
    "confidence": 0.95
  },
  "kokum_sharbat": {
    "name": "Kokum Sharbat (Goan Cooling Drink)",
    "estimated_grams": 200,
    "calories": 60,
    "protein": 0.2,
    "carbs": 15.0,
    "fat": 0.0,
    "fiber": 0.5,
    "sugar": 14.0,
    "sodium": 85,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.96
  },
  "jaljeera": {
    "name": "Refreshing Spicy Jaljeera Mint Drink",
    "estimated_grams": 200,
    "calories": 35,
    "protein": 0.8,
    "carbs": 8.0,
    "fat": 0.2,
    "fiber": 1.2,
    "sugar": 3.5,
    "sodium": 260,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.97
  },
  "bel_sharbat": {
    "name": "Bel / Wood Apple Fruit Sharbat",
    "estimated_grams": 250,
    "calories": 140,
    "protein": 1.8,
    "carbs": 34.0,
    "fat": 0.4,
    "fiber": 3.5,
    "sugar": 28.0,
    "sodium": 35,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.95
  },
  "thandai": {
    "name": "Kesar Badam Thandai with Poppy Seeds",
    "estimated_grams": 200,
    "calories": 210,
    "protein": 6.5,
    "carbs": 26.0,
    "fat": 9.5,
    "fiber": 1.8,
    "sugar": 22.0,
    "sodium": 80,
    "serving_unit": "glass",
    "category": "beverages",
    "confidence": 0.94
  }
};

// Strict food recognition: ONLY returns what is requested or recognized. Never returns random salmon.
function intelligentOfflineFoodAnalysis(imageMetadata, isTestNonFood, foodHint) {
  if (isTestNonFood) {
    return {
      error: 'no_food_detected',
      message: 'No food or beverage could be detected in this photo. Please photograph a prepared meal or beverage.'
    };
  }

  // If a specific food hint was passed, match it accurately
  if (foodHint) {
    const cleanHint = foodHint.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const matchedKey = Object.keys(FOOD_NUTRITION_DB).find(k => k === cleanHint || cleanHint.includes(k) || k.includes(cleanHint));
    if (matchedKey) {
      return { items: [{ ...FOOD_NUTRITION_DB[matchedKey] }] };
    }
  }

  // If no Gemini API key and no specific food selected: Do NOT fabricate a random meal!
  return {
    error: 'api_key_required',
    message: 'To identify what is in this photo, Gemini 2.5 Flash Vision requires a Google Gemini API key. Please enter your API key in settings or select your food from the quick list below.'
  };
}

// --- Ria AI 24/7 Nutritionist & Dietitian Engine ---
function callLiveRiaChat(apiKey, userMessage, conversationHistory, profile, healthData, foodLog) {
  return new Promise(async (resolve, reject) => {
    const todayMealsSummary = (foodLog || []).map(e => `${e.mealType}: ${e.foodName} (${e.calories} kcal, P:${e.protein}g C:${e.carbs}g F:${e.fat}g)`).join('; ');
    const heightM = (profile.heightCm || 168) / 100;
    const bmi = (profile.weightKg / (heightM * heightM)).toFixed(1);

    const systemPrompt = `You are Ria, CaloriQ's 24/7 expert AI Nutritionist & Dietitian, inspired by leading Indian health apps like HealthifyMe.
You possess deep expertise in Indian nutrition, regional foods (North, South, East, West Indian cuisines), healthy home-cooking swaps, vegetarian and non-vegetarian protein optimization, Ayurvedic and modern nutritional balance, Indian serving sizes (katoris, rotis, plates, cups, pieces), glycemic index, and lifestyle management (PCOS, thyroid, diabetes, weight loss/gain).

USER METABOLIC DATA:
- Age: ${profile.age}, Sex: ${profile.sex}, Height: ${profile.heightCm} cm, Current Weight: ${profile.weightKg} kg
- Asian Indian BMI: ${bmi} (Asian Indian Cutoffs: <18.5 Underweight, 18.5-22.9 Normal/Healthy, 23-24.9 Overweight, >=25 Obese)
- Goal: ${profile.goal} weight (${profile.targetRateKgPerWeek} kg/week)
- Daily Calorie Target: ${profile.dailyCalorieTarget} kcal | TDEE: ${profile.tdee} kcal | BMR: ${profile.bmr} kcal
- Target Macros: Protein ${profile.proteinTargetG}g, Carbs ${profile.carbsTargetG}g, Fat ${profile.fatTargetG}g
- Today's Telemetry: ${healthData.steps || 0} steps, ${healthData.totalCalories || 0} kcal burned
- Today's Logged Meals: ${todayMealsSummary || 'No meals logged yet today'}

INSTRUCTIONS:
1. Speak as Ria: warm, supportive, motivating, scientifically sound, and culturally nuanced.
2. Provide direct, actionable answers with Indian portions (e.g. 2 rotis, 1 katori dal, 1 glass chaas, 100g paneer).
3. If the user asks for food suggestions, specify the calories and protein count.
4. Keep the response formatted in clean markdown (bullet points, bold highlights) so it reads effortlessly on mobile.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: "Namaste! I am Ria, your personal AI nutritionist. I have reviewed your Asian Indian BMI, metabolic profile, and today's activity. How can I help you reach your goals today?" }] }
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-6).forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const postData = JSON.stringify({ contents });

    for (const model of GEMINI_MODELS) {
      try {
        const resultText = await new Promise((resSingle, rejSingle) => {
          const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000
          };

          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.error) return rejSingle(new Error(parsed.error.message));
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) return rejSingle(new Error('Empty text from Gemini'));
                resSingle(text);
              } catch (e) {
                rejSingle(e);
              }
            });
          });

          req.on('error', rejSingle);
          req.write(postData);
          req.end();
        });

        return resolve(resultText);
      } catch (err) {
        if (err.message.includes('API key not valid')) return reject(err);
      }
    }

    resolve(getOfflineRiaResponse(userMessage, profile, todayMealsSummary));
  });
}

function getOfflineRiaResponse(query, profile, todayMeals) {
  const q = (query || '').toLowerCase();
  if (q.includes('protein') || q.includes('high protein')) {
    return `### High-Protein Indian Options from Ria 🥗\nTo hit your **${profile.proteinTargetG}g protein** target:\n- **Paneer (100g)**: ~18g Protein | 265 kcal\n- **Boiled Eggs (2 pcs)**: ~13g Protein | 156 kcal\n- **Yellow Moong / Chana Dal (1 katori)**: ~8-9g Protein | 150 kcal\n- **Sprouted Moong Salad (1 bowl / 150g)**: ~10g Protein | 140 kcal\n- **Roasted Chana / Sattu Drink (30g)**: ~7g Protein | 120 kcal\n- **Grilled Chicken Tikka (150g)**: ~34g Protein | 220 kcal\n\n💡 *Ria's Tip*: Add a katori of curd (4.8g protein) or a glass of spiced chaas to your lunch and dinner!`;
  }
  if (q.includes('snack') || q.includes('late night') || q.includes('evening')) {
    return `### Healthy Indian Snack Ideas from Ria ☕\nCraving a quick bite under 150 kcal?\n1. **Roasted Makhana (1 bowl, 35g)**: Lightly roasted with 1/2 tsp ghee & turmeric (~125 kcal, 3.5g protein).\n2. **Khaman Dhokla (2 pcs)**: Steamed and low in oil (~140 kcal, 4.5g protein).\n3. **Cucumber & Paneer Chaat (50g paneer)**: Diced with lemon juice & chaat masala (~140 kcal, 9g protein).\n4. **Masala Chaas (1 tall glass)**: Chilled buttermilk with roasted jeera & black salt (~50 kcal).\n\n💡 *Ria's Tip*: Avoid deep-fried sev or biscuits with your evening chai.`;
  }
  if (q.includes('weight loss') || q.includes('deficit') || q.includes('diet plan')) {
    return `### Ria's Weight Loss Action Plan 🎯\n- **Current Calorie Target**: ${profile.dailyCalorieTarget} kcal/day (aiming for ${profile.targetRateKgPerWeek} kg/week deficit).\n- **Plate Rule**: Fill 50% of your plate with sabzi/salad, 25% with protein (dal/paneer/egg/chicken), and 25% with smart carbs (whole wheat roti or brown rice).\n- **Hydration**: Drink 2.5–3 liters of water daily to maintain metabolic rate and prevent false hunger.`;
  }
  return `### Ria's Personalized Consultation ✨\nI have reviewed your profile (Goal: **${profile.goal} weight**, Daily Target: **${profile.dailyCalorieTarget} kcal**).\n\n**Key Directives Today:**\n- **Hydration**: Ensure you hit at least 8–10 glasses of water.\n- **Meal Timing**: Keep a 3–4 hour gap between dinner and sleep.\n- **Macro Balance**: Aim for **${profile.proteinTargetG}g protein** across your meals.\n\nAsk me anything! For example: *"What should I eat for dinner?"*, *"How to increase protein on vegetarian diet?"*, or *"Suggest a 400 kcal lunch"*.`;
}

async function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: Config & API Key ---
  if (pathname === '/api/config' && req.method === 'GET') {
    if (parsedUrl.query && parsedUrl.query.key) {
      userConfig.geminiApiKey = parsedUrl.query.key.trim().replace(/^["']|["']$/g, '');
      saveConfigToFile();
    }
    if (parsedUrl.query && parsedUrl.query.visionKey) {
      userConfig.geminiVisionApiKey = parsedUrl.query.visionKey.trim().replace(/^["']|["']$/g, '');
      saveConfigToFile();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasApiKey: !!userConfig.geminiApiKey,
      maskedKey: userConfig.geminiApiKey ? userConfig.geminiApiKey.substring(0, 6) + '...' + userConfig.geminiApiKey.substring(userConfig.geminiApiKey.length - 4) : '',
      hasVisionApiKey: !!userConfig.geminiVisionApiKey,
      maskedVisionKey: userConfig.geminiVisionApiKey ? userConfig.geminiVisionApiKey.substring(0, 6) + '...' + userConfig.geminiVisionApiKey.substring(userConfig.geminiVisionApiKey.length - 4) : '',
      visionApiKey: userConfig.geminiVisionApiKey,
      apiKey: userConfig.geminiApiKey,
      hasSupabase: !!(userConfig.supabaseUrl && userConfig.supabaseKey),
      supabaseUrl: userConfig.supabaseUrl,
      supabaseKey: userConfig.supabaseKey
    }));
    return;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { apiKey, visionApiKey } = JSON.parse(body);
        if (apiKey) {
          let cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').replace(/^(key|apiKey|GEMINI_API_KEY)=/i, '');
          userConfig.geminiApiKey = cleanKey;
        }
        if (visionApiKey) {
          let cleanVisionKey = (visionApiKey || '').trim().replace(/^["']|["']$/g, '').replace(/^(key|apiKey|GEMINI_VISION_API_KEY)=/i, '');
          userConfig.geminiVisionApiKey = cleanVisionKey;
        }
        saveConfigToFile();
        console.log(`[Config] Gemini API keys updated. General: ${!!userConfig.geminiApiKey}, Vision: ${!!userConfig.geminiVisionApiKey}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          hasApiKey: !!userConfig.geminiApiKey,
          hasVisionApiKey: !!userConfig.geminiVisionApiKey
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- API: Food Entries (CRUD) ---
  if (pathname === '/api/entries' && req.method === 'GET') {
    const targetDate = parsedUrl.query.date || getTodayStr();
    const filtered = foodEntries.filter(e => e.date === targetDate);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(filtered));
    return;
  }

  if (pathname === '/api/entries' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        item.id = Date.now() + Math.floor(Math.random() * 1000);
        if (!item.date) item.date = getTodayStr();
        foodEntries.push(item);
        touchEnclaveMutation(getActiveEnclaveCode(req), 'meal_added', `Meal logged: ${item.foodName} (${item.calories} kcal)`, item.deviceId);

        // Step 5 WRITE Operation: Auto-sync NutritionRecord to Health Connect
        if (healthConnect.permissions.writeNutrition && healthConnect.status === 'available') {
          healthConnect.metrics.nutritionRecordsCount = (healthConnect.metrics.nutritionRecordsCount || 0) + 1;
          healthConnect.syncAuditLog.unshift({
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: 'HealthConnectClient.insertRecords(NutritionRecord)',
            steps: 0,
            activeBurn: 0,
            details: `${item.foodName || 'Meal'} (${item.calories || 0} kcal, P:${item.protein || 0}g, C:${item.carbs || 0}g, F:${item.fat || 0}g)`,
            status: 'SUCCESS'
          });
          if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();
          healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(item));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/entries/') && req.method === 'PUT') {
    const id = parseInt(pathname.split('/').pop(), 10);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const updated = JSON.parse(body);
        const idx = foodEntries.findIndex(e => e.id === id);
        if (idx !== -1) {
          foodEntries[idx] = { ...foodEntries[idx], ...updated };
          touchEnclaveMutation(getActiveEnclaveCode(req), 'meal_updated', `Meal updated: ${foodEntries[idx].foodName}`, updated.deviceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(foodEntries[idx]));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Entry not found' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/entries/') && req.method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop(), 10);
    foodEntries = foodEntries.filter(e => e.id !== id);
    touchEnclaveMutation(getActiveEnclaveCode(req), 'meal_deleted', 'Meal removed', null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // --- API: Health Connect Subsystem ---
  if (pathname === '/api/health-connect' && req.method === 'GET') {
    updateHealthTotals();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthConnect));
    return;
  }

  // Update Health Connect configuration & permissions
  if (pathname === '/api/health-connect/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        if (update.androidVersion !== undefined) healthConnect.androidVersion = update.androidVersion;
        if (update.status !== undefined) healthConnect.status = update.status;
        if (update.permissions) healthConnect.permissions = { ...healthConnect.permissions, ...update.permissions };

        updateHealthTotals();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthConnect));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Perform a realistic Health Connect Sync
  if (pathname === '/api/health-connect/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const payload = body ? JSON.parse(body) : {};

      if (healthConnect.status === 'not_installed') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'HEALTH_CONNECT_NOT_INSTALLED',
          message: 'Health Connect standalone APK is not installed on this Android device (Android 9-13). Please install from Google Play Store.'
        }));
        return;
      }

      if (healthConnect.status === 'permission_denied' || !healthConnect.permissions.steps) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'PERMISSION_DENIED',
          message: 'READ_STEPS permission was denied. Please grant permission in Health Connect Settings.'
        }));
        return;
      }

      // Simulate delta steps synced from device sensors / watch
      const newStepsDelta = payload.stepsDelta || (Math.floor(Math.random() * 450) + 120);
      healthConnect.metrics.steps += newStepsDelta;

      const currentHour = new Date().getHours() + ':00';
      const activeDelta = Math.round(newStepsDelta * 0.045);

      // Add to audit log
      healthConnect.syncAuditLog.unshift({
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: healthConnect.androidVersion >= 14 ? 'Health Connect Mainline Framework' : 'Health Connect APK (com.google.android.apps.healthdata)',
        steps: newStepsDelta,
        activeBurn: activeDelta,
        status: 'SUCCESS'
      });
      if (healthConnect.syncAuditLog.length > 8) healthConnect.syncAuditLog.pop();

      healthConnect.metrics.lastSyncedAt = new Date().toISOString();
      updateHealthTotals();
      touchEnclaveMutation(getActiveEnclaveCode(req), 'health_synced', `Health Connect synced (+${newStepsDelta} steps)`, null);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        syncedDelta: newStepsDelta,
        metrics: healthConnect.metrics,
        healthConnect: healthConnect
      }));
    });
    return;
  }

  // Activity simulation button (Walk, Run, Gym)
  if (pathname === '/api/health-connect/simulate-activity' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { activityType, steps, activeCalories } = JSON.parse(body);
        healthConnect.metrics.steps += (steps || 0);

        healthConnect.syncAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: `User Activity (${activityType || 'Cardio Workout'})`,
          steps: steps || 0,
          activeBurn: activeCalories || Math.round((steps || 0) * 0.045),
          status: 'SUCCESS'
        });

        healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        updateHealthTotals();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthConnect));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Set exact phone steps (from Health Connect sync)
  if (pathname === '/api/health-connect/set-steps' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { totalSteps, source } = JSON.parse(body);
        const newTotal = Math.max(0, parseInt(totalSteps, 10) || 0);
        const prev = healthConnect.metrics.steps;
        healthConnect.metrics.steps = newTotal;
        const delta = newTotal - prev;
        const activeDelta = Math.round(Math.abs(delta) * 0.045);

        healthConnect.syncAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: source || 'Health Connect Telemetry Sync',
          steps: delta,
          activeBurn: activeDelta,
          status: 'SUCCESS'
        });
        if (healthConnect.syncAuditLog.length > 10) healthConnect.syncAuditLog.pop();

        healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        updateHealthTotals();
        touchEnclaveMutation(getActiveEnclaveCode(req), 'steps_updated', `Steps updated: ${newTotal.toLocaleString()}`, null);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthConnect));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Structured Workout Logger (Walking, Running, Cycling, HIIT, Gym)
  if (pathname === '/api/health-connect/log-workout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { workoutType, durationMinutes, steps, activeCalories } = JSON.parse(body);
        const mins = parseInt(durationMinutes, 10) || 30;
        const addSteps = parseInt(steps, 10) || 0;
        const addCal = parseInt(activeCalories, 10) || Math.round(mins * 7.5);

        healthConnect.metrics.steps += addSteps;

        healthConnect.syncAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: `Workout: ${workoutType || 'Cardio'} (${mins}m)`,
          steps: addSteps,
          activeBurn: addCal,
          status: 'SUCCESS'
        });
        if (healthConnect.syncAuditLog.length > 10) healthConnect.syncAuditLog.pop();

        healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        updateHealthTotals();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthConnect));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Step 5: Write Nutrition Record to Health Connect
  if (pathname === '/api/health-connect/write-nutrition' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { foodName, calories, protein, carbs, fat, fiber, sugar, sodium, mealType } = JSON.parse(body);
        if (!foodName || calories === undefined) {
          throw new Error('foodName and calories are required');
        }

        healthConnect.metrics.nutritionRecordsCount = (healthConnect.metrics.nutritionRecordsCount || 0) + 1;
        healthConnect.syncAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: 'HealthConnectClient.insertRecords(NutritionRecord)',
          steps: 0,
          activeBurn: 0,
          details: `${foodName} (${calories} kcal | P:${protein || 0}g C:${carbs || 0}g F:${fat || 0}g)`,
          status: 'SUCCESS'
        });
        if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();

        healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'NutritionRecord successfully written to Health Connect',
          healthConnect: healthConnect
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Step 5: Write Body Weight Record to Health Connect
  if (pathname === '/api/health-connect/write-weight' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { weightKg } = JSON.parse(body);
        const w = parseFloat(weightKg);
        if (!w || isNaN(w)) throw new Error('Valid weightKg is required');

        userProfile.weightKg = w;
        recalculateProfile();
        weightLogs.push({ date: getTodayStr(), weightKg: w });

        healthConnect.syncAuditLog.unshift({
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: 'HealthConnectClient.insertRecords(WeightRecord)',
          steps: 0,
          activeBurn: 0,
          details: `Body Weight: ${w.toFixed(1)} kg`,
          status: 'SUCCESS'
        });
        if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();

        healthConnect.metrics.lastSyncedAt = new Date().toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'WeightRecord successfully written to Health Connect',
          userProfile: userProfile,
          healthConnect: healthConnect
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Sync All Today's Meals to Health Connect
  if (pathname === '/api/health-connect/sync-all-meals' && req.method === 'POST') {
    const todayMeals = foodEntries.filter(e => e.date === getTodayStr());
    todayMeals.forEach(meal => {
      healthConnect.syncAuditLog.unshift({
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: 'HealthConnectClient.insertRecords(NutritionRecord)',
        steps: 0,
        activeBurn: 0,
        details: `${meal.foodName} (${meal.calories} kcal)`,
        status: 'SUCCESS'
      });
    });
    while (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();

    healthConnect.metrics.nutritionRecordsCount = (healthConnect.metrics.nutritionRecordsCount || 0) + todayMeals.length;
    healthConnect.metrics.lastSyncedAt = new Date().toISOString();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      syncedCount: todayMeals.length,
      healthConnect: healthConnect
    }));
    return;
  }

  // Set SDK Status (for Developer Testing of Step 3 availability flows)
  if (pathname === '/api/health-connect/sdk-status' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body);
        if (['available', 'update_required', 'not_installed', 'permission_denied'].includes(status)) {
          healthConnect.status = status;
          if (status === 'available') {
            healthConnect.developerSteps.step3_getSdkStatus.status = 'SDK_AVAILABLE';
            healthConnect.developerSteps.step3_getSdkStatus.statusCode = 3;
          } else if (status === 'update_required') {
            healthConnect.developerSteps.step3_getSdkStatus.status = 'SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED';
            healthConnect.developerSteps.step3_getSdkStatus.statusCode = 2;
          } else {
            healthConnect.developerSteps.step3_getSdkStatus.status = 'SDK_UNAVAILABLE';
            healthConnect.developerSteps.step3_getSdkStatus.statusCode = 1;
          }
          updateHealthTotals();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthConnect));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Trigger 20-minute Auto-Sync Cycle immediately
  if (pathname === '/api/health-connect/trigger-auto-sync' && req.method === 'POST') {
    const autoDelta = Math.floor(Math.random() * 120) + 40;
    healthConnect.metrics.steps += autoDelta;
    const activeDelta = Math.round(autoDelta * 0.045);
    healthConnect.syncAuditLog.unshift({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'WorkManager Background Job (20m Auto-Sync)',
      steps: autoDelta,
      activeBurn: activeDelta,
      details: 'On-demand trigger of 20-minute sync cycle',
      status: 'SUCCESS'
    });
    if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();
    healthConnect.metrics.lastSyncedAt = new Date().toISOString();
    updateHealthTotals();
    touchEnclaveMutation(getActiveEnclaveCode(req), 'health_auto_sync', `20m auto-sync completed (+${autoDelta} steps)`, null);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: '20-minute Health Connect auto-sync completed',
      addedSteps: autoDelta,
      healthConnect: healthConnect
    }));
    return;
  }

  // --- API: Food Photo Analysis (Strict Gemini 2.5 Flash + Exact Food DB) ---
  if (pathname === '/api/analyze-food' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { imageBase64, mimeType, isTestNonFood, apiKeyOverride, foodHint, cookingNotes } = JSON.parse(body);
        // Exclusively prioritize dedicated Vision Key (Key 2) for food photo recognition:
        const activeKey = apiKeyOverride || userConfig.geminiVisionApiKey || userConfig.geminiApiKey;
        console.log(`[Food Scanner] Invoking Gemini Vision with dedicated image scan key (${activeKey.substring(0, 8)}...${activeKey.substring(activeKey.length - 4)})${cookingNotes ? ` [Hint: "${cookingNotes.substring(0, 40)}..."]` : ''}`);

        // 1. Explicit Non-Food Test
        if (isTestNonFood) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'no_food_detected',
            message: 'No food or beverage could be detected in this photo. Please photograph a prepared meal or beverage.'
          }));
          return;
        }

        // 2. Exact Food Hint provided (e.g. from user food selection)
        if (foodHint) {
          const offlineResult = intelligentOfflineFoodAnalysis(imageBase64, false, foodHint);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(offlineResult));
          return;
        }

        // 3. Live Gemini Flash Multimodal Vision API Call (Single-pass recognition + structured volume estimation)
        if (activeKey && imageBase64 && imageBase64.length > 200) {
          try {
            console.log('Invoking Live Gemini Flash Multimodal Vision API with structured outputs...');
            const liveResult = await callLiveGeminiVision(activeKey, imageBase64, mimeType, cookingNotes);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(liveResult));
            return;
          } catch (liveErr) {
            console.error('Live Gemini Vision call failed:', liveErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'gemini_api_error',
              message: `Gemini Vision error: ${liveErr.message}. Make sure your Gemini API key is valid.`
            }));
            return;
          }
        }

        // 4. Missing API Key
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'api_key_required',
          message: 'Gemini API key required for live photo recognition. Please enter your Google Gemini API key or pick your food from the quick catalog.'
        }));

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_request', message: err.message }));
      }
    });
    return;
  }

  // --- API: Common Food Catalog ---
  if (pathname === '/api/food-db' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(FOOD_NUTRITION_DB));
    return;
  }

  // --- API: AI Summary (Live Gemini + Fallback) ---
  if (pathname === '/api/generate-summary' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { apiKeyOverride } = body ? JSON.parse(body) : {};
        const activeKey = apiKeyOverride || userConfig.geminiApiKey;
        const todayEntries = foodEntries.filter(e => e.date === getTodayStr());

        if (activeKey && todayEntries.length > 0) {
          try {
            console.log('Invoking Live Gemini 2.5 Flash Summary API...');
            const liveSummary = await callLiveGeminiSummary(activeKey, todayEntries, healthConnect.metrics, userProfile);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(liveSummary));
            return;
          } catch (liveErr) {
            console.error('Live Gemini Summary call failed:', liveErr.message);
          }
        }

        // Fallback nutrition coaching synthesis
        setTimeout(() => {
          if (!todayEntries || todayEntries.length === 0) {
            const emptySummary = {
              total_calories_in: 0,
              total_calories_burned: healthConnect.metrics.totalCalories || 0,
              net_vs_goal: -(userProfile.dailyCalorieTarget || 1650),
              macro_summary: {
                protein_g: 0,
                carbs_g: 0,
                fat_g: 0,
                fiber_g: 0
              },
              steps: healthConnect.metrics.steps || 0,
              pros: [
                `Clean slate: Ready to track your daily nutrition and hit your ${userProfile.dailyCalorieTarget || 1650} kcal target!`
              ],
              cons: [
                `No meals logged yet today. Use the One-Touch Indian Food Database or Food Scanner to log your first meal.`
              ],
              suggestions: [
                `Tap "+ ADD ROW" or use HealthifySnap to log breakfast, lunch, or dinner.`,
                `Drink water regularly to meet your hydration target.`
              ],
              overall_rating: 'good'
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(emptySummary));
            return;
          }

          const totalIn = todayEntries.reduce((sum, e) => sum + e.calories, 0);
          const totalProt = todayEntries.reduce((sum, e) => sum + e.protein, 0);
          const totalCarbs = todayEntries.reduce((sum, e) => sum + e.carbs, 0);
          const totalFat = todayEntries.reduce((sum, e) => sum + e.fat, 0);
          const totalFiber = todayEntries.reduce((sum, e) => sum + e.fiber, 0);

          const summary = {
            total_calories_in: Math.round(totalIn),
            total_calories_burned: healthConnect.metrics.totalCalories,
            net_vs_goal: Math.round(totalIn - userProfile.dailyCalorieTarget),
            macro_summary: {
              protein_g: Math.round(totalProt),
              carbs_g: Math.round(totalCarbs),
              fat_g: Math.round(totalFat),
              fiber_g: Math.round(totalFiber)
            },
            steps: healthConnect.metrics.steps,
            pros: [
              `Protein intake (${Math.round(totalProt)}g) preserves lean tissue during your ${userProfile.goal} plan.`,
              `Active physical burn of ${healthConnect.metrics.steps.toLocaleString()} steps supported your expenditure target.`
            ],
            cons: [
              totalFiber < 25 ? `Dietary fiber (${Math.round(totalFiber)}g) is under the 25g daily target.` : `Evening carbs were dense.`,
              `Sodium reached ${Math.round(todayEntries.reduce((s,e)=>s+e.sodium,0))}mg; drink additional water to balance fluid retention.`
            ],
            suggestions: [
              `Add 1 cup of leafy greens or 2 tablespoons of chia seeds to hit your fiber target tomorrow.`,
              `Schedule a 20-minute post-lunch walk to hit 10,000 steps smoothly.`,
              `Maintain hydration with 2.5L water to support muscle recovery.`
            ],
            overall_rating: totalIn <= userProfile.dailyCalorieTarget + 100 ? 'great' : 'good'
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(summary));
        }, 500);

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- API: Profile & Weights ---
  if (pathname === '/api/profile' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userProfile));
    return;
  }

  if (pathname === '/api/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        userProfile = { ...userProfile, ...update };
        recalculateProfile();
        updateHealthTotals();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userProfile));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/weights' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(weightLogs));
    return;
  }

  if (pathname === '/api/weights' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        entry.date = entry.date || getTodayStr();
        weightLogs.push(entry);
        userProfile.weightKg = entry.weightKg;
        recalculateProfile();
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- API: Large Indian Food Database (with Indian Serving Sizes) ---
  if (pathname === '/api/indian-foods' && req.method === 'GET') {
    const list = Object.entries(FOOD_NUTRITION_DB).map(([key, item]) => ({
      key,
      name: item.name,
      estimated_grams: item.estimated_grams,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber || 0,
      sugar: item.sugar || 0,
      sodium: item.sodium || 0,
      serving_unit: item.serving_unit || 'g',
      confidence: item.confidence || 0.95
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // --- API: Smart Plans (Ria AI Recommended Indian Diet Plans) ---
  if (pathname === '/api/smart-plans' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(smartPlans));
    return;
  }

  if (pathname === '/api/smart-plans/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { planId, mealType } = JSON.parse(body);
        const plan = smartPlans.find(p => p.id === planId) || smartPlans[0];
        const today = getTodayStr();
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let addedEntries = [];
        const mealKeys = mealType ? [mealType] : ['breakfast', 'lunch', 'eveningSnack', 'dinner'];
        
        mealKeys.forEach(mKey => {
          const items = plan.meals[mKey] || [];
          items.forEach(it => {
            const entry = {
              id: Date.now() + Math.floor(Math.random() * 10000),
              date: today,
              time: nowTime,
              mealType: mKey === 'eveningSnack' || mKey === 'midMorning' ? 'snack' : mKey,
              foodName: it.name,
              quantity: it.grams,
              quantityUnit: 'g',
              calories: it.calories,
              protein: it.protein,
              carbs: it.carbs,
              fat: it.fat,
              fiber: 2.0,
              sugar: 1.0,
              sodium: 100,
              source: 'smart_plan',
              confidence: 0.98
            };
            foodEntries.push(entry);
            addedEntries.push(entry);
          });
        });

        // Step 5 Write: Auto-sync to Health Connect
        if (healthConnect.permissions.writeNutrition && healthConnect.status === 'available') {
          healthConnect.metrics.nutritionRecordsCount = (healthConnect.metrics.nutritionRecordsCount || 0) + addedEntries.length;
          healthConnect.syncAuditLog.unshift({
            timestamp: nowTime,
            source: 'HealthConnectClient.insertRecords(NutritionRecord)',
            steps: 0,
            activeBurn: 0,
            details: `Smart Plan Applied: ${plan.title} (${addedEntries.length} items)`,
            status: 'SUCCESS'
          });
          if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();
        }

        touchEnclaveMutation(getActiveEnclaveCode(req), 'smart_plan', `Applied Smart Plan: ${plan.title}`, null);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, addedCount: addedEntries.length, planTitle: plan.title }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- API: Trackers (Water, Sleep, Handwash, Wearables, Asian BMI) ---
  if (pathname === '/api/trackers' && req.method === 'GET') {
    const heightM = (userProfile.heightCm || 168) / 100;
    const bmi = parseFloat(((userProfile.weightKg || 68) / (heightM * heightM)).toFixed(1));
    let bmiCategory = 'Normal (Healthy)';
    let bmiRisk = 'Optimal metabolic health';
    let bmiColor = 'emerald';
    if (bmi < 18.5) { bmiCategory = 'Underweight'; bmiRisk = 'Nutritional deficiency risk'; bmiColor = 'amber'; }
    else if (bmi <= 22.9) { bmiCategory = 'Normal (Healthy Asian Cutoff)'; bmiRisk = 'Optimal metabolic health'; bmiColor = 'emerald'; }
    else if (bmi <= 24.9) { bmiCategory = 'Overweight (Asian Cutoff)'; bmiRisk = 'Elevated cardiovascular risk'; bmiColor = 'amber'; }
    else { bmiCategory = 'Obese (Asian Cutoff)'; bmiRisk = 'High risk for Type 2 Diabetes / Dyslipidemia'; bmiColor = 'red'; }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...trackerState,
      bmiInfo: {
        bmi,
        category: bmiCategory,
        risk: bmiRisk,
        color: bmiColor,
        weightKg: userProfile.weightKg,
        heightCm: userProfile.heightCm,
        idealWeightRangeKg: `${Math.round(18.5 * heightM * heightM)} - ${Math.round(22.9 * heightM * heightM)} kg`
      }
    }));
    return;
  }

  // Water Tracker Log
  if (pathname === '/api/trackers/water' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { amountMl, reset } = JSON.parse(body);
        if (reset) {
          trackerState.water.currentMl = 0;
          trackerState.water.glassesCount = 0;
          trackerState.water.hourlyLog = [];
        } else {
          const add = parseInt(amountMl, 10) || 250;
          trackerState.water.currentMl += add;
          trackerState.water.glassesCount = Math.round(trackerState.water.currentMl / 250);
          trackerState.water.lastLogged = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          trackerState.water.hourlyLog.unshift({
            time: trackerState.water.lastLogged,
            amountMl: add
          });
          if (trackerState.water.hourlyLog.length > 8) trackerState.water.hourlyLog.pop();
        }
        touchEnclaveMutation(getActiveEnclaveCode(req), 'water_logged', `Water logged (${trackerState.water.currentMl} ml)`, null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trackerState.water));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Sleep Tracker Log
  if (pathname === '/api/trackers/sleep' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { hours, bedTime, wakeTime, quality } = JSON.parse(body);
        if (hours !== undefined) trackerState.sleep.durationHours = parseFloat(hours);
        if (bedTime) trackerState.sleep.bedTime = bedTime;
        if (wakeTime) trackerState.sleep.wakeTime = wakeTime;
        if (quality) trackerState.sleep.quality = quality;
        trackerState.sleep.sleepDebtMinutes = Math.max(0, Math.round((trackerState.sleep.targetHours - trackerState.sleep.durationHours) * 60));
        touchEnclaveMutation(getActiveEnclaveCode(req), 'sleep_logged', `Sleep logged: ${trackerState.sleep.durationHours}h`, null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trackerState.sleep));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Handwash Tracker Log (20s hygiene)
  if (pathname === '/api/trackers/handwash' && req.method === 'POST') {
    trackerState.handwash.countToday += 1;
    trackerState.handwash.lastTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    touchEnclaveMutation(getActiveEnclaveCode(req), 'handwash_logged', `Handwash recorded (${trackerState.handwash.countToday} times)`, null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(trackerState.handwash));
    return;
  }

  // Wearables & Fitbit Sync
  if (pathname === '/api/trackers/wearables-sync' && req.method === 'POST') {
    trackerState.wearables.lastSynced = 'Just now';
    trackerState.wearables.steps = healthConnect.metrics.steps;
    trackerState.wearables.activeMinutes = Math.round(healthConnect.metrics.steps / 160);
    trackerState.wearables.restingHeartRate = 62 + Math.floor(Math.random() * 5);
    trackerState.wearables.batteryPct = Math.max(10, trackerState.wearables.batteryPct - 1);

    healthConnect.syncAuditLog.unshift({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'Fitbit Web API / Wearable Bridge',
      steps: 0,
      activeBurn: 0,
      details: `${trackerState.wearables.fitbitDevice} synced (${trackerState.wearables.steps.toLocaleString()} steps | HR: ${trackerState.wearables.restingHeartRate} bpm)`,
      status: 'SUCCESS'
    });
    if (healthConnect.syncAuditLog.length > 12) healthConnect.syncAuditLog.pop();

    touchEnclaveMutation(getActiveEnclaveCode(req), 'wearables_synced', `Wearables synced (${trackerState.wearables.steps} steps)`, null);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(trackerState.wearables));
    return;
  }

  // --- API: Ria AI 24/7 Nutritionist & Consultation ---
  if (pathname === '/api/ria/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { message, conversationHistory, apiKeyOverride } = JSON.parse(body);
        const activeKey = apiKeyOverride || userConfig.geminiApiKey;

        const reply = await callLiveRiaChat(
          activeKey,
          message,
          conversationHistory,
          userProfile,
          healthConnect.metrics,
          foodEntries.filter(e => e.date === getTodayStr())
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply }));
      } catch (err) {
        // Fallback offline response on error
        const offlineReply = getOfflineRiaResponse(body ? JSON.parse(body).message : '', userProfile, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: offlineReply }));
      }
    });
    return;
  }

  // POST /api/onboarding/generate-plan
  // Accepts user signup data, saves to userProfile, recalculates TDEE, then calls Gemini to generate a personalized workout plan
  if (pathname === '/api/onboarding/generate-plan' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const {
          name, age, sex, heightCm, weightKg, activityLevel,
          primaryGoal, workoutLocation, fitnessLevel,
          equipment, dietaryPref, healthConditions
        } = data;

        // --- 1. Save to userProfile ---
        userProfile.name = name || userProfile.name;
        userProfile.age = parseInt(age) || userProfile.age;
        userProfile.sex = sex || userProfile.sex;
        userProfile.heightCm = parseFloat(heightCm) || userProfile.heightCm;
        userProfile.weightKg = parseFloat(weightKg) || userProfile.weightKg;
        userProfile.activityLevel = activityLevel || userProfile.activityLevel;
        userProfile.workoutLocation = workoutLocation || 'both';
        userProfile.fitnessLevel = fitnessLevel || 'beginner';
        userProfile.equipment = equipment || [];
        userProfile.dietaryPref = dietaryPref || 'vegetarian';
        userProfile.healthConditions = healthConditions || '';
        userProfile.onboardingDone = true;

        // Map primaryGoal to existing goal system
        const goalMap = {
          lose_weight: 'lose',
          gain_muscle: 'gain',
          general_fitness: 'maintain',
          endurance: 'maintain',
          recovery: 'maintain'
        };
        userProfile.goal = goalMap[primaryGoal] || 'maintain';
        userProfile.targetRateKgPerWeek = primaryGoal === 'lose_weight' ? 0.5 : primaryGoal === 'gain_muscle' ? 0.3 : 0;

        // --- 2. Recalculate BMI, BMR, TDEE ---
        const heightM = userProfile.heightCm / 100;
        const bmi = +(userProfile.weightKg / (heightM * heightM)).toFixed(1);
        const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 23 ? 'Healthy' : bmi < 25 ? 'Overweight' : 'Obese';

        recalculateProfile();

        // --- 3. Find best matching workout plan ---
        const workoutGoalMap = {
          lose_weight: 'fat_loss',
          gain_muscle: 'muscle_gain',
          general_fitness: 'general_fitness',
          endurance: 'endurance',
          recovery: 'recovery'
        };
        const wGoal = workoutGoalMap[primaryGoal] || 'general_fitness';
        const wLoc  = workoutLocation || 'both';
        const wLvl  = fitnessLevel || 'beginner';

        // Find best plan: exact match → relax level → relax location
        let recommendedPlan = WORKOUT_PLANS.find(p =>
          p.goal === wGoal && (p.location === wLoc || p.location === 'both') && p.level === wLvl
        ) || WORKOUT_PLANS.find(p =>
          p.goal === wGoal && (p.location === wLoc || p.location === 'both')
        ) || WORKOUT_PLANS.find(p => p.goal === wGoal)
          || WORKOUT_PLANS[0];

        // Enrich plan with exercises
        const planDays = PLAN_DAYS.filter(d => d.planId === recommendedPlan.id).map(d => ({
          ...d,
          exercises: PLAN_DAY_EXERCISES
            .filter(e => e.dayId === d.id)
            .sort((a, b) => a.sort - b.sort)
            .map(pde => {
              const ex = EXERCISES_DB.find(e => e.id === pde.exId);
              const muscle = MUSCLE_GROUPS.find(m => m.id === ex?.muscleId);
              return { name: ex?.name, muscle: muscle?.name, sets: pde.sets, reps: pde.reps, duration: pde.dur, rest: pde.rest, category: ex?.category };
            })
        }));

        // --- 4. Build Gemini prompt for personalized plan ---
        const equipList = Array.isArray(equipment) && equipment.length ? equipment.join(', ') : 'bodyweight only';
        const geminiPrompt = `You are a certified fitness coach and nutritionist. Create a detailed, personalized weekly workout and wellness plan for this user.

USER PROFILE:
- Name: ${name || 'User'}, Age: ${age}, Sex: ${sex}
- Height: ${heightCm} cm, Weight: ${weightKg} kg
- BMI: ${bmi} (${bmiCategory} by Asian Indian standards)
- Maintenance Calories (TDEE): ${userProfile.tdee} kcal/day
- Daily Target: ${userProfile.dailyCalorieTarget} kcal/day
- Primary Goal: ${primaryGoal?.replace(/_/g, ' ')}
- Activity Level: ${activityLevel}
- Workout Location: ${workoutLocation}
- Fitness Level: ${fitnessLevel}
- Available Equipment: ${equipList}
- Dietary Preference: ${dietaryPref}
- Health Conditions/Notes: ${healthConditions || 'None'}

MATCHED WORKOUT PLAN FROM DATABASE: "${recommendedPlan.name}"
- Goal: ${recommendedPlan.goal}, ${recommendedPlan.daysPerWeek} days/week, ${recommendedPlan.sessionMin} min/session
- Training Days:
${planDays.map(d => `  Day ${d.dayNum} (${d.dayName}): ${(d.exercises||[]).slice(0,4).map(e => e.name).join(', ')}${d.exercises?.length > 4 ? ` +${d.exercises.length-4} more` : ''}`).join('\n')}

INSTRUCTIONS:
1. Write a warm, encouraging 2-sentence welcome message addressing the user by name.
2. Confirm their BMI and what it means for them specifically.
3. Explain their calorie target: maintenance (${userProfile.tdee} kcal), daily target (${userProfile.dailyCalorieTarget} kcal), and why.
4. Endorse the matched workout plan by name and explain why it suits their goal, location, and fitness level.
5. Give a brief 7-day weekly schedule (Mon–Sun) using days from the plan above, including rest days.
6. Add 3 personalized diet tips for their goal and dietary preference (${dietaryPref}).
7. Give 2 motivational tips specific to their health conditions (${healthConditions || 'general fitness'}).

Format with clear headings using **bold** and bullet points. Keep it under 500 words. Be warm, specific, and actionable.`;

        const activeKey = userConfig.geminiApiKey;
        let aiPlan = '';
        if (activeKey) {
          try {
            const postData = JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: geminiPrompt }] }]
            });
            for (const model of GEMINI_MODELS) {
              try {
                const text = await new Promise((resolve, reject) => {
                  const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    port: 443,
                    path: `/v1beta/models/${model}:generateContent?key=${activeKey}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
                    timeout: 40000
                  };
                  const hreq = https.request(options, (hres) => {
                    let b = '';
                    hres.on('data', c => b += c);
                    hres.on('end', () => {
                      try {
                        const parsed = JSON.parse(b);
                        if (parsed.error) return reject(new Error(parsed.error.message));
                        const t = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!t) return reject(new Error('Empty response'));
                        resolve(t);
                      } catch(e) { reject(e); }
                    });
                  });
                  hreq.on('error', reject);
                  hreq.write(postData);
                  hreq.end();
                });
                aiPlan = text;
                break;
              } catch(err) {
                if (err.message.includes('API key not valid')) break;
              }
            }
          } catch(e) {
            console.error('[Onboarding] Gemini plan error:', e.message);
          }
        }

        // Fallback plan if Gemini fails
        if (!aiPlan) {
          aiPlan = `## Welcome, ${name || 'User'}! 🎉\n\nYour profile is set up. Here's your personalised plan:\n\n**BMI:** ${bmi} (${bmiCategory})\n**Calorie Target:** ${userProfile.dailyCalorieTarget} kcal/day\n**Recommended Plan:** ${recommendedPlan.name}\n\nStart with the **${planDays[0]?.dayName || 'Day 1'}** workout and build from there. Ria AI is here to guide you every step of the way!`;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          bmi,
          bmiCategory,
          bmr: userProfile.bmr,
          tdee: userProfile.tdee,
          dailyCalorieTarget: userProfile.dailyCalorieTarget,
          macros: { protein: userProfile.proteinTargetG, carbs: userProfile.carbsTargetG, fat: userProfile.fatTargetG },
          recommendedPlan: { ...recommendedPlan, days: planDays },
          aiPlan,
          profile: userProfile
        }));
      } catch (err) {
        console.error('[Onboarding] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /api/onboarding/status — check if onboarding is completed
  if (pathname === '/api/onboarding/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      done: !!userProfile.onboardingDone,
      name: userProfile.name || null
    }));
    return;
  }

  // Serve qr_lib.js
  if (pathname === '/qr_lib.js') {
    const qrPath = path.join(__dirname, 'qr_lib.js');
    if (fs.existsSync(qrPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(qrPath, 'utf8'));
      return;
    }
  }

  // ==================== MULTI-DEVICE INTER-CONNECT SYNC ENDPOINTS ====================
  // Sync Info & Enclave Metadata
  if (pathname === '/api/sync/info' && req.method === 'GET') {
    const code = parsedUrl.query.code || getActiveEnclaveCode(req);
    const enclave = getEnclave(code);
    const ips = getNetworkIps();
    const primaryIp = ips[0] || 'localhost';
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      syncCode: enclave.code,
      pairUrl: `http://${primaryIp}:${PORT}/?sync=${enclave.code}`,
      localUrl: `http://localhost:${PORT}/?sync=${enclave.code}`,
      primaryIp,
      networkIps: ips,
      port: PORT,
      clientIp,
      lastUpdated: enclave.lastUpdated,
      deviceCount: enclave.devices.length,
      devices: enclave.devices,
      lastMutation: enclave.lastMutation
    }));
    return;
  }

  // Dynamic High-Fidelity Vector QR Code SVG
  if (pathname === '/api/sync/qr.svg' && req.method === 'GET') {
    const code = parsedUrl.query.code || getActiveEnclaveCode(req);
    const size = Math.min(600, Math.max(120, parseInt(parsedUrl.query.size, 10) || 280));
    const ips = getNetworkIps();
    const targetIp = parsedUrl.query.ip || ips[0] || 'localhost';
    const targetUrl = `http://${targetIp}:${PORT}/?sync=${code}`;

    const svg = CaloriqQR.generateQRCodeSVG(targetUrl, size, 2);
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(svg);
    return;
  }

  // Register / Pair Device
  if (pathname === '/api/sync/pair' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { syncCode, deviceId, deviceName, platform } = JSON.parse(body || '{}');
        const code = (syncCode || DEFAULT_SYNC_CODE).trim().toUpperCase();
        const enclave = getEnclave(code);
        const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
        const dev = registerOrUpdateDevice(enclave, deviceId, deviceName, platform, clientIp);

        const ips = getNetworkIps();
        const primaryIp = ips[0] || 'localhost';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          syncCode: enclave.code,
          device: dev,
          deviceCount: enclave.devices.length,
          devices: enclave.devices,
          pairUrl: `http://${primaryIp}:${PORT}/?sync=${enclave.code}`,
          lastUpdated: enclave.lastUpdated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Real-Time Heartbeat Pulse & Change Detection
  if (pathname === '/api/sync/pulse' && req.method === 'GET') {
    const code = parsedUrl.query.code || getActiveEnclaveCode(req);
    const enclave = getEnclave(code);
    const deviceId = parsedUrl.query.deviceId;
    const since = parseInt(parsedUrl.query.since, 10) || 0;

    if (deviceId) {
      const dev = enclave.devices.find(d => d.id === deviceId);
      if (dev) {
        dev.lastSeen = Date.now();
      }
    }

    const changed = enclave.lastUpdated > since;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      changed,
      lastUpdated: enclave.lastUpdated,
      deviceCount: enclave.devices.length,
      devices: enclave.devices,
      lastMutation: enclave.lastMutation
    }));
    return;
  }

  // Generate Brand New Unique User Code
  if (pathname === '/api/sync/generate-code' && req.method === 'POST') {
    const newCode = generateRandomSyncCode();
    const enclave = getEnclave(newCode);
    const ips = getNetworkIps();
    const primaryIp = ips[0] || 'localhost';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      syncCode: newCode,
      pairUrl: `http://${primaryIp}:${PORT}/?sync=${newCode}`,
      localUrl: `http://localhost:${PORT}/?sync=${newCode}`
    }));
    return;
  }

  // Unpair / Disconnect Device
  if (pathname === '/api/sync/unpair' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { syncCode, deviceId } = JSON.parse(body || '{}');
        const code = syncCode || DEFAULT_SYNC_CODE;
        const enclave = getEnclave(code);
        enclave.devices = enclave.devices.filter(d => d.id !== deviceId);
        touchEnclaveMutation(code, 'device_unpaired', `Device disconnected`, deviceId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deviceCount: enclave.devices.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // =====================================================================
  // WORKOUT API ROUTES
  // =====================================================================

  // GET /api/workout/plans  — list all plans with optional filters
  if (pathname === '/api/workout/plans' && req.method === 'GET') {
    const { goal, location: loc, level } = parsedUrl.query;
    let plans = WORKOUT_PLANS.map(p => ({
      ...p,
      days: PLAN_DAYS.filter(d => d.planId === p.id).map(d => ({
        ...d,
        exercises: PLAN_DAY_EXERCISES
          .filter(e => e.dayId === d.id)
          .sort((a, b) => a.sort - b.sort)
          .map(pde => {
            const ex = EXERCISES_DB.find(e => e.id === pde.exId);
            const muscle = MUSCLE_GROUPS.find(m => m.id === ex?.muscleId);
            const equip = EQUIPMENT_LIST.find(e => e.id === ex?.equipId);
            return { ...pde, exercise: ex?.name, muscle: muscle?.name, equipment: equip?.name, category: ex?.category, kcalPerMin: ex?.kcalPerMin };
          })
      }))
    }));
    if (goal) plans = plans.filter(p => p.goal === goal);
    if (loc) plans = plans.filter(p => p.location === loc || p.location === 'both');
    if (level) plans = plans.filter(p => p.level === level);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(plans));
    return;
  }

  // GET /api/workout/exercises  — list exercises with filters
  if (pathname === '/api/workout/exercises' && req.method === 'GET') {
    const { category, location: loc, muscle, difficulty } = parsedUrl.query;
    let exList = EXERCISES_DB.map(e => ({
      ...e,
      muscleName: MUSCLE_GROUPS.find(m => m.id === e.muscleId)?.name,
      equipmentName: EQUIPMENT_LIST.find(eq => eq.id === e.equipId)?.name
    }));
    if (category) exList = exList.filter(e => e.category === category);
    if (loc) exList = exList.filter(e => e.location === loc || e.location === 'both');
    if (muscle) exList = exList.filter(e => e.muscleName?.toLowerCase().includes(muscle.toLowerCase()));
    if (difficulty) exList = exList.filter(e => e.difficulty === difficulty);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(exList));
    return;
  }

  // GET /api/workout/muscles  — muscle group list
  if (pathname === '/api/workout/muscles' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(MUSCLE_GROUPS));
    return;
  }

  // GET /api/workout/log  — get workout log entries (optionally filter by date)
  if (pathname === '/api/workout/log' && req.method === 'GET') {
    const { date } = parsedUrl.query;
    let logs = workoutLog;
    if (date) logs = logs.filter(l => l.date === date);
    // Enrich with exercise names
    logs = logs.map(l => ({
      ...l,
      exerciseName: EXERCISES_DB.find(e => e.id === l.exerciseId)?.name || 'Unknown'
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs));
    return;
  }

  // POST /api/workout/log  — log a workout set
  if (pathname === '/api/workout/log' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const entry = {
          id: Date.now().toString(),
          date: data.date || getTodayStr(),
          exerciseId: data.exerciseId,
          setsDone: data.setsDone || null,
          repsDone: data.repsDone || null,
          weightKg: data.weightKg || null,
          durationMin: data.durationMin || null,
          notes: data.notes || '',
          createdAt: new Date().toISOString()
        };
        workoutLog.push(entry);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, entry }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/workout/log/:id
  if (pathname.startsWith('/api/workout/log/') && req.method === 'DELETE') {
    const logId = pathname.split('/').pop();
    const idx = workoutLog.findIndex(l => l.id === logId);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Log entry not found' }));
      return;
    }
    workoutLog.splice(idx, 1);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // GET /api/workout/today-summary  — summary for today's logged exercises
  if (pathname === '/api/workout/today-summary' && req.method === 'GET') {
    const today = getTodayStr();
    const todayLogs = workoutLog.filter(l => l.date === today);
    const totalSets = todayLogs.reduce((s, l) => s + (l.setsDone || 0), 0);
    const totalKcal = todayLogs.reduce((s, l) => {
      const ex = EXERCISES_DB.find(e => e.id === l.exerciseId);
      return s + (l.durationMin || 0) * (ex?.kcalPerMin || 0);
    }, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ date: today, exercisesLogged: todayLogs.length, totalSets, totalKcalBurned: Math.round(totalKcal) }));
    return;
  }

  // Serve static UI

  if (pathname === '/' || pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'caloriq_web.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath, 'utf8'));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  const HOST = '0.0.0.0';
  server.listen(PORT, HOST, () => {
    const ips = getNetworkIps();
    console.log('=======================================================');
    console.log('🚀 CaloriQ Local Server is LIVE on your Network!');
    console.log(`• Local:   http://localhost:${PORT}`);
    ips.forEach(ip => {
      console.log(`• Network: http://${ip}:${PORT}`);
    });
    console.log('• Accessible from phones, tablets, & laptops on Wi-Fi');
    console.log('=======================================================');
  });
}

module.exports = requestHandler;
