"""Check arithmetic only; completion evidence still requires human review."""
import re
from collections import defaultdict
from pathlib import Path


def check_checklist(text: str) -> None:
    counts = defaultdict(lambda: [0, 0])
    ids = set()
    for section, item, status in re.findall(r'^\| (\d+)\.(\d+) \| \[([ x])\]', text, re.M):
        identity = (int(section), int(item))
        if identity in ids:
            raise ValueError(f'DUPLICATE_ITEM:{section}.{item}')
        ids.add(identity)
        counts[int(section)][0] += 1
        counts[int(section)][1] += status == 'x'
    if not counts:
        raise ValueError('CHECKLIST_EMPTY')
    summary = {int(section): [int(total), int(done)] for section, total, done in
               re.findall(r'^\| (\d+) [^|]+\| (\d+) \| (\d+) \|', text, re.M)}
    if dict(counts) != summary:
        raise ValueError(f'SECTION_TOTAL_MISMATCH:expected={dict(counts)} actual={summary}')
    total = sum(row[0] for row in counts.values())
    done = sum(row[1] for row in counts.values())
    headline = re.search(r'✅ (\d+) از (\d+) کار', text)
    footer = re.search(r'\| \*\*مجموع\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|', text)
    if not headline or [int(headline[1]), int(headline[2])] != [done, total]:
        raise ValueError('HEADLINE_TOTAL_MISMATCH')
    if not footer or [int(footer[1]), int(footer[2])] != [total, done]:
        raise ValueError('FOOTER_TOTAL_MISMATCH')


if __name__ == '__main__':
    check_checklist(Path(__file__).with_name('14-CHECKLIST.md').read_text(encoding='utf-8'))
    print('Checklist arithmetic OK (not a completion-evidence audit)')
