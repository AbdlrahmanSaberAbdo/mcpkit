import {
  maskForDisplay,
  serializedJsonLength,
  LARGE_PAYLOAD_BYTES,
  LARGE_PREVIEW_CHARS,
  MASK_STORAGE_KEY,
  DEFAULT_MASK_ENABLED,
} from "./mask-json.js";

(function () {
  const traceBody = document.getElementById("trace-body");
  const emptyState = document.getElementById("empty-state");
  const detailPanel = document.getElementById("detail-panel");
  const detailTitle = document.getElementById("detail-title");
  const detailMeta = document.getElementById("detail-meta");
  const detailRequest = document.getElementById("detail-request");
  const detailResponse = document.getElementById("detail-response");
  const detailRequestToolbar = document.getElementById("detail-request-toolbar");
  const detailResponseToolbar = document.getElementById("detail-response-toolbar");
  const detailClose = document.getElementById("detail-close");
  const maskSensitiveEl = document.getElementById("mask-sensitive");
  const searchInput = document.getElementById("search");
  const filterType = document.getElementById("filter-type");
  const filterServer = document.getElementById("filter-server");
  const filterStatus = document.getElementById("filter-status");
  const filterDirection = document.getElementById("filter-direction");
  const toggleScroll = document.getElementById("toggle-scroll");
  const clearBtn = document.getElementById("clear-btn");
  const statusEl = document.getElementById("status");
  const tableContainer = document.getElementById("table-container");

  let traces = [];
  let autoScroll = true;
  let selectedId = null;
  let ws = null;

  /** @type {Set<string>} */
  const expandedPayload = new Set();

  const ROW_HEIGHT = 38;
  const SCROLL_BUFFER_ROWS = 8;
  let scrollScheduled = false;

  function initMaskToggle() {
    var stored = localStorage.getItem(MASK_STORAGE_KEY);
    if (stored !== null) {
      maskSensitiveEl.checked = stored === "1";
    } else {
      maskSensitiveEl.checked = DEFAULT_MASK_ENABLED;
    }
    maskSensitiveEl.addEventListener("change", function () {
      localStorage.setItem(MASK_STORAGE_KEY, maskSensitiveEl.checked ? "1" : "0");
      var t = traces.find(function (x) {
        return x.id === selectedId;
      });
      if (t) selectTrace(t);
    });
  }

  initMaskToggle();

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getMaskOpts() {
    return { enabled: maskSensitiveEl.checked };
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws/traces`);

    ws.onopen = function () {
      statusEl.textContent = "connected";
      statusEl.className = "status connected";
    };

    ws.onclose = function () {
      statusEl.textContent = "disconnected";
      statusEl.className = "status disconnected";
      setTimeout(connect, 2000);
    };

    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      if (msg.type === "history") {
        traces = msg.traces;
        traces.forEach(function (t) {
          registerServer(t.server);
        });
        traces.forEach(function (t) {
          if (t.paired_with && t.direction === "server_to_client") {
            var req = traces.find(function (r) {
              return r.id === t.paired_with;
            });
            if (req) {
              req.status = t.status;
              req.latency_ms = t.latency_ms;
              req.paired_with = t.id;
            }
          }
        });
        render();
      } else if (msg.type === "trace") {
        traces.push(msg.trace);
        registerServer(msg.trace.server);
        updatePairing(msg.trace);
        render();
        if (autoScroll) {
          tableContainer.scrollTop = tableContainer.scrollHeight;
        }
      }
    };
  }

  var knownServers = new Set();
  function registerServer(serverName) {
    if (!serverName || knownServers.has(serverName)) return;
    knownServers.add(serverName);
    var opt = document.createElement("option");
    opt.value = serverName;
    opt.textContent = serverName;
    filterServer.appendChild(opt);
  }

  function updatePairing(newTrace) {
    if (newTrace.paired_with) {
      for (var i = traces.length - 2; i >= 0; i--) {
        if (traces[i].id === newTrace.paired_with) {
          traces[i].paired_with = newTrace.id;
          traces[i].latency_ms = newTrace.latency_ms;
          traces[i].status = newTrace.status;
          break;
        }
      }
    }
    render();
    var t = traces.find(function (x) {
      return x.id === selectedId;
    });
    if (t) selectTrace(t);
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function matchesFilter(trace) {
    var search = searchInput.value.toLowerCase();
    var type = filterType.value;
    var server = filterServer.value;
    var status = filterStatus.value;
    var direction = filterDirection.value;

    var isToolCall = trace.method === "tools/call";
    var isRequest = trace.direction === "client_to_server";
    if (type === "tools_only" && (!isToolCall || !isRequest)) return false;
    if (type === "protocol" && isToolCall) return false;
    if (server && trace.server !== server) return false;
    if (status && trace.status !== status) return false;
    if (direction && trace.direction !== direction) return false;
    if (search) {
      var haystack = [
        trace.method || "",
        trace.params && trace.params.name ? trace.params.name : "",
        trace.server || "",
        JSON.stringify(trace.params || {}),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
  }

  function buildFiltered() {
    var out = [];
    for (var i = 0; i < traces.length; i++) {
      if (matchesFilter(traces[i])) out.push(traces[i]);
    }
    return out;
  }

  function createRow(trace) {
    var tr = document.createElement("tr");
    tr.className = "trace-row";
    tr.dataset.traceId = trace.id;
    updateRowContent(tr, trace);

    tr.addEventListener("click", function () {
      selectTrace(trace);
    });

    return tr;
  }

  function getToolName(trace) {
    if (trace.params && trace.params.name) return trace.params.name;
    if (trace.paired_with) {
      var pair = traces.find(function (t) {
        return t.id === trace.paired_with;
      });
      if (pair && pair.params && pair.params.name) return pair.params.name;
    }
    return "—";
  }

  function updateRowContent(tr, trace) {
    var isOut = trace.direction === "client_to_server";
    var toolName = getToolName(trace);
    var latency = trace.latency_ms !== null ? trace.latency_ms + "ms" : "—";
    var latencyClass =
      trace.latency_ms !== null && trace.latency_ms > 1000 ? "latency-slow" : "latency-fast";

    var statusIcon;
    var statusClass;
    switch (trace.status) {
      case "ok":
        statusIcon = "✓";
        statusClass = "status-ok";
        break;
      case "error":
        statusIcon = "✗";
        statusClass = "status-error";
        break;
      case "timeout":
        statusIcon = "⏱";
        statusClass = "status-timeout";
        break;
      default:
        statusIcon = "…";
        statusClass = "status-pending";
        break;
    }

    tr.innerHTML =
      '<td class="col-time">' +
      formatTime(trace.timestamp) +
      "</td>" +
      '<td class="col-dir"><span class="dir-arrow ' +
      (isOut ? "dir-out" : "dir-in") +
      '">' +
      (isOut ? "→" : "←") +
      "</span></td>" +
      '<td class="col-server"><span class="server-tag">' +
      (trace.server || "—") +
      "</span></td>" +
      '<td class="col-method">' +
      (trace.method || "response") +
      "</td>" +
      '<td class="col-tool">' +
      toolName +
      "</td>" +
      '<td class="col-latency ' +
      latencyClass +
      '">' +
      latency +
      "</td>" +
      '<td class="col-status ' +
      statusClass +
      '">' +
      statusIcon +
      "</td>";
  }

  function renderVirtualRows() {
    var filtered = buildFiltered();
    traceBody.innerHTML = "";

    if (filtered.length === 0) {
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    var ch = tableContainer.clientHeight || 480;
    var scrollTop = tableContainer.scrollTop;
    var totalPx = filtered.length * ROW_HEIGHT;
    var win = Math.ceil(ch / ROW_HEIGHT) + SCROLL_BUFFER_ROWS * 2;
    var start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - SCROLL_BUFFER_ROWS);
    var end = Math.min(filtered.length, start + win);

    if (selectedId) {
      var selIdx = -1;
      for (var j = 0; j < filtered.length; j++) {
        if (filtered[j].id === selectedId) {
          selIdx = j;
          break;
        }
      }
      if (selIdx !== -1) {
        if (selIdx < start) {
          start = Math.max(0, selIdx - SCROLL_BUFFER_ROWS);
          end = Math.min(filtered.length, start + win);
        }
        if (selIdx >= end) {
          end = Math.min(filtered.length, selIdx + SCROLL_BUFFER_ROWS + 1);
          start = Math.max(0, end - win);
        }
      }
    }

    var topPx = start * ROW_HEIGHT;
    var bottomPx = Math.max(0, totalPx - end * ROW_HEIGHT);

    if (topPx > 0) {
      var topTr = document.createElement("tr");
      topTr.className = "vscroll-spacer";
      var topTd = document.createElement("td");
      topTd.colSpan = 7;
      topTd.style.height = topPx + "px";
      topTd.style.padding = "0";
      topTd.style.border = "none";
      topTr.appendChild(topTd);
      traceBody.appendChild(topTr);
    }

    for (var i = start; i < end; i++) {
      traceBody.appendChild(createRow(filtered[i]));
    }

    if (bottomPx > 0) {
      var botTr = document.createElement("tr");
      botTr.className = "vscroll-spacer";
      var botTd = document.createElement("td");
      botTd.colSpan = 7;
      botTd.style.height = bottomPx + "px";
      botTd.style.padding = "0";
      botTd.style.border = "none";
      botTr.appendChild(botTd);
      traceBody.appendChild(botTr);
    }

    if (selectedId) {
      var row = document.querySelector('[data-trace-id="' + selectedId + '"]');
      if (row) row.classList.add("selected");
    }
  }

  function scheduleScrollRender() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      scrollScheduled = false;
      renderVirtualRows();
    });
  }

  function render() {
    renderVirtualRows();
  }

  tableContainer.addEventListener("scroll", scheduleScrollRender);
  window.addEventListener("resize", scheduleScrollRender);

  function syntaxHighlight(json) {
    if (json === null || json === undefined) return '<span class="json-null">null</span>';
    var str = JSON.stringify(json, null, 2);
    return str.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      function (match) {
        var cls = "json-number";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "json-key" : "json-string";
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return '<span class="' + cls + '">' + escapeHtml(match) + "</span>";
      }
    );
  }

  /**
   * @param {HTMLElement} toolbarEl
   * @param {HTMLElement} preEl
   * @param {unknown} rawValue — unmasked source (for size + download)
   * @param {string} traceId
   * @param {"request"|"response"} part
   */
  /** @returns {boolean} true when compact toolbar + preview/download path was used */
  function renderJsonSection(toolbarEl, preEl, rawValue, traceId, part) {
    toolbarEl.innerHTML = "";
    toolbarEl.classList.add("hidden");
    toolbarEl.classList.remove("json-toolbar--compact");

    var expKey = traceId + ":" + part;

    if (rawValue === null || rawValue === undefined) {
      preEl.innerHTML = '<span class="json-null">—</span>';
      return false;
    }

    var len = serializedJsonLength(rawValue);
    var displayValue = maskForDisplay(rawValue, getMaskOpts());

    if (len <= LARGE_PAYLOAD_BYTES) {
      preEl.innerHTML = syntaxHighlight(displayValue);
      return false;
    }

    toolbarEl.classList.remove("hidden");
    toolbarEl.classList.add("json-toolbar--compact");

    var summary = document.createElement("div");
    summary.className = "payload-summary";
    summary.textContent =
      "Large payload (~" +
      len +
      " bytes serialized JSON, threshold " +
      LARGE_PAYLOAD_BYTES +
      "). Preview truncated; Download is full unmasked JSON.";
    toolbarEl.appendChild(summary);

    var dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.textContent = "Download JSON";
    dlBtn.addEventListener("click", function () {
      try {
        var blob = new Blob([JSON.stringify(rawValue, null, 2)], {
          type: "application/json",
        });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "trace-" + traceId.slice(0, 8) + "-" + part + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) {
        alert("Download failed: " + e);
      }
    });
    toolbarEl.appendChild(dlBtn);

    var expanded = expandedPayload.has(expKey);

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = expanded ? "Collapse" : "Expand full";
    toggleBtn.addEventListener("click", function () {
      if (!expanded && len > 1024 * 1024) {
        if (
          !confirm(
            "This payload is very large (>1 MiB). Expanding may slow the browser. Continue?",
          )
        ) {
          return;
        }
      }
      if (expandedPayload.has(expKey)) expandedPayload.delete(expKey);
      else expandedPayload.add(expKey);
      var t = traces.find(function (x) {
        return x.id === traceId;
      });
      if (t) selectTrace(t);
    });
    toolbarEl.appendChild(toggleBtn);

    if (expanded) {
      preEl.innerHTML = syntaxHighlight(displayValue);
      return true;
    }

    var pretty = JSON.stringify(displayValue, null, 2);
    var truncatedText =
      pretty.length > LARGE_PREVIEW_CHARS ? pretty.slice(0, LARGE_PREVIEW_CHARS) + "\n… (preview truncated)" : pretty;
    preEl.innerHTML =
      '<div class="json-preview-trunc">' + escapeHtml(truncatedText) + "</div>";
    return true;
  }

  function selectTrace(trace) {
    selectedId = trace.id;
    document.querySelectorAll(".trace-row.selected").forEach(function (el) {
      el.classList.remove("selected");
    });
    var row = document.querySelector('[data-trace-id="' + trace.id + '"]');
    if (row) {
      row.classList.add("selected");
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    detailPanel.classList.remove("hidden");
    detailTitle.textContent =
      (trace.method || "response") +
      (trace.params && trace.params.name ? " — " + trace.params.name : "");

    var respBody = null;
    if (trace.direction === "client_to_server") {
      var responseTrace = trace.paired_with
        ? traces.find(function (t) {
            return t.id === trace.paired_with;
          })
        : null;
      respBody =
        responseTrace &&
        (responseTrace.result !== null && responseTrace.result !== undefined
          ? responseTrace.result
          : responseTrace.error !== null && responseTrace.error !== undefined
            ? responseTrace.error
            : null);
    } else {
      respBody =
        trace.result !== null && trace.result !== undefined
          ? trace.result
          : trace.error !== null && trace.error !== undefined
            ? trace.error
            : null;
    }

    var respSerializedLen =
      respBody !== null && respBody !== undefined ? serializedJsonLength(respBody) : 0;
    var largeHint =
      respSerializedLen > LARGE_PAYLOAD_BYTES
        ? '<div class="detail-meta-banner"><span class="label">Large response</span><span class="detail-large-hint">~' +
          respSerializedLen +
          " chars serialized — use <strong>Download JSON</strong> / <strong>Expand full</strong> under <strong>Response</strong> below.</span></div>"
        : "";

    detailMeta.innerHTML =
      '<span class="label">Time</span><span>' +
      formatTime(trace.timestamp) +
      "</span>" +
      '<span class="label">Direction</span><span>' +
      (trace.direction === "client_to_server" ? "Client → Server" : "Server → Client") +
      "</span>" +
      '<span class="label">Server</span><span>' +
      trace.server +
      "</span>" +
      '<span class="label">Latency</span><span>' +
      (trace.latency_ms !== null ? trace.latency_ms + "ms" : "—") +
      "</span>" +
      '<span class="label">Status</span><span class="' +
      ("status-" + trace.status) +
      '">' +
      trace.status +
      "</span>" +
      largeHint;

    renderJsonSection(detailRequestToolbar, detailRequest, trace.params ?? null, trace.id, "request");

    var compactResponse = renderJsonSection(
      detailResponseToolbar,
      detailResponse,
      respBody,
      trace.id,
      "response",
    );

    if (compactResponse) {
      requestAnimationFrame(function () {
        detailResponseToolbar.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  }

  detailClose.addEventListener("click", function () {
    detailPanel.classList.add("hidden");
    selectedId = null;
    expandedPayload.clear();
    document.querySelectorAll(".trace-row.selected").forEach(function (el) {
      el.classList.remove("selected");
    });
  });

  toggleScroll.addEventListener("click", function () {
    autoScroll = !autoScroll;
    toggleScroll.textContent = autoScroll ? "⏸" : "▶";
    toggleScroll.title = autoScroll ? "Pause auto-scroll" : "Resume auto-scroll";
  });

  clearBtn.addEventListener("click", function () {
    traces = [];
    expandedPayload.clear();
    render();
    detailPanel.classList.add("hidden");
    selectedId = null;
    fetch("/api/clear", { method: "POST" }).catch(function () {});
  });

  searchInput.addEventListener("input", render);
  filterType.addEventListener("change", render);
  filterServer.addEventListener("change", render);
  filterStatus.addEventListener("change", render);
  filterDirection.addEventListener("change", render);

  connect();
})();
