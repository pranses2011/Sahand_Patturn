import unittest
from pathlib import Path
from check_checklist import check_checklist


class ChecklistArithmeticTests(unittest.TestCase):
    def setUp(self):
        self.text = Path(__file__).with_name('14-CHECKLIST.md').read_text(encoding='utf-8')

    def test_real_checklist(self):
        check_checklist(self.text)

    def test_changed_checkbox_requires_summary_update(self):
        with self.assertRaisesRegex(ValueError, 'SECTION_TOTAL_MISMATCH'):
            check_checklist(self.text.replace('| 12.5 | [ ]', '| 12.5 | [x]'))

    def test_headline_and_footer_are_checked(self):
        for old, new in [('✅ 70 از 122', '✅ 71 از 122'), ('**122** | **70**', '**122** | **71**')]:
            with self.subTest(old=old), self.assertRaisesRegex(ValueError, 'TOTAL_MISMATCH'):
                check_checklist(self.text.replace(old, new))

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_ITEM'):
            check_checklist(self.text + '\n| 12.5 | [ ] | duplicate |')


if __name__ == '__main__':
    unittest.main()
