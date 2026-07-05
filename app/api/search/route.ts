import { source } from '@/lib/source';
import { mixedLanguageTokenizer } from '@/lib/search-tokenizer';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source, {
  tokenizer: mixedLanguageTokenizer,
});
