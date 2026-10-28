<script lang="ts">
  import ProgressView from './progress-view.svelte';
  import { getProgressData } from './progress.remote';

  const progress = getProgressData();
</script>

{#await progress then data}
  <ProgressView {data} />
{/await}
