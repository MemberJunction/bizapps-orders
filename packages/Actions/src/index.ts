export * from './generated/action_subclasses.js';

// Hand-authored actions. Each needs its Load* anchor called from the server bootstrap, or the
// @RegisterClass decorator is tree-shaken away and the action exists in metadata with nothing
// behind it.
export * from './custom/generate-invoice.action.js';
