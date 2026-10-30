<script lang="ts">
  import { onDestroy } from 'svelte';

  import {
    boundsFromPoints,
    captureViewport,
    formatShortcut,
    isAppElement,
    loadScreenshot,
    makeElementSelection,
    makeRectangleSelection,
    QUEUE_STORAGE_KEY,
    readShortcut,
    removeScreenshot,
    restoreQueue,
    saveScreenshot,
    SHORTCUT_STORAGE_KEY,
    shortcutFromEvent,
    shortcutMatches,
    snapshotFeedback,
    viewportChanged,
  } from './client';
  import { submitFeedback } from './feedback.remote';
  import {
    CaptureStatus,
    DeliveryPhase,
    DeliveryStatus,
    LIMITS,
    QueueStatus,
    RetryAction,
  } from './schema';
  import type { FeedbackTarget, QueueItem, Shortcut } from './schema';

  interface Drag {
    x: number;
    y: number;
    target: Element;
  }

  interface DeliveryOperation {
    controller: AbortController;
    captureWasReady: boolean;
    itemId: string;
    phase: DeliveryPhase;
  }

  const SELECTION_DRAG_THRESHOLD = 5;
  const RECTANGLE_MIDPOINT_DIVISOR = 2;
  const PANEL_WIDTH_REM = 24;
  const PANEL_EDGE_REM = 1.75;

  let open = $state(false);
  let selecting = $state(false);
  let recording = $state(false);
  let shortcut = $state<Shortcut>(readShortcut());
  let drag = $state<Drag | null>(null);
  let pointer = $state<{ x: number; y: number } | null>(null);
  let swallowClick = false;
  let draft = $state<FeedbackTarget | null>(null);
  let editingId = $state<string | null>(null);
  let note = $state('');
  let sending = $state(false);
  let activePhase = $state<DeliveryOperation['phase'] | null>(null);
  let activeOperation: DeliveryOperation | null = null;
  const saved = restoreQueue();
  let queue = $state.raw(saved.items);
  let queueMessage = $state(saved.warning);
  let selectedSessionId = $state<Record<string, string>>({});

  const persist = (items: QueueItem[]) => {
    queue = items;

    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
    } catch {
      queueMessage = 'Could not save the feedback queue in this browser.';
    }
  };

  const updateItem = (id: string, update: (item: QueueItem) => QueueItem) =>
    persist(queue.map((item) => (item.feedback.id === id ? update(item) : item)));

  const cancelDraft = () => {
    selecting = false;
    drag = null;
    pointer = null;
    draft = null;
    editingId = null;
    note = '';
    swallowClick = false;
  };

  const stopDelivery = () => {
    const operation = activeOperation;

    if (!operation) {
      return;
    }

    activeOperation = null;
    operation.controller.abort();
    activePhase = null;
    sending = false;

    if (operation.phase === DeliveryPhase.Submit) {
      updateItem(operation.itemId, (current) => ({
        ...current,
        result: {
          files: null,
          message:
            'Stopped waiting. The remote command may still finish; check the receipt before retrying.',
          retry: RetryAction.Check,
          status: DeliveryStatus.Failed,
        },
      }));
    } else {
      updateItem(operation.itemId, (current) => ({
        ...current,
        capture: operation.captureWasReady ? CaptureStatus.Captured : CaptureStatus.Pending,
        result: { status: QueueStatus.Queued },
      }));
    }
  };

  onDestroy(stopDelivery);

  const beginSelection = (id?: string) => {
    if (id) {
      const item = queue.find(({ feedback }) => feedback.id === id);
      editingId = id;
      note = item?.feedback.note ?? '';
    } else {
      cancelDraft();
    }

    selecting = true;
    open = true;
  };

  const isTypingTarget = (event: KeyboardEvent) =>
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)),
      );

  const onKeydown = (event: KeyboardEvent) => {
    if (recording) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        recording = false;
      } else if (!event.repeat && !event.isComposing) {
        const next = shortcutFromEvent(event);

        if (next) {
          event.preventDefault();
          event.stopImmediatePropagation();
          shortcut = next;
          recording = false;

          try {
            localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(next));
          } catch {
            queueMessage = 'Shortcut changed for this visit but could not be saved.';
          }
        }
      }

      return;
    }

    if (event.key === 'Escape' && (selecting || draft || open)) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (draft) {
        cancelDraft();
        selecting = true;
      } else {
        stopDelivery();
        open = false;
        cancelDraft();
      }

      return;
    }

    if (selecting && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();

      return;
    }

    if (
      !event.repeat &&
      !event.isComposing &&
      !isTypingTarget(event) &&
      shortcutMatches(event, shortcut)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (open) {
        stopDelivery();
        open = false;
        cancelDraft();
      } else {
        beginSelection();
      }
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!selecting || event.button !== 0) {
      return;
    }

    const path = event.composedPath();

    if (path.some((node) => node instanceof HTMLElement && !isAppElement(node))) {
      return;
    }

    const target = path.find((node): node is Element => node instanceof Element);

    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    drag = { target, x: event.clientX, y: event.clientY };
    pointer = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!selecting || !drag) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    pointer = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!selecting || !drag) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const bounds = boundsFromPoints(drag.x, drag.y, event.clientX, event.clientY);

    const selection =
      bounds.width > SELECTION_DRAG_THRESHOLD || bounds.height > SELECTION_DRAG_THRESHOLD
        ? makeRectangleSelection(
            bounds,
            document
              .elementsFromPoint(
                bounds.x + bounds.width / RECTANGLE_MIDPOINT_DIVISOR,
                bounds.y + bounds.height / RECTANGLE_MIDPOINT_DIVISOR,
              )
              .find(
                (element): element is HTMLElement =>
                  element instanceof HTMLElement && isAppElement(element),
              ),
          )
        : makeElementSelection(drag.target);

    const snapshot = snapshotFeedback(selection);

    const existing = editingId
      ? queue.find(({ feedback }) => feedback.id === editingId)
      : undefined;

    draft = existing ? { ...snapshot, id: existing.feedback.id } : snapshot;
    note = existing?.feedback.note ?? '';
    selecting = false;
    drag = null;
    pointer = null;
    swallowClick = true;
  };

  const onPointerCancel = () => {
    drag = null;
    pointer = null;
  };

  const onClick = (event: MouseEvent) => {
    if (!swallowClick) {
      return;
    }

    swallowClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const saveDraft = () => {
    if (!draft || !note.trim() || sending) {
      return;
    }

    const currentDraft = draft;
    let feedback = { ...currentDraft, note: note.trim() };
    const existing = editingId ? queue.find((item) => item.feedback.id === editingId) : undefined;

    if (existing) {
      if (
        existing.capture === CaptureStatus.Captured ||
        existing.feedback.createdAt !== feedback.createdAt
      ) {
        feedback = { ...feedback, id: crypto.randomUUID() };
      }

      updateItem(existing.feedback.id, () => ({
        capture: CaptureStatus.Pending,
        feedback,
        result: { status: QueueStatus.Queued },
      }));
      selectedSessionId = Object.fromEntries(
        Object.entries(selectedSessionId).filter(([id]) => id !== existing.feedback.id),
      );
    } else {
      persist([
        { capture: CaptureStatus.Pending, feedback, result: { status: QueueStatus.Queued } },
        ...queue,
      ]);
    }

    draft = null;
    editingId = null;
    note = '';
    selecting = true;
  };

  const editItem = (item: QueueItem) => {
    const { feedback } = item;
    const { id, note: feedbackNote } = feedback;
    draft = feedback;
    editingId = id;
    note = feedbackNote;
    selecting = false;
    open = true;
  };

  const captureFor = async (item: QueueItem, signal: AbortSignal): Promise<string | null> => {
    if (item.capture === CaptureStatus.Captured) {
      try {
        const cached = await loadScreenshot(item.feedback.id, signal);
        signal.throwIfAborted();

        if (cached) {
          return cached;
        }
      } catch (error) {
        signal.throwIfAborted();
        console.warn(
          'Could not load the saved feedback screenshot; reselection is required.',
          error,
        );
      }

      updateItem(item.feedback.id, (current) => ({
        ...current,
        result: {
          message: 'The saved retry image is unavailable. Reselect to capture a new item.',
          status: QueueStatus.NeedsReselection,
        },
      }));

      return null;
    }

    if (viewportChanged(item.feedback)) {
      updateItem(item.feedback.id, (current) => ({
        ...current,
        result: {
          message: 'The route or viewport changed after selection. Reselect before sending.',
          status: QueueStatus.NeedsReselection,
        },
      }));

      return null;
    }

    const screenshot = await captureViewport(signal);
    signal.throwIfAborted();

    if (viewportChanged(item.feedback)) {
      updateItem(item.feedback.id, (current) => ({
        ...current,
        result: {
          message: 'The route or viewport changed during capture. Reselect before sending.',
          status: QueueStatus.NeedsReselection,
        },
      }));

      return null;
    }

    updateItem(item.feedback.id, (current) => ({ ...current, capture: CaptureStatus.Captured }));

    try {
      await saveScreenshot(item.feedback.id, screenshot, signal);
      signal.throwIfAborted();
    } catch {
      signal.throwIfAborted();
      queueMessage =
        'The retry image could not be saved in this browser. Keep this tab open to retry.';
    }

    return screenshot;
  };

  const deliver = async (item: QueueItem) => {
    if (sending || activeOperation) {
      return;
    }

    const operation: DeliveryOperation = {
      captureWasReady: item.capture === CaptureStatus.Captured,
      controller: new AbortController(),
      itemId: item.feedback.id,
      phase: DeliveryPhase.Capture,
    };

    activeOperation = operation;
    const { signal } = operation.controller;
    sending = true;
    activePhase = DeliveryPhase.Capture;
    queueMessage = '';

    try {
      const screenshot = await captureFor(item, signal);

      if (!screenshot) {
        return;
      }

      signal.throwIfAborted();
      const sessionId = selectedSessionId[item.feedback.id];
      operation.phase = DeliveryPhase.Submit;
      activePhase = DeliveryPhase.Submit;

      const result = await submitFeedback({
        feedback: item.feedback,
        screenshot,
        ...(sessionId && { sessionId }),
      });

      if (activeOperation === operation) {
        updateItem(item.feedback.id, (current) => ({ ...current, result }));
      }
    } catch (error) {
      if (activeOperation !== operation) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Feedback delivery failed.';
      updateItem(item.feedback.id, (current) => ({
        ...current,
        result: {
          files: null,
          message,
          retry: current.capture === CaptureStatus.Captured ? RetryAction.Check : RetryAction.Send,
          status: DeliveryStatus.Failed,
        },
      }));
    } finally {
      if (activeOperation === operation) {
        activeOperation = null;
        activePhase = null;
        sending = false;
      }
    }
  };

  const removeItem = async (id: string) => {
    persist(queue.filter(({ feedback }) => feedback.id !== id));
    selectedSessionId = Object.fromEntries(
      Object.entries(selectedSessionId).filter(([sessionId]) => sessionId !== id),
    );

    try {
      await removeScreenshot(id);
    } catch {
      queueMessage = 'Feedback removed; its browser image cache could not be cleared.';
    }
  };
</script>

<svelte:document
  onkeydowncapture={onKeydown}
  onpointerdowncapture={onPointerDown}
  onpointermovecapture={onPointerMove}
  onpointerupcapture={onPointerUp}
  onpointercancelcapture={onPointerCancel}
  onclickcapture={onClick}
/>
<svelte:window onpagehide={stopDelivery} />

<div data-ui-feedback>
  {#if open}
    <aside
      class="card text-app-ink app-panel-soft fixed top-3.5 right-3.5 z-50 flex flex-col gap-3 overflow-auto rounded-xl p-4 text-sm shadow-xl"
      style:width={`min(${PANEL_WIDTH_REM}rem, calc(100vw - ${PANEL_EDGE_REM}rem))`}
      style:max-height={`calc(100vh - ${PANEL_EDGE_REM}rem)`}
      aria-label="Developer feedback"
      data-ui-feedback
    >
      <header class="flex items-center justify-between gap-2">
        <strong class="text-base">Developer feedback</strong>
        <button
          class="btn app-button-secondary"
          type="button"
          aria-label="Close feedback"
          onclick={() => {
            stopDelivery();
            open = false;
            cancelDraft();
          }}>×</button
        >
      </header>
      {#if selecting}
        <p class="text-body-muted m-0">
          Click an element, or drag to select an area. Press Escape to close feedback.
        </p>
      {:else if draft}
        <p class="text-body-muted m-0 text-xs wrap-break-word">
          {draft.selection.kind} · {draft.route} · {draft.viewport.width}×{draft.viewport.height}
        </p>
        {#if draft.selection.dom.kind !== 'unavailable'}
          <p class="text-body-muted m-0 text-xs wrap-break-word">
            DOM: {draft.selection.dom.tag}
            {draft.selection.dom.selector} · {draft.selection.dom.text || '(no text)'}
          </p>
        {:else}
          <p class="text-body-muted m-0 text-xs">DOM details unavailable for the selected area.</p>
        {/if}
        <p class="text-body-muted m-0 text-xs wrap-break-word">
          Bounds: {draft.selection.bounds.x}, {draft.selection.bounds.y} · {draft.selection.bounds
            .width}×{draft.selection.bounds.height}
          {#if draft.selection.source}
            · {draft.selection.source.file}:{draft.selection.source.line}:{draft.selection.source
              .column}
            {draft.selection.source.ancestor ? ' (ancestor)' : ''}{draft.selection.source.vendor
              ? ' (vendor)'
              : ''}
          {:else}
            · Source unavailable
          {/if}
        </p>
        <label class="font-semibold" for="feedback-note">What should we know?</label>
        <textarea
          class="textarea app-control-focus min-h-24 w-full resize-y"
          id="feedback-note"
          bind:value={note}
          rows="4"
          maxlength={LIMITS.note}
          placeholder="Describe the issue or idea"></textarea>
        <div class="flex justify-end gap-2">
          <button
            class="btn app-button-secondary"
            type="button"
            onclick={() => {
              cancelDraft();
              selecting = true;
            }}>Cancel</button
          >
          <button
            class="btn app-button-primary"
            type="button"
            disabled={!note.trim() || sending}
            onclick={saveDraft}>{editingId ? 'Save changes' : 'Queue note'}</button
          >
        </div>
      {:else}
        <p class="text-body-muted m-0">
          Click an element or drag across the page to add another feedback note.
        </p>
      {/if}

      <div class="border-card-border flex items-center justify-between gap-2 border-t pt-3 text-xs">
        <span
          >Open shortcut: <kbd class="badge preset-tonal-surface">{formatShortcut(shortcut)}</kbd
          ></span
        >
        <button class="btn app-button-secondary" type="button" onclick={() => (recording = true)}
          >{recording ? 'Press shortcut…' : 'Change'}</button
        >
      </div>
      {#if queueMessage}<p class="text-error-text m-0" role="status">{queueMessage}</p>{/if}
      {#if sending}
        <button class="btn app-button-secondary" type="button" onclick={stopDelivery}>
          {activePhase === DeliveryPhase.Submit ? 'Stop waiting for response' : 'Cancel capture'}
        </button>
      {/if}
      {#if queue.length}
        <section class="border-card-border border-t pt-2" aria-label="Feedback queue">
          <h2 class="m-0 text-sm font-semibold">Queue</h2>
          {#each queue as item (item.feedback.id)}
            <article class="border-card-border my-2 rounded-lg border p-2">
              <div class="flex items-center justify-between gap-2">
                <strong class="wrap-break-word">{item.feedback.note || 'Feedback'}</strong>
                <span class="text-body-muted text-xs"
                  >{item.result.status === QueueStatus.NeedsReselection
                    ? 'Select again'
                    : item.result.status}</span
                >
              </div>
              {#if 'files' in item.result && item.result.files}
                <p class="text-body-muted my-1 text-xs break-all">
                  Saved: {item.result.files.feedbackPath} · {item.result.files.screenshotPath}
                </p>
              {/if}
              {#if item.result.status === DeliveryStatus.Choose}
                <label class="my-1 block text-xs font-semibold" for={`session-${item.feedback.id}`}
                  >Session</label
                >
                <select
                  class="select app-control-focus min-h-11 w-full"
                  id={`session-${item.feedback.id}`}
                  value={selectedSessionId[item.feedback.id] ?? ''}
                  disabled={sending}
                  onchange={(event) => {
                    selectedSessionId[item.feedback.id] = event.currentTarget.value;
                  }}
                >
                  <option value="">Choose a session</option>
                  {#each item.result.sessions as session (session.id)}<option value={session.id}
                      >{session.label}</option
                    >{/each}
                </select>
              {/if}
              {#if 'message' in item.result && item.result.message}
                <p class="text-body-muted my-1 text-xs">{item.result.message}</p>
              {/if}
              <div class="mt-2 flex flex-wrap justify-end gap-2">
                {#if item.result.status === DeliveryStatus.Choose}
                  <button
                    class="btn app-button-primary"
                    type="button"
                    disabled={!selectedSessionId[item.feedback.id] || sending}
                    onclick={() => deliver(item)}>Send to session</button
                  >
                  <button
                    class="btn app-button-secondary"
                    type="button"
                    disabled={sending}
                    onclick={() => editItem(item)}>Edit</button
                  >
                {:else if item.result.status === DeliveryStatus.Failed}
                  <button
                    class="btn app-button-primary"
                    type="button"
                    disabled={sending}
                    onclick={() => deliver(item)}
                    >{item.result.retry === RetryAction.Check ? 'Check receipt' : 'Retry'}</button
                  >
                  <button
                    class="btn app-button-secondary"
                    type="button"
                    disabled={sending}
                    onclick={() => beginSelection(item.feedback.id)}>Reselect</button
                  >
                {:else if item.result.status === QueueStatus.NeedsReselection}
                  <button
                    class="btn app-button-primary"
                    type="button"
                    disabled={sending}
                    onclick={() => beginSelection(item.feedback.id)}>Reselect and retry</button
                  >
                {:else if item.result.status === QueueStatus.Queued}
                  <button
                    class="btn app-button-secondary"
                    type="button"
                    disabled={sending}
                    onclick={() => editItem(item)}>Edit</button
                  >
                  <button
                    class="btn app-button-primary"
                    type="button"
                    disabled={sending}
                    onclick={() => deliver(item)}>Send</button
                  >
                {/if}
                <button
                  class="btn app-button-secondary"
                  type="button"
                  disabled={sending}
                  onclick={() => removeItem(item.feedback.id)}>Remove</button
                >
              </div>
            </article>
          {/each}
        </section>
      {/if}
      <footer class="border-card-border text-body-muted border-t pt-2 text-xs">
        Send captures the visible app viewport. The development endpoint saves the screenshot
        locally. Retry images stay in this browser and submitted images remain in the local
        worktree.
      </footer>
    </aside>
  {/if}
  {#if selecting && drag && pointer}
    {const bounds = $derived(boundsFromPoints(drag.x, drag.y, pointer.x, pointer.y))}
    <div
      class="border-primary-700-300 bg-primary-700-300/20 pointer-events-none fixed z-40 box-border border-2"
      style:left={`${bounds.x}px`}
      style:top={`${bounds.y}px`}
      style:width={`${bounds.width}px`}
      style:height={`${bounds.height}px`}
    ></div>
  {/if}
</div>
