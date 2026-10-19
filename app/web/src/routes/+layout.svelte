<script lang="ts">
  import FeedbackOverlay from '#lib/ui-feedback/feedback-overlay.svelte';

  import { submitFeedback } from '../lib/ui-feedback/feedback.remote';

  import './layout.css';

  let { children } = $props();
</script>

{@render children()}
<FeedbackOverlay {submitFeedback} />
