/**
 * chat-renderer.js — DOM rendering for the chat UI.
 *
 * Renders from a ChatTree + TurnStateMachine. Supports:
 * - Full rebuild (project switch, edit, fork navigation)
 * - Incremental delta updates (streaming — only touches the streaming message)
 * - Fork navigation UI at branch points
 * - Content block rendering (text, tool_use, status, error, attachment)
 *
 * Security note: All user-generated text is rendered via textContent or
 * sanitized through escapeHtml before DOM insertion. Markdown rendering
 * uses a safe subset that escapes HTML entities before applying formatting.
 */

(function () {
  'use strict';

  var getTextContent = window.ChatState.getTextContent;
  var hasVisibleContent = window.ChatState.hasVisibleContent;

  // ── DOM Helpers ────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (key === 'className') node.className = attrs[key];
        else if (key === 'textContent') node.textContent = attrs[key];
        else if (key.startsWith('on') && typeof attrs[key] === 'function') node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        else node.setAttribute(key, attrs[key]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) {
          if (typeof children[i] === 'string') node.appendChild(document.createTextNode(children[i]));
          else node.appendChild(children[i]);
        }
      }
    }
    return node;
  }

  function scrollToBottom() {
    var c = document.getElementById('chat-messages');
    if (c) requestAnimationFrame(function () { c.scrollTop = c.scrollHeight; });
  }

  function svgIcon(pathD, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (cls) svg.setAttribute('class', cls);
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', pathD);
    svg.appendChild(p);
    return svg;
  }

  // ── Safe Markdown Rendering ────────────────────────────────
  // All text is HTML-escaped first, then formatting is applied to the
  // escaped output. This prevents XSS since user content never reaches
  // the DOM as raw HTML.

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function applySafeInlineFormatting(escaped) {
    // Bold
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic (avoid matching inside bold)
    escaped = escaped.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Inline code
    escaped = escaped.replace(/`([^`]+?)`/g, '<code>$1</code>');
    // Links — href is already escaped via escapeHtml, safe to use in attribute
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return escaped;
  }

  /**
   * Render markdown text to a DOM element. Text is escaped before any
   * formatting is applied, preventing injection.
   */
  function renderMarkdown(text) {
    if (!text) return el('div');
    var container = el('div', { className: 'markdown-content' });
    var lines = text.split('\n');
    var inCode = false;
    var codeLang = '';
    var codeLines = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Code block toggle
      if (line.trimStart().startsWith('```')) {
        if (!inCode) {
          inCode = true;
          codeLang = line.trimStart().slice(3).trim();
          codeLines = [];
        } else {
          var pre = el('pre', { className: 'code-block' });
          var code = el('code', { className: codeLang ? 'language-' + codeLang : '' });
          code.textContent = codeLines.join('\n'); // textContent = safe

          var copyBtn = el('button', { className: 'code-copy-btn', textContent: 'Copy' });
          (function (codeText) {
            copyBtn.addEventListener('click', function () {
              navigator.clipboard.writeText(codeText).then(function () {
                copyBtn.textContent = 'Copied!';
                setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
              });
            });
          })(codeLines.join('\n'));

          var codeWrapper = el('div', { className: 'code-block-wrapper' }, [pre, copyBtn]);
          pre.appendChild(code);
          container.appendChild(codeWrapper);
          inCode = false;
          codeLang = '';
          codeLines = [];
        }
        continue;
      }

      if (inCode) { codeLines.push(line); continue; }

      // Empty line
      if (!line.trim()) { container.appendChild(el('div', { className: 'md-spacer' })); continue; }

      // Headings
      var hMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (hMatch) {
        var h = document.createElement('h' + hMatch[1].length);
        h.className = 'md-heading';
        // Safe: escapeHtml then apply formatting
        var safeHeading = applySafeInlineFormatting(escapeHtml(hMatch[2]));
        h.insertAdjacentHTML('beforeend', safeHeading);
        container.appendChild(h);
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        container.appendChild(el('hr', { className: 'md-hr' }));
        continue;
      }

      // Unordered list
      var ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)/);
      if (ulMatch) {
        var li = document.createElement('li');
        var safeLi = applySafeInlineFormatting(escapeHtml(ulMatch[2]));
        li.insertAdjacentHTML('beforeend', safeLi);
        container.appendChild(el('ul', { className: 'md-list' }, [li]));
        continue;
      }

      // Ordered list
      var olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
      if (olMatch) {
        var oli = document.createElement('li');
        var safeOli = applySafeInlineFormatting(escapeHtml(olMatch[2]));
        oli.insertAdjacentHTML('beforeend', safeOli);
        container.appendChild(el('ol', { className: 'md-list' }, [oli]));
        continue;
      }

      // Paragraph
      var p = document.createElement('p');
      p.className = 'md-paragraph';
      var safePara = applySafeInlineFormatting(escapeHtml(line));
      p.insertAdjacentHTML('beforeend', safePara);
      container.appendChild(p);
    }

    // Unclosed code block
    if (inCode && codeLines.length > 0) {
      var pre2 = el('pre', { className: 'code-block' });
      var code2 = el('code');
      code2.textContent = codeLines.join('\n');
      pre2.appendChild(code2);
      container.appendChild(pre2);
    }

    return container;
  }

  // ── Content Block Rendering ────────────────────────────────

  function renderContentBlocks(blocks, isStreaming) {
    var container = el('div', { className: 'content-blocks' });

    var toolBlocks = [];
    var otherBlocks = [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].type === 'tool_use') toolBlocks.push(blocks[i]);
      else otherBlocks.push(blocks[i]);
    }

    // Tool activity (collapsible)
    if (toolBlocks.length > 0) {
      var toolsSummary = el('summary', { className: 'activity-summary' }, [
        isStreaming ? el('span', { className: 'activity-spinner' }) : el('span', { className: 'activity-done-icon', textContent: '\u2713' }),
        el('span', { className: 'activity-label', textContent: (isStreaming ? 'Working' : 'Worked') + '... (' + toolBlocks.length + ' step' + (toolBlocks.length > 1 ? 's' : '') + ')' }),
      ]);
      var toolsList = el('ul', { className: 'activity-list' });
      for (var ti = 0; ti < toolBlocks.length; ti++) {
        var dotClass = (isStreaming && ti === toolBlocks.length - 1) ? 'activity-dot spinning' : 'activity-dot done';
        toolsList.appendChild(el('li', { className: 'activity-entry' }, [
          el('span', { className: dotClass }),
          el('span', { className: 'activity-name', textContent: toolBlocks[ti].name }),
        ]));
      }
      container.appendChild(el('details', { className: 'activity-block', open: isStreaming ? 'true' : undefined }, [toolsSummary, toolsList]));
    }

    // Text, status, error, attachment
    for (var j = 0; j < otherBlocks.length; j++) {
      var block = otherBlocks[j];
      switch (block.type) {
        case 'text':
          if (block.text) container.appendChild(renderMarkdown(block.text));
          break;
        case 'status':
          container.appendChild(el('div', { className: 'content-status', textContent: block.text }));
          break;
        case 'error':
          container.appendChild(el('div', { className: 'content-error', textContent: block.text }));
          break;
        case 'attachment':
          if (block.attachType === 'image' && block.dataUrl) {
            container.appendChild(el('img', { className: 'attachment-image', src: block.dataUrl, alt: block.name || 'image' }));
          } else {
            container.appendChild(el('span', { className: 'attachment-badge', textContent: '\uD83D\uDCCE ' + (block.name || 'file') }));
          }
          break;
      }
    }

    return container;
  }

  // ── Message Bubble Creation ────────────────────────────────

  function createUserBubble(node, callbacks) {
    var wrapper = el('div', { className: 'message message-user', 'data-msg-id': node.id });
    var text = getTextContent(node.content);
    var bubble = el('div', { className: 'message-bubble' });

    // Attachments above text
    for (var i = 0; i < node.content.length; i++) {
      var block = node.content[i];
      if (block.type === 'attachment') {
        if (block.attachType === 'image' && block.dataUrl) {
          bubble.appendChild(el('img', { className: 'attachment-image', src: block.dataUrl, alt: block.name || 'image' }));
        } else {
          bubble.appendChild(el('span', { className: 'attachment-badge', textContent: '\uD83D\uDCCE ' + (block.name || 'file') }));
        }
      }
    }

    if (text) {
      var textDiv = el('div');
      textDiv.textContent = text;
      bubble.appendChild(textDiv);
    }

    // Actions
    var actions = el('div', { className: 'message-actions' });

    var editBtn = el('button', { className: 'message-action-btn', title: 'Edit & resend' });
    editBtn.appendChild(svgIcon('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'action-icon'));
    editBtn.addEventListener('click', function () {
      if (callbacks && callbacks.onEdit) callbacks.onEdit(node.id, text);
    });
    actions.appendChild(editBtn);

    var copyBtn = el('button', { className: 'message-action-btn', title: 'Copy' });
    copyBtn.appendChild(svgIcon('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'action-icon'));
    copyBtn.addEventListener('click', function () { navigator.clipboard.writeText(text); });
    actions.appendChild(copyBtn);

    wrapper.appendChild(el('div', { className: 'message-row' }, [bubble, actions]));
    return wrapper;
  }

  function createAssistantBubble(node) {
    var wrapper = el('div', { className: 'message message-assistant', 'data-msg-id': node.id });
    var contentDiv = renderContentBlocks(node.content, false);
    var text = getTextContent(node.content);

    var actions = el('div', { className: 'message-actions' });
    if (text) {
      var copyBtn = el('button', { className: 'message-action-btn', title: 'Copy' });
      copyBtn.appendChild(svgIcon('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'action-icon'));
      copyBtn.addEventListener('click', function () { navigator.clipboard.writeText(text); });
      actions.appendChild(copyBtn);
    }

    wrapper.appendChild(el('div', { className: 'message-row' }, [
      el('div', { className: 'message-bubble' }, [contentDiv]),
      actions,
    ]));
    return wrapper;
  }

  function createStreamingBubble(node) {
    var wrapper = el('div', { className: 'message message-assistant streaming', 'data-msg-id': node.id });
    var contentDiv = renderContentBlocks(node.content, true);
    var bubble = el('div', { className: 'message-bubble' }, [contentDiv]);

    bubble.appendChild(el('div', { className: 'thinking-indicator' }, [
      el('span', { className: 'thinking-dot' }),
      el('span', { className: 'thinking-dot' }),
      el('span', { className: 'thinking-dot' }),
    ]));

    wrapper.appendChild(el('div', { className: 'message-row' }, [bubble]));
    return wrapper;
  }

  function createStatusBubble(text) {
    return el('div', { className: 'message message-status' }, [
      el('span', { textContent: text }),
    ]);
  }

  function createThinkingIndicator() {
    return el('div', { className: 'message message-assistant streaming persistent-thinking', 'data-msg-id': '__thinking__' }, [
      el('div', { className: 'message-row' }, [
        el('div', { className: 'message-bubble' }, [
          el('div', { className: 'thinking-indicator' }, [
            el('span', { className: 'thinking-dot' }),
            el('span', { className: 'thinking-dot' }),
            el('span', { className: 'thinking-dot' }),
          ]),
        ]),
      ]),
    ]);
  }

  // ── Fork Navigator ─────────────────────────────────────────

  function createForkNavigator(nodeId, branchInfo, callbacks) {
    var nav = el('div', { className: 'fork-navigator' });

    var prevBtn = el('button', { className: 'fork-nav-btn', textContent: '\u2039', title: 'Previous branch' });
    prevBtn.disabled = branchInfo.active <= 0;
    prevBtn.addEventListener('click', function () {
      if (callbacks && callbacks.onSwitchBranch && branchInfo.active > 0) {
        callbacks.onSwitchBranch(branchInfo.parentId, branchInfo.active - 1);
      }
    });

    var label = el('span', { className: 'fork-nav-label', textContent: (branchInfo.active + 1) + ' / ' + branchInfo.total });

    var nextBtn = el('button', { className: 'fork-nav-btn', textContent: '\u203A', title: 'Next branch' });
    nextBtn.disabled = branchInfo.active >= branchInfo.total - 1;
    nextBtn.addEventListener('click', function () {
      if (callbacks && callbacks.onSwitchBranch && branchInfo.active < branchInfo.total - 1) {
        callbacks.onSwitchBranch(branchInfo.parentId, branchInfo.active + 1);
      }
    });

    nav.appendChild(prevBtn);
    nav.appendChild(label);
    nav.appendChild(nextBtn);
    return nav;
  }

  // ── Welcome Screen ─────────────────────────────────────────

  function createWelcome(callbacks) {
    var wrapper = el('div', { className: 'welcome-container' });
    wrapper.appendChild(el('h2', { className: 'welcome-heading', textContent: 'What do you want to build?' }));

    var chips = ['A portfolio website', 'A landing page for my business', 'A recipe organizer', 'A budgeting tool'];
    var chipContainer = el('div', { className: 'welcome-chips' });
    for (var i = 0; i < chips.length; i++) {
      (function (chipText) {
        var chip = el('button', { className: 'welcome-chip', textContent: chipText });
        chip.addEventListener('click', function () {
          if (callbacks && callbacks.onChipClick) callbacks.onChipClick(chipText);
        });
        chipContainer.appendChild(chip);
      })(chips[i]);
    }
    wrapper.appendChild(chipContainer);
    return wrapper;
  }

  // ── Full Chat Render ───────────────────────────────────────

  function renderFullChat(tree, turnState, projectName, callbacks) {
    var container = document.getElementById('chat-messages');
    if (!container) return;
    container.textContent = '';

    var path = tree.getActivePath();
    if (path.length === 0) {
      container.appendChild(createWelcome(callbacks));
      return;
    }

    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node.role === 'assistant' && !hasVisibleContent(node.content) && node.status === 'complete') continue;

      if (node.role === 'user') {
        container.appendChild(createUserBubble(node, callbacks));
      } else if (node.role === 'assistant' && node.status === 'streaming') {
        container.appendChild(createStreamingBubble(node));
      } else if (node.role === 'assistant') {
        container.appendChild(createAssistantBubble(node));
      } else if (node.role === 'status') {
        var statusText = getTextContent(node.content) || '';
        if (statusText) container.appendChild(createStatusBubble(statusText));
      }

      var branchInfo = tree.getBranchInfo(node.id);
      if (branchInfo && branchInfo.total > 1) {
        container.appendChild(createForkNavigator(node.id, branchInfo, callbacks));
      }
    }

    if (turnState.isGenerating()) {
      var lastEl = container.lastElementChild;
      var hasStreamingEl = lastEl && lastEl.classList && lastEl.classList.contains('streaming');
      if (!hasStreamingEl) {
        container.appendChild(createThinkingIndicator());
      }
    }

    scrollToBottom();
  }

  // ── Incremental Delta Render ───────────────────────────────

  function renderDelta(nodeId, tree, turnState, callbacks) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var node = tree.getNode(nodeId);
    if (!node) return;

    var existing = container.querySelector('[data-msg-id="' + nodeId + '"]');

    if (existing) {
      var newBubble = createStreamingBubble(node);
      existing.parentNode.replaceChild(newBubble, existing);
      var thinkingEl = container.querySelector('[data-msg-id="__thinking__"]');
      if (thinkingEl) thinkingEl.remove();
    } else {
      var thinkingEl2 = container.querySelector('[data-msg-id="__thinking__"]');
      if (thinkingEl2) thinkingEl2.remove();
      container.appendChild(createStreamingBubble(node));
    }

    scrollToBottom();
  }

  function finalizeStreamingBubble(nodeId, tree) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var node = tree.getNode(nodeId);
    if (!node) return;

    var existing = container.querySelector('[data-msg-id="' + nodeId + '"]');
    if (existing) {
      var finalBubble = createAssistantBubble(node);
      existing.parentNode.replaceChild(finalBubble, existing);
    }

    var thinkingEl = container.querySelector('[data-msg-id="__thinking__"]');
    if (thinkingEl) thinkingEl.remove();
  }

  // ── Exports ────────────────────────────────────────────────

  window.ChatRenderer = {
    renderFullChat: renderFullChat,
    renderDelta: renderDelta,
    finalizeStreamingBubble: finalizeStreamingBubble,
    scrollToBottom: scrollToBottom,
    renderMarkdown: renderMarkdown,
    createWelcome: createWelcome,
  };
})();
