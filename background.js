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
  chrome.alarms.clear("daily_11am");
  chrome.alarms.clear("daily_5pm");

  const msTo11am = msUntilNextISTTime(11, 0);
  const msTo5pm = msUntilNextISTTime(17, 0);

  chrome.alarms.create("daily_11am", {
    delayInMinutes: msTo11am / 60000,
    periodInMinutes: 1440
  });

  chrome.alarms.create("daily_5pm", {
    delayInMinutes: msTo5pm / 60000,
    periodInMinutes: 1440
  });
}

function scheduleTaskAlarm(task) {
  // task.completionDateTime is "YYYY-MM-DDTHH:MM" in IST
  const [datePart, timePart] = task.completionDateTime.split("T");
  const [yyyy, mm, dd] = datePart.split("-").map(Number);
  const [hh, min] = timePart.split(":").map(Number);

  // Build IST timestamp for that datetime
  const istTargetMs = Date.UTC(yyyy, mm - 1, dd, hh, min, 0, 0) - IST_OFFSET_MINUTES * 60000;
  const nowMs = Date.now();

  if (istTargetMs <= nowMs) {
    // Time already passed — mark as due immediately via storage flag
    return false; // caller handles this
  }

  const delayMinutes = (istTargetMs - nowMs) / 60000;
  const alarmName = `task_${task.id}`;

  chrome.alarms.create(alarmName, {
    delayInMinutes: delayMinutes
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

chrome.runtime.onInstalled.addListener(() => {
  scheduleDailyAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyAlarms();
  // Reschedule all active task alarms on browser start
  chrome.storage.local.get("tasks", (data) => {
    const tasks = data.tasks || [];
    tasks.forEach(t => {
      if (t.status === "active" && t.completionDateTime) {
        scheduleTaskAlarm(t);
      }
    });
  });
});

// Expose scheduleTaskAlarm and cancelTaskAlarm to popup via messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCHEDULE_TASK_ALARM") {
    const scheduled = scheduleTaskAlarm(msg.task);
    sendResponse({ scheduled });
  }
  if (msg.type === "CANCEL_TASK_ALARM") {
    cancelTaskAlarm(msg.taskId);
    sendResponse({ done: true });
  }
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
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
        const dateOnly = t.completionDateTime ? t.completionDateTime.split("T")[0] : t.dueDate;
        return dateOnly <= today;
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
      // Find all active tasks whose alarm just fired at this same minute
      const nowISTMs = getCurrentISTTimestamp();
      const ist = new Date(nowISTMs);
      const currentMinute = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,"0")}-${String(ist.getDate()).padStart(2,"0")}T${String(ist.getHours()).padStart(2,"0")}:${String(ist.getMinutes()).padStart(2,"0")}`;

      const firingTasks = tasks.filter(t =>
        t.status === "active" &&
        t.completionDateTime === currentMinute
      );

      // Also include the specific task that fired (in case of slight timing mismatch)
      const specificTask = tasks.find(t => t.id === taskId && t.status === "active");

      const toNotify = firingTasks.length > 0 ? firingTasks : (specificTask ? [specificTask] : []);

      if (toNotify.length > 0) {
        const taskList = toNotify.map(t => `• ${t.title}`).join("\n");
        chrome.notifications.create("notif_task_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "⏰ Task Due Now",
          message: toNotify.length === 1
            ? `"${toNotify[0].title}" is due now!`
            : `${toNotify.length} tasks are due now:\n${taskList}`
        });
      }
    }
  });
});