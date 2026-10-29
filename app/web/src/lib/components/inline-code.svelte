<script lang="ts">
  type InlineCodeToken =
    | { kind: 'text'; start: number; text: string }
    | { kind: 'code'; start: number; text: string };

  const INLINE_CODE_MARKER = /`(?<code>[^`]+)`/gu;

  const tokenizeInlineCode = (text: string): InlineCodeToken[] => {
    const tokens: InlineCodeToken[] = [];
    let cursor = 0;

    [...text.matchAll(INLINE_CODE_MARKER)].forEach((match) => {
      const [fullMatch] = match;
      const { groups, index: start } = match;
      const code = groups?.['code'];

      if (code === undefined) {
        return;
      }

      if (start > cursor) {
        tokens.push({ kind: 'text', start: cursor, text: text.slice(cursor, start) });
      }

      tokens.push({ kind: 'code', start, text: code });
      cursor = start + fullMatch.length;
    });

    if (cursor < text.length) {
      tokens.push({ kind: 'text', start: cursor, text: text.slice(cursor) });
    }

    return tokens;
  };

  let { text }: { text: string } = $props();
  let tokens = $derived(tokenizeInlineCode(text));
</script>

{#each tokens as token (token.start)}
  {#if token.kind === 'code'}
    <code>{token.text}</code>
  {:else}
    {token.text}
  {/if}
{/each}
