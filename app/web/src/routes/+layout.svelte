<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  import FeedbackOverlay from '#lib/ui-feedback/feedback-overlay.svelte';

  import './layout.css';

  const navigationItems = [
    { label: 'Exam packs', path: '/' },
    { label: 'Practice', path: '/practice' },
    { label: 'Mock', path: '/mock' },
    { label: 'Progress', path: '/progress' },
    { label: 'Review', path: '/review' },
  ] as const;

  let { children } = $props();
</script>

<nav class="border-divider border-b bg-white px-4" aria-label="Primary navigation">
  <div class="mx-auto flex w-full max-w-240 flex-wrap gap-1 py-2">
    {#each navigationItems as item (item.path)}
      <a
        class="app-nav-link"
        href={resolve(item.path)}
        aria-current={page.url.pathname === resolve(item.path) ? 'page' : undefined}>{item.label}</a
      >
    {/each}
  </div>
</nav>
{@render children()}
<FeedbackOverlay />
