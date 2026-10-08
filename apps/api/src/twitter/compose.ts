// Text rules for posts on X: the weighted length X counts against the 280 limit,
// splitting a long text into a thread, and the checks a preview reports.

export const MAX_POST_LENGTH = 280;
export const MAX_THREAD_POSTS = 25;
// X counts every URL as 23 characters, whatever its length.
const URL_LENGTH = 23;
const URL_PATTERN = /https?:\/\/[^\s]+/g;

// The code point ranges X weighs as one; everything else (CJK, most emoji) as two.
function weight(codePoint: number): number {
  if (
    codePoint <= 4351 ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247)
  ) {
    return 1;
  }
  return 2;
}

export function weightedLength(text: string): number {
  let length = 0;
  const withoutUrls = text.normalize('NFC').replace(URL_PATTERN, () => {
    length += URL_LENGTH;
    return '';
  });
  for (const char of withoutUrls) length += weight(char.codePointAt(0)!);
  return length;
}

// Splits text into posts of at most `max` weighted characters: on paragraphs
// first, then sentences, then words. With `numbered`, each post ends in " 1/3".
export function splitThread(text: string, numbered = true, max = MAX_POST_LENGTH): string[] {
  const suffixRoom = numbered ? 8 : 0;
  const limit = max - suffixRoom;
  const pieces = text
    .trim()
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .flatMap((sentence) => (weightedLength(sentence) <= limit ? [sentence] : sentence.split(/\s+/)))
    .map((piece) => piece.trim())
    .filter(Boolean);

  const posts: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (weightedLength(candidate) <= limit) {
      current = candidate;
      continue;
    }
    if (current) posts.push(current);
    // A single word longer than the limit is cut, since it cannot be split better.
    current = weightedLength(piece) <= limit ? piece : [...piece].slice(0, limit).join('');
  }
  if (current) posts.push(current);
  if (!numbered || posts.length < 2) return posts.slice(0, MAX_THREAD_POSTS);
  const total = Math.min(posts.length, MAX_THREAD_POSTS);
  return posts.slice(0, total).map((post, index) => `${post} ${index + 1}/${total}`);
}

export interface PostCheck {
  index: number;
  text: string;
  length: number;
  overLimit: boolean;
}

export function checkPosts(posts: string[]): { posts: PostCheck[]; issues: string[] } {
  const checks = posts.map((text, index) => {
    const length = weightedLength(text);
    return { index, text, length, overLimit: length > MAX_POST_LENGTH };
  });
  const issues: string[] = [];
  if (posts.length === 0) issues.push('The draft has no posts');
  if (posts.length > MAX_THREAD_POSTS) {
    issues.push(`A thread has at most ${MAX_THREAD_POSTS} posts`);
  }
  for (const check of checks) {
    if (check.text.trim().length === 0) issues.push(`Post ${check.index + 1} is empty`);
    if (check.overLimit) {
      issues.push(
        `Post ${check.index + 1} is ${check.length} characters; the limit is ${MAX_POST_LENGTH}`,
      );
    }
  }
  return { posts: checks, issues };
}

// Numbers in the draft that appear in none of its sources. A figure the writer
// cannot point to in a source is reported, so it is checked before it goes out.
export function unsourcedNumbers(posts: string[], sourceTexts: string[]): string[] {
  const sources = sourceTexts.join('\n').replace(/[\s,.]/g, '');
  const found = new Set<string>();
  for (const post of posts) {
    // Thread numbering ("2/5") is not a claim.
    const withoutNumbering = post.replace(/\s\d+\/\d+$/, '');
    for (const match of withoutNumbering.matchAll(/\d[\d.,]*%?/g)) {
      const number = match[0].replace(/[.,]$/, '');
      if (!sources.includes(number.replace(/[,.]/g, ''))) found.add(number);
    }
  }
  return [...found];
}
