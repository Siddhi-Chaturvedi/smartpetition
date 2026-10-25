"""Transparent, rule-based urgency scoring engine.

Every factor that fires is recorded so the recommendation can be explained
to officers and citizens. Configurable via RULES below (policy knobs).
Patterns tolerate plurals and inflections (e.g. 'potholes', 'accidents').
"""
import re

from ..models import Priority

# pattern -> (weight, human-readable factor)
SAFETY_RULES: list[tuple[str, float, str]] = [
    (r"(electrocut\w*|live (?:electrical |electric )?wire\w*|exposed wire\w*|sparking|short[- ]?circuit\w*)",
     0.35, "Electrical safety hazard mentioned"),
    (r"(collaps\w*|caving|caved|landslide\w*|falling)",
     0.3, "Structural collapse risk mentioned"),
    (r"(fire|burning|smoke|explos\w*|gas leak\w*|leaking gas)",
     0.35, "Fire/explosion hazard mentioned"),
    (r"(accident\w*|injur\w*|dead|death|fatal\w*|casualt\w*|bleeding|unconscious)",
     0.35, "Injury or loss of life mentioned"),
    (r"(open manhole\w*|uncovered manhole\w*|manhole\w*|open drain\w*|open pit\w*)",
     0.25, "Open manhole/pit hazard mentioned"),
    (r"(contaminat\w*|sewage (?:in|into) (?:water|drinking)|pollut\w*.{0,20}drinking|dirty water.{0,20}sick)",
     0.25, "Drinking-water contamination risk"),
    (r"(snake\w*|stray dogs?|rabies|dengue|malaria|mosquito\w*)",
     0.2, "Public health / animal hazard mentioned"),
    (r"(pothole\w*|crater\w*|road\w*.{0,40}(?:broken|damaged)|skidding)",
     0.15, "Road surface hazard mentioned"),
    (r"(tree\w*.{0,20}(?:fall|uproot|block)|branch\w*.{0,10}fall|fallen tree)",
     0.2, "Fallen tree / falling branches hazard"),
    (r"(flood\w*|waterlog\w*|submerg\w*|inundat\w*)",
     0.25, "Flooding reported"),
]

IMPACT_RULES: list[tuple[str, float, str]] = [
    (r"(entire|whole|all residents|many (?:houses|families|people)|hundreds|thousands|neighbo[u]?rhood|colony|street|apartment complex)",
     0.2, "Large number of people affected"),
    (r"(hospital\w*|school\w*|clinic\w*|old age|child\w*|kid\w*|infant\w*|student\w*|patient\w*|elderly)",
     0.15, "Vulnerable population or essential service affected"),
    (r"(no water|without water|water supply (?:stopped|cut)|dry taps?)",
     0.15, "Essential water supply disrupted"),
    (r"(power (?:cut|out|failure)|no electricity|blackout|outage)",
     0.15, "Electricity supply disrupted"),
    (r"(road (?:blocked|closed)|traffic (?:jam\w*|blocked)|cannot pass|impassable)",
     0.15, "Movement/transport blocked"),
]

TIME_SENSITIVITY_RULES: list[tuple[str, float, str]] = [
    (r"(urgent\w*|immediate\w*|emergency|right away|asap|any ?time|tonight|today)",
     0.15, "Citizen reports time-critical situation"),
    (r"(since|for the (?:last|past))\s+(\d+)\s*(month|year)s?",
     0.0, "_chronic_marker"),  # handled separately below
    (r"(exam\w*|election\w*|festival\w*|monsoon|rainy season)",
     0.1, "Time-bound event context mentioned"),
]

# Policy weights by category (safety-critical services get a small bump)
CATEGORY_POLICY = {"electricity": 0.05, "healthcare": 0.05, "water supply": 0.03}


def _chronic_adjustment(text: str) -> tuple[float, str | None]:
    """Long-standing issues get slightly lower *urgency* (still important,
    but not immediate-hazard), per common civic triage policy."""
    m = re.search(r"(?:since|for the (?:last|past))\s+(\d+)\s*(month|year)s?", text)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        months = n * 12 if unit.startswith("year") else n
        if months >= 6:
            return -0.05, f"Issue is long-standing (~{months} months); urgency adjusted per policy"
    return 0.0, None


def score_urgency(text: str, category: str | None = None) -> tuple[float, Priority, list[str]]:
    """Return (score 0..1, priority, explanation factors)."""
    t = (text or "").lower()
    score = 0.1  # baseline: every registered grievance deserves attention
    factors: list[str] = []

    for rules in (SAFETY_RULES, IMPACT_RULES, TIME_SENSITIVITY_RULES):
        for pattern, weight, label in rules:
            if label.startswith("_"):
                continue
            if re.search(pattern, t):
                score += weight
                factors.append(label)

    chronic, chronic_label = _chronic_adjustment(t)
    score += chronic
    if chronic_label:
        factors.append(chronic_label)

    if category and category.lower() in CATEGORY_POLICY:
        score += CATEGORY_POLICY[category.lower()]
        factors.append(f"Category '{category}' carries elevated policy weight")

    score = max(0.0, min(1.0, score))

    if score >= 0.70:
        priority = Priority.critical
    elif score >= 0.45:
        priority = Priority.high
    elif score >= 0.25:
        priority = Priority.medium
    else:
        priority = Priority.low

    if not factors:
        factors.append("No hazard or high-impact keywords detected; baseline priority applied")
    return round(score, 3), priority, factors
