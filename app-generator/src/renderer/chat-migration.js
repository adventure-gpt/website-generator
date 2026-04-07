/**
 * chat-migration.js — Converts old flat-array chat format to the new
 * tree-based format. Runs automatically on first load of a legacy project.
 *
 * Old format:
 *   messages = [ { role, content (string), timestamp, tools?, attachments?, _live? }, ... ]
 *   forks = { version, forkPoints: { [rawIndex]: { activeBranch, branches: [{ messages, forks }] } } }
 *
 * New format (chat-tree-v1):
 *   { _format: 'chat-tree-v1', nodes: { id → node }, rootIds: [], activeChildMap: {} }
 *
 * Each node: { id, parentId, role, content: ContentBlock[], status, children: [], createdAt, metadata }
 */

(function () {
  'use strict';

  var uid = window.ChatState.uid;

  /**
   * Detect whether data needs migration.
   * Returns true for old flat arrays, false for new tree format.
   */
  function needsMigration(data) {
    if (!data) return false;
    if (data._format === 'chat-tree-v1') return false;
    if (Array.isArray(data)) return true;
    return false;
  }

  /**
   * Convert a single old message to content blocks.
   */
  function convertMessageContent(msg) {
    var blocks = [];

    // Convert tool entries to content blocks
    if (msg.tools && msg.tools.length > 0) {
      for (var t = 0; t < msg.tools.length; t++) {
        blocks.push({
          type: 'tool_use',
          name: msg.tools[t].name || 'tool',
          detail: msg.tools[t].detail || '',
        });
      }
    }

    // Convert attachments
    if (msg.attachments && msg.attachments.length > 0) {
      for (var a = 0; a < msg.attachments.length; a++) {
        var att = msg.attachments[a];
        blocks.push({
          type: 'attachment',
          attachType: att.type || 'file',
          name: att.name || 'file',
          dataUrl: att.dataUrl || null,
          content: att.content || null,
        });
      }
    }

    // Convert text content
    if (msg.content && msg.content.trim()) {
      if (msg.role === 'status') {
        blocks.push({ type: 'status', text: msg.content });
      } else {
        blocks.push({ type: 'text', text: msg.content });
      }
    }

    return blocks;
  }

  /**
   * Convert a flat array of messages into a linear chain of tree nodes.
   * Returns { nodes: {}, orderedIds: [], idByOldIndex: {} }.
   */
  function convertLinearChain(messages, startParentId) {
    var nodes = {};
    var orderedIds = [];
    var idByOldIndex = {};
    var parentId = startParentId || null;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      // Skip empty messages and leftover _live messages
      if (!msg) continue;
      if (msg._live && !msg.content && (!msg.tools || msg.tools.length === 0)) continue;

      var id = uid();
      var content = convertMessageContent(msg);

      var node = {
        id: id,
        parentId: parentId,
        role: msg.role || 'assistant',
        content: content,
        status: 'complete',
        children: [],
        createdAt: msg.timestamp || Date.now(),
        metadata: {},
      };

      // Remove the _live flag — everything migrated is complete
      delete node._live;

      nodes[id] = node;
      orderedIds.push(id);
      idByOldIndex[i] = id;

      // Link to parent
      if (parentId && nodes[parentId]) {
        nodes[parentId].children.push(id);
      }

      parentId = id;
    }

    return { nodes: nodes, orderedIds: orderedIds, idByOldIndex: idByOldIndex };
  }

  /**
   * Recursively migrate fork structures from the old index-based format
   * to tree branches. Modifies `nodes` in place and returns activeChildMap entries.
   *
   * @param {Object} nodes - The nodes map (modified in place)
   * @param {Object} idByOldIndex - Map of old array index → node ID (for the main chain)
   * @param {Object} forkPoints - Old fork data: { [rawIndex]: { activeBranch, branches: [...] } }
   * @param {number} indexOffset - Offset to apply to old indices (for nested forks within branches)
   * @returns {Object} activeChildMap entries to merge
   */
  function migrateForks(nodes, idByOldIndex, forkPoints, indexOffset) {
    if (!forkPoints) return {};
    var activeChildMap = {};
    indexOffset = indexOffset || 0;

    var forkKeys = Object.keys(forkPoints).map(Number).sort(function (a, b) { return a - b; });

    for (var fi = 0; fi < forkKeys.length; fi++) {
      var rawIndex = forkKeys[fi];
      var adjustedIndex = rawIndex + indexOffset;
      var forkData = forkPoints[rawIndex];
      if (!forkData || !forkData.branches || forkData.branches.length === 0) continue;

      // The node at this index is the fork point (the user message that was edited)
      var forkNodeId = idByOldIndex[adjustedIndex];
      if (!forkNodeId) continue;
      var forkNode = nodes[forkNodeId];
      if (!forkNode) continue;

      // The parent of the fork node is where branches attach
      var branchParentId = forkNode.parentId;

      for (var bi = 0; bi < forkData.branches.length; bi++) {
        var branch = forkData.branches[bi];
        if (!branch || !branch.messages || branch.messages.length === 0) continue;

        // Convert branch messages to a linear chain
        var branchResult = convertLinearChain(branch.messages, branchParentId);

        // Merge branch nodes into the main nodes map
        var branchIds = Object.keys(branchResult.nodes);
        for (var ni = 0; ni < branchIds.length; ni++) {
          var bid = branchIds[ni];
          nodes[bid] = branchResult.nodes[bid];
        }

        // Link the first node of the branch to the parent
        if (branchResult.orderedIds.length > 0) {
          var firstBranchNodeId = branchResult.orderedIds[0];
          if (branchParentId && nodes[branchParentId]) {
            // Only add if not already there (the main chain node is already a child)
            if (nodes[branchParentId].children.indexOf(firstBranchNodeId) === -1) {
              nodes[branchParentId].children.push(firstBranchNodeId);
            }
          }
        }

        // Recursively handle sub-forks within this branch
        if (branch.forks && Object.keys(branch.forks).length > 0) {
          var subActiveMap = migrateForks(
            nodes,
            branchResult.idByOldIndex,
            branch.forks,
            0 // branch messages start at index 0
          );
          for (var sk in subActiveMap) {
            activeChildMap[sk] = subActiveMap[sk];
          }
        }
      }

      // Set the active branch
      if (branchParentId) {
        var parentNode = nodes[branchParentId];
        if (parentNode) {
          var activeBr = forkData.activeBranch || 0;
          // activeBranch 0 = first branch (saved continuation), 1+ = alternatives
          // In the tree model, the original continuation is the first child (added during
          // linear chain creation), and branches are added after. So the mapping is:
          // active branch in old system maps to child index in the tree.
          if (activeBr >= 0 && activeBr < parentNode.children.length) {
            activeChildMap[branchParentId] = activeBr;
          }
        }
      }
    }

    return activeChildMap;
  }

  /**
   * Main migration function.
   * @param {Array} messages - Old flat message array
   * @param {Object|null} forks - Old fork data (from forks.json) or null
   * @returns {Object} Serialized ChatTree data ({ _format, nodes, rootIds, activeChildMap })
   */
  function migrate(messages, forks) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { _format: 'chat-tree-v1', nodes: {}, rootIds: [], activeChildMap: {} };
    }

    // Step 1: Convert main message chain to tree nodes
    var result = convertLinearChain(messages, null);

    // Step 2: Determine root IDs
    var rootIds = [];
    if (result.orderedIds.length > 0) {
      rootIds.push(result.orderedIds[0]);
    }

    // Step 3: Migrate forks
    var activeChildMap = {};
    if (forks && forks.forkPoints) {
      activeChildMap = migrateForks(result.nodes, result.idByOldIndex, forks.forkPoints, 0);
    }

    // Step 4: Set active root if there are multiple roots
    if (rootIds.length > 1) {
      activeChildMap['__root__'] = rootIds.length - 1;
    }

    return {
      _format: 'chat-tree-v1',
      nodes: result.nodes,
      rootIds: rootIds,
      activeChildMap: activeChildMap,
    };
  }

  // ── Exports ────────────────────────────────────────────────

  window.ChatMigration = {
    needsMigration: needsMigration,
    migrate: migrate,
  };
})();
