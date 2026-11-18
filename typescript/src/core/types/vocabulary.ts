/**
 * SemanticDOM & Semantic State Graph Types
 * Implementing ISO/IEC Draft Standard for Agentic Web Interoperability
 *
 * @packageDocumentation
 */

/**
 * Semantic role categories following ARIA specification
 */
export type SemanticRole =
  | 'document'
  | 'article'
  | 'section'
  | 'navigation'
  | 'main'
  | 'header'
  | 'footer'
  | 'aside'
  | 'form'
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'listbox'
  | 'option'
  | 'menu'
  | 'menuitem'
  | 'dialog'
  | 'alert'
  | 'status'
  | 'progressbar'
  | 'slider'
  | 'tablist'
  | 'tab'
  | 'tabpanel'
  | 'tree'
  | 'treeitem'
  | 'grid'
  | 'gridcell'
  | 'row'
  | 'rowgroup'
  | 'columnheader'
  | 'rowheader'
  | 'img'
  | 'figure'
  | 'table'
  | 'heading'
  | 'list'
  | 'listitem'
  | 'landmark'
  | 'region'
  | 'group'
  | 'separator'
  | 'tooltip'
  | 'search'
  | 'switch'
  | 'combobox'
  | 'searchbox'
  | 'spinbutton'
  | 'audio'
  | 'video'
  | 'generic';

/**
 * Semantic intent types for agent understanding
 */
export type SemanticIntent =
  | 'navigate'
  | 'submit'
  | 'input'
  | 'toggle'
  | 'select'
  | 'expand'
  | 'collapse'
  | 'open'
  | 'close'
  | 'search'
  | 'filter'
  | 'sort'
  | 'paginate'
  | 'scroll'
  | 'upload'
  | 'download'
  | 'play'
  | 'pause'
  | 'stop'
  | 'mute'
  | 'unmute'
  | 'zoom'
  | 'edit'
  | 'delete'
  | 'create'
  | 'copy'
  | 'paste'
  | 'undo'
  | 'redo'
  | 'confirm'
  | 'cancel'
  | 'dismiss'
  | 'info'
  | 'warn'
  | 'error'
  | 'action';

/**
 * State types for Semantic State Graph
 */
export type StateType =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'disabled'
  | 'enabled'
  | 'selected'
  | 'unselected'
  | 'expanded'
  | 'collapsed'
  | 'checked'
  | 'unchecked'
  | 'indeterminate'
  | 'focused'
  | 'blurred'
  | 'valid'
  | 'invalid'
  | 'required'
  | 'optional'
  | 'readonly'
  | 'editable'
  | 'visible'
  | 'hidden'
  | 'dragging'
  | 'dropping';

/**
 * Semantic node identifier - unique within document context.
 * Format: `sdom-[prefix-]<role>-<hash>` where the hash is derived from the
 * element's structural position, so the same DOM always yields the same IDs.
 */
export type SemanticId = `sdom-${string}`;

