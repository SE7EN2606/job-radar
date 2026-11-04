"""Fast offline regression tests for per-profile job discovery."""
import importlib.util
import pathlib
import sys
import types
import unittest

sys.modules["jobspy"] = types.SimpleNamespace(scrape_jobs=lambda **_: None)
source = pathlib.Path(__file__).parents[1] / "scanner" / "profile_scan.py"
spec = importlib.util.spec_from_file_location("profile_scan_tested", source)
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

class SearchTest(unittest.TestCase):
    def test_json_title_delimiters(self):
        roles = scan.titles("Directeur de Business Unit / Directeur de BU; Directeur général / Directeur général de filiale; Directeur commercial / Directeur des ventes; Directeur commercial international / Directeur export")
        self.assertIn("Directeur général", roles)
        self.assertIn("Directeur commercial", roles)
        self.assertIn("Directeur export", roles)
        self.assertEqual(len(roles), 8)

    def test_expansion_keeps_user_titles(self):
        roles = scan.titles("Directeur BU; Directeur général; Directeur commercial; Directeur commercial international")
        terms = scan.expanded_titles(roles)
        for role in roles:
            self.assertIn(role, terms)

    def test_search_coverage(self):
        self.assertEqual(scan.search_locations("Bretagne; France entière"), ["Bretagne, France", "France"])
        self.assertEqual(scan.search_locations("France"), ["France"])

    def test_relevance(self):
        roles = ["Directeur commercial", "Directeur général", "Directeur de BU"]
        self.assertGreaterEqual(scan.title_quality("Directeur commercial France et Export", roles), 90)
        self.assertGreaterEqual(scan.title_quality("International Sales Director", roles), 80)
        self.assertEqual(scan.title_quality("Responsable Comptable Groupe", roles), 0)
        self.assertEqual(scan.title_quality("Spécialiste Clinique", roles), 0)
        self.assertEqual(scan.title_quality("Directeur général des services", roles), 0)
        self.assertEqual(scan.title_quality("Responsable agence / développeur commercial", roles), 0)

    def test_location(self):
        self.assertEqual(scan.region_quality("Rennes, Brittany, France")[1], "Bretagne")
        self.assertEqual(scan.region_quality("Paris, Île-de-France, France")[1], "France")

if __name__ == "__main__":
    unittest.main()
