<script lang="ts">
  import { page } from '$app/state';

  import ReviewView from './review-view.svelte';
  import { getReviewData } from './review.remote';

  let data = $derived(
    await getReviewData({
      examId: page.url.searchParams.get('examId') ?? undefined,
      packId: page.url.searchParams.get('packId') ?? undefined,
      packVersion: page.url.searchParams.get('packVersion') ?? undefined,
    }),
  );
</script>

<ReviewView {data} />
