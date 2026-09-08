// ../ayq-client/src/ayq-bridge.ts
var counter = 0;
function nextId() {
  counter += 1;
  return `ayq-${Date.now().toString(36)}-${counter}`;
}
async function ayqAsk(body) {
  const bridge = window.ayq;
  if (!bridge) {
    throw new Error(
      "No AYQ bridge on this page. The renderer is not running inside the AYQ Electron host, and there is no other way to reach the engine."
    );
  }
  return bridge.request({ ...body, id: nextId() });
}

// ../ayq-client/src/ayq-dom.ts
function ayqElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
}
function ayqTable(columns, rows, onRow) {
  const table = ayqElement("table", "grid");
  const headRow = ayqElement("tr");
  for (const column of columns) {
    headRow.append(ayqElement("th", column.className, column.label));
  }
  const head = ayqElement("thead");
  head.append(headRow);
  table.append(head);
  const body = ayqElement("tbody");
  for (const row of rows) {
    const line = ayqElement("tr");
    for (const column of columns) {
      const content = column.cell(row);
      if (typeof content === "string") {
        line.append(ayqElement("td", column.className, content));
      } else {
        const cell = ayqElement("td", column.className);
        cell.append(content);
        line.append(cell);
      }
    }
    if (onRow) onRow(row, line);
    body.append(line);
  }
  table.append(body);
  return table;
}
function ayqSelect(options, selected, onChange, className) {
  const select = document.createElement("select");
  if (className) select.className = className;
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  }
  select.value = selected;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

// ../ayq-client/src/ayq-format.ts
var AMOUNT = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR"
});
function ayqEuro(cents) {
  return AMOUNT.format(cents / 100);
}
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function ayqDay(date) {
  const [year, month, day] = date.split("-");
  const name = MONTHS[Number(month) - 1]?.slice(0, 3) ?? month;
  return `${Number(day)} ${name} ${year}`;
}
function ayqMonth(month) {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1] ?? month} ${year}`;
}
function ayqMoment(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return `${ayqDay(when.toISOString().slice(0, 10))}, ${when.toTimeString().slice(0, 5)}`;
}

// ../ayq-client/src/ayq-other-views.ts
function ayqRenderRecurring(entries, target) {
  target.replaceChildren();
  if (entries.length === 0) {
    target.append(
      ayqElement("p", "empty-title", "Nothing recurs yet."),
      ayqElement(
        "p",
        "empty-body",
        "A counterparty needs three payments before a rhythm is more than a coincidence. Import a few more months and they will show up here."
      )
    );
    return;
  }
  target.append(
    ayqTable(
      [
        { label: "Counterparty", className: "col-payee", cell: (entry) => entry.name },
        { label: "Rhythm", className: "col-account", cell: (entry) => entry.cadence },
        {
          label: "Seen",
          className: "col-account",
          cell: (entry) => `${entry.occurrences}\xD7`
        },
        {
          label: "Typical",
          className: "col-amount",
          cell: (entry) => ayqElement(
            "span",
            "out",
            entry.amountVaries ? `~ ${ayqEuro(entry.averageAmountCents)}` : ayqEuro(entry.averageAmountCents)
          )
        },
        { label: "Last", className: "col-date", cell: (entry) => ayqDay(entry.lastDate) },
        {
          label: "Next",
          className: "col-date",
          cell: (entry) => entry.nextExpectedDate === null ? "\u2014" : ayqDay(entry.nextExpectedDate)
        },
        {
          label: "Mandate",
          className: "col-account",
          cell: (entry) => entry.mandateId === null ? "\u2014" : "SEPA"
        }
      ],
      entries
    )
  );
  target.append(
    ayqElement(
      "p",
      "count",
      `${entries.length} recurring ${entries.length === 1 ? "counterparty" : "counterparties"}`
    )
  );
}
function ayqRenderRules(rules, target, redraw) {
  target.replaceChildren();
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "quiet";
  apply.textContent = "Apply rules to uncategorised transactions";
  apply.addEventListener("click", () => {
    void (async () => {
      apply.disabled = true;
      await ayqAsk({ kind: "rules.apply" });
      apply.disabled = false;
      redraw();
    })();
  });
  if (rules.length === 0) {
    target.append(
      ayqElement("p", "empty-title", "No rules yet."),
      ayqElement(
        "p",
        "empty-body",
        'Give a transaction a category and tick "remember this" \u2014 every transaction from that counterparty, past and future, follows.'
      ),
      apply
    );
    return;
  }
  target.append(
    ayqTable(
      [
        {
          label: "Counterparty",
          className: "col-payee",
          cell: (rule) => rule.counterpartyKey
        },
        {
          label: "Category",
          className: "col-account",
          cell: (rule) => rule.categoryName
        },
        {
          label: "Since",
          className: "col-date",
          cell: (rule) => ayqDay(rule.createdAt.slice(0, 10))
        },
        {
          label: "",
          className: "col-amount",
          cell: (rule) => {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "quiet small";
            remove.textContent = "Forget";
            remove.addEventListener("click", () => {
              void (async () => {
                await ayqAsk({ kind: "rules.remove", ruleId: rule.id });
                redraw();
              })();
            });
            return remove;
          }
        }
      ],
      rules
    )
  );
  target.append(apply);
}
function ayqRenderImports(history, target) {
  target.replaceChildren();
  if (history.length === 0) {
    target.append(
      ayqElement("p", "empty-title", "Nothing imported yet."),
      ayqElement(
        "p",
        "empty-body",
        "Every import is recorded here: what the file held, what went in, and what was already there."
      )
    );
    return;
  }
  target.append(
    ayqTable(
      [
        { label: "When", className: "col-date", cell: (record) => ayqMoment(record.at) },
        { label: "File", className: "col-payee", cell: (record) => record.file },
        {
          label: "Account",
          className: "col-account",
          cell: (record) => record.accountName
        },
        {
          label: "Read",
          className: "col-amount",
          cell: (record) => String(record.records)
        },
        {
          label: "Imported",
          className: "col-amount",
          cell: (record) => String(record.imported)
        },
        {
          label: "Already there",
          className: "col-amount",
          cell: (record) => String(record.duplicates)
        },
        {
          label: "Categorised",
          className: "col-amount",
          cell: (record) => String(record.categorised)
        },
        {
          label: "Failed",
          className: "col-amount",
          cell: (record) => String(record.failed)
        }
      ],
      history
    )
  );
}

// ../ayq-client/src/ayq-transactions.ts
function ayqEmptyTransactionsState() {
  return {
    filter: {},
    accounts: [],
    categories: [],
    ledger: null,
    openId: null,
    detail: null,
    problem: null
  };
}
function ayqRenderTransactions(state2, target, redraw) {
  target.replaceChildren(filterBar(state2, redraw));
  const ledger = state2.ledger;
  if (ledger === null) {
    target.append(ayqElement("p", "muted", "Reading the budget\u2026"));
    return;
  }
  if (ledger.total === 0) {
    target.append(emptyState(state2));
    return;
  }
  const table = ayqTable(
    [
      { label: "Date", className: "col-date", cell: (row) => ayqDay(row.date) },
      {
        label: "Counterparty",
        className: "col-payee",
        cell: (row) => row.payee ?? "Unknown"
      },
      {
        label: "Category",
        className: "col-category",
        cell: (row) => row.category ?? "\u2014"
      },
      {
        label: "Account",
        className: "col-account",
        cell: (row) => row.account
      },
      {
        label: "Amount",
        className: "col-amount",
        cell: (row) => {
          const cell = ayqElement(
            "span",
            row.amountCents < 0 ? "out" : "in",
            ayqEuro(row.amountCents)
          );
          return cell;
        }
      }
    ],
    ledger.rows,
    (row, line) => {
      line.classList.add("clickable");
      if (row.id === state2.openId) line.classList.add("open");
      line.addEventListener("click", () => {
        state2.openId = state2.openId === row.id ? null : row.id;
        state2.detail = null;
        state2.problem = null;
        redraw(false);
        if (state2.openId !== null) void loadDetail(state2, redraw);
      });
    }
  );
  target.append(table);
  target.append(
    ayqElement(
      "p",
      "count",
      ledger.shown === ledger.total ? `${ledger.total} transactions` : `${ledger.shown} of ${ledger.total} transactions`
    )
  );
  if (state2.openId !== null) target.append(detailPanel(state2, redraw));
}
async function loadDetail(state2, redraw) {
  const transactionId = state2.openId;
  if (transactionId === null) return;
  const answer = await ayqAsk({ kind: "transaction.detail", transactionId });
  if (answer.ok && answer.kind === "transaction.detail") {
    if (state2.openId === transactionId) {
      state2.detail = answer.result;
      redraw(false);
    }
  }
}
function emptyState(state2) {
  const box = ayqElement("div", "empty");
  const filtered = Object.keys(state2.filter).some(
    (key) => key !== "limit" && state2.filter[key]
  );
  if (filtered) {
    box.append(
      ayqElement("p", "empty-title", "Nothing matches."),
      ayqElement(
        "p",
        "empty-body",
        "No transaction in this budget answers that filter. Clear it to see everything again."
      )
    );
    return box;
  }
  box.append(
    ayqElement("p", "empty-title", "No transactions yet."),
    ayqElement(
      "p",
      "empty-body",
      "Import a CAMT.053 statement from your bank \u2014 an .xml file or a .zip of them \u2014 and it will appear here. Nothing leaves this machine."
    )
  );
  return box;
}
function filterBar(state2, redraw) {
  const bar = ayqElement("div", "filters");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search counterparty or description";
  search.className = "search";
  search.value = state2.filter.search ?? "";
  search.addEventListener("input", () => {
    state2.filter.search = search.value.trim() === "" ? void 0 : search.value;
    redraw(true);
  });
  bar.append(search);
  bar.append(
    ayqSelect(
      [
        { value: "", label: "All accounts" },
        ...state2.accounts.map((account) => ({
          value: account.id,
          label: account.name
        }))
      ],
      state2.filter.accountId ?? "",
      (value) => {
        state2.filter.accountId = value === "" ? void 0 : value;
        redraw(true);
      }
    )
  );
  for (const [label, key] of [
    ["From", "from"],
    ["To", "to"]
  ]) {
    const field = document.createElement("input");
    field.type = "date";
    field.title = label;
    field.value = state2.filter[key] ?? "";
    field.addEventListener("change", () => {
      state2.filter[key] = field.value === "" ? void 0 : field.value;
      redraw(true);
    });
    bar.append(field);
  }
  const uncategorised = ayqElement("label", "check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = state2.filter.uncategorised === true;
  box.addEventListener("change", () => {
    state2.filter.uncategorised = box.checked ? true : void 0;
    redraw(true);
  });
  uncategorised.append(box, ayqElement("span", void 0, "Uncategorised"));
  bar.append(uncategorised);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "quiet";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    state2.filter = {};
    redraw(true);
  });
  bar.append(clear);
  return bar;
}
function detailPanel(state2, redraw) {
  const panel = ayqElement("div", "detail");
  const detail = state2.detail;
  if (state2.problem !== null) {
    panel.append(ayqElement("p", "error", state2.problem));
  }
  if (detail === null) {
    panel.append(ayqElement("p", "muted", "Reading the transaction\u2026"));
    return panel;
  }
  panel.append(ayqElement("h2", void 0, detail.row.payee ?? "Unknown"));
  const facts = [
    ["Date", ayqDay(detail.row.date)],
    ["Amount", ayqEuro(detail.row.amountCents)],
    ["Account", detail.row.account],
    ["Status", detail.row.cleared ? "Booked" : "Pending"]
  ];
  if (detail.importedPayee) facts.push(["The bank said", detail.importedPayee]);
  if (detail.notes && detail.notes !== detail.importedPayee) {
    facts.push(["Description", detail.notes]);
  }
  const provenance = detail.provenance;
  if (provenance) {
    facts.push(["Payment kind", provenance.kind]);
    facts.push(["Name decided by", provenance.resolvedBy]);
    if (provenance.counterpartyKey) {
      facts.push(["Counterparty key", provenance.counterpartyKey]);
    }
    if (provenance.bankTransactionCode) {
      facts.push(["Bank transaction code", provenance.bankTransactionCode]);
    }
    if (provenance.counterpartyIban) {
      facts.push(["Counterparty IBAN", provenance.counterpartyIban]);
    }
    if (provenance.intermediary) {
      facts.push(["Paid through", provenance.intermediary]);
    }
    if (provenance.mandateId) facts.push(["SEPA mandate", provenance.mandateId]);
    if (provenance.endToEndId) facts.push(["End-to-end id", provenance.endToEndId]);
    if (provenance.valueDate && provenance.valueDate !== detail.row.date) {
      facts.push(["Value date", ayqDay(provenance.valueDate)]);
    }
    if (provenance.file) facts.push(["Imported from", provenance.file]);
  }
  const list = ayqElement("dl", "facts");
  for (const [label, value] of facts) {
    list.append(
      ayqElement("dt", void 0, label),
      ayqElement("dd", void 0, value)
    );
  }
  panel.append(list);
  panel.append(categoryPicker(state2, detail, redraw));
  return panel;
}
function categoryPicker(state2, detail, redraw) {
  const box = ayqElement("div", "categorise");
  box.append(ayqElement("h3", void 0, "Category"));
  const remember = document.createElement("input");
  remember.type = "checkbox";
  remember.checked = true;
  const select = ayqSelect(
    [
      { value: "", label: "No category" },
      ...state2.categories.map((category) => ({
        value: category.id,
        label: category.groupName ? `${category.groupName} \xB7 ${category.name}` : category.name
      }))
    ],
    detail.row.categoryId ?? "",
    (value) => {
      void assign(state2, detail.row.id, value === "" ? null : value, remember.checked, redraw);
    }
  );
  box.append(select);
  const label = ayqElement("label", "check");
  label.append(
    remember,
    ayqElement(
      "span",
      void 0,
      "Remember this for every transaction from this counterparty"
    )
  );
  box.append(label);
  return box;
}
async function assign(state2, transactionId, categoryId, createRule, redraw) {
  try {
    const answer = await ayqAsk({
      kind: "transaction.categorise",
      transactionId,
      categoryId,
      createRule: createRule && categoryId !== null
    });
    state2.problem = answer.ok ? null : answer.message;
  } catch (error) {
    state2.problem = error instanceof Error ? error.message : String(error);
  }
  redraw(true);
}

// ../ayq-client/src/ayq-app.ts
var VIEWS = [
  { id: "transactions", label: "Transactions" },
  { id: "recurring", label: "Recurring" },
  { id: "rules", label: "Rules" },
  { id: "imports", label: "Imports" }
];
var state = {
  view: "transactions",
  status: null,
  summary: null,
  transactions: ayqEmptyTransactionsState(),
  recurring: [],
  rules: [],
  imports: []
};
function byId(id) {
  return document.getElementById(id);
}
function markState(value) {
  document.body.dataset.ayqState = value;
  if (state.status) document.body.dataset.ayqEngineHost = state.status.engineHost;
}
function markLedger() {
  const ledger = state.transactions.ledger;
  document.body.dataset.ayqLedgerTotal = String(
    state.summary?.transactionCount ?? ledger?.total ?? 0
  );
  document.body.dataset.ayqLedgerRows = String(ledger?.rows.length ?? 0);
}
function markImport(value, summary) {
  document.body.dataset.ayqImportState = value;
  if (summary) document.body.dataset.ayqImportSummary = JSON.stringify(summary);
}
function showProblem(message) {
  const bar = byId("ayq-problem");
  if (!bar) return;
  bar.replaceChildren(ayqElement("span", "problem-text", message));
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "quiet small";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => void refresh(true));
  bar.append(retry);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "quiet small";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => clearProblem());
  bar.append(dismiss);
  bar.hidden = false;
}
function clearProblem() {
  const bar = byId("ayq-problem");
  if (!bar) return;
  bar.replaceChildren();
  bar.hidden = true;
}
async function need(body) {
  const answer = await ayqAsk(body);
  if (!answer.ok) throw new Error(answer.message);
  if (answer.kind !== body.kind) {
    throw new Error("the engine answered a different request");
  }
  return answer;
}
async function loadShell() {
  state.status = (await need({ kind: "engine.status" })).result;
  state.summary = (await need({ kind: "summary" })).result;
  state.transactions.accounts = state.summary.accounts;
}
async function loadView() {
  switch (state.view) {
    case "transactions": {
      if (state.transactions.categories.length === 0) {
        state.transactions.categories = (await need({ kind: "categories.list" })).result;
      }
      state.transactions.ledger = (await need({
        kind: "transactions.list",
        filter: state.transactions.filter
      })).result;
      return;
    }
    case "recurring":
      state.recurring = (await need({ kind: "recurring.list" })).result;
      return;
    case "rules":
      state.rules = (await need({ kind: "rules.list" })).result;
      return;
    case "imports":
      state.imports = (await need({ kind: "imports.list" })).result;
      return;
  }
}
var loading = false;
var queued = false;
async function refresh(reload) {
  if (reload) {
    if (loading) {
      queued = true;
      return;
    }
    loading = true;
    try {
      await loadShell();
      await loadView();
      clearProblem();
      markState("ready");
    } catch (error) {
      showProblem(error instanceof Error ? error.message : String(error));
      markState("error");
    } finally {
      loading = false;
    }
    if (queued) {
      queued = false;
      await refresh(true);
      return;
    }
  }
  draw();
}
function draw() {
  drawSummary();
  drawTabs();
  drawView();
  drawFooter();
  markLedger();
}
function drawSummary() {
  const target = byId("ayq-summary");
  if (!target) return;
  const summary = state.summary;
  if (summary === null) {
    target.replaceChildren();
    return;
  }
  const figures = [
    ["Balance", ayqEuro(summary.totalBalanceCents)],
    ["Transactions", String(summary.transactionCount)],
    ["Counterparties", String(summary.counterpartyCount)],
    ["Uncategorised", String(summary.uncategorisedCount)]
  ];
  if (summary.month !== null) {
    figures.splice(
      1,
      0,
      [`In \xB7 ${ayqMonth(summary.month)}`, ayqEuro(summary.monthIncomeCents), "in"],
      [
        `Out \xB7 ${ayqMonth(summary.month)}`,
        ayqEuro(summary.monthExpenseCents),
        "out"
      ]
    );
  }
  target.replaceChildren();
  for (const [label, value, tone] of figures) {
    const cell = ayqElement("div", "figure");
    cell.append(
      ayqElement("span", "figure-label", label),
      ayqElement("span", `figure-value ${tone ?? ""}`.trim(), value)
    );
    target.append(cell);
  }
}
function drawTabs() {
  const target = byId("ayq-tabs");
  if (!target) return;
  target.replaceChildren();
  for (const view of VIEWS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = view.id === state.view ? "tab current" : "tab";
    tab.textContent = view.label;
    tab.dataset.ayqTab = view.id;
    tab.addEventListener("click", () => {
      if (state.view === view.id) return;
      state.view = view.id;
      void refresh(true);
    });
    target.append(tab);
  }
}
function drawView() {
  const target = byId("ayq-body");
  if (!target) return;
  switch (state.view) {
    case "transactions":
      ayqRenderTransactions(
        state.transactions,
        target,
        (reload) => void refresh(reload)
      );
      return;
    case "recurring":
      ayqRenderRecurring(state.recurring, target);
      return;
    case "rules":
      ayqRenderRules(state.rules, target, () => void refresh(true));
      return;
    case "imports":
      ayqRenderImports(state.imports, target);
      return;
  }
}
function drawFooter() {
  const note = byId("ayq-engine-note");
  if (!note) return;
  const status = state.status;
  if (status === null) {
    note.textContent = "";
    return;
  }
  const parts = [
    `${status.budgetName} \xB7 @actual-app/api ${status.apiVersion} \xB7 ${status.engineHost}`
  ];
  if (state.summary?.lastImportAt) {
    parts.push(`last import ${ayqMoment(state.summary.lastImportAt)}`);
  }
  parts.push(status.dataDir);
  note.textContent = parts.join(" \xB7 ");
}
function renderImportLine(node) {
  const target = byId("ayq-import-result");
  if (!target) return;
  if (node === null) target.replaceChildren();
  else target.replaceChildren(node);
}
async function importCamt() {
  const button = byId("ayq-import");
  if (button instanceof HTMLButtonElement) button.disabled = true;
  markImport("working");
  renderImportLine(ayqElement("span", "muted", "Waiting for a file\u2026"));
  try {
    const picked = await need({ kind: "import.pick" });
    const paths = picked.result.paths;
    if (paths.length === 0) {
      renderImportLine(
        ayqElement("span", "muted", "No file chosen; nothing was imported.")
      );
      markImport("cancelled");
      return;
    }
    renderImportLine(
      ayqElement(
        "span",
        "muted",
        paths.length === 1 ? "Reading and importing\u2026" : `Reading and importing ${paths.length} files\u2026`
      )
    );
    const done = await need({ kind: "import.camt", paths });
    const summary = done.result;
    renderImportLine(
      ayqElement(
        "span",
        "import-done",
        `${summary.file}: ${summary.imported} imported, ${summary.duplicates} already there` + (summary.categorised > 0 ? `, ${summary.categorised} categorised by rules` : "") + (summary.skipped > 0 ? `, ${summary.skipped} skipped` : "") + (summary.failed > 0 ? `, ${summary.failed} failed` : "") + ` \u2014 ${summary.accountName}`
      )
    );
    state.view = "transactions";
    await refresh(true);
    markImport("done", summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderImportLine(null);
    showProblem(`The import failed. ${message}`);
    markImport("error");
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}
async function start() {
  byId("ayq-import")?.addEventListener("click", () => void importCamt());
  clearProblem();
  await refresh(true);
}
void start();
//# sourceMappingURL=ayq-client.js.map
