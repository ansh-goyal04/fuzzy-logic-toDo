"""
test_inference.py — Unit tests for the fuzzy inference engine.

Run with:
    python -m pytest backend/fuzzy_engine/test_inference.py -v

Each test passes specific input profiles into the TaskPrioritizer and
asserts that:
    1. No math/shape errors are thrown.
    2. The returned score is a float within [0, 100].
    3. The relative ordering of scores is psychologically coherent
       (e.g., a crisis outranks a non-urgent task).
"""

import pytest

from backend.fuzzy_engine.inference import TaskPrioritizer


# ── Shared fixture: build the engine once for all tests ──────────────────

@pytest.fixture(scope="module")
def prioritizer() -> TaskPrioritizer:
    """Instantiate the FIS once (expensive due to rule compilation)."""
    return TaskPrioritizer()


# ═══════════════════════════════════════════════════════════════════════════
# Test 1: Crisis scenario — deadline imminent + critical importance
# ═══════════════════════════════════════════════════════════════════════════

class TestCrisisScenario:
    """Deadline tomorrow, critical task, user is alert and calm."""

    def test_returns_float(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=1.0,       # 1 day left — very soon
            effort_val=5.0,         # medium effort
            energy_val=7.0,         # normal-to-focused
            importance_val=9.5,     # critical
            stress_val=3.0,         # calm
            distraction_val=5.0,    # minimal distraction
        )
        assert isinstance(score, float)

    def test_score_in_bounds(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=1.0,
            effort_val=5.0,
            energy_val=7.0,
            importance_val=9.5,
            stress_val=3.0,
            distraction_val=5.0,
        )
        assert 0.0 <= score <= 100.0

    def test_score_is_high(self, prioritizer: TaskPrioritizer) -> None:
        """Crisis inputs (R1, R7, R13) should yield a high priority."""
        score = prioritizer.calculate_priority(
            deadline_val=1.0,
            effort_val=5.0,
            energy_val=7.0,
            importance_val=9.5,
            stress_val=3.0,
            distraction_val=5.0,
        )
        assert score >= 60.0, f"Crisis scenario scored too low: {score}"


# ═══════════════════════════════════════════════════════════════════════════
# Test 2: Burnout / exhaustion scenario
# ═══════════════════════════════════════════════════════════════════════════

class TestBurnoutScenario:
    """User is exhausted and stressed, task is normal importance, far deadline."""

    def test_returns_float(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=20.0,      # far deadline
            effort_val=8.0,         # high effort
            energy_val=1.5,         # exhausted
            importance_val=4.0,     # normal
            stress_val=9.0,         # high stress
            distraction_val=50.0,   # moderate distraction
        )
        assert isinstance(score, float)

    def test_score_in_bounds(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=20.0,
            effort_val=8.0,
            energy_val=1.5,
            importance_val=4.0,
            stress_val=9.0,
            distraction_val=50.0,
        )
        assert 0.0 <= score <= 100.0

    def test_score_is_low(self, prioritizer: TaskPrioritizer) -> None:
        """Burnout inputs (R8, R9, R10) should suppress priority."""
        score = prioritizer.calculate_priority(
            deadline_val=20.0,
            effort_val=8.0,
            energy_val=1.5,
            importance_val=4.0,
            stress_val=9.0,
            distraction_val=50.0,
        )
        assert score <= 40.0, f"Burnout scenario scored too high: {score}"


# ═══════════════════════════════════════════════════════════════════════════
# Test 3: Doomscroll recovery — high distraction + easy task
# ═══════════════════════════════════════════════════════════════════════════

class TestDoomscrollRecovery:
    """User has been doomscrolling; a quick-win task should be pushed up."""

    def test_returns_float(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=10.0,      # moderate deadline
            effort_val=1.0,         # very low effort (quick win)
            energy_val=4.0,         # low energy
            importance_val=5.0,     # normal
            stress_val=5.0,         # moderate
            distraction_val=100.0,  # heavy doomscrolling
        )
        assert isinstance(score, float)

    def test_score_in_bounds(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=10.0,
            effort_val=1.0,
            energy_val=4.0,
            importance_val=5.0,
            stress_val=5.0,
            distraction_val=100.0,
        )
        assert 0.0 <= score <= 100.0

    def test_quick_win_gets_boosted(self, prioritizer: TaskPrioritizer) -> None:
        """R4 (distraction high + effort very low → immediate) should fire."""
        score = prioritizer.calculate_priority(
            deadline_val=10.0,
            effort_val=1.0,
            energy_val=4.0,
            importance_val=5.0,
            stress_val=5.0,
            distraction_val=100.0,
        )
        assert score >= 40.0, f"Doomscroll quick-win scored too low: {score}"


# ═══════════════════════════════════════════════════════════════════════════
# Test 4: Deep work — focused user, minimal distraction, high effort
# ═══════════════════════════════════════════════════════════════════════════

class TestDeepWorkScenario:
    """User is focused, calm, minimal distractions — time for deep work."""

    def test_returns_float(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=8.0,       # soon-ish
            effort_val=9.0,         # high effort (deep work)
            energy_val=9.0,         # focused
            importance_val=7.0,     # important
            stress_val=2.0,         # calm
            distraction_val=5.0,    # minimal
        )
        assert isinstance(score, float)

    def test_score_in_bounds(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=8.0,
            effort_val=9.0,
            energy_val=9.0,
            importance_val=7.0,
            stress_val=2.0,
            distraction_val=5.0,
        )
        assert 0.0 <= score <= 100.0

    def test_deep_work_is_high(self, prioritizer: TaskPrioritizer) -> None:
        """R7, R12, R13 should fire — deep work gets high priority."""
        score = prioritizer.calculate_priority(
            deadline_val=8.0,
            effort_val=9.0,
            energy_val=9.0,
            importance_val=7.0,
            stress_val=2.0,
            distraction_val=5.0,
        )
        assert score >= 55.0, f"Deep work scenario scored too low: {score}"


# ═══════════════════════════════════════════════════════════════════════════
# Test 5: Coherence — crisis must outrank burnout
# ═══════════════════════════════════════════════════════════════════════════

class TestRelativeOrdering:
    """Verify that the engine's rankings are psychologically coherent."""

    def test_crisis_beats_burnout(self, prioritizer: TaskPrioritizer) -> None:
        crisis = prioritizer.calculate_priority(
            deadline_val=1.0, effort_val=5.0, energy_val=7.0,
            importance_val=9.5, stress_val=3.0, distraction_val=5.0,
        )
        burnout = prioritizer.calculate_priority(
            deadline_val=20.0, effort_val=8.0, energy_val=1.5,
            importance_val=4.0, stress_val=9.0, distraction_val=50.0,
        )
        assert crisis > burnout, (
            f"Crisis ({crisis}) should outrank burnout ({burnout})"
        )

    def test_deep_work_beats_burnout(self, prioritizer: TaskPrioritizer) -> None:
        deep = prioritizer.calculate_priority(
            deadline_val=8.0, effort_val=9.0, energy_val=9.0,
            importance_val=7.0, stress_val=2.0, distraction_val=5.0,
        )
        burnout = prioritizer.calculate_priority(
            deadline_val=20.0, effort_val=8.0, energy_val=1.5,
            importance_val=4.0, stress_val=9.0, distraction_val=50.0,
        )
        assert deep > burnout, (
            f"Deep work ({deep}) should outrank burnout ({burnout})"
        )


# ═══════════════════════════════════════════════════════════════════════════
# Test 6: Edge cases — boundary inputs don't crash
# ═══════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Ensure the engine handles boundary and out-of-range inputs."""

    def test_all_minimum_inputs(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=0, effort_val=0, energy_val=1,
            importance_val=1, stress_val=1, distraction_val=0,
        )
        assert isinstance(score, float)
        assert 0.0 <= score <= 100.0

    def test_all_maximum_inputs(self, prioritizer: TaskPrioritizer) -> None:
        score = prioritizer.calculate_priority(
            deadline_val=30, effort_val=10, energy_val=10,
            importance_val=10, stress_val=10, distraction_val=120,
        )
        assert isinstance(score, float)
        assert 0.0 <= score <= 100.0

    def test_out_of_range_clamped(self, prioritizer: TaskPrioritizer) -> None:
        """Values outside the universe should be clamped, not crash."""
        score = prioritizer.calculate_priority(
            deadline_val=-5, effort_val=20, energy_val=0,
            importance_val=15, stress_val=-1, distraction_val=999,
        )
        assert isinstance(score, float)
        assert 0.0 <= score <= 100.0
