// Import all tool modules to trigger auto-registration.
// Each module's top-level tool() call registers into the global registry.
import './client/question.js';

export type { ToolDefinition, ToolTag } from './tool.js';
// Re-export the registry functions as the public API
export { getRegistry, getToolByName, getTools, getToolsByTag } from './tool.js';
