"""Traceability checks only: these are not proof of feature implementation."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).parent


class SolidVentsReferences(unittest.TestCase):
    def test_each_requirement_has_one_matrix_row_and_one_open_checklist_row(self):
        spec = (ROOT / "16-SOLIDVENTS-SPEC.md").read_text()
        checklist = (ROOT / "14-CHECKLIST.md").read_text()
        identifiers = re.findall(r"^\| (SV-\d{2}) \|", spec, re.M)
        self.assertEqual(identifiers, [f"SV-{i:02d}" for i in range(1, 51)])
        for number in range(1, 51):
            # Completion status may change only with independently reviewed evidence.
            matches = re.findall(rf"^\| 14\.{number} \| \[[ x]\] \| SV-{number:02d}:", checklist, re.M)
            self.assertEqual(len(matches), 1, f"SV-{number:02d}")

    def test_every_specialist_reference_links_the_new_spec(self):
        files = sorted(ROOT.glob("[0-1][0-9]-*.md"))
        for file in files:
            if int(file.name[:2]) <= 14:
                self.assertIn("16-SOLIDVENTS-SPEC.md", file.read_text(), file.name)

    def test_handbook_registers_spec_and_cover_links_it(self):
        self.assertIn('("16-SOLIDVENTS-SPEC.md",', (ROOT / "build_handbook.py").read_text())
        self.assertIn("16-SOLIDVENTS-SPEC.md", (ROOT / "README.md").read_text())

    def test_sources_and_end_to_end_scenarios_are_addressable(self):
        spec = (ROOT / "16-SOLIDVENTS-SPEC.md").read_text()
        for number in range(1, 14):
            self.assertRegex(spec, rf"(?m)^\| S{number:02d} ")
        for number in range(1, 10):
            self.assertIn(f"SV-E{number:02d}", spec)


if __name__ == "__main__":
    unittest.main()
