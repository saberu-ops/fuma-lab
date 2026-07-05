const cjkCharacter =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const latinOrNumberCharacter = /[\p{Script=Latin}\p{Number}_'-]/u;
const otherWordCharacter = /[\p{Letter}\p{Number}]/u;

function addCjkRun(tokens: Set<string>, characters: string[]) {
  if (characters.length === 1) {
    tokens.add(characters[0]);
    return;
  }

  for (let index = 0; index < characters.length; index += 1) {
    if (index + 1 < characters.length) {
      tokens.add(`${characters[index]}${characters[index + 1]}`);
    }
  }
}

function addWord(tokens: Set<string>, word: string) {
  const normalized = word.replace(/^[-']+|[-']+$/g, '');
  if (normalized) tokens.add(normalized);
}

/**
 * Orama's bundled language tokenizers do not segment Chinese or Japanese.
 * This tokenizer keeps Latin words intact and indexes CJK text as overlapping
 * bigrams (or a unigram for a one-character run), which supports mixed Chinese,
 * Japanese and English notes without making multi-character searches too broad.
 */
function tokenize(raw: string) {
  if (typeof raw !== 'string') return [raw];

  const tokens = new Set<string>();
  const normalized = raw.normalize('NFKC').toLowerCase();
  let cjkRun: string[] = [];
  let word = '';

  const flushCjk = () => {
    if (cjkRun.length === 0) return;
    addCjkRun(tokens, cjkRun);
    cjkRun = [];
  };

  const flushWord = () => {
    if (!word) return;
    addWord(tokens, word);
    word = '';
  };

  for (const character of normalized) {
    if (cjkCharacter.test(character)) {
      flushWord();
      cjkRun.push(character);
      continue;
    }

    if (latinOrNumberCharacter.test(character)) {
      flushCjk();
      word += character;
      continue;
    }

    if (otherWordCharacter.test(character)) {
      flushCjk();
      word += character;
      continue;
    }

    flushCjk();
    flushWord();
  }

  flushCjk();
  flushWord();

  return [...tokens];
}

export const mixedLanguageTokenizer = {
  language: 'mixed-cjk',
  normalizationCache: new Map<string, string>(),
  tokenize,
};
