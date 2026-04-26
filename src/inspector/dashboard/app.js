(function () {
  const traceBody = document.getElementById("trace-body");
  const emptyState = document.getElementById("empty-state");
  const detailPanel = document.getElementById("detail-panel");
  const detailTitle = document.getElementById("detail-title");
  const detailMeta = document.getElementById("detail-meta");
  const detailRequest = document.getElementById("detail-request");
  const detailResponse = document.getElementById("detail-response");
  const detailClose = document.getElementById("detail-close");
  const searchInput = document.getElementById("search");
  const filterType = document.getElementById("filter-type");
  const filterServer = document.getElementById("filter-server");
  const filterStatus = document.getElementById("filter-status");
  const filterDirection = document.getElementById("filter-direction");
  const toggleScroll = document.getElementById("toggle-scroll");
  const clearBtn = document.getElementById("clear-btn");
  const statusEl = document.getElementById("status");
  const tableContainer = document.querySelector(".table-container");

  let traces = [];
  let autoScroll = true;
  let selectedId = null;
  let ws = null;

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
        traces.forEach(function (t) { registerServer(t.server); });
        // Patch request entries with data from their paired responses,
        // because the ring buffer stores them separately and the request
        // entry never gets updated server-side after the response arrives.
        traces.forEach(function (t) {
          if (t.paired_with && t.direction === "server_to_client") {
            var req = traces.find(function (r) { return r.id === t.paired_with; });
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
        appendRow(msg.trace);
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
          var row = document.querySelector(`[data-trace-id="${traces[i].id}"]`);
          if (row) updateRowContent(row, traces[i]);
          break;
        }
      }
    }
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function matchesFilter(trace) {
    var search = searchInput.value.toLowerCase();
    var type = filterType.value;
    var server = filterServer.value;
    var status = filterStatus.value;
    var direction = filterDirection.value;

    var isToolCall = trace.method === "tools/call";
    var isRequest = trace.direction === "client_to_server";
    // In tools_only mode show one row per call (the request, which gets updated with latency+status)
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
      ].join(" ").toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
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
    // For response rows, look up tool name from the paired request
    if (trace.paired_with) {
      var pair = traces.find(function (t) { return t.id === trace.paired_with; });
      if (pair && pair.params && pair.params.name) return pair.params.name;
    }
    return "—";
  }

  function updateRowContent(tr, trace) {
    var isOut = trace.direction === "client_to_server";
    var toolName = getToolName(trace);
    var latency = trace.latency_ms !== null ? trace.latency_ms + "ms" : "—";
    var latencyClass = trace.latency_ms !== null && trace.latency_ms > 1000 ? "latency-slow" : "latency-fast";

    var statusIcon;
    var statusClass;
    switch (trace.status) {
      case "ok": statusIcon = "✓"; statusClass = "status-ok"; break;
      case "error": statusIcon = "✗"; statusClass = "status-error"; break;
      case "timeout": statusIcon = "⏱"; statusClass = "status-timeout"; break;
      default: statusIcon = "…"; statusClass = "status-pending"; break;
    }

    tr.innerHTML =
      '<td class="col-time">' + formatTime(trace.timestamp) + "</td>" +
      '<td class="col-dir"><span class="dir-arrow ' + (isOut ? "dir-out" : "dir-in") + '">' + (isOut ? "→" : "←") + "</span></td>" +
      '<td class="col-server"><span class="server-tag">' + (trace.server || "—") + "</span></td>" +
      '<td class="col-method">' + (trace.method || "response") + "</td>" +
      '<td class="col-tool">' + toolName + "</td>" +
      '<td class="col-latency ' + latencyClass + '">' + latency + "</td>" +
      '<td class="col-status ' + statusClass + '">' + statusIcon + "</td>";
  }

  function appendRow(trace) {
    if (!matchesFilter(trace)) return;
    emptyState.style.display = "none";
    traceBody.appendChild(createRow(trace));
  }

  function render() {
    traceBody.innerHTML = "";
    var visible = 0;
    for (var i = 0; i < traces.length; i++) {
      if (matchesFilter(traces[i])) {
        traceBody.appendChild(createRow(traces[i]));
        visible++;
      }
    }
    emptyState.style.display = visible === 0 ? "block" : "none";
  }

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
        return '<span class="' + cls + '">' + match + "</span>";
      }
    );
  }

  function selectTrace(trace) {
    selectedId = trace.id;
    document.querySelectorAll(".trace-row.selected").forEach(function (el) {
      el.classList.remove("selected");
    });
    var row = document.querySelector('[data-trace-id="' + trace.id + '"]');
    if (row) row.classList.add("selected");

    detailPanel.classList.remove("hidden");
    detailTitle.textContent = (trace.method || "response") + (trace.params && trace.params.name ? " — " + trace.params.name : "");

    detailMeta.innerHTML =
      '<span class="label">Time</span><span>' + formatTime(trace.timestamp) + "</span>" +
      '<span class="label">Direction</span><span>' + (trace.direction === "client_to_server" ? "Client → Server" : "Server → Client") + "</span>" +
      '<span class="label">Server</span><span>' + trace.server + "</span>" +
      '<span class="label">Latency</span><span>' + (trace.latency_ms !== null ? trace.latency_ms + "ms" : "—") + "</span>" +
      '<span class="label">Status</span><span class="' + ("status-" + trace.status) + '">' + trace.status + "</span>";

    detailRequest.innerHTML = trace.params ? syntaxHighlight(trace.params) : '<span class="json-null">—</span>';

    if (trace.direction === "client_to_server") {
      // Request row: look up the paired response for the response body
      var responseTrace = trace.paired_with
        ? traces.find(function (t) { return t.id === trace.paired_with; })
        : null;
      detailResponse.innerHTML = responseTrace
        ? (responseTrace.result
          ? syntaxHighlight(responseTrace.result)
          : responseTrace.error
            ? syntaxHighlight(responseTrace.error)
            : '<span class="json-null">—</span>')
        : '<span class="json-null">—</span>';
    } else {
      // Response row: result is directly on this trace
      detailResponse.innerHTML = trace.result
        ? syntaxHighlight(trace.result)
        : trace.error
          ? syntaxHighlight(trace.error)
          : '<span class="json-null">—</span>';
    }
  }

  // Event listeners
  detailClose.addEventListener("click", function () {
    detailPanel.classList.add("hidden");
    selectedId = null;
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
    render();
    detailPanel.classList.add("hidden");
    fetch("/api/clear", { method: "POST" }).catch(function () {});
  });

  searchInput.addEventListener("input", render);
  filterType.addEventListener("change", render);
  filterServer.addEventListener("change", render);
  filterStatus.addEventListener("change", render);
  filterDirection.addEventListener("change", render);

  connect();
})();
