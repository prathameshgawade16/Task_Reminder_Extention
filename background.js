const IST_OFFSET_MINUTES = 330;

function getTodayISTDateString() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + IST_OFFSET_MINUTES * 60000;
  const ist = new Date(istMs);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentISTTimestamp() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return utcMs + IST_OFFSET_MINUTES * 60000;
}

function msUntilNextISTTime(targetHour, targetMinute) {
  const nowISTMs = getCurrentISTTimestamp();
  const ist = new Date(nowISTMs);
  let next = new Date(nowISTMs);
  next.setHours(targetHour, targetMinute, 0, 0);
  if (next <= ist) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - ist.getTime();
}

function scheduleDailyAlarms() {
  chrome.alarms.get("daily_11am", (existing) => {
    if (!existing) {
      const msTo11am = msUntilNextISTTime(11, 0);
      chrome.alarms.create("daily_11am", {
        delayInMinutes: Math.max(msTo11am / 60000, 1),
        periodInMinutes: 1440
      });
    }
  });

  chrome.alarms.get("daily_5pm", (existing) => {
    if (!existing) {
      const msTo5pm = msUntilNextISTTime(17, 0);
      chrome.alarms.create("daily_5pm", {
        delayInMinutes: Math.max(msTo5pm / 60000, 1),
        periodInMinutes: 1440
      });
    }
  });
}

function scheduleTaskAlarm(task) {
  const [datePart, timePart] = task.completionDateTime.split("T");
  const [yyyy, mm, dd] = datePart.split("-").map(Number);
  const [hh, min] = timePart.split(":").map(Number);

  // Build UTC ms from IST datetime
  const istTargetMs = Date.UTC(yyyy, mm - 1, dd, hh, min, 0, 0) - IST_OFFSET_MINUTES * 60000;
  const nowMs = Date.now();

  if (istTargetMs <= nowMs) {
    return false;
  }

  const delayMinutes = (istTargetMs - nowMs) / 60000;
  const alarmName = `task_${task.id}`;

  chrome.alarms.get(alarmName, (existing) => {
    if (!existing) {
      chrome.alarms.create(alarmName, {
        delayInMinutes: Math.max(delayMinutes, 1)
      });
    }
  });

  return true;
}

function cancelTaskAlarm(taskId) {
  chrome.alarms.clear(`task_${taskId}`);
}

function cleanOldDoneTasks(tasks) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return tasks.filter(t => {
    if (t.status !== "done") return true;
    return (now - t.completedAt) < sevenDays;
  });
}

function rescheduleAllTaskAlarms() {
  chrome.storage.local.get("tasks", (data) => {
    const tasks = data.tasks || [];
    tasks.forEach(t => {
      if (t.status === "active" && t.completionDateTime) {
        scheduleTaskAlarm(t);
      }
    });
  });
}

// On install
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clearAll(() => {
    scheduleDailyAlarms();
    rescheduleAllTaskAlarms();
  });
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  scheduleDailyAlarms();
  rescheduleAllTaskAlarms();
});

// Keep service worker alive by listening to alarms
chrome.alarms.onAlarm.addListener((alarm) => {

  // Re-schedule daily alarms if needed (keeps them alive)
  scheduleDailyAlarms();

  chrome.storage.local.get("tasks", (data) => {
    let tasks = data.tasks || [];
    tasks = cleanOldDoneTasks(tasks);
    chrome.storage.local.set({ tasks });

    const today = getTodayISTDateString();

    // Daily 11am
    if (alarm.name === "daily_11am") {
      const activeTasks = tasks.filter(t => t.status === "active");
      if (activeTasks.length > 0) {
        const taskList = activeTasks.map(t => `• ${t.title}`).join("\n");
        chrome.notifications.create("notif_11am_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Task Reminder — 11 AM Check",
          message: `You have ${activeTasks.length} active task(s):\n${taskList}`
        });
      }
    }

    // Daily 5pm
    if (alarm.name === "daily_5pm") {
      const dueTasks = tasks.filter(t => {
        if (t.status !== "active") return false;
        const dateOnly = t.completionDateTime
          ? t.completionDateTime.split("T")[0]
          : null;
        return dateOnly && dateOnly <= today;
      });
      if (dueTasks.length > 0) {
        const taskList = dueTasks.map(t => `• ${t.title}`).join("\n");
        chrome.notifications.create("notif_5pm_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Task Reminder — Due Tasks",
          message: `${dueTasks.length} task(s) due or overdue:\n${taskList}`
        });
      }
    }

    // Task-specific alarm
    if (alarm.name.startsWith("task_")) {
      const taskId = alarm.name.replace("task_", "");
      const nowISTMs = getCurrentISTTimestamp();
      const ist = new Date(nowISTMs);
      const currentMinute =
        `${ist.getFullYear()}-` +
        `${String(ist.getMonth() + 1).padStart(2, "0")}-` +
        `${String(ist.getDate()).padStart(2, "0")}T` +
        `${String(ist.getHours()).padStart(2, "0")}:` +
        `${String(ist.getMinutes()).padStart(2, "0")}`;

      // Find all active tasks due at this exact minute
      const firingTasks = tasks.filter(t =>
        t.status === "active" &&
        t.completionDateTime === currentMinute
      );

      // Fallback to the specific task if no minute match
      const specificTask = tasks.find(
        t => t.id === taskId && t.status === "active"
      );
      const toNotify =
        firingTasks.length > 0
          ? firingTasks
          : specificTask
          ? [specificTask]
          : [];

      if (toNotify.length > 0) {
        const taskList = toNotify.map(t => `• ${t.title}`).join("\n");
        chrome.notifications.create("notif_task_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "⏰ Task Due Now",
          message:
            toNotify.length === 1
              ? `"${toNotify[0].title}" is due now!`
              : `${toNotify.length} tasks are due now:\n${taskList}`
        });
      }
    }
  });
});

// Message handler from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCHEDULE_TASK_ALARM") {
    const scheduled = scheduleTaskAlarm(msg.task);
    sendResponse({ scheduled });
  }
  if (msg.type === "CANCEL_TASK_ALARM") {
    cancelTaskAlarm(msg.taskId);
    sendResponse({ done: true });
  }
  if (msg.type === "RESCHEDULE_ALL") {
    rescheduleAllTaskAlarms();
    sendResponse({ done: true });
  }
  return true;
});
