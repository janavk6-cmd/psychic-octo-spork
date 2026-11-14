"use strict";

(() => {
  const STORAGE_KEY = "evergreen-finance-v1";
  const CATEGORIES = {
    expense: ["Housing", "Groceries", "Transport", "Dining", "Health", "Shopping", "Utilities", "Entertainment", "Other"],
    income: ["Salary", "Freelance", "Investments", "Gift", "Other"]
  };
  const CATEGORY_ICONS = {
    Housing: "⌂", Groceries: "🥑", Transport: "↗", Dining: "☕", Health: "✚",
    Shopping: "◇", Utilities: "ϟ", Entertainment: "♫", Salary: "↙",
    Freelance: "✳", Investments: "⌁", Gift: "♡", Other: "·"
  };
  const $ = (selector) => document.querySelector(selector);
  const els = {
    monthLabel: $("#month-label"), income: $("#income-total"), expense: $("#expense-total"),
    balance: $("#balance-total"), transactions: $("#transaction-list"), transactionCount: $("#transaction-count"),
    categories: $("#category-list"), budgets: $("#budget-list"), dialog: $("#transaction-dialog"),
    transactionForm: $("#transaction-form"), dialogTitle: $("#dialog-title"), description: $("#description"),
    amount: $("#amount"), date: $("#date"), category: $("#category"), type: $("#transaction-type"),
    transactionError: $("#transaction-error"), saveTransaction: $("#save-transaction"),
    budgetForm: $("#budget-form"), budgetCategory: $("#budget-category"), budgetAmount: $("#budget-amount"),
    budgetError: $("#budget-error"), toast: $("#toast")
  };

  const dateNow = new Date();
  let selectedMonth = new Date(dateNow.getFullYear(), dateNow.getMonth(), 1);
  let editingId = null;
  let toastTimer;
  let storageReady = true;

  function initialState() {
    return { transactions: [], budgets: {} };
  }

  function readState() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageReady = false;
      showToast("Browser storage is unavailable. Finance changes cannot be saved.");
      return initialState();
    }
    if (!raw) return initialState();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      storageReady = false;
      showToast("Saved finance data could not be read and was left unchanged.");
      return initialState();
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        !Array.isArray(parsed.transactions) ||
        !parsed.transactions.every(isValidStoredTransaction) ||
        !isValidStoredBudgets(parsed.budgets)) {
      storageReady = false;
      showToast("Saved finance data is invalid and was left unchanged.");
      return initialState();
    }
    return { transactions: parsed.transactions, budgets: parsed.budgets || {} };
  }

  let state = readState();

  function isValidStoredTransaction(item) {
    return item && typeof item.id === "string" && typeof item.description === "string" &&
      Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 &&
      (item.type === "income" || item.type === "expense") &&
      CATEGORIES[item.type].includes(item.category) &&
      item.description.trim().length > 0 && item.description.length <= 80 &&
      typeof item.date === "string" && isValidDate(item.date);
  }

  function isValidStoredBudgets(budgets) {
    if (budgets === undefined) return true;
    if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) return false;
    return Object.entries(budgets).every(([month, categories]) =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
      categories && typeof categories === "object" && !Array.isArray(categories) &&
      Object.entries(categories).every(([category, amount]) =>
        CATEGORIES.expense.includes(category) && Number.isFinite(Number(amount)) && Number(amount) > 0
      )
    );
  }

  function saveState(nextState) {
    if (!storageReady) {
      showToast("Cannot save until the existing finance data can be read.");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      showToast("Could not save. Check this browser's storage settings.");
      return false;
    }
    state = nextState;
    return true;
  }

  function money(value) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
  }

  function monthKey(date) {
    return date.slice(0, 7);
  }

  function currentMonthKey() {
    return `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthTransactions() {
    const key = currentMonthKey();
    return state.transactions.filter((item) => monthKey(item.date) === key);
  }

  function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
  }

  function setText(element, value) {
    element.textContent = value;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function render() {
    renderMonth();
    renderSummary();
    renderTransactions();
    renderCategories();
    renderBudgets();
  }

  function renderMonth() {
    const today = new Date();
    const same = today.getFullYear() === selectedMonth.getFullYear() && today.getMonth() === selectedMonth.getMonth();
    setText(els.monthLabel, same
      ? `This month · ${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(selectedMonth)}`
      : new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(selectedMonth));
  }

  function renderSummary() {
    const items = monthTransactions();
    const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    setText(els.income, money(income));
    setText(els.expense, money(expense));
    setText(els.balance, money(income - expense));
  }

  function renderTransactions() {
    const items = monthTransactions().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    els.transactions.replaceChildren();
    setText(els.transactionCount, `${items.length} ${items.length === 1 ? "entry" : "entries"}`);
    if (!items.length) {
      const empty = makeElement("div", "empty-state");
      empty.append(makeElement("div", "empty-illustration", "✦"));
      empty.append(makeElement("strong", "", "A fresh month is a fresh start."));
      empty.append(makeElement("p", "", "Add your first transaction to see your finances take shape."));
      els.transactions.append(empty);
      return;
    }
    items.forEach((item) => {
      const row = makeElement("article", "transaction-row");
      const icon = makeElement("span", "transaction-icon", CATEGORY_ICONS[item.category] || "·");
      icon.setAttribute("aria-hidden", "true");
      const info = makeElement("div", "transaction-info");
      info.append(makeElement("p", "transaction-name", item.description));
      info.append(makeElement("p", "transaction-meta", `${item.category} · ${formatDate(item.date)}`));
      const right = makeElement("div", "transaction-right");
      const amount = makeElement("p", `transaction-amount ${item.type === "income" ? "amount-income" : "amount-expense"}`, `${item.type === "income" ? "+" : "−"}${money(Number(item.amount))}`);
      const actions = makeElement("div", "row-actions");
      const edit = makeElement("button", "row-action", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit ${item.description}`);
      edit.addEventListener("click", () => openTransaction(item));
      const remove = makeElement("button", "row-action", "Delete");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${item.description}`);
      remove.addEventListener("click", () => deleteTransaction(item.id));
      actions.append(edit, remove);
      right.append(amount, actions);
      row.append(icon, info, right);
      els.transactions.append(row);
    });
  }

  function renderCategories() {
    const totals = new Map();
    monthTransactions().filter((item) => item.type === "expense").forEach((item) => {
      totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount));
    });
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    els.categories.replaceChildren();
    if (!sorted.length) {
      els.categories.append(makeElement("p", "category-empty", "Your spending categories will show up here."));
      return;
    }
    const max = sorted[0][1] || 1;
    sorted.forEach(([category, total]) => {
      const item = makeElement("div", "category-item");
      const top = makeElement("div", "category-topline");
      const label = makeElement("span", "category-label");
      label.append(makeElement("span", "category-emoji", CATEGORY_ICONS[category] || "·"));
      label.append(makeElement("span", "", category));
      top.append(label, makeElement("span", "category-amount", money(total)));
      const track = makeElement("div", "progress-track");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${category} spending`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(total / max * 100)));
      const fill = makeElement("div", "progress-fill");
      fill.style.width = `${Math.max(4, total / max * 100)}%`;
      track.append(fill);
      item.append(top, track);
      els.categories.append(item);
    });
  }

  function budgetFor(category) {
    const value = Number(state.budgets[currentMonthKey()] && state.budgets[currentMonthKey()][category]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function renderBudgets() {
    const monthBudgets = state.budgets[currentMonthKey()] || {};
    const categories = Object.keys(monthBudgets).filter((category) => Number(monthBudgets[category]) > 0).sort();
    const spent = new Map();
    monthTransactions().filter((item) => item.type === "expense").forEach((item) => {
      spent.set(item.category, (spent.get(item.category) || 0) + Number(item.amount));
    });
    els.budgets.replaceChildren();
    if (!categories.length) {
      const empty = makeElement("div", "category-empty", "No budgets yet. Add one to set a monthly intention.");
      els.budgets.append(empty);
      return;
    }
    categories.forEach((category) => {
      const limit = budgetFor(category);
      if (!limit) return;
      const actual = spent.get(category) || 0;
      const percent = Math.min(100, actual / limit * 100);
      const over = actual > limit;
      const item = makeElement("div", "budget-item");
      const head = makeElement("div", "budget-head");
      head.append(makeElement("span", "budget-category", `${CATEGORY_ICONS[category] || "·"} ${category}`));
      const value = makeElement("span", "budget-value");
      value.append(makeElement("strong", "", money(actual)), document.createTextNode(` / ${money(limit)}`));
      head.append(value);
      const track = makeElement("div", "budget-progress");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${category} budget used`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", String(limit));
      track.setAttribute("aria-valuenow", String(Math.min(actual, limit)));
      const fill = makeElement("span", over ? "over" : "");
      fill.style.width = `${Math.max(actual > 0 ? 2 : 0, percent)}%`;
      track.append(fill);
      const subline = makeElement("div", "budget-subline");
      subline.append(makeElement("span", "budget-status " + (over ? "over" : "ok"), over ? `${money(actual - limit)} over` : `${money(limit - actual)} left`));
      subline.append(makeElement("span", "", `${Math.round(actual / limit * 100)}%`));
      const actions = makeElement("div", "budget-actions");
      const edit = makeElement("button", "row-action", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => showBudgetForm(category));
      const remove = makeElement("button", "row-action", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => removeBudget(category));
      actions.append(edit, remove);
      item.append(head, track, subline, actions);
      els.budgets.append(item);
    });
  }

  function updateCategoryOptions(select, type, chosen) {
    select.replaceChildren();
    CATEGORIES[type].forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
    if (chosen && CATEGORIES[type].includes(chosen)) select.value = chosen;
  }

  function openTransaction(item) {
    editingId = item ? item.id : null;
    setText(els.dialogTitle, item ? "Edit transaction" : "Add a transaction");
    setText(els.saveTransaction, item ? "Save changes" : "Save transaction");
    els.type.value = item ? item.type : "expense";
    document.querySelectorAll(".type-option").forEach((button) => {
      const selected = button.dataset.type === els.type.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    updateCategoryOptions(els.category, els.type.value, item ? item.category : undefined);
    els.description.value = item ? item.description : "";
    els.amount.value = item ? String(item.amount) : "";
    els.date.value = item ? item.date : localDateString(new Date());
    setText(els.transactionError, "");
    els.dialog.showModal();
    window.setTimeout(() => els.description.focus(), 0);
  }

  function localDateString(date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function closeTransaction() {
    if (els.dialog.open) els.dialog.close();
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();
    const description = els.description.value.trim();
    const amount = Number(els.amount.value);
    const date = els.date.value;
    const type = els.type.value;
    if (!description) return setText(els.transactionError, "Please enter a description.");
    if (!Number.isFinite(amount) || amount <= 0) return setText(els.transactionError, "Enter an amount greater than zero.");
    if (!date || !isValidDate(date)) return setText(els.transactionError, "Choose a valid date.");
    if (date > localDateString(new Date())) return setText(els.transactionError, "Date cannot be in the future.");
    const item = {
      id: editingId || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      description, amount: Math.round(amount * 100) / 100, date, type, category: els.category.value,
      createdAt: editingId ? (state.transactions.find((entry) => entry.id === editingId) || {}).createdAt || Date.now() : Date.now()
    };
    const transactions = editingId
      ? state.transactions.map((entry) => entry.id === editingId ? item : entry)
      : [...state.transactions, item];
    if (saveState({ ...state, transactions })) {
      closeTransaction();
      render();
      showToast(editingId ? "Transaction updated." : "Transaction added.");
    }
  }

  function isValidDate(value) {
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return false;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
  }

  function deleteTransaction(id) {
    const item = state.transactions.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Delete “${item.description}”? This cannot be undone.`)) return;
    const transactions = state.transactions.filter((entry) => entry.id !== id);
    if (saveState({ ...state, transactions })) {
      render();
      showToast("Transaction deleted.");
    }
  }

  function showBudgetForm(category) {
    els.budgetForm.hidden = false;
    updateCategoryOptions(els.budgetCategory, "expense", category);
    els.budgetAmount.value = category ? String(budgetFor(category) || "") : "";
    setText(els.budgetError, "");
    els.budgetAmount.focus();
  }

  function saveBudget(event) {
    event.preventDefault();
    const category = els.budgetCategory.value;
    const amount = Number(els.budgetAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return setText(els.budgetError, "Enter a monthly limit greater than zero.");
    const key = currentMonthKey();
    const budgets = {
      ...state.budgets,
      [key]: { ...(state.budgets[key] || {}), [category]: Math.round(amount * 100) / 100 }
    };
    if (saveState({ ...state, budgets })) {
      els.budgetForm.hidden = true;
      renderBudgets();
      showToast(`${category} budget saved.`);
    }
  }

  function removeBudget(category) {
    const key = currentMonthKey();
    if (!state.budgets[key]) return;
    const monthBudgets = { ...state.budgets[key] };
    delete monthBudgets[category];
    const budgets = { ...state.budgets };
    if (Object.keys(monthBudgets).length) budgets[key] = monthBudgets;
    else delete budgets[key];
    if (saveState({ ...state, budgets })) {
      renderBudgets();
      showToast(`${category} budget removed.`);
    }
  }

  function showToast(message) {
    setText(els.toast, message);
    els.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  $("#add-transaction").addEventListener("click", () => openTransaction(null));
  $("#close-dialog").addEventListener("click", closeTransaction);
  $("#cancel-dialog").addEventListener("click", closeTransaction);
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) closeTransaction();
  });
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  document.querySelectorAll(".type-option").forEach((button) => {
    button.addEventListener("click", () => {
      els.type.value = button.dataset.type;
      updateCategoryOptions(els.category, els.type.value);
      document.querySelectorAll(".type-option").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
    });
  });
  $("#previous-month").addEventListener("click", () => {
    selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
    render();
  });
  $("#next-month").addEventListener("click", () => {
    const next = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
    if (next <= new Date(dateNow.getFullYear(), dateNow.getMonth(), 1)) {
      selectedMonth = next;
      render();
    }
  });
  $("#current-month").addEventListener("click", () => {
    selectedMonth = new Date(dateNow.getFullYear(), dateNow.getMonth(), 1);
    render();
  });
  $("#add-budget").addEventListener("click", () => showBudgetForm(null));
  $("#cancel-budget").addEventListener("click", () => { els.budgetForm.hidden = true; });
  els.budgetForm.addEventListener("submit", saveBudget);

  render();
})();
