"""The designatum taxonomy: what a street name actually refers to.

Three orthogonal axes, because street names do not sort onto one:

  category / subcategory   what kind of thing the name designates
  gender                   only meaningful where the referent has one
  realness                 whether the referent existed

Keeping gender orthogonal is what lets the platform answer both "how many
streets are named after women" and "how many are named after fruit" from a
single pass, and it is what makes the thesis' own four-way scheme (mujer real /
mujer ficticia / gremio / desconocida) expressible as a view over these axes
rather than as a competing classification.

Labels are carried in both languages here so the UI never has to hold a
translation table of its own.
"""
from __future__ import annotations

PALETTE_NOTE = """Categorical colours are chosen, not improvised.

The eleven carrying categories are OKLCH steps inside the dark-mode lightness
band (L 0.48-0.67) with chroma at or above 0.10, ordered so that every adjacent
pair clears the colour-vision-deficiency gate. Verified with the data-viz
validator against the app's own dark surface #0f1218:

    lightness band   PASS   all 11 inside L 0.48-0.67
    chroma floor     PASS   all 11 >= 0.10
    CVD separation   PASS   worst adjacent nature<->landscape dE 10.6 (deutan)
    normal vision    PASS   worst adjacent fictional<->religion dE 20.4
    contrast         PASS   all 11 >= 3:1 on the surface

`unknown` is deliberately outside that set: it is a reserved neutral, in the
same way a status colour is reserved, so an unclassified vía can never be
mistaken for a category.

Re-run the validator if any of these change."""

# --- axis 1: category ------------------------------------------------------

CATEGORIES: dict[str, dict] = {
    # Colours are the validated categorical palette (see PALETTE_NOTE); the
    # order below is the order they were validated in and the order the legend
    # renders, so adjacent entries stay separable. Do not reorder or recolour
    # without re-running the validator.

    "person": {
        "es": "Persona real", "en": "Real person",
        "colour": "#bc549e",
        "gendered": True,
        "sub": {
            "politics":     {"es": "Política y gobierno", "en": "Politics & government"},
            "military":     {"es": "Militar", "en": "Military"},
            "clergy":       {"es": "Clero y vida religiosa", "en": "Clergy & religious life"},
            "letters":      {"es": "Artes literarias", "en": "Literature"},
            "performing":   {"es": "Artes escénicas", "en": "Performing arts"},
            "visual":       {"es": "Artes visuales", "en": "Visual arts"},
            "music":        {"es": "Música", "en": "Music"},
            "science":      {"es": "Ciencia y técnica", "en": "Science & engineering"},
            "education":    {"es": "Educación", "en": "Education"},
            "health":       {"es": "Medicina y cuidados", "en": "Medicine & care"},
            "sport":        {"es": "Deporte", "en": "Sport"},
            "bullfighting": {"es": "Tauromaquia", "en": "Bullfighting"},
            "business":     {"es": "Empresa e industria", "en": "Business & industry"},
            "nobility":     {"es": "Nobleza y realeza", "en": "Nobility & royalty"},
            "exploration":  {"es": "Exploración", "en": "Exploration"},
            "activism":     {"es": "Activismo y sociedad", "en": "Activism & society"},
            "relative":     {"es": "Esposa, madre o hija de", "en": "Wife, mother or daughter of"},
            "journalism":   {"es": "Periodismo", "en": "Journalism"},
            "law":          {"es": "Derecho", "en": "Law"},
            "other":        {"es": "Otra dedicación", "en": "Other"},
        },
    },
    "religion": {
        "es": "Religión y devoción", "en": "Religion & devotion",
        "colour": "#9c7c0b",
        "gendered": True,
        "sub": {
            "marian":     {"es": "Advocación mariana", "en": "Marian devotion"},
            "saint":      {"es": "Santoral", "en": "Saints"},
            "biblical":   {"es": "Figura bíblica", "en": "Biblical figure"},
            "order":      {"es": "Orden o institución religiosa", "en": "Religious order or institution"},
            "devotion":   {"es": "Devoción y liturgia", "en": "Devotion & liturgy"},
        },
    },
    "fictional": {
        "es": "Personaje ficticio", "en": "Fictional character",
        "colour": "#b2385f",
        "gendered": True,
        "sub": {
            "mythology":  {"es": "Mitología", "en": "Mythology"},
            "literature": {"es": "Literatura", "en": "Literature"},
            "opera":      {"es": "Ópera y zarzuela", "en": "Opera & zarzuela"},
            "folklore":   {"es": "Folclore y leyenda", "en": "Folklore & legend"},
            "other":      {"es": "Otro personaje", "en": "Other character"},
        },
    },
    "place": {
        "es": "Lugar", "en": "Place",
        "colour": "#2769c6",
        "gendered": False,
        "sub": {
            "municipality": {"es": "Municipio español", "en": "Spanish municipality"},
            "region":       {"es": "Región o provincia", "en": "Region or province"},
            "country":      {"es": "País", "en": "Country"},
            "world_city":   {"es": "Ciudad del mundo", "en": "World city"},
            "hydronym":     {"es": "Río, mar o costa", "en": "River, sea or coast"},
            "oronym":       {"es": "Montaña o sierra", "en": "Mountain or range"},
            "local":        {"es": "Lugar de Málaga", "en": "Local place"},
        },
    },
    "landscape": {
        "es": "Terreno y poblamiento", "en": "Land & settlement",
        "colour": "#a35303",
        "gendered": False,
        "sub": {
            "rural_estate": {"es": "Lagar, cortijo o finca", "en": "Wine press, farmstead or holding"},
            "hydrography":  {"es": "Arroyo, fuente o pozo", "en": "Stream, spring or well"},
            "relief":       {"es": "Loma, cerro o cañada", "en": "Hill, ridge or dell"},
            "built":        {"es": "Construcción o hito", "en": "Structure or landmark"},
            "descriptive":  {"es": "Descripción de la propia vía", "en": "Describes the vía itself"},
        },
    },
    "nature": {
        "es": "Naturaleza", "en": "Nature",
        "colour": "#06976d",
        "gendered": False,
        "sub": {
            "tree":      {"es": "Árboles", "en": "Trees"},
            "flower":    {"es": "Flores y plantas", "en": "Flowers & plants"},
            "fruit":     {"es": "Frutas", "en": "Fruit"},
            "bird":      {"es": "Aves", "en": "Birds"},
            "animal":    {"es": "Animales", "en": "Animals"},
            "sea_life":  {"es": "Fauna marina", "en": "Sea life"},
            "mineral":   {"es": "Minerales y piedras", "en": "Minerals & stones"},
            "celestial": {"es": "Astros", "en": "Celestial bodies"},
            "weather":   {"es": "Vientos, mareas y clima", "en": "Winds, tides & weather"},
        },
    },
    "culture": {
        "es": "Cultura y obras", "en": "Culture & works",
        "colour": "#8e49aa",
        "gendered": False,
        "sub": {
            "music_form": {"es": "Palos y formas musicales", "en": "Musical forms"},
            "artwork":    {"es": "Obras y objetos", "en": "Works & objects"},
            "vessel":     {"es": "Barcos y naves", "en": "Ships & craft"},
            "sport_club": {"es": "Deporte y clubes", "en": "Sport & clubs"},
            "science":    {"es": "Ciencia y saberes", "en": "Science & knowledge"},
        },
    },
    "trade": {
        "es": "Oficios y gremios", "en": "Trades & guilds",
        "colour": "#04a19b",
        "gendered": True,
        "sub": {
            "guild":      {"es": "Gremio", "en": "Guild"},
            "occupation": {"es": "Oficio", "en": "Occupation"},
        },
    },
    "event": {
        "es": "Hechos y fechas", "en": "Events & dates",
        "colour": "#7e6cd9",
        "gendered": False,
        "sub": {
            "battle":     {"es": "Batalla", "en": "Battle"},
            "date":       {"es": "Efeméride", "en": "Commemorative date"},
            "historical": {"es": "Hecho histórico", "en": "Historical event"},
            "festivity":  {"es": "Fiesta y celebración", "en": "Festivity"},
        },
    },
    "abstract": {
        "es": "Conceptos y valores", "en": "Concepts & values",
        "colour": "#ce514d",
        "gendered": False,
        "sub": {
            "virtue":  {"es": "Virtudes", "en": "Virtues"},
            "concept": {"es": "Ideas y estados", "en": "Ideas & states"},
        },
    },
    "institution": {
        "es": "Instituciones", "en": "Institutions",
        "colour": "#138db1",
        "gendered": False,
        "sub": {
            "civic":     {"es": "Institución civil", "en": "Civic institution"},
            "education": {"es": "Educación", "en": "Education"},
            "labour":    {"es": "Trabajo y sindicatos", "en": "Labour & unions"},
        },
    },
    "unknown": {
        "es": "Sin clasificar", "en": "Unclassified",
        "colour": "#8b9199",
        "gendered": False,
        "sub": {
            "unresolved": {"es": "Sin resolver", "en": "Unresolved"},
            "surname_only": {"es": "Sólo apellido o apodo", "en": "Surname or nickname only"},
        },
    },
}


# --- axis 2: gender --------------------------------------------------------

GENDERS = {
    # Three carrying slots plus two reserved neutrals. Validated all-pairs,
    # because gender shows up in scatter and small multiples where every pair
    # can end up side by side, not only adjacent ones.
    "f":       {"es": "Mujeres", "en": "Women", "colour": "#d4517f"},
    "m":       {"es": "Hombres", "en": "Men", "colour": "#2f86cf"},
    "mixed":   {"es": "Mixto o familia", "en": "Mixed or family", "colour": "#7f9c3c"},
    "none":    {"es": "Sin género", "en": "Not a person", "colour": "#8b9199"},
    "unknown": {"es": "Indeterminado", "en": "Undetermined", "colour": "#c0c4c9"},
}

# --- axis 3: realness ------------------------------------------------------

REALNESS = {
    "real":      {"es": "Real", "en": "Real"},
    "fictional": {"es": "Ficticia", "en": "Fictional"},
    "n/a":       {"es": "No aplica", "en": "Not applicable"},
    "unknown":   {"es": "Desconocida", "en": "Unknown"},
}

# The thesis' own first-level scheme, expressed as a view over the axes above,
# so its published counts can be reproduced exactly and checked against ours.
THESIS_VIEW = {
    "mujer real":      {"gender": "f", "realness": "real"},
    "mujer ficticia":  {"gender": "f", "realness": "fictional"},
    "gremio mujeres":  {"gender": "f", "category": "trade"},
    "mujer desconocida": {"gender": "f", "realness": "unknown"},
}


def validate() -> None:
    for key, cat in CATEGORIES.items():
        assert {"es", "en", "colour", "sub", "gendered"} <= set(cat), key
        for sub, labels in cat["sub"].items():
            assert {"es", "en"} <= set(labels), f"{key}.{sub}"


def as_json() -> dict:
    validate()
    return {"categories": CATEGORIES, "genders": GENDERS, "realness": REALNESS}


if __name__ == "__main__":
    validate()
    n = sum(len(c["sub"]) for c in CATEGORIES.values())
    print(f"{len(CATEGORIES)} categories, {n} subcategories - ok")
