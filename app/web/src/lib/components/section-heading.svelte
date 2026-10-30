<script lang="ts">
  let {
    id,
    eyebrow,
    title,
    description,
    class: className = '',
  }: {
    id: string;
    eyebrow: string;
    title: string;
    description?: string;
    class?: string;
  } = $props();
</script>

<div class={className}>
  <p class="app-eyebrow">{eyebrow}</p>
  <h2 {id} class="app-section-title m-0">{title}</h2>
  {#if description}<p class="text-body-muted mt-2 mb-0 leading-relaxed">{description}</p>{/if}
</div>
