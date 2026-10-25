"""Generate the synthetic demonstration dataset for SmartPetition.

PROVENANCE / LIMITATIONS (important, honest disclosure):
- Every row here is SYNTHETIC, produced from hand-written templates with
  combinatorial variation. It is NOT real citizen data and contains no PII.
- A model trained only on this data will perform well on text that resembles
  these templates and MUST NOT be assumed to have real-world accuracy.
- The dataset exists so the full ML pipeline (train -> save -> infer ->
  evaluate) is genuinely runnable and testable out of the box. Replace it with
  labeled real grievances (with proper consent/anonymization) for production.

Usage:  python -m app.ai.data.generate_dataset
Output: app/ai/data/synthetic_grievances.csv  (columns: text,category)
"""
import csv
import random
from pathlib import Path

random.seed(42)  # reproducible generation

OUT = Path(__file__).resolve().parent / "synthetic_grievances.csv"

PLACES = ["Anna Nagar", "T Nagar", "Velachery", "Adyar", "Guindy", "Tambaram", "Porur",
          "OMR IT corridor", "Mylapore", "Perambur", "Ambattur", "Sholinganallur",
          "Ward 12", "Ward 45", "the 3rd cross street", "near the bus stand",
          "behind the government hospital", "opposite the park"]

DURATIONS = ["since last week", "for three days", "since two months", "for the past week",
             "since yesterday", "for over a month", "since last Monday", "for days"]

TEMPLATES: dict[str, list[str]] = {
    "roads": [
        "Huge potholes on the main road at {place} {duration}. Two-wheelers are skidding and it is very dangerous for commuters. Please repair the road urgently.",
        "The street lights on the road near {place} are not working {duration}. The stretch is pitch dark at night and pedestrians feel unsafe.",
        "Footpath at {place} is completely broken and encroached. Pedestrians are forced to walk on the busy road. Requesting restoration of the footpath.",
        "Road at {place} was dug up for pipeline work {duration} but never restored. Vehicles are getting damaged and there is dust everywhere.",
        "The traffic signal near {place} is malfunctioning {duration}, causing long jams during peak hours. Please fix the signal.",
        "A speed breaker at {place} has collapsed and broken pieces are scattered on the road. It is a hazard for night riders.",
        "Rainwater has washed away the tar on the internal road at {place}. The entire surface is gravel now and school children struggle to walk.",
    ],
    "water supply": [
        "No water supply in our street at {place} {duration}. Overhead tank is dry and families are buying private tanker water at high cost.",
        "Sewage water is mixing with the drinking water pipeline at {place}. The tap water smells foul and people are falling sick. This is urgent.",
        "Massive water leakage from the main pipeline near {place} {duration}. Thousands of litres are being wasted every day. Please repair immediately.",
        "Water supply at {place} comes only for 20 minutes and is muddy. Residents of the entire colony are affected.",
        "The public borewell hand pump at {place} is broken {duration}. Elderly residents have no source of water.",
        "Contaminated water is being supplied to the apartments at {place}. Several children have reported stomach infection. Requesting immediate water testing.",
        "There is low water pressure throughout {place} {duration}. Houses on upper floors receive no water at all.",
    ],
    "electricity": [
        "A transformer near {place} is sparking and making loud noises {duration}. It could explode any time and there are houses right next to it. Emergency attention needed.",
        "Power cut in the whole of {place} {duration} with no announcement. Students cannot study and food is spoiling.",
        "Live electrical wire is hanging low over the street at {place} after the storm. A child could touch it. This is extremely dangerous, please act today.",
        "Street light pole at {place} is leaning dangerously and the wiring is exposed. Requesting urgent repair before someone is electrocuted.",
        "Frequent voltage fluctuation at {place} has damaged my refrigerator and other appliances {duration}. Please stabilise the supply.",
        "Electricity meter at my home in {place} is showing wrong readings and I have been overbilled for two months. Requesting meter inspection.",
        "No street lighting on the entire stretch of {place} {duration}. Women returning from work feel unsafe after dark.",
    ],
    "sanitation": [
        "Garbage has not been collected at {place} {duration}. Heaps are rotting on the roadside, stray dogs are scattering them and the stench is unbearable.",
        "The storm water drain at {place} is completely choked with plastic waste. Even light rain floods the street with dirty water.",
        "Open manhole near the school at {place} {duration}. Children could fall in. Please cover it immediately, this is a safety emergency.",
        "Public toilet at {place} is filthy, has no water and the door is broken. It is unusable and unhygienic.",
        "Mosquito breeding from stagnant water near the dump at {place}. Several dengue cases have been reported in the neighbourhood. Requesting fumigation.",
        "Someone is dumping construction debris on the vacant plot at {place} every night {duration}. It has become a garbage mountain.",
        "Sweepers have not visited our street at {place} for two weeks. Dust and litter are everywhere.",
    ],
    "transport": [
        "Bus route 21G has not been running via {place} {duration}. Daily commuters including office goers are stranded.",
        "The bus stop at {place} has no shelter. Passengers stand in sun and rain. Requesting a proper bus shelter with seating.",
        "Auto drivers at {place} refuse to go by meter and charge triple the fare. Requesting enforcement action.",
        "Metro station entrance at {place} has broken escalators {duration}. Elderly and disabled passengers are suffering.",
        "Overcrowded buses on the {place} route during peak hours. Students travelling to schools and colleges are squeezed dangerously.",
        "Illegal parking of trucks near {place} blocks the entire carriageway every evening causing huge traffic jams.",
        "The last bus from {place} leaves too early; shift workers at the IT corridor have no public transport after 10 pm.",
    ],
    "education": [
        "The government school at {place} has no drinking water facility for students {duration}. Children of around 400 families study here.",
        "Mid day meal served at the school in {place} was of very poor quality and several students complained of stomach pain. Requesting inspection.",
        "Teacher vacancy at the school at {place}: class 8 has had no mathematics teacher for the entire semester. Board exam students are losing the year.",
        "The roof of a classroom at the school in {place} is leaking badly during rain. Students are moved to a corridor to study. Urgent repair needed.",
        "Scholarship amounts for students from {place} have not been disbursed {duration} despite complete documentation.",
        "The school playground at {place} has been encroached upon for parking. Children have no space for physical activity.",
        "No toilets for girl students at the school near {place}. Attendance of girl children is dropping. Requesting construction of toilets.",
    ],
    "healthcare": [
        "The government hospital at {place} has no doctor available in the casualty ward at night {duration}. Patients are being turned away.",
        "Medicines prescribed at the primary health centre in {place} are never in stock. Poor patients are forced to buy from private pharmacies.",
        "An ambulance did not arrive for over an hour for a heart attack patient at {place}. The delay could cost a life. Requesting better ambulance coverage.",
        "Staff nurses at the clinic in {place} are reported absent frequently. Long queues of patients including pregnant women wait all day.",
        "Vaccination camp was announced for {place} but no team arrived. Many infants have missed their scheduled doses.",
        "The hospital ward at {place} is unhygienic; bedsheets are not changed and there are insects. Patients risk infection.",
        "Lab testing facility at the health centre in {place} is not working {duration}. Samples are sent far away and reports take weeks.",
    ],
    "other": [
        "Stray dogs near {place} have become aggressive {duration} and have bitten two residents. Requesting the animal control team to intervene safely.",
        "A fallen tree at {place} has been lying across the road {duration}. Nobody has removed it despite repeated phone calls.",
        "Noise pollution from a marriage hall at {place} continues past midnight {duration}. Residents including patients and students cannot sleep.",
        "The name board of our street at {place} is missing and deliveries and emergency services cannot locate addresses.",
        "Encroachment on the public park at {place} by vendors has taken over the walking track. Requesting the civic body to restore the park.",
        "Birth certificate application submitted {duration} at {place} office is still pending with no status update.",
        "Illegal banner hoardings at {place} are blocking visibility and could fall during wind. Requesting removal.",
        "Property tax receipt for my house at {place} shows an incorrect assessment. Requesting correction of records.",
    ],
}


def generate() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for category, templates in TEMPLATES.items():
        for template in templates:
            for _ in range(18):  # ~18 variants per template -> ~1150 rows total
                text = template.format(place=random.choice(PLACES), duration=random.choice(DURATIONS))
                rows.append((text, category))
    random.shuffle(rows)
    return rows


def main() -> None:
    rows = generate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["text", "category"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} synthetic rows to {OUT}")


if __name__ == "__main__":
    main()
