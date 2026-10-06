(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  tg?.ready();
  tg?.expand();

  // ==================================================================
  // ТЕМА: только тёмный режим
  // ==================================================================
  const root = document.documentElement;

  function applyTheme() {
    const theme = localStorage.getItem("rem_theme") || "classic";
    root.dataset.theme = theme;
    root.dataset.scheme = "dark";
    localStorage.removeItem("rem_scheme");
    document.querySelectorAll("[data-set-theme]").forEach((b) =>
      b.classList.toggle("active", b.dataset.setTheme === theme));

    const hero = document.querySelector(".hero-art");
    if (hero) {
      const heroMap = {
        resident: "assets/theme-resident.svg",
        strinova: "assets/theme-strinova.svg",
      };
      hero.src = heroMap[theme] || "assets/reminder-hero.svg";
    }
    document.body.dataset.heroTheme = theme;
  }

  function setTheme(theme) {
    localStorage.setItem("rem_theme", theme);
    tg?.HapticFeedback?.selectionChanged();
    applyTheme();
  }

  // ==================================================================
  // ШТОРКА НАСТРОЕК
  // ==================================================================
  const sheet = document.getElementById("settingsSheet");
  const backdrop = document.getElementById("sheetBackdrop");

  function openSheet() {
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    backdrop.classList.remove("hidden");
    tg?.HapticFeedback?.impactOccurred("light");
  }

  function closeSheet() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.classList.add("hidden");
  }

  document.getElementById("settingsBtn").addEventListener("click", () => {
    sheet.classList.contains("open") ? closeSheet() : openSheet();
  });
  backdrop.addEventListener("click", closeSheet);

  document.querySelectorAll("[data-set-theme]").forEach((b) =>
    b.addEventListener("click", () => setTheme(b.dataset.setTheme)));

  // «+» — новая напоминалка (сбрасываем форму, уходим из режима редактирования)
  document.getElementById("menuNew").addEventListener("click", () => {
    tg?.HapticFeedback?.impactOccurred("light");
    if (location.search) {
      window.location.href = location.pathname;
    } else {
      closeSheet();
    }
  });

  document.getElementById("bottomNewReminder")?.addEventListener("click", () => {
    tg?.HapticFeedback?.impactOccurred("light");
    window.scrollTo({ top: 0, behavior: "smooth" });
    taskText?.focus();
  });

  // «Мои напоминалки» теперь находятся прямо в нижней части интерфейса.
  document.getElementById("menuList").addEventListener("click", () => {
    tg?.HapticFeedback?.impactOccurred("light");
    closeSheet();
    document.getElementById("myRemindersSection")?.scrollIntoView({
      behavior: "smooth", block: "start"
    });
  });

  // ==================================================================
  // РЕЖИМ: новая / редактирование
  // ==================================================================
  function decodePayload(b64url) {
    let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }

  const params = new URLSearchParams(location.search);
  const editing = params.get("mode") === "edit";
  let prefill = null;
  if (editing && params.get("data")) {
    try { prefill = decodePayload(params.get("data")); } catch { prefill = null; }
  }

  // Локальный список — быстрый экранный кэш для нижнего блока «Мои напоминалки».
  // Сам бот остаётся источником истины; здесь мы лишь запоминаем то, что
  // пользователь только что сохранил на этом устройстве.
  const REMINDER_CACHE_KEY = "notes_reminders_cache_v2";

  function readReminderCache() {
    try {
      const value = JSON.parse(localStorage.getItem(REMINDER_CACHE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeReminderCache(items) {
    try {
      localStorage.setItem(REMINDER_CACHE_KEY, JSON.stringify(items.slice(0, 30)));
    } catch (_) {}
  }

  function cacheReminder(item) {
    if (!item?.text || !item?.time || !item?.mode) return;
    const items = readReminderCache();
    const serverId = item.id || null;
    const id = serverId || `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const next = { ...item, id, server_id: serverId, saved_at: Date.now() };
    const filtered = items.filter((x) => x.id !== id);
    writeReminderCache([next, ...filtered]);
  }

  function removeCachedReminder(id) {
    writeReminderCache(readReminderCache().filter((x) => x.id !== id));
    renderReminderCache();
  }

  function formatSchedule(item) {
    if (item.mode === "once") {
      return item.date ? `Разово · ${item.date.split("-").reverse().join(".")}` : "Разово";
    }
    if (item.mode === "weekly") {
      const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
      const days = (item.weekdays || []).map(Number).sort((a,b) => a-b);
      return `По дням · ${days.map((d) => names[d]).join(", ") || "—"}`;
    }
    return `Каждые ${item.interval_days || 1} ${(item.interval_days || 1) === 1 ? "день" : "дня"}`;
  }

  function renderReminderCache() {
    const list = document.getElementById("myRemindersList");
    const empty = document.getElementById("myRemindersEmpty");
    const count = document.getElementById("myRemindersCount");
    if (!list || !empty || !count) return;

    const items = readReminderCache();
    count.textContent = String(items.length);
    list.innerHTML = "";

    empty.classList.toggle("hidden", items.length !== 0);

    items.slice(0, 8).forEach((item) => {
      const card = document.createElement("article");
      card.className = "reminder-item";

      const top = document.createElement("div");
      top.className = "reminder-item-top";

      const time = document.createElement("strong");
      time.className = "reminder-item-time";
      time.textContent = item.time;

      const badge = document.createElement("span");
      badge.className = "reminder-item-badge";
      badge.textContent = item.mode === "once" ? "РАЗОВО" : item.mode === "weekly" ? "ПО ДНЯМ" : "ИНТЕРВАЛ";

      top.append(time, badge);

      const text = document.createElement("div");
      text.className = "reminder-item-text";
      text.textContent = item.text;

      const meta = document.createElement("div");
      meta.className = "reminder-item-meta";
      meta.textContent = formatSchedule(item);

      const actions = document.createElement("div");
      actions.className = "reminder-item-actions";

      if (item.server_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "reminder-mini-btn";
        editBtn.textContent = "Изменить";
        editBtn.addEventListener("click", () => {
          const editData = { ...item, id: item.server_id };
          const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(editData))))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
          window.location.href = `${location.pathname}?mode=edit&data=${encoded}`;
        });
        actions.append(editBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "reminder-mini-btn danger";
      deleteBtn.textContent = "Убрать";
      deleteBtn.addEventListener("click", async () => {
        if (!item.server_id) {
          removeCachedReminder(item.id);
          return;
        }
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Удаляем…";
        try {
          const response = await fetch("/.netlify/functions/reminders", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-Init-Data": tg?.initData || "",
            },
            body: JSON.stringify({ id: item.server_id }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error || `API ${response.status}`);
          removeCachedReminder(item.id);
          tg?.HapticFeedback?.notificationOccurred("success");
        } catch (err) {
          console.error("Delete reminder failed", err);
          deleteBtn.disabled = false;
          deleteBtn.textContent = "Убрать";
          alert("Не удалось удалить напоминание.");
        }
      });

      actions.append(deleteBtn);
      card.append(top, text, meta, actions);
      list.appendChild(card);
    });
  }

  renderReminderCache();

  const headLogo = document.getElementById("headLogo");
  const headSub = document.getElementById("headSub");
  if (editing) {
    headLogo.textContent = "✏️";
    headSub.textContent = "Изменить напоминалку";
  }

  // ==================================================================
  // Колесо выбора времени
  // ==================================================================
  const CELL_H = 56;
  const WRAP_H = 176;
  const SPACER = (WRAP_H - CELL_H) / 2;

  function buildWheel(container, max) {
    const top = document.createElement("div");
    top.style.height = SPACER + "px";
    container.appendChild(top);
    for (let i = 0; i <= max; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = String(i).padStart(2, "0");
      cell.dataset.value = String(i);
      container.appendChild(cell);
    }
    const bottom = document.createElement("div");
    bottom.style.height = SPACER + "px";
    container.appendChild(bottom);
  }

  function wheelController(container, max, initial, onChange) {
    buildWheel(container, max);
    const cells = Array.from(container.querySelectorAll(".cell"));
    let current = initial;

    function paint(index) {
      cells.forEach((c, i) => c.classList.toggle("is-center", i === index));
    }

    function scrollTo(index, smooth) {
      const clamped = Math.max(0, Math.min(max, index));
      container.scrollTo({ top: clamped * CELL_H, behavior: smooth ? "smooth" : "auto" });
      paint(clamped);
    }

    let scrollTimer = null;
    container.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = Math.max(0, Math.min(max, Math.round(container.scrollTop / CELL_H)));
        scrollTo(index, true);
        if (index !== current) {
          current = index;
          tg?.HapticFeedback?.selectionChanged();
        }
        onChange(index);
      }, 120);
    });

    scrollTo(initial, false);
    paint(initial);
    return { scrollTo, get value() { return current; } };
  }

  function parsePrefillTime(value) {
    const m = /^([01]?\d|2[0-3]):([0-5]?\d)$/.exec(String(value || ""));
    if (!m) return null;
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  }

  const now = new Date();
  const localDateStr = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const pfTime = prefill ? parsePrefillTime(prefill.time) : null;
  const initHour = pfTime ? pfTime.h : now.getHours();
  const initMinute = pfTime ? pfTime.m : now.getMinutes();

  let selectedHour = initHour;
  let selectedMinute = initMinute;

  const hoursWheel = wheelController(document.getElementById("wheelHours"), 23, initHour,
    (v) => { selectedHour = v; validate(); });
  const minutesWheel = wheelController(document.getElementById("wheelMinutes"), 59, initMinute,
    (v) => { selectedMinute = v; validate(); });

  // ==================================================================
  // Текст задачи
  // ==================================================================
  const taskText = document.getElementById("taskText");
  if (prefill?.text) taskText.value = prefill.text;
  taskText.addEventListener("input", validate);

  // ==================================================================
  // Режим повтора
  // ==================================================================
  const segButtons = Array.from(document.querySelectorAll(".seg-btn"));
  const panes = {
    once: document.getElementById("paneOnce"),
    weekly: document.getElementById("paneWeekly"),
    interval: document.getElementById("paneInterval"),
  };
  let currentMode = prefill?.mode || "once";

  function setMode(mode) {
    currentMode = mode;
    segButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    Object.entries(panes).forEach(([key, el]) => el.classList.toggle("hidden", key !== mode));
    validate();
  }

  segButtons.forEach((btn) => btn.addEventListener("click", () => {
    tg?.HapticFeedback?.impactOccurred("light");
    setMode(btn.dataset.mode);
  }));

  const onceDate = document.getElementById("onceDate");
  const todayStr = localDateStr();
  onceDate.min = todayStr;
  onceDate.value = prefill?.date || todayStr;
  onceDate.addEventListener("input", validate);

  const dayPills = Array.from(document.querySelectorAll(".day-pill"));
  const selectedDays = new Set(prefill?.weekdays || []);
  dayPills.forEach((pill) => {
    const day = parseInt(pill.dataset.day, 10);
    pill.classList.toggle("active", selectedDays.has(day));
    pill.addEventListener("click", () => {
      tg?.HapticFeedback?.selectionChanged();
      if (selectedDays.has(day)) selectedDays.delete(day); else selectedDays.add(day);
      pill.classList.toggle("active");
      validate();
    });
  });

  const intervalValueEl = document.getElementById("intervalValue");
  const intervalUnitEl = document.getElementById("intervalUnit");
  const startDate = document.getElementById("startDate");
  startDate.min = todayStr;
  startDate.value = prefill?.start_date || todayStr;
  startDate.addEventListener("input", validate);

  let intervalDays = prefill?.interval_days || 1;

  function pluralDays(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "день";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
    return "дней";
  }

  function renderInterval() {
    intervalValueEl.textContent = String(intervalDays);
    intervalUnitEl.textContent = pluralDays(intervalDays);
  }
  renderInterval();

  document.getElementById("intervalMinus").addEventListener("click", () => {
    intervalDays = Math.max(1, intervalDays - 1);
    tg?.HapticFeedback?.selectionChanged();
    renderInterval();
  });
  document.getElementById("intervalPlus").addEventListener("click", () => {
    intervalDays = Math.min(365, intervalDays + 1);
    tg?.HapticFeedback?.selectionChanged();
    renderInterval();
  });

  setMode(currentMode);

  // ==================================================================
  // Валидация + кнопка сохранения
  // ==================================================================
  const ACCENT = getComputedStyle(root).getPropertyValue("--accent").trim() || "#8C7CF0";

  function validate() {
    let ok = taskText.value.trim().length > 0;
    if (ok && currentMode === "once") ok = !!onceDate.value;
    if (ok && currentMode === "weekly") ok = selectedDays.size > 0;
    if (ok && currentMode === "interval") ok = !!startDate.value;

    if (tg?.MainButton) {
      if (ok) tg.MainButton.enable(); else tg.MainButton.disable();
      tg.MainButton.setParams({
        color: ok ? ACCENT : "#5B5E82",
        text_color: "#FFFFFF",
      });
    }
    const fb = document.getElementById("saveFallback");
    if (fb) fb.disabled = !ok;
    return ok;
  }

  function buildPayload() {
    let timezone = "UTC";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
    const payload = {
      text: taskText.value.trim(),
      time: `${String(selectedHour).padStart(2, "0")}:${String(selectedMinute).padStart(2, "0")}`,
      mode: currentMode,
      timezone,
      theme: localStorage.getItem("rem_theme") || "classic",
    };
    if (prefill?.id) payload.id = prefill.id;
    if (currentMode === "once") payload.date = onceDate.value;
    if (currentMode === "weekly") payload.weekdays = Array.from(selectedDays).sort((a, b) => a - b);
    if (currentMode === "interval") {
      payload.interval_days = intervalDays;
      payload.start_date = startDate.value;
    }
    return payload;
  }

  let saving = false;
  let saveTimer = null;

  function resetSaveState() {
    saving = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (tg?.MainButton) {
      tg.MainButton.hideProgress();
      validate();
    }
    const fb = document.getElementById("saveFallback");
    if (fb) {
      fb.disabled = !validate();
      fb.textContent = editing ? "Сохранить изменения" : "Сохранить";
    }
  }

  async function saveViaApi(payload) {
    const initData = tg?.initData || "";
    if (!initData) throw new Error("Telegram initData отсутствует");
    const response = await fetch("/.netlify/functions/reminders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initData,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `API ${response.status}`);
    }
    return data.item;
  }

  async function handleSave() {
    if (saving) return;
    if (!validate()) {
      tg?.HapticFeedback?.notificationOccurred("error");
      return;
    }

    const payload = buildPayload();
    saving = true;

    if (tg?.MainButton) {
      tg.MainButton.showProgress();
      tg.MainButton.disable();
    }

    const fb = document.getElementById("saveFallback");
    if (fb) {
      fb.disabled = true;
      fb.textContent = "Сохраняем…";
    }

    // Основной путь теперь одинаковый для кнопки Open/Menu и для обычного
    // запуска: Mini App → Netlify Function → бот. sendData остаётся запасным
    // вариантом для старого сценария reply-кнопки Telegram.
    try {
      const saved = await saveViaApi(payload);
      cacheReminder(saved || payload);
      renderReminderCache();
      tg?.HapticFeedback?.notificationOccurred("success");
      if (tg?.MainButton) tg.MainButton.hideProgress();
      if (fb) fb.textContent = editing ? "Изменения сохранены ✓" : "Сохранено ✓";
      setTimeout(() => {
        try { tg?.close(); } catch (_) {}
      }, 350);
      return;
    } catch (apiError) {
      console.warn("Mini App API save failed, trying Telegram sendData", apiError);
    }

    if (tg?.sendData) {
      try {
        tg.sendData(JSON.stringify(payload));
        cacheReminder(payload);
        renderReminderCache();
        tg?.HapticFeedback?.notificationOccurred("success");
        saveTimer = setTimeout(resetSaveState, 1800);
        return;
      } catch (err) {
        console.error("Telegram WebApp.sendData failed", err);
      }
    }

    resetSaveState();
    tg?.HapticFeedback?.notificationOccurred("error");
    alert("Не удалось сохранить напоминание. Проверьте подключение Mini App к серверу.");
  }

  // Всегда используем одну обработку нажатия. Это устраняет накопление
  // обработчиков при повторной инициализации WebApp.
  if (tg?.MainButton) {
    tg.MainButton.setParams({
      text: editing ? "Сохранить изменения" : "Сохранить",
      color: ACCENT,
      text_color: "#FFFFFF",
    });
    tg.MainButton.onClick(handleSave);
    tg.MainButton.show();
  } else {
    const fb = document.createElement("button");
    fb.id = "saveFallback";
    fb.type = "button";
    fb.className = "save-fallback";
    fb.textContent = editing ? "Сохранить изменения" : "Сохранить";
    fb.addEventListener("click", handleSave);
    document.body.appendChild(fb);
    document.getElementById("bottomHint").textContent =
      "Откройте форму через Telegram, чтобы сохранить напоминание.";
  }

  applyTheme();
  validate();
})();
