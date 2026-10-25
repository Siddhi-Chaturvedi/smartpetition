"""Database seeding: first-administrator setup + safe development demo data.

FIRST ADMINISTRATOR (documented procedure):
  * Set FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD in your .env BEFORE first
    start to choose them yourself; OR
  * Leave them unset: a random strong password is generated, printed once to
    the console, and written to backend/FIRST_ADMIN.txt (gitignored).
  * There is NEVER a shipped, public default admin password.

DEMO ACCOUNTS (development only, environment=development and SEED_DEMO_DATA=true):
  * citizen@demo.smartpetition.dev  / Citizen#123
  * officer@demo.smartpetition.dev  / Officer#123  (Roads & Infrastructure dept)
  * water.officer@demo.smartpetition.dev / Officer#123 (Water Supply dept)
  These are documented in README.md and disabled in staging/production.

Usage:  python -m app.seed
"""
import os
import random
import secrets
from datetime import timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal, init_db
from .models import (
    Category, Department, Grievance, GrievanceStatus, SLARule, User,
    Role, utcnow,
)
from .security import hash_password, verify_password

random.seed(7)

DEPARTMENTS = [
    ("Roads & Infrastructure", "Roads, footpaths, street lights, traffic signals, bridges",
     "Chennai North,Chennai South,Chennai Central"),
    ("Water Supply & Sewerage", "Drinking water supply, leaks, sewage, contamination",
     "Chennai North,Chennai South,Chennai Central"),
    ("Electricity & Power", "Power cuts, transformers, electrical safety, street lighting power",
     "Chennai North,Chennai South,Chennai Central"),
    ("Sanitation & Public Health", "Garbage collection, drains, public toilets, mosquito control",
     "Chennai North,Chennai South,Chennai Central"),
    ("Transport", "Buses, metro, autos, parking, bus shelters",
     "Chennai North,Chennai South,Chennai Central"),
    ("Education", "Government schools, mid-day meals, scholarships, school infrastructure",
     "Chennai North,Chennai South,Chennai Central"),
    ("Healthcare", "Government hospitals, primary health centres, ambulances, vaccination",
     "Chennai North,Chennai South,Chennai Central"),
    ("General Administration", "Certificates, property tax, encroachments, miscellaneous civic issues",
     "Chennai North,Chennai South,Chennai Central"),
]

CATEGORIES = [
    ("roads", "Roads & Infrastructure", 72),
    ("water supply", "Water Supply & Sewerage", 48),
    ("electricity", "Electricity & Power", 24),
    ("sanitation", "Sanitation & Public Health", 48),
    ("transport", "Transport", 96),
    ("education", "Education", 120),
    ("healthcare", "Healthcare", 48),
    ("other", "General Administration", 120),
]

DEMO_GRIEVANCES = [
    ("Potholes near Anna Nagar 2nd Avenue causing accidents",
     "There are huge potholes on the main road near Anna Nagar 2nd Avenue since last week. Two-wheelers are skidding, especially during rain. Several minor accidents have happened. Please repair the road urgently before someone is seriously injured.",
     "Anna Nagar", "Chennai North"),
    ("No water supply in Velachery for three days",
     "Our entire street in Velachery has had no water supply for three days. The overhead tank is dry and residents are buying tanker water at very high cost. Families with children and elderly people are suffering the most. Requesting immediate restoration of water supply.",
     "Velachery", "Chennai South"),
    ("Transformer sparking near Guindy market — fire risk",
     "The electrical transformer near Guindy market is sparking and making loud crackling noises since yesterday evening. Shops and houses are right next to it and there is heavy pedestrian traffic. This could cause a fire or electrocution at any moment. Emergency repair needed today.",
     "Guindy", "Chennai South"),
    ("Garbage not collected in Perambur for two weeks",
     "Garbage has not been collected in our Perambur street for two weeks. Heaps are rotting on the roadside, stray dogs scatter them at night, and the stench is unbearable. Mosquito breeding has increased and neighbours are reporting fever cases. Please restore daily collection.",
     "Perambur", "Chennai North"),
    ("Street lights not working on OMR service road",
     "Around twelve street lights on the OMR service road near Sholinganallur have not been working for the past week. IT employees returning late at night walk in complete darkness and feel unsafe. Two-wheeler riders cannot see the median gaps. Please restore lighting quickly.",
     "Sholinganallur", "Chennai South"),
    ("Sewage mixing with drinking water in Tambaram",
     "Sewage water appears to be mixing with the drinking water pipeline in our Tambaram colony. Tap water smells foul and is slightly yellow since Monday. Several residents have reported stomach infections, including children. This is a public health emergency, please test and fix the line.",
     "Tambaram", "Chennai South"),
    ("Government school without mathematics teacher in Ambattur",
     "The government school in Ambattur has had no mathematics teacher for class 8 for the entire semester. Board examination students are losing precious months. Parents have petitioned twice with no response. Requesting urgent teacher posting.",
     "Ambattur", "Chennai North"),
    ("Bus route 21G discontinued via Porur",
     "Bus route 21G has not been running via Porur since two months. Daily office commuters and college students are stranded and forced to use expensive autos. The bus stand boards still show the old timings which misleads passengers. Requesting restoration of the route.",
     "Porur", "Chennai West"),
    ("Open manhole near Mylapore school endangering children",
     "A manhole right outside the school gate in Mylapore has been left open for days after pipe work. Small children could fall in while walking to school. Parents are extremely worried. Please cover it immediately, this is a safety emergency.",
     "Mylapore", "Chennai Central"),
    ("No doctor at night casualty ward, Adyar hospital",
     "The government hospital in Adyar has no doctor available in the casualty ward at night since last week. Last Tuesday an accident victim was turned away and had to travel to another hospital. Poor patients cannot afford private care. Requesting restoration of 24x7 casualty staffing.",
     "Adyar", "Chennai South"),
    ("Illegal truck parking blocks road in T Nagar every evening",
     "Illegal parking of goods trucks near the T Nagar market blocks the entire carriageway every evening, causing huge traffic jams and blocking emergency vehicles. Repeated verbal complaints to the local office have not helped. Requesting enforcement and towing action.",
     "T Nagar", "Chennai Central"),
    ("Mosquito breeding and dengue cases near dump yard in Perungudi",
     "Stagnant water near the dump yard in Perungudi is breeding mosquitoes heavily. Five dengue cases have been reported in our street in the past fortnight, including two children. Requesting urgent fumigation, larvicide treatment and removal of stagnant water.",
     "Perungudi", "Chennai South"),
]


def seed(db: Session) -> dict:
    report: dict = {"departments": 0, "categories": 0, "sla_rules": 0,
                    "admin": None, "demo_users": 0, "demo_grievances": 0}

    # --- departments & categories ------------------------------------------
    dept_by_name: dict[str, Department] = {}
    for name, desc, jurs in DEPARTMENTS:
        d = db.query(Department).filter(Department.name == name).first()
        if d is None:
            d = Department(name=name, description=desc, jurisdictions=jurs)
            db.add(d)
            report["departments"] += 1
        dept_by_name[name] = d
    db.flush()

    for cat_name, dept_name, sla_hours in CATEGORIES:
        c = db.query(Category).filter(Category.name == cat_name).first()
        if c is None:
            c = Category(name=cat_name, department_id=dept_by_name[dept_name].id,
                         sla_resolution_hours=sla_hours)
            db.add(c)
            report["categories"] += 1
        else:
            c.department_id = dept_by_name[dept_name].id
    db.flush()

    # --- SLA rules -----------------------------------------------------------
    if db.query(SLARule).count() == 0:
        db.add_all([
            SLARule(scope="global", scope_value="", resolution_hours=72, escalation_hours=24),
            SLARule(scope="priority", scope_value="critical", resolution_hours=24, escalation_hours=12),
            SLARule(scope="priority", scope_value="high", resolution_hours=48, escalation_hours=24),
        ])
        report["sla_rules"] = 3

    # --- first administrator ---------------------------------------------------
    admin = db.query(User).filter(User.role == Role.admin).first()
    if admin is None:
        email = os.getenv("FIRST_ADMIN_EMAIL", "").strip().lower() or "admin@smartpetition.dev"
        password = os.getenv("FIRST_ADMIN_PASSWORD", "").strip()
        generated = False
        if not password:
            password = secrets.token_urlsafe(12) + "Aa1"
            generated = True
        admin = User(email=email, full_name="System Administrator",
                     hashed_password=hash_password(password), role=Role.admin,
                     email_verified=True)
        db.add(admin)
        report["admin"] = email
        msg = (f"\n=== FIRST ADMINISTRATOR CREATED ===\n"
               f"  Email:    {email}\n"
               f"  Password: {password}\n"
               f"{'  (generated randomly — change it after first login)' if generated else ''}"
               f"\n=================================\n")
        print(msg)
        if generated and settings.environment == "development":
            Path(__file__).resolve().parent.parent.joinpath("FIRST_ADMIN.txt").write_text(
                f"SmartPetition first administrator (LOCAL DEVELOPMENT ONLY)\nEmail: {email}\nPassword: {password}\n"
                "This file is gitignored. Delete it after first login.\n")

    # --- demo accounts (development only) -----------------------------------------
    # --- demo accounts (development only) -----------------------------------------
    # Idempotent + self-repairing: existing demo accounts are never duplicated;
    # if a demo account's role or password hash drifts (e.g. spec change), it is
    # repaired. Real users (any other email) are never touched.
    demo_specs = [
        ("citizen@demo.smartpetition.dev", "Demo Citizen", "Citizen#123", Role.citizen, None),
        ("officer@demo.smartpetition.dev", "Demo Roads Officer", "Officer#123", Role.officer, "Roads & Infrastructure"),
        ("water.officer@demo.smartpetition.dev", "Demo Water Officer", "Officer#123", Role.officer, "Water Supply & Sewerage"),
        ("citizen@smartpetition.local", "Demo Citizen (local)", "CitizenDemo@123", Role.citizen, None),
        ("officer@smartpetition.local", "Demo Roads Officer (local)", "OfficerDemo@123", Role.officer, "Roads & Infrastructure"),
        ("admin@smartpetition.local", "Demo Administrator (local)", "AdminDemo@123", Role.admin, None),
    ]
    citizen = None
    if settings.environment in ("development", "testing") and settings.seed_demo_data:
        for email, name, pw, role, dept_name in demo_specs:
            dept_id = dept_by_name[dept_name].id if dept_name else None
            u = db.query(User).filter(User.email == email).first()
            if u is None:
                u = User(email=email, full_name=name, hashed_password=hash_password(pw),
                         role=role, email_verified=True, department_id=dept_id)
                db.add(u)
                report["demo_users"] += 1
            else:
                repaired = False
                if u.role != role:
                    u.role = role
                    repaired = True
                if not verify_password(pw, u.hashed_password):
                    u.hashed_password = hash_password(pw)
                    repaired = True
                if u.department_id != dept_id:
                    u.department_id = dept_id
                    repaired = True
                if repaired:
                    report["demo_users_repaired"] = report.get("demo_users_repaired", 0) + 1
            if email == "citizen@demo.smartpetition.dev":
                citizen = u
        db.flush()

        # --- demo grievances (clearly flagged is_demo_data=True) -------------------
        from .services.workflow import create_grievance
        from .schemas import GrievanceCreate
        existing_titles = {g.title for g in db.query(Grievance).all()}
        now = utcnow()
        for i, (title, desc, loc, jur) in enumerate(DEMO_GRIEVANCES):
            if title in existing_titles:
                continue
            payload = GrievanceCreate(title=title, description=desc, location=loc, jurisdiction=jur)
            g = create_grievance(db, citizen, payload)
            g.is_demo_data = True
            # spread submissions over the past ~10 weeks for realistic analytics
            back = timedelta(days=random.randint(0, 70), hours=random.randint(0, 23))
            g.submitted_at = now - back
            if g.assigned_at:
                g.assigned_at = g.submitted_at + timedelta(hours=random.randint(1, 8))
            if g.due_at:
                g.due_at = g.submitted_at + timedelta(hours=random.choice([24, 48, 72]))
            # vary the lifecycle
            stage = i % 5
            if stage == 1:  # resolved within SLA
                g.status = GrievanceStatus.resolved
                g.resolved_at = g.submitted_at + timedelta(hours=random.randint(6, 40))
                g.resolution_summary = "Issue inspected and rectified on site. Verified with the complainant."
            elif stage == 2:  # resolved late (SLA breach)
                g.status = GrievanceStatus.resolved
                g.resolved_at = g.submitted_at + timedelta(hours=random.randint(80, 200))
                g.resolution_summary = "Work completed after extended timeline due to material procurement."
            elif stage == 3:  # in progress
                g.status = GrievanceStatus.in_progress
            elif stage == 4 and g.due_at and g.due_at < now:
                g.status = GrievanceStatus.escalated  # overdue & escalated
            db.commit()
            report["demo_grievances"] += 1

    db.commit()
    return report


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        report = seed(db)
        print(f"Seed complete: {report}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
