/**
 * chat-state.js — Tree-based message store and turn state machine.
 *
 * Replaces the old flat array + _live flag system with:
 * - A tree of message nodes (parent/child relationships for branching)
 * - Content blocks instead of raw strings
 * - A finite state machine for turn management
 * - Per-project state orchestration
 *
 * Zero DOM dependencies — pure data logic.
 */

(function () {
  'use strict';

  // ── Utilities ──────────────────────────────────────────────

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── Content Block Helpers ──────────────────────────────────

  /**
   * Content block types:
   *   { type: 'text', text: string }
   *   { type: 'tool_use', name: string, detail: string }
   *   { type: 'status', text: string }
   *   { type: 'error', text: string }
   *   { type: 'attachment', attachType: 'image'|'file', name: string, dataUrl?: string, content?: string }
   */

  function textBlock(text) { return { type: 'text', text: text || '' }; }
  function toolBlock(name, detail) { return { type: 'tool_use', name: name, detail: detail || '' }; }
  function statusBlock(text) { return { type: 'status', text: text || '' }; }
  function errorBlock(text) { return { type: 'error', text: text || '' }; }

  function getTextContent(blocks) {
    if (!blocks || !blocks.length) return '';
    return blocks
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('');
  }

  function hasVisibleContent(blocks) {
    if (!blocks || !blocks.length) return false;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'text' && b.text && b.text.trim()) return true;
      if (b.type === 'tool_use') return true;
      if (b.type === 'attachment') return true;
      if (b.type === 'error' && b.text) return true;
    }
    return false;
  }

  // ── ChatTree ───────────────────────────────────────────────

  /**
   * Tree-based message store. Each message is a node with:
   *   id, parentId, role, content[], status, children[], createdAt, metadata
   *
   * The "active path" is the sequence of nodes from a root to the deepest
   * active leaf, following the active child at each fork point.
   */
  function ChatTree() {
    this.nodes = {};           // id → node
    this.rootIds = [];         // top-level message IDs
    this.activeChildMap = {};  // nodeId → active child index in that node's children[]
  }

  ChatTree.prototype.getNode = function (id) {
    return this.nodes[id] || null;
  };

  ChatTree.prototype.addMessage = function (parentId, role, content, status) {
    var node = {
      id: uid(),
      parentId: parentId || null,
      role: role,
      content: content || [],
      status: status || 'complete',
      children: [],
      createdAt: Date.now(),
      metadata: {},
    };
    this.nodes[node.id] = node;

    if (!parentId) {
      this.rootIds.push(node.id);
    } else {
      var parent = this.nodes[parentId];
      if (parent) {
        parent.children.push(node.id);
        // New child becomes active
        this.activeChildMap[parentId] = parent.children.length - 1;
      }
    }
    return node;
  };

  /**
   * Get the active path — ordered array of nodes from root to active leaf.
   */
  ChatTree.prototype.getActivePath = function () {
    if (this.rootIds.length === 0) return [];

    // Find the active root
    var activeRootIdx = this.activeChildMap['__root__'];
    if (activeRootIdx === undefined || activeRootIdx >= this.rootIds.length) {
      activeRootIdx = this.rootIds.length - 1;
    }

    var path = [];
    var currentId = this.rootIds[activeRootIdx];

    while (currentId) {
      var node = this.nodes[currentId];
      if (!node) break;
      path.push(node);

      if (node.children.length === 0) break;

      var activeIdx = this.activeChildMap[node.id];
      if (activeIdx === undefined || activeIdx >= node.children.length) {
        activeIdx = node.children.length - 1;
      }
      currentId = node.children[activeIdx];
    }

    return path;
  };

  /**
   * Get the ID of the deepest node on the active path.
   */
  ChatTree.prototype.getActiveLeafId = function () {
    var path = this.getActivePath();
    return path.length > 0 ? path[path.length - 1].id : null;
  };

  /**
   * Find the node that is currently streaming (status === 'streaming').
   */
  ChatTree.prototype.getStreamingNode = function () {
    var path = this.getActivePath();
    for (var i = path.length - 1; i >= 0; i--) {
      if (path[i].status === 'streaming') return path[i];
    }
    return null;
  };

  /**
   * Append a text delta to a node. Finds the last text block and appends,
   * or creates a new text block if the last block is not text.
   */
  ChatTree.prototype.appendTextDelta = function (nodeId, delta) {
    var node = this.nodes[nodeId];
    if (!node) return;
    var blocks = node.content;
    var last = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    if (last && last.type === 'text') {
      last.text += delta;
    } else {
      blocks.push(textBlock(delta));
    }
  };

  /**
   * Append a content block to a node.
   */
  ChatTree.prototype.appendContentBlock = function (nodeId, block) {
    var node = this.nodes[nodeId];
    if (!node) return;
    node.content.push(block);
  };

  /**
   * Finalize a streaming node — set status to complete (or error).
   */
  ChatTree.prototype.finalizeNode = function (nodeId, status) {
    var node = this.nodes[nodeId];
    if (!node) return;
    node.status = status || 'complete';
  };

  /**
   * Edit a message: create a new sibling (child of the same parent) with
   * the new content. The new sibling becomes the active branch.
   * Returns the new node.
   */
  ChatTree.prototype.editMessage = function (nodeId, newContent) {
    var original = this.nodes[nodeId];
    if (!original) return null;

    var parentId = original.parentId;
    // Create sibling with same role
    var newNode = this.addMessage(parentId, original.role, newContent, 'complete');

    // If this is a root message, handle root-level branching
    if (!parentId) {
      // addMessage already pushed to rootIds and set activeChildMap['__root__']... but we
      // actually need to manage root branching separately since roots don't have a parent node.
      // The active root is tracked via activeChildMap['__root__'].
      this.activeChildMap['__root__'] = this.rootIds.length - 1;
    }

    return newNode;
  };

  /**
   * Switch the active branch at a fork point.
   * parentId: the node whose children represent branches.
   *           Use '__root__' for root-level branching.
   * childIndex: which child to make active.
   */
  ChatTree.prototype.switchBranch = function (parentId, childIndex) {
    if (parentId === '__root__') {
      if (childIndex >= 0 && childIndex < this.rootIds.length) {
        this.activeChildMap['__root__'] = childIndex;
      }
      return;
    }
    var parent = this.nodes[parentId];
    if (!parent) return;
    if (childIndex >= 0 && childIndex < parent.children.length) {
      this.activeChildMap[parentId] = childIndex;
    }
  };

  /**
   * Get branch info for a node (how many siblings, which is active).
   * Returns { total, active, parentId } or null if no branching.
   */
  ChatTree.prototype.getBranchInfo = function (nodeId) {
    var node = this.nodes[nodeId];
    if (!node) return null;

    var parentId = node.parentId;
    var siblings;
    var mapKey;

    if (!parentId) {
      // Root-level branching
      siblings = this.rootIds;
      mapKey = '__root__';
    } else {
      var parent = this.nodes[parentId];
      if (!parent) return null;
      siblings = parent.children;
      mapKey = parentId;
    }

    if (siblings.length <= 1) return null;

    var activeIdx = this.activeChildMap[mapKey];
    if (activeIdx === undefined) activeIdx = siblings.length - 1;
    var myIdx = siblings.indexOf(nodeId);

    return {
      total: siblings.length,
      active: myIdx,
      parentId: mapKey,
    };
  };

  /**
   * Remove all nodes that descend from a given node (inclusive).
   * Used when deleting a branch.
   */
  ChatTree.prototype._removeSubtree = function (nodeId) {
    var node = this.nodes[nodeId];
    if (!node) return;
    for (var i = 0; i < node.children.length; i++) {
      this._removeSubtree(node.children[i]);
    }
    delete this.nodes[nodeId];
    delete this.activeChildMap[nodeId];
  };

  /**
   * Clear the entire tree.
   */
  ChatTree.prototype.clear = function () {
    this.nodes = {};
    this.rootIds = [];
    this.activeChildMap = {};
  };

  /**
   * Serialize to a plain object for persistence.
   */
  ChatTree.prototype.serialize = function () {
    return {
      _format: 'chat-tree-v1',
      nodes: this.nodes,
      rootIds: this.rootIds,
      activeChildMap: this.activeChildMap,
    };
  };

  /**
   * Deserialize from a plain object. Returns a new ChatTree.
   */
  ChatTree.deserialize = function (data) {
    var tree = new ChatTree();
    if (!data || !data.nodes) return tree;
    tree.nodes = data.nodes;
    tree.rootIds = data.rootIds || [];
    tree.activeChildMap = data.activeChildMap || {};
    return tree;
  };

  // ── Turn State Machine ─────────────────────────────────────

  var TURN_STATES = {
    idle: true,
    waiting_for_assistant: true,
    assistant_streaming: true,
    assistant_tool_use: true,
    error: true,
  };

  var TRANSITIONS = {
    idle:                    { user_send: 'waiting_for_assistant' },
    waiting_for_assistant:   { text: 'assistant_streaming', tool_use: 'assistant_tool_use', done: 'idle', error: 'error' },
    assistant_streaming:     { text: 'assistant_streaming', tool_use: 'assistant_tool_use', done: 'idle', error: 'error', result: 'assistant_streaming' },
    assistant_tool_use:      { text: 'assistant_streaming', tool_use: 'assistant_tool_use', done: 'idle', error: 'error' },
    error:                   { user_send: 'waiting_for_assistant' },
  };

  function TurnStateMachine() {
    this._state = 'idle';
  }

  TurnStateMachine.prototype.getState = function () {
    return this._state;
  };

  TurnStateMachine.prototype.transition = function (event) {
    // 'stop' always goes to idle regardless of current state
    if (event === 'stop') {
      this._state = 'idle';
      return this._state;
    }
    var table = TRANSITIONS[this._state];
    if (table && table[event]) {
      this._state = table[event];
    }
    // If no valid transition, stay in current state (forgiving — don't throw)
    return this._state;
  };

  TurnStateMachine.prototype.isGenerating = function () {
    return this._state !== 'idle' && this._state !== 'error';
  };

  TurnStateMachine.prototype.reset = function () {
    this._state = 'idle';
  };

  // ── Per-Project State Manager ──────────────────────────────

  function ChatStateManager() {
    this._stores = {}; // projectName → { tree, turnState, messageQueue, loaded }
  }

  ChatStateManager.prototype.getOrCreate = function (projectName) {
    if (!this._stores[projectName]) {
      this._stores[projectName] = {
        tree: new ChatTree(),
        turnState: new TurnStateMachine(),
        messageQueue: [],
        loaded: false,
      };
    }
    return this._stores[projectName];
  };

  ChatStateManager.prototype.getTree = function (projectName) {
    return this.getOrCreate(projectName).tree;
  };

  ChatStateManager.prototype.getTurnState = function (projectName) {
    return this.getOrCreate(projectName).turnState;
  };

  /**
   * Load chat from disk. Handles migration from old format automatically.
   * Returns a promise.
   */
  ChatStateManager.prototype.loadFromDisk = function (projectName) {
    var self = this;
    var store = this.getOrCreate(projectName);
    if (store.loaded) return Promise.resolve(store);

    return window.api.loadChat(projectName).then(function (data) {
      if (!data || (Array.isArray(data) && data.length === 0) || (data._format && !Object.keys(data.nodes || {}).length)) {
        store.loaded = true;
        return store;
      }

      // New format — deserialize directly
      if (data._format === 'chat-tree-v1') {
        store.tree = ChatTree.deserialize(data);
        store.loaded = true;
        return store;
      }

      // Old format — needs migration
      if (Array.isArray(data)) {
        return window.api.loadForksLegacy(projectName).then(function (forks) {
          // Back up old files before migrating
          return window.api.backupChat(projectName).then(function () {
            var migrated = window.ChatMigration.migrate(data, forks);
            store.tree = ChatTree.deserialize(migrated);
            store.loaded = true;
            // Save migrated format to disk
            return self.saveToDisk(projectName).then(function () {
              return store;
            });
          });
        }).catch(function () {
          // If legacy forks can't be loaded, migrate without them
          var migrated = window.ChatMigration.migrate(data, null);
          store.tree = ChatTree.deserialize(migrated);
          store.loaded = true;
          return self.saveToDisk(projectName).then(function () {
            return store;
          });
        });
      }

      // Unknown format
      store.loaded = true;
      return store;
    }).catch(function () {
      store.loaded = true;
      return store;
    });
  };

  /**
   * Save chat tree to disk.
   */
  ChatStateManager.prototype.saveToDisk = function (projectName) {
    var store = this.getOrCreate(projectName);
    var data = store.tree.serialize();
    return window.api.saveChat(projectName, data);
  };

  /**
   * Remove a project from the in-memory store.
   */
  ChatStateManager.prototype.remove = function (projectName) {
    delete this._stores[projectName];
  };

  /**
   * Force-reload a project's chat (e.g., after import).
   */
  ChatStateManager.prototype.invalidate = function (projectName) {
    if (this._stores[projectName]) {
      this._stores[projectName].loaded = false;
    }
  };

  // ── Exports ────────────────────────────────────────────────

  window.ChatState = {
    ChatTree: ChatTree,
    TurnStateMachine: TurnStateMachine,
    ChatStateManager: ChatStateManager,
    // Content block helpers
    textBlock: textBlock,
    toolBlock: toolBlock,
    statusBlock: statusBlock,
    errorBlock: errorBlock,
    getTextContent: getTextContent,
    hasVisibleContent: hasVisibleContent,
    uid: uid,
  };
})();
