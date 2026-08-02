export * from './generated/action_subclasses.js';

// Hand-authored actions. Each needs its Load* anchor called from the server bootstrap, or the
// @RegisterClass decorator is tree-shaken away and the action exists in metadata with nothing
// behind it.
export * from './custom/generate-invoice.action.js';
export * from './custom/send-document.action.js';

// Shared services the actions compose. Exported so a consumer can render or deliver from code without
// going through the Actions dispatcher — which is the point of keeping the logic out of the actions.
export * from './services/invoice-renderer.js';
