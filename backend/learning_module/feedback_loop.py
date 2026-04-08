"""
learning_module/feedback_loop.py — Reinforcement Learning Module

This module closes the loop in the Adaptive Neuro-Fuzzy Productivity Suite.
It analyzes historical execution logs (actual vs. predicted effort) to 
detect cognitive biases (e.g., chronic underestimation or overestimation)
and dynamically shifts the membership functions of the fuzzy inference engine so
that the system adapts to the user's actual capabilities over time.
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.models import ExecutionLog
from backend.database.session import SessionLocal

WEIGHTS_FILE = os.path.join(os.path.dirname(__file__), "user_weights.json")

class NeuroFuzzyAdapter:
    """
    A learning agent that tunes the parameters of the Fuzzy Inference System.

    Math / Theory:
    --------------
    For each completed task, we calculate the Variance Ratio:
        Ratio = Actual_Time / Predicted_Time

    If Ratio > 1, the user under-estimated (took longer).
    If Ratio < 1, the user over-estimated (finished faster).

    We calculate the Exponential Moving Average (or simple mean) of these ratios
    over the last 7 days. This average ratio is our "Bias Factor".

    Weight Adjustment (Neuro-Fuzzy Shift):
    -------------------------------------
    The fuzzy membership function for `effort` maps human estimates (1-4, mapped to hours)
    to fuzzy sets. If a user says "1 hour" but it always takes them "2 hours" (Bias = 2.0),
    we dynamically shift the boundaries of the `effort` antecedents by multiplying
    the mathematical parameters of the trimf/trapmf by the Bias Factor.

    Example: 
    Original "low" effort: [1, 3, 5]
    Bias Factor: 1.5 (takes 50% longer than expected)
    Adjusted "low" effort: [1*1.5, 3*1.5, 5*1.5] = [1.5, 4.5, 7.5]

    This ensures that when the user inputs "low" effort next time, the fuzzy system
    evaluates it at a higher true temporal cost, naturally shifting its prioritization matrix
    (e.g., perhaps preventing it from qualifying as a "Quick Win" or triggering Burnout Protection).
    """

    def __init__(self, db_session: Session = None):
        """Allows passing a session, or generates its own."""
        self.db = db_session

    def extract_recent_logs(self, days: int = 7) -> list:
        """
        Query Execution_Logs for tasks completed in the last `days` days.
        """
        db = self.db or SessionLocal()
        time_threshold = datetime.utcnow() - timedelta(days=days)
        
        try:
            stmt = select(ExecutionLog).where(ExecutionLog.completed_at >= time_threshold)
            logs = db.scalars(stmt).all()
            return list(logs)
        finally:
            if not self.db:
                db.close()

    def identify_bias(self, logs: list) -> float:
        """
        Calculate the average Variance Ratio (Actual / Predicted).
        Returns a float where 1.0 is perfect accuracy.
        """
        if not logs:
            return 1.0  # Default to no bias

        total_variance = 0.0
        valid_logs = 0
        
        for log in logs:
            if log.predicted_effort_minutes <= 0:
                continue # Prevent division by zero
                
            variance = log.actual_time_spent_minutes / log.predicted_effort_minutes
            total_variance += variance
            valid_logs += 1

        if valid_logs == 0:
            return 1.0

        mean_bias = total_variance / valid_logs
        
        # Clamp bias to reasonable limits to prevent extreme shifts
        mean_bias = max(0.5, min(3.0, mean_bias)) 
        return mean_bias

    def adjust_weights(self, bias_factor: float) -> Dict[str, list]:
        """
        Shift the core scikit-fuzzy effort membership functions based on bias.
        
        We limit the maximum adjusted value to 10 (the universe max) to prevent
        out-of-bounds array evaluations in scikit-fuzzy.
        """
        # Original Base Parameters (hours)
        base_params = {
            "very_low": [0, 0, 1, 2],
            "low": [1, 3, 5],
            "medium": [4, 6, 8],
            "high": [6, 8, 10, 10]
        }
        
        adjusted_params = {}
        for key, points in base_params.items():
            # Multiply by bias, but clamp to max 10.0
            adjusted = [min(10.0, float(p * bias_factor)) for p in points]
            
            # Ensure monotonicity (prevent overlapping bounds due to clamping)
            for i in range(1, len(adjusted)):
                if adjusted[i] < adjusted[i-1]:
                    adjusted[i] = adjusted[i-1]
                    
            adjusted_params[key] = adjusted
            
        print(f"[Neuro-Fuzzy] Bias Factor {bias_factor:.2f}. Adjusted '{key}': {points} -> {adjusted_params[key]}")
        return adjusted_params

    def persist_weights(self, weights: Dict[str, list]):
        """Save the new mathematical definitions to disk."""
        with open(WEIGHTS_FILE, 'w') as f:
            json.dump({
                "last_updated": datetime.utcnow().isoformat(),
                "effort_membership_functions": weights
            }, f, indent=4)
        print(f"[Neuro-Fuzzy] Adaptation complete. Weights saved to {WEIGHTS_FILE}")

    def run_learning_loop(self):
        """
        Execute the full Reinforcement Learning routine.
        """
        print("[Neuro-Fuzzy] Starting nightly learning loop...")
        logs = self.extract_recent_logs(days=7)
        print(f"[Neuro-Fuzzy] Extracted {len(logs)} completed tasks in the last 7 days.")
        
        bias = self.identify_bias(logs)
        if bias > 1.1:
            print(f"[Neuro-Fuzzy] User is chronic Under-estimator (Bias: {bias:.2f}x). Shifting matrices right.")
        elif bias < 0.9:
            print(f"[Neuro-Fuzzy] User is an Over-estimator (Bias: {bias:.2f}x). Shifting matrices left.")
        else:
            print(f"[Neuro-Fuzzy] User estimates are highly accurate (Bias: {bias:.2f}x). Minor calibrations.")
            
        new_weights = self.adjust_weights(bias)
        self.persist_weights(new_weights)
