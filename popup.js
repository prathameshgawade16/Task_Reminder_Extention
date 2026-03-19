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

function getCurrentISTDateTimeString() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + IST_OFFSET_MINUTES * 60000;
  const ist = new Date(istMs);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  const hh = String(ist.getHours()).padStart(2, "0");
  const min = String(ist.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function loadTasks(callback) {
  chrome.storage.local.get("tasks", (data) => {
    callback(data.tasks || []);
  });
}

function saveTasks(tasks, callback) {
  chrome.storage.local.set({ tasks }, callback);
}

function cleanOldDoneTasks(tasks) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return tasks.filter(t => {
    if (t.status !== "done") return true;
    return (now - t.completedAt) < sevenDays;
  });
}

function isTaskDue(task) {
  const nowISTStr = getCurrentISTDateTimeString();
  return task.completionDateTime <= nowISTStr;
}

function renderTasks() {
  loadTasks((tasks) => {
    tasks = cleanOldDoneTasks(tasks);
    saveTasks(tasks);

    const activeTasks = tasks
      .filter(t => t.status === "active")
      .sort((a, b) => a.createdAt - b.createdAt);

    const doneTasks = tasks
      .filter(t => t.status === "done")
      .sort((a, b) => b.completedAt - a.completedAt);

    const activeList = document.getElementById("activeList");
    const doneList = document.getElementById("doneList");

    // Render Active
    if (activeTasks.length === 0) {
      activeList.innerHTML = `<div class="empty-msg">No active tasks</div>`;
    } else {
      activeList.innerHTML = activeTasks.map(task => {
        const due = isTaskDue(task);
        const badgeClass = due ? "badge-due" : "badge-pending";
        const badgeLabel = due ? "Due" : "Pending";
        const formattedDT = formatCompletionDateTime(task.completionDateTime);

        return `
          <div class="task-card" data-id="${task.id}">
            <div class="task-header">
              <span class="task-title">${escapeHtml(task.title)}</span>
              <span class="badge ${badgeClass}">${badgeLabel}</span>
            </div>
            ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ""}
            <div class="task-meta">
              Completion: ${formattedDT} &nbsp;|&nbsp; Added: ${formatDateTime(task.createdAt)}
            </div>
            <div class="task-actions">
              <button class="btn-done" data-id="${task.id}">✓ Mark Complete</button>
            </div>
          </div>
        `;
      }).join("");
    }

    // Render Done
    if (doneTasks.length === 0) {
      doneList.innerHTML = `<div class="empty-msg">No completed tasks</div>`;
    } else {
      doneList.innerHTML = doneTasks.map(task => {
        const formattedDT = formatCompletionDateTime(task.completionDateTime);
        return `
          <div class="task-card" data-id="${task.id}">
            <div class="task-header">
              <span class="task-title">${escapeHtml(task.title)}</span>
              <span class="badge badge-done">Done</span>
            </div>
            ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ""}
            <div class="task-meta">
              Completion: ${formattedDT} &nbsp;|&nbsp; Completed: ${formatDateTime(task.completedAt)}
            </div>
            <div class="task-actions">
              <button class="btn-reactivate" data-id="${task.id}">↩ Move to Active</button>
            </div>
          </div>
        `;
      }).join("");
    }

    // Mark Complete buttons
    document.querySelectorAll(".btn-done").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        markDone(id);
      });
    });

    // Reactivate buttons
    document.querySelectorAll(".btn-reactivate").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        markActive(id);
      });
    });
  });
}

function markDone(id) {
  // Cancel the task-specific alarm
  chrome.runtime.sendMessage({ type: "CANCEL_TASK_ALARM", taskId: id });

  loadTasks((tasks) => {
    const updated = tasks.map(t => {
      if (t.id === id) {
        return { ...t, status: "done", completedAt: Date.now() };
      }
      return t;
    });
    saveTasks(updated, renderTasks);
  });
}

function markActive(id) {
  loadTasks((tasks) => {
    const task = tasks.find(t => t.id === id);
    const updated = tasks.map(t => {
      if (t.id === id) {
        const { completedAt, ...rest } = t;
        return { ...rest, status: "active" };
      }
      return t;
    });

    saveTasks(updated, () => {
      // Reschedule alarm if time hasn't passed
      if (task && task.completionDateTime) {
        chrome.runtime.sendMessage({ type: "SCHEDULE_TASK_ALARM", task: { ...task, status: "active" } }, (response) => {
          if (response && !response.scheduled) {
            // Time already passed — mark as due (just re-render, isTaskDue handles badge)
          }
          renderTasks();
        });
      } else {
        renderTasks();
      }
    });
  });
}

function addTask() {
  const title = document.getElementById("taskTitle").value.trim();
  const description = document.getElementById("taskDesc").value.trim();
  const dueDate = document.getElementById("taskDue").value;
  const dueTime = document.getElementById("taskTime").value;

  if (!title) {
    alert("Please enter a task title.");
    return;
  }
  if (!dueDate) {
    alert("Please select a completion date.");
    return;
  }
  if (!dueTime) {
    alert("Please select a completion time.");
    return;
  }

  const completionDateTime = `${dueDate}T${dueTime}`;

  const newTask = {
    id: generateId(),
    title,
    description,
    completionDateTime,
    status: "active",
    createdAt: Date.now()
  };

  loadTasks((tasks) => {
    tasks.push(newTask);
    saveTasks(tasks, () => {
      // Try to schedule alarm
      chrome.runtime.sendMessage({ type: "SCHEDULE_TASK_ALARM", task: newTask }, (response) => {
        if (response && !response.scheduled) {
          // Time already passed — task is immediately Due, no alarm needed
        }
        document.getElementById("taskTitle").value = "";
        document.getElementById("taskDesc").value = "";
        document.getElementById("taskDue").value = "";
        document.getElementById("taskTime").value = "";
        renderTasks();
      });
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCompletionDateTime(dtStr) {
  if (!dtStr) return "—";
  const [datePart, timePart] = dtStr.split("T");
  const [yyyy, mm, dd] = datePart.split("-");
  return `${dd}/${mm}/${yyyy} ${timePart}`;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false
  });
}

// Init
document.getElementById("addTaskBtn").addEventListener("click", addTask);
renderTasks();