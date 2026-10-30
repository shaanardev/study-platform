<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    eyebrow,
    title,
    children,
    class: className = '',
  }: {
    eyebrow: string;
    title: string;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<header class={['app-page-heading', className]}>
  <p class="app-eyebrow">{eyebrow}</p>
  <h1 class="app-page-title">{title}</h1>
  {@render children?.()}
</header>
