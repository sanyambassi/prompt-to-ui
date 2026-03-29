/**
 * Injects a WYSIWYG editing layer into HTML prototype content.
 * Enables contentEditable on the body and uses postMessage to
 * communicate changes back to the parent frame.
 *
 * Formatting commands are received via postMessage from the parent
 * toolbar (type: '__ptu_format_cmd').
 */

const EDITOR_SCRIPT = `
<style>
  body { cursor: text; }
  *::selection { background: rgba(99,102,241,0.25); }
  [contenteditable]:focus { outline: 2px solid rgba(99,102,241,0.4); outline-offset: 2px; border-radius: 2px; }
</style>
<script>
(function() {
  var debounceTimer = null;

  document.body.setAttribute('contenteditable', 'true');
  document.body.style.outline = 'none';

  document.body.addEventListener('dragstart', function(e) { e.preventDefault(); });

  // Report selection state to parent so toolbar can show active states
  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection();
    var hasSelection = sel && sel.toString().trim().length > 0 && !sel.isCollapsed;
    var state = {
      bold: false, italic: false, underline: false, strikeThrough: false,
      fontSize: '', fontName: '', foreColor: '', backColor: '',
      justifyLeft: false, justifyCenter: false, justifyRight: false,
      hasSelection: !!hasSelection,
    };
    try {
      state.bold = document.queryCommandState('bold');
      state.italic = document.queryCommandState('italic');
      state.underline = document.queryCommandState('underline');
      state.strikeThrough = document.queryCommandState('strikeThrough');
      state.justifyLeft = document.queryCommandState('justifyLeft');
      state.justifyCenter = document.queryCommandState('justifyCenter');
      state.justifyRight = document.queryCommandState('justifyRight');
      state.foreColor = document.queryCommandValue('foreColor');
      state.backColor = document.queryCommandValue('backColor');
    } catch(e) {}
    // Compute font from selection
    if (sel && sel.rangeCount > 0) {
      var node = sel.focusNode;
      if (node) {
        var el = node.nodeType === 3 ? node.parentElement : node;
        if (el) {
          var cs = window.getComputedStyle(el);
          state.fontSize = cs.fontSize || '';
          state.fontName = cs.fontFamily || '';
        }
      }
    }
    parent.postMessage({ type: '__ptu_selection_state', state: state }, '*');
  });

  // Listen for formatting commands from parent toolbar
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== '__ptu_format_cmd') return;
    var cmd = e.data.cmd;
    var value = e.data.value || null;

    switch (cmd) {
      case 'bold':
      case 'italic':
      case 'underline':
      case 'strikeThrough':
      case 'justifyLeft':
      case 'justifyCenter':
      case 'justifyRight':
      case 'justifyFull':
      case 'insertOrderedList':
      case 'insertUnorderedList':
      case 'undo':
      case 'redo':
      case 'removeFormat':
        document.execCommand(cmd, false, value);
        break;

      case 'foreColor':
        document.execCommand('foreColor', false, value);
        break;

      case 'backColor': {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) break;
        var range = sel.getRangeAt(0);
        var span = document.createElement('span');
        span.style.backgroundColor = value;
        try { range.surroundContents(span); } catch(ex) {
          document.execCommand('hiliteColor', false, value);
        }
        break;
      }

      case 'fontSize': {
        var sel2 = window.getSelection();
        if (!sel2 || sel2.isCollapsed) break;
        var range2 = sel2.getRangeAt(0);
        var span2 = document.createElement('span');
        span2.style.fontSize = value;
        try {
          range2.surroundContents(span2);
        } catch(ex2) {
          document.execCommand('fontSize', false, '7');
          document.querySelectorAll('font[size="7"]').forEach(function(el) {
            el.removeAttribute('size');
            el.style.fontSize = value;
          });
        }
        break;
      }

      case 'fontName': {
        // Dynamically load Google Font if needed
        var fontFamily = value;
        if (fontFamily && !document.querySelector('link[data-gfont="' + fontFamily + '"]')) {
          var safeFonts = ['Arial','Helvetica','Georgia','Times New Roman','Courier New','Verdana','system-ui','monospace','sans-serif','serif'];
          var isSafe = safeFonts.some(function(f) { return fontFamily.toLowerCase().indexOf(f.toLowerCase()) !== -1; });
          if (!isSafe) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontFamily) + ':wght@300;400;500;600;700&display=swap';
            link.setAttribute('data-gfont', fontFamily);
            document.head.appendChild(link);
          }
        }
        var sel3 = window.getSelection();
        if (!sel3 || sel3.isCollapsed) break;
        var range3 = sel3.getRangeAt(0);
        var span3 = document.createElement('span');
        span3.style.fontFamily = "'" + fontFamily + "', sans-serif";
        try {
          range3.surroundContents(span3);
        } catch(ex3) {
          document.execCommand('fontName', false, fontFamily);
        }
        break;
      }
    }
    scheduleSync();
  });

  function scheduleSync() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      var clone = document.documentElement.cloneNode(true);
      // Remove injected editor artifacts
      clone.querySelectorAll('style, script').forEach(function(el) {
        if (el.textContent && el.textContent.indexOf('__ptu') !== -1) el.remove();
      });
      var body = clone.querySelector('body');
      if (body) body.removeAttribute('contenteditable');
      parent.postMessage({ type: '__ptu_html_update', html: '<!DOCTYPE html>' + clone.outerHTML }, '*');
    }, 400);
  }

  document.body.addEventListener('input', function() {
    scheduleSync();
  });

  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a) e.preventDefault();
  }, true);
})();
<\/script>
`;

/**
 * Inject the live-editing layer into an HTML document string.
 * Appends before </body> (or at end if no closing body tag).
 */
export function injectLiveEditor(html: string): string {
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) {
    return html.slice(0, idx) + EDITOR_SCRIPT + html.slice(idx);
  }
  return html + EDITOR_SCRIPT;
}

/** Selection state reported by the iframe editor */
export type IframeSelectionState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  fontSize: string;
  fontName: string;
  foreColor: string;
  backColor: string;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  hasSelection: boolean;
};

/** Send a formatting command to the live-editing iframe */
export function sendFormatCommand(
  screenId: string,
  cmd: string,
  value?: string,
): void {
  const container = document.querySelector(
    `[data-live-edit-screen="${screenId}"]`,
  );
  const iframe = container?.querySelector("iframe") as HTMLIFrameElement | null;
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(
      { type: "__ptu_format_cmd", cmd, value: value ?? null },
      "*",
    );
  }
}
