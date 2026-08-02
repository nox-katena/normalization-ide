export type PythonHighlightKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment';

const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'type',
  'while',
  'with',
  'yield',
]);

const STRING_PREFIXES = new Set([
  'b',
  'br',
  'f',
  'fr',
  'r',
  'rb',
  'rf',
  'u',
]);

export function highlightPythonGraphemes(
  graphemes: readonly string[],
): PythonHighlightKind[] {
  const highlights = graphemes.map((): PythonHighlightKind => 'plain');
  let index = 0;

  while (index < graphemes.length) {
    const value = graphemes[index];

    if (value === '#') {
      const end = findLineEnd(graphemes, index);
      mark(highlights, index, end, 'comment');
      index = end;
      continue;
    }

    if (isQuote(value)) {
      const end = findStringEnd(graphemes, index);
      mark(highlights, index, end, 'string');
      index = end;
      continue;
    }

    if (value !== undefined && isIdentifierStart(value)) {
      const end = findIdentifierEnd(graphemes, index);
      const identifier = graphemes.slice(index, end).join('');
      const quote = graphemes[end];

      if (isQuote(quote) && STRING_PREFIXES.has(identifier.toLowerCase())) {
        const stringEnd = findStringEnd(graphemes, end);
        mark(highlights, index, stringEnd, 'string');
        index = stringEnd;
        continue;
      }

      if (PYTHON_KEYWORDS.has(identifier)) {
        mark(highlights, index, end, 'keyword');
      }
      index = end;
      continue;
    }

    if (isNumberStart(graphemes, index)) {
      const end = findNumberEnd(graphemes, index);
      mark(highlights, index, end, 'number');
      index = end;
      continue;
    }

    index += 1;
  }

  return highlights;
}

function findLineEnd(graphemes: readonly string[], start: number): number {
  let index = start;
  while (index < graphemes.length && graphemes[index] !== '\n') {
    index += 1;
  }
  return index;
}

function findStringEnd(graphemes: readonly string[], quoteIndex: number): number {
  const quote = graphemes[quoteIndex];
  const triple =
    graphemes[quoteIndex + 1] === quote && graphemes[quoteIndex + 2] === quote;
  let index = quoteIndex + (triple ? 3 : 1);

  while (index < graphemes.length) {
    if (graphemes[index] === '\\') {
      index += 2;
      continue;
    }

    if (triple) {
      if (
        graphemes[index] === quote &&
        graphemes[index + 1] === quote &&
        graphemes[index + 2] === quote
      ) {
        return index + 3;
      }
    } else {
      if (graphemes[index] === quote) {
        return index + 1;
      }
      if (graphemes[index] === '\n') {
        return index;
      }
    }

    index += 1;
  }

  return graphemes.length;
}

function findIdentifierEnd(
  graphemes: readonly string[],
  start: number,
): number {
  let index = start + 1;
  while (
    index < graphemes.length &&
    isIdentifierContinuation(graphemes[index] ?? '')
  ) {
    index += 1;
  }
  return index;
}

function findNumberEnd(graphemes: readonly string[], start: number): number {
  let index = start;

  if (graphemes[index] === '0' && /^[bBoOxX]$/.test(graphemes[index + 1] ?? '')) {
    index += 2;
    while (/^[0-9a-fA-F_]$/.test(graphemes[index] ?? '')) {
      index += 1;
    }
    return /^[jJ]$/.test(graphemes[index] ?? '') ? index + 1 : index;
  }

  while (/^[0-9_]$/.test(graphemes[index] ?? '')) {
    index += 1;
  }

  if (graphemes[index] === '.') {
    index += 1;
    while (/^[0-9_]$/.test(graphemes[index] ?? '')) {
      index += 1;
    }
  }

  if (/^[eE]$/.test(graphemes[index] ?? '')) {
    const exponentStart = index;
    index += 1;
    if (/^[+-]$/.test(graphemes[index] ?? '')) {
      index += 1;
    }
    const digitsStart = index;
    while (/^[0-9_]$/.test(graphemes[index] ?? '')) {
      index += 1;
    }
    if (digitsStart === index) {
      index = exponentStart;
    }
  }

  return /^[jJ]$/.test(graphemes[index] ?? '') ? index + 1 : index;
}

function isNumberStart(graphemes: readonly string[], index: number): boolean {
  const value = graphemes[index] ?? '';
  return /^[0-9]$/.test(value) || (value === '.' && /^[0-9]$/.test(graphemes[index + 1] ?? ''));
}

function isQuote(value: string | undefined): value is "'" | '"' {
  return value === "'" || value === '"';
}

function isIdentifierStart(value: string): boolean {
  return /^[_\p{ID_Start}][\p{ID_Continue}]*$/u.test(value);
}

function isIdentifierContinuation(value: string): boolean {
  return /^[_\p{ID_Continue}]+$/u.test(value);
}

function mark(
  highlights: PythonHighlightKind[],
  start: number,
  end: number,
  kind: PythonHighlightKind,
): void {
  highlights.fill(kind, start, end);
}
