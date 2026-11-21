import re
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
        headline = re.search(r'✅ (\d+) از (\d+)', self.text)
        footer = re.search(r'\*\*(\d+)\*\* \| \*\*(\d+)\*\*', self.text)
        self.assertIsNotNone(headline)
        self.assertIsNotNone(footer)
        replacements = [
            (headline.group(0), f'✅ {int(headline.group(1)) + 1} از {headline.group(2)}'),
            (footer.group(0), f'**{footer.group(1)}** | **{int(footer.group(2)) + 1}**'),
        ]
        for old, new in replacements:
            with self.subTest(old=old), self.assertRaisesRegex(ValueError, 'TOTAL_MISMATCH'):
                check_checklist(self.text.replace(old, new))

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_ITEM'):
            check_checklist(self.text + '\n| 12.5 | [ ] | duplicate |')

    def test_malformed_task_status_or_identifier_is_not_ignored(self):
        for replacement in ['| 12.5 | [X]', '| 12.5 | [yes]', '| 12.a | [ ]']:
            with self.subTest(replacement=replacement), self.assertRaisesRegex(ValueError, 'INVALID_ITEM_ROW'):
                check_checklist(self.text.replace('| 12.5 | [ ]', replacement))

    def test_duplicate_summary_section_is_not_silently_overwritten(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_SUMMARY_SECTION'):
            check_checklist(self.text + '\n| ۱۲ تست | 10 | 4 |')

    def test_duplicate_headline_and_footer_are_rejected(self):
        for duplicate, code in [('✅ 70 از 122 کار', 'HEADLINE_COUNT_MISMATCH'),
                                ('| **مجموع** | **122** | **70** |', 'FOOTER_COUNT_MISMATCH')]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, code):
                check_checklist(self.text + '\n' + duplicate)

    def test_empty_document_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'CHECKLIST_EMPTY'):
            check_checklist('')


if __name__ == '__main__':
    unittest.main()
