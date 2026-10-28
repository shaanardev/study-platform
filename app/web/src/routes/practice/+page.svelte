<script lang="ts">
  import { page } from '$app/state';

  import PracticeView from './practice-view.svelte';
  import { getPracticePage } from './practice.remote';

  let data = $derived(
    await getPracticePage({
      sessionId: page.url.searchParams.get('session') ?? undefined,
    }),
  );
</script>

<PracticeView {data} />
