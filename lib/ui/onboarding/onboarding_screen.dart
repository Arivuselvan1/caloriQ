import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/constants.dart';
import '../../core/utils/macro_calculator.dart';
import '../../core/utils/tdee_calculator.dart';
import '../../domain/entities/user_profile.dart';
import '../providers.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  final VoidCallback onComplete;

  const OnboardingScreen({super.key, required this.onComplete});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentStep = 0;

  // Form Fields
  int _age = 28;
  String _sex = 'female';
  double _heightCm = 168.0;
  double _weightKg = 68.0;
  String _activityLevel = ActivityLevel.moderate.name;
  String _goal = GoalType.lose.name;
  double _targetRateKg = 0.5;

  double get _bmr => TdeeCalculator.calculateBmr(
        weightKg: _weightKg,
        heightCm: _heightCm,
        age: _age,
        sex: _sex,
      );

  double get _tdee => TdeeCalculator.calculateTdee(
        bmr: _bmr,
        activityLevel: _activityLevel,
      );

  int get _dailyCalories => TdeeCalculator.calculateDailyTarget(
        tdee: _tdee,
        goal: _goal,
        rateKgPerWeek: _targetRateKg,
        sex: _sex,
      );

  MacroTargets get _macros => MacroCalculator.calculateMacros(
        dailyCalories: _dailyCalories,
        weightKg: _weightKg,
        goal: _goal,
      );

  void _nextPage() {
    if (_currentStep < 3) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _finishOnboarding();
    }
  }

  void _previousPage() {
    if (_currentStep > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  Future<void> _finishOnboarding() async {
    final userRepo = ref.read(userRepositoryProvider);
    final deviceId = await userRepo.getOrCreateDeviceId();

    final profile = UserProfile(
      age: _age,
      sex: _sex,
      heightCm: _heightCm,
      weightKg: _weightKg,
      activityLevel: _activityLevel,
      goal: _goal,
      targetRateKgPerWeek: _targetRateKg,
      bmr: (_bmr * 10).round() / 10,
      tdee: (_tdee * 10).round() / 10,
      dailyCalorieTarget: _dailyCalories,
      proteinTargetG: _macros.proteinG,
      carbsTargetG: _macros.carbsG,
      fatTargetG: _macros.fatG,
      fiberTargetG: _macros.fiberG,
      onboardingComplete: true,
      deviceId: deviceId,
      updatedAt: DateTime.now(),
    );

    await userRepo.saveProfile(profile);
    await userRepo.logWeight(_weightKg);

    widget.onComplete();
  }

  Widget _buildStep1Basics() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('About You', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
            'We use this to calculate your Basal Metabolic Rate (BMR) with the clinically proven Mifflin-St Jeor formula.',
            style: TextStyle(color: Colors.grey.shade600, height: 1.4),
          ),
          const SizedBox(height: 32),
          const Text('Biological Sex', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: const Center(child: Text('Female', style: TextStyle(fontSize: 15))),
                  selected: _sex == 'female',
                  onSelected: (val) => setState(() => _sex = 'female'),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: ChoiceChip(
                  label: const Center(child: Text('Male', style: TextStyle(fontSize: 15))),
                  selected: _sex == 'male',
                  onSelected: (val) => setState(() => _sex = 'male'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Age', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              Text('$_age years old', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ],
          ),
          Slider(
            value: _age.toDouble(),
            min: 14,
            max: 90,
            divisions: 76,
            label: '$_age',
            onChanged: (val) => setState(() => _age = val.round()),
          ),
        ],
      ),
    );
  }

  Widget _buildStep2Body() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Your Measurements', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
            'Accurate measurements guarantee safe calorie budgets and appropriate macronutrient goals.',
            style: TextStyle(color: Colors.grey.shade600, height: 1.4),
          ),
          const SizedBox(height: 32),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Height', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              Text('${_heightCm.round()} cm', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ],
          ),
          Slider(
            value: _heightCm,
            min: 120,
            max: 220,
            divisions: 100,
            label: '${_heightCm.round()} cm',
            onChanged: (val) => setState(() => _heightCm = val),
          ),
          const SizedBox(height: 28),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Current Weight', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              Text('${_weightKg.toStringAsFixed(1)} kg', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ],
          ),
          Slider(
            value: _weightKg,
            min: 35,
            max: 200,
            divisions: 330,
            label: '${_weightKg.toStringAsFixed(1)} kg',
            onChanged: (val) => setState(() => _weightKg = (val * 10).round() / 10),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0F766E).withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.flash_on_rounded, color: Color(0xFF0F766E)),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Calculated Resting BMR', style: TextStyle(fontSize: 12, color: Color(0xFF0F766E))),
                    Text(
                      '~${_bmr.round()} kcal/day',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF0F766E)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep3Activity() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Daily Activity Level', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
            'Select the option that best reflects your typical weekly movement routine.',
            style: TextStyle(color: Colors.grey.shade600, height: 1.4),
          ),
          const SizedBox(height: 20),
          ...ActivityLevel.values.map((lvl) {
            final isSelected = _activityLevel == lvl.name;
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: isSelected ? const Color(0xFF0F766E) : Colors.grey.shade300,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: ListTile(
                title: Text(lvl.label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                subtitle: Text(lvl.description, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                trailing: Text('${lvl.multiplier}x', style: const TextStyle(fontWeight: FontWeight.w700)),
                selected: isSelected,
                onTap: () => setState(() => _activityLevel = lvl.name),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildStep4Goals() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Your Health Goal', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
            'We ensure safe calorie floors: no extreme deficits or unsafe restrictions.',
            style: TextStyle(color: Colors.grey.shade600, height: 1.4),
          ),
          const SizedBox(height: 20),
          Row(
            children: GoalType.values.map((g) {
              final isSelected = _goal == g.name;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Center(
                      child: Text(
                        g.label.split(' ').first,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                    selected: isSelected,
                    onSelected: (val) => setState(() => _goal = g.name),
                  ),
                ),
              );
            }).toList(),
          ),
          if (_goal != GoalType.maintain.name) ...[
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Pace / Rate', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                Text('${_targetRateKg.toStringAsFixed(2)} kg/week',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ],
            ),
            Slider(
              value: _targetRateKg,
              min: 0.25,
              max: 1.0,
              divisions: 3,
              label: '${_targetRateKg.toStringAsFixed(2)} kg/week',
              onChanged: (val) => setState(() => _targetRateKg = val),
            ),
          ],
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0F766E),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('YOUR RECOMMENDED TARGET',
                    style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text('$_dailyCalories',
                        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white)),
                    const SizedBox(width: 6),
                    const Text('kcal / day', style: TextStyle(color: Colors.white70, fontSize: 14)),
                  ],
                ),
                const Divider(color: Colors.white24, height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _macroBadge('Protein', '${_macros.proteinG}g', '🥩'),
                    _macroBadge('Carbs', '${_macros.carbsG}g', '🌾'),
                    _macroBadge('Fat', '${_macros.fatG}g', '🥑'),
                    _macroBadge('Fiber', '${_macros.fiberG}g', '🥦'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _macroBadge(String label, String value, String icon) {
    return Column(
      children: [
        Text('$icon $value', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 10)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setup CaloriQ'),
        leading: _currentStep > 0
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: _previousPage,
              )
            : null,
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: (_currentStep + 1) / 4.0,
            backgroundColor: Colors.grey.shade200,
            color: const Color(0xFF0F766E),
          ),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              onPageChanged: (page) => setState(() => _currentStep = page),
              children: [
                _buildStep1Basics(),
                _buildStep2Body(),
                _buildStep3Activity(),
                _buildStep4Goals(),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _nextPage,
                child: Text(_currentStep == 3 ? 'Start Tracking' : 'Continue'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
