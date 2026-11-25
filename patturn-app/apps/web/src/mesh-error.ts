import type { ExportResult } from '@patturn/exporters';
import { meshValidation as text } from './messages/fa.json';
import { formatNumber } from './number-format';

/** Presentation only. Never interpret filenames, partial codes or unknown diagnostics. */
export function meshProblemMessage(problem: string): string {
  if (Object.hasOwn(text.simple, problem)) return text.simple[problem as keyof typeof text.simple];
  const match = /^([A-Z_]+):(\d+)$/.exec(problem);
  if (!match || !Object.hasOwn(text.counted, match[1]!)) return problem;
  const count = Number(match[2]);
  if (!Number.isSafeInteger(count)) return problem;
  return `${text.counted[match[1] as keyof typeof text.counted]}: ${formatNumber(count)}`;
}

export function meshValidationMessage(problems: readonly string[]): string {
  return [text.title, problems.map(meshProblemMessage).join(text.separator), text.help]
    .filter(Boolean)
    .join(' ');
}

/** Use structured reports, not a regex over paths/names embedded in exporter error strings. */
export function meshExportErrorMessage(result: Pick<ExportResult, 'validation' | 'error'>): string {
  return result.validation && !result.validation.ok && result.validation.problems.length
    ? meshValidationMessage(result.validation.problems)
    : (result.error ?? text.unknown);
}
