<script lang="ts">
  import { page } from '$app/state';

  import ReviewView from './review-view.svelte';
  import { getReviewData } from './review.remote';

  const PACK_SELECTION_PART_COUNT = 3;

  const getPackSelection = () => {
    const key = page.url.searchParams.get('packChoice');
    const selection = key?.split('|');

    if (selection?.length === PACK_SELECTION_PART_COUNT && selection.every(Boolean)) {
      return { examId: selection[0], packId: selection[1], packVersion: selection[2] };
    }

    return {
      examId: page.url.searchParams.get('examId') ?? undefined,
      packId: page.url.searchParams.get('packId') ?? undefined,
      packVersion: page.url.searchParams.get('packVersion') ?? undefined,
    };
  };

  let data = $derived(await getReviewData(getPackSelection()));
</script>

<ReviewView {data} />
