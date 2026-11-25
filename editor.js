// Cake Walk: EDITOR and PLAYER
// Placeholder for Prompt 1. Prompt 2 adds import, the timeline and the preview here.
// The Worker (worker.js) will do decoding and drawing; this file drives the UI.

export const PLAYER = {
  ready: false
};

export const EDITOR = {
  // Called by app.js when the Editor screen opens. `ui` gives shared helpers (Sprinkle art, toasts).
  render(container, ui) {
    container.innerHTML = '';
    const empty = ui.emptyState(
      'The editor is getting glam.',
      'Import, the timeline and the preview arrive in the next build. Your projects will open here.'
    );
    container.appendChild(empty);
  },

  // Prompt 5 hooks every save through here. Nothing is open yet in Prompt 1.
  async saveOpenWork() {
    return true;
  }
};
