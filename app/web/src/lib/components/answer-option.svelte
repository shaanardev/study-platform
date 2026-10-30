<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<label class="app-answer-option">
  {@render children()}
</label>
