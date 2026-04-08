"""
fuzzy_engine/inference.py — Mamdani-type Fuzzy Inference System for task prioritization.

This module implements the core intelligent ranking engine of the Adaptive
Neuro-Fuzzy Productivity Suite. It uses scikit-fuzzy's control system API
to evaluate 20 hand-crafted rules across 6 input dimensions and produce a
single crisp priority score (0–100) via centroid defuzzification.

Rule categories model human psychology:
    - Crisis & Core Priorities (deadline × importance)
    - Doomscroll Recovery (distraction debt interventions)
    - Burnout Protection (stress × energy guards)
    - Deep Work Optimization (energy × effort × focus)
    - Quick Wins & Maintenance (low-effort triaging)
    - Procrastination Trap (deadline × distraction wake-up calls)

Usage:
    from backend.fuzzy_engine.inference import TaskPrioritizer

    prioritizer = TaskPrioritizer()
    score = prioritizer.calculate_priority(
        deadline_val=3.0,    # days left
        effort_val=2.0,      # hours needed
        energy_val=7.0,      # 1–10 scale
        importance_val=8.0,  # 1–10 scale
        stress_val=4.0,      # 1–10 scale
        distraction_val=15.0 # minutes wasted recently
    )
    print(f"Priority: {score:.1f}/100")
"""

from __future__ import annotations

import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
import os
import json

WEIGHTS_FILE = os.path.join(os.path.dirname(__file__), "..", "learning_module", "user_weights.json")


# ═══════════════════════════════════════════════════════════════════════════
# Fuzzy Variable Factory
# ═══════════════════════════════════════════════════════════════════════════

def _build_antecedents() -> dict[str, ctrl.Antecedent]:
    """
    Define the six input (antecedent) fuzzy variables with their
    membership functions.

    Returns a dict keyed by variable name for easy rule construction.
    """

    # ── Deadline (days remaining: 0–30) ──────────────────────────────────
    deadline = ctrl.Antecedent(np.arange(0, 31, 1), "deadline")
    deadline["very_soon"] = fuzz.trapmf(deadline.universe, [0, 0, 2, 5])
    deadline["soon"]      = fuzz.trimf(deadline.universe, [3, 7, 12])
    deadline["far"]       = fuzz.trimf(deadline.universe, [10, 17, 23])
    deadline["very_far"]  = fuzz.trapmf(deadline.universe, [20, 25, 30, 30])

    # ── Effort (hours needed: 0–10) ──────────────────────────────────────
    effort = ctrl.Antecedent(np.arange(0, 11, 1), "effort")
    
    # Load dynamic weights if RL loop has produced them
    base_params = {
        "very_low": [0, 0, 1, 2],
        "low": [1, 3, 5],
        "medium": [4, 6, 8],
        "high": [6, 8, 10, 10]
    }
    
    if os.path.exists(WEIGHTS_FILE):
        try:
            with open(WEIGHTS_FILE, 'r') as f:
                data = json.load(f)
                if "effort_membership_functions" in data:
                    base_params.update(data["effort_membership_functions"])
        except Exception as e:
            print(f"[Neuro-Fuzzy] Failed to load adaptive weights: {e}. Falling back to default.")

    effort["very_low"] = fuzz.trapmf(effort.universe, base_params["very_low"])
    effort["low"]      = fuzz.trimf(effort.universe, base_params["low"])
    effort["medium"]   = fuzz.trimf(effort.universe, base_params["medium"])
    effort["high"]     = fuzz.trapmf(effort.universe, base_params["high"])

    # ── Energy (self-reported: 1–10) ─────────────────────────────────────
    energy = ctrl.Antecedent(np.arange(1, 11, 1), "energy")
    energy["exhausted"] = fuzz.trapmf(energy.universe, [1, 1, 2, 3])
    energy["low"]       = fuzz.trimf(energy.universe, [2, 4, 5])
    energy["normal"]    = fuzz.trimf(energy.universe, [4, 6, 8])
    energy["focused"]   = fuzz.trapmf(energy.universe, [7, 8, 10, 10])

    # ── Importance (1–10) ────────────────────────────────────────────────
    importance = ctrl.Antecedent(np.arange(1, 11, 1), "importance")
    importance["optional"]  = fuzz.trapmf(importance.universe, [1, 1, 2, 3])
    importance["normal"]    = fuzz.trimf(importance.universe, [2, 4, 6])
    importance["important"] = fuzz.trimf(importance.universe, [5, 7, 9])
    importance["critical"]  = fuzz.trapmf(importance.universe, [8, 9, 10, 10])

    # ── Stress (1–10) ───────────────────────────────────────────────────
    stress = ctrl.Antecedent(np.arange(1, 11, 1), "stress")
    stress["calm"]     = fuzz.trapmf(stress.universe, [1, 1, 3, 4])
    stress["moderate"] = fuzz.trimf(stress.universe, [3, 5, 7])
    stress["high"]     = fuzz.trapmf(stress.universe, [6, 8, 10, 10])

    # ── Distraction Debt (minutes wasted: 0–120) ────────────────────────
    distraction_debt = ctrl.Antecedent(np.arange(0, 121, 1), "distraction_debt")
    distraction_debt["minimal"]  = fuzz.trapmf(distraction_debt.universe, [0, 0, 10, 30])
    distraction_debt["moderate"] = fuzz.trimf(distraction_debt.universe, [20, 50, 80])
    distraction_debt["high"]     = fuzz.trapmf(distraction_debt.universe, [60, 90, 120, 120])

    return {
        "deadline": deadline,
        "effort": effort,
        "energy": energy,
        "importance": importance,
        "stress": stress,
        "distraction_debt": distraction_debt,
    }


def _build_consequent() -> ctrl.Consequent:
    """
    Define the output (consequent) fuzzy variable: priority_score.

    Uses centroid defuzzification (the scikit-fuzzy default).
    """
    priority = ctrl.Consequent(np.arange(0, 101, 1), "priority_score")
    priority["ignore"]    = fuzz.trapmf(priority.universe, [0, 0, 5, 15])
    priority["low"]       = fuzz.trimf(priority.universe, [10, 25, 40])
    priority["medium"]    = fuzz.trimf(priority.universe, [30, 50, 70])
    priority["high"]      = fuzz.trimf(priority.universe, [60, 75, 90])
    priority["immediate"] = fuzz.trapmf(priority.universe, [80, 90, 100, 100])
    return priority


# ═══════════════════════════════════════════════════════════════════════════
# Rule Base — 20 rules across 6 behavioural categories
# ═══════════════════════════════════════════════════════════════════════════

def _build_rules(
    a: dict[str, ctrl.Antecedent],
    p: ctrl.Consequent,
) -> list[ctrl.Rule]:
    """
    Construct the complete 20-rule knowledge base.

    Parameters
    ----------
    a : dict of Antecedents keyed by name
    p : the priority_score Consequent

    Returns
    -------
    list[ctrl.Rule]
    """
    rules: list[ctrl.Rule] = []

    # ── Category 1: Crisis & Core Priorities ─────────────────────────────
    # R1: deadline=very_soon ∧ importance=critical → immediate
    rules.append(ctrl.Rule(
        a["deadline"]["very_soon"] & a["importance"]["critical"],
        p["immediate"],
    ))
    # R2: deadline=very_soon ∧ importance=important → high
    rules.append(ctrl.Rule(
        a["deadline"]["very_soon"] & a["importance"]["important"],
        p["high"],
    ))
    # R3: deadline=soon ∧ importance=critical → high
    rules.append(ctrl.Rule(
        a["deadline"]["soon"] & a["importance"]["critical"],
        p["high"],
    ))

    # ── Category 2: Doomscroll Recovery ──────────────────────────────────
    # R4: distraction_debt=high ∧ effort=very_low → immediate
    rules.append(ctrl.Rule(
        a["distraction_debt"]["high"] & a["effort"]["very_low"],
        p["immediate"],
    ))
    # R5: distraction_debt=high ∧ effort=high → low
    rules.append(ctrl.Rule(
        a["distraction_debt"]["high"] & a["effort"]["high"],
        p["low"],
    ))
    # R6: distraction_debt=moderate ∧ energy=low → low
    rules.append(ctrl.Rule(
        a["distraction_debt"]["moderate"] & a["energy"]["low"],
        p["low"],
    ))
    # R7: distraction_debt=minimal ∧ energy=focused → high
    rules.append(ctrl.Rule(
        a["distraction_debt"]["minimal"] & a["energy"]["focused"],
        p["high"],
    ))

    # ── Category 3: Burnout Protection ───────────────────────────────────
    # R8: stress=high ∧ effort=high → low
    rules.append(ctrl.Rule(
        a["stress"]["high"] & a["effort"]["high"],
        p["low"],
    ))
    # R9: energy=exhausted ∧ importance=normal → ignore
    rules.append(ctrl.Rule(
        a["energy"]["exhausted"] & a["importance"]["normal"],
        p["ignore"],
    ))
    # R10: energy=exhausted ∧ deadline=far → ignore
    rules.append(ctrl.Rule(
        a["energy"]["exhausted"] & a["deadline"]["far"],
        p["ignore"],
    ))
    # R11: stress=high ∧ deadline=very_soon → medium
    rules.append(ctrl.Rule(
        a["stress"]["high"] & a["deadline"]["very_soon"],
        p["medium"],
    ))

    # ── Category 4: Deep Work Optimization ───────────────────────────────
    # R12: energy=focused ∧ effort=high ∧ distraction_debt=minimal → high
    rules.append(ctrl.Rule(
        a["energy"]["focused"] & a["effort"]["high"] & a["distraction_debt"]["minimal"],
        p["high"],
    ))
    # R13: energy=focused ∧ importance=important → high
    rules.append(ctrl.Rule(
        a["energy"]["focused"] & a["importance"]["important"],
        p["high"],
    ))
    # R14: energy=normal ∧ effort=medium → medium
    rules.append(ctrl.Rule(
        a["energy"]["normal"] & a["effort"]["medium"],
        p["medium"],
    ))

    # ── Category 5: Quick Wins & Maintenance ─────────────────────────────
    # R15: effort=very_low ∧ energy=low → medium
    rules.append(ctrl.Rule(
        a["effort"]["very_low"] & a["energy"]["low"],
        p["medium"],
    ))
    # R16: importance=optional ∧ deadline=very_far → ignore
    rules.append(ctrl.Rule(
        a["importance"]["optional"] & a["deadline"]["very_far"],
        p["ignore"],
    ))
    # R17: importance=optional ∧ effort=very_low → low
    rules.append(ctrl.Rule(
        a["importance"]["optional"] & a["effort"]["very_low"],
        p["low"],
    ))
    # R18: effort=low ∧ deadline=soon → medium
    rules.append(ctrl.Rule(
        a["effort"]["low"] & a["deadline"]["soon"],
        p["medium"],
    ))

    # ── Category 6: Procrastination Trap ─────────────────────────────────
    # R19: deadline=soon ∧ distraction_debt=high ∧ importance=important → high
    rules.append(ctrl.Rule(
        a["deadline"]["soon"] & a["distraction_debt"]["high"] & a["importance"]["important"],
        p["high"],
    ))
    # R20: deadline=far ∧ distraction_debt=high → low
    rules.append(ctrl.Rule(
        a["deadline"]["far"] & a["distraction_debt"]["high"],
        p["low"],
    ))

    return rules


# ═══════════════════════════════════════════════════════════════════════════
# TaskPrioritizer — Public API
# ═══════════════════════════════════════════════════════════════════════════

class TaskPrioritizer:
    """
    Fuzzy-logic task prioritization engine.

    Builds the complete control system (variables, membership functions,
    rule base) once at construction time. Each call to `calculate_priority`
    creates a fresh simulation to avoid state leakage between evaluations.

    Attributes
    ----------
    _ctrl : ctrl.ControlSystem
        The compiled fuzzy control system (immutable after __init__).

    Example
    -------
    >>> p = TaskPrioritizer()
    >>> score = p.calculate_priority(
    ...     deadline_val=2, effort_val=1, energy_val=8,
    ...     importance_val=9, stress_val=3, distraction_val=5
    ... )
    >>> 0.0 <= score <= 100.0
    True
    """

    def __init__(self) -> None:
        self._antecedents = _build_antecedents()
        self._consequent = _build_consequent()
        rules = _build_rules(self._antecedents, self._consequent)
        self._ctrl = ctrl.ControlSystem(rules)

    # ── Input clamping helpers ───────────────────────────────────────────

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        """Clamp *value* into [lo, hi] to prevent out-of-universe errors."""
        return float(max(lo, min(hi, value)))

    # ── Main inference method ────────────────────────────────────────────

    def calculate_priority(
        self,
        deadline_val: float,
        effort_val: float,
        energy_val: float,
        importance_val: float,
        stress_val: float,
        distraction_val: float,
    ) -> float:
        """
        Run the fuzzy inference system and return a crisp priority score.

        Parameters
        ----------
        deadline_val : float
            Days remaining until the task's deadline (0–30).
        effort_val : float
            Estimated hours of work required (0–10).
        energy_val : float
            User's self-reported energy level (1–10).
        importance_val : float
            Task importance rating (1–10).
        stress_val : float
            User's self-reported stress level (1–10).
        distraction_val : float
            Minutes of distraction debt accumulated recently (0–120).

        Returns
        -------
        float
            A priority score in the range [0, 100], where higher values
            indicate more urgent tasks. Computed via centroid
            defuzzification of the aggregated fuzzy output.

        Raises
        ------
        ValueError
            If the fuzzy system cannot produce a result (e.g., no rules
            fire for the given inputs). This is unlikely with 20 rules
            but is guarded against for robustness.
        """
        # Clamp inputs to their respective universes
        deadline_val    = self._clamp(deadline_val, 0, 30)
        effort_val      = self._clamp(effort_val, 0, 10)
        energy_val      = self._clamp(energy_val, 1, 10)
        importance_val  = self._clamp(importance_val, 1, 10)
        stress_val      = self._clamp(stress_val, 1, 10)
        distraction_val = self._clamp(distraction_val, 0, 120)

        # Create a fresh simulation (stateless — safe for concurrent use)
        sim = ctrl.ControlSystemSimulation(self._ctrl)

        # Feed inputs
        sim.input["deadline"]         = deadline_val
        sim.input["effort"]           = effort_val
        sim.input["energy"]           = energy_val
        sim.input["importance"]       = importance_val
        sim.input["stress"]           = stress_val
        sim.input["distraction_debt"] = distraction_val

        # Execute inference + centroid defuzzification
        try:
            sim.compute()
        except Exception as exc:
            raise ValueError(
                f"Fuzzy inference failed for inputs: "
                f"deadline={deadline_val}, effort={effort_val}, "
                f"energy={energy_val}, importance={importance_val}, "
                f"stress={stress_val}, distraction={distraction_val}. "
                f"Original error: {exc}"
            ) from exc

        score: float = sim.output["priority_score"]
        return round(float(score), 2)
