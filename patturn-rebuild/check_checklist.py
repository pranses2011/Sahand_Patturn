"""Check arithmetic only; completion evidence still requires human review."""
import re
from collections import defaultdict
from pathlib import Path


def check_checklist(text: str) -> None:
    counts = defaultdict(lambda: [0, 0])
    ids = set()
    for line in text.splitlines():
        if not re.match(r'^\|\s*\d+\.', line):
            continue
        row = re.match(r'^\| (\d+)\.(\d+) \| \[([ x])\] \|', line)
        if not row:
            raise ValueError(f'INVALID_ITEM_ROW:{line}')
        section, item, status = row.groups()
        identity = (int(section), int(item))
        if identity in ids:
            raise ValueError(f'DUPLICATE_ITEM:{section}.{item}')
        ids.add(identity)
        counts[int(section)][0] += 1
        counts[int(section)][1] += status == 'x'
    if not counts:
        raise ValueError('CHECKLIST_EMPTY')
    summary = {}
    for section, total, done in re.findall(r'^\| (\d+) [^|]+\| (\d+) \| (\d+) \|', text, re.M):
        section = int(section)
        if section in summary:
            raise ValueError(f'DUPLICATE_SUMMARY_SECTION:{section}')
        summary[section] = [int(total), int(done)]
    if dict(counts) != summary:
        raise ValueError(f'SECTION_TOTAL_MISMATCH:expected={dict(counts)} actual={summary}')
    total = sum(row[0] for row in counts.values())
    done = sum(row[1] for row in counts.values())
    headlines = re.findall(r'✅ (\d+) از (\d+) کار', text)
    if len(headlines) != 1:
        raise ValueError('HEADLINE_COUNT_MISMATCH')
    headline = headlines[0]
    footers = re.findall(r'\| \*\*مجموع\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|', text)
    if len(footers) != 1:
        raise ValueError('FOOTER_COUNT_MISMATCH')
    footer = footers[0]
    if [int(headline[0]), int(headline[1])] != [done, total]:
        raise ValueError('HEADLINE_TOTAL_MISMATCH')
    if [int(footer[0]), int(footer[1])] != [total, done]:
        raise ValueError('FOOTER_TOTAL_MISMATCH')


if __name__ == '__main__':
    check_checklist(Path(__file__).with_name('14-CHECKLIST.md').read_text(encoding='utf-8'))
    print('Checklist arithmetic OK (not a completion-evidence audit)')
