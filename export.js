// Cake Walk: EXPORT
// Placeholder for Prompt 1. Prompt 3 adds the export screen, sharing and the spec check here.
// Reminder for Prompt 3: iOS pauses a web app as soon as it leaves the screen, so exports
// only run while Cake Walk is open and on screen.

export const EXPORT = {
  running: false,

  render(container, ui) {
    container.innerHTML = '';
    container.appendChild(ui.emptyState('Export is coming soon.', 'Keep Cake Walk open while it exports. Leaving the app pauses the export.'));
  }
};
