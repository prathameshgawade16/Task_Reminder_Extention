# Credits to claude, 100% vibe coded

# Task_Reminder_Extention
A Chrome extension for personal task management with smart reminders.  Add tasks with completion deadlines, get notified at 11AM daily, at task due time,  and at 5PM for overdue items. Built with vanilla JS and Chrome Extensions Manifest V3.


# Task Reminder — Chrome Extension

A lightweight personal task manager built as a Chrome Extension. No servers, no accounts, no hosting required. Everything runs locally in your browser.

---

## What It Does

Task Reminder lets you add tasks with a title, description, and an exact completion deadline (date + time). It tracks your tasks across two sections — **Active** and **Done** — and reminds you automatically so nothing slips through.

### Key Features

- Add tasks with a title, description, and completion date & time (24hr format)
- Tasks are labelled **Pending** (deadline in the future) or **Due** (deadline reached or passed)
- Three smart alarms:
  - **11:00 AM IST daily** — always fires, lists all your active tasks
  - **Exact task time** — fires at the precise completion datetime you set for each task
  - **5:00 PM IST daily** — fires only if you have due or overdue tasks that day
- Mark tasks complete — they move instantly to the Done section
- Move a Done task back to Active if needed
- Done tasks are automatically cleaned up after 7 days
- All data is stored locally in Chrome — nothing leaves your machine

---

## How to Install (Developer Mode)

1. Download or clone this repository to your machine
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the project folder (`task-reminder-extension`)
6. The extension appears in Chrome — pin it from the puzzle piece (🧩) icon in the toolbar

---

### Managing Tasks
- Click **✓ Mark Complete** on any Active task to move it to Done
- Click **↩ Move to Active** on any Done task to reactivate it
- Tasks in Active are sorted by time added (oldest first)
- Done tasks older than 7 days are removed automatically

### Reminders
- Reminders fire as Chrome notifications — make sure Chrome notifications are allowed in your system settings
- The exact-time alarm is cancelled automatically if you mark a task complete before its deadline
- If you add a task whose deadline has already passed, it is immediately marked as **Due** with no alarm

---

## Tech Stack

- Vanilla JavaScript
- Chrome Extensions Manifest V3
- Chrome APIs: `storage`, `alarms`, `notifications`
- No external libraries or dependencies


---

## Notes

- Built for personal use — no publishing to Chrome Web Store required
- All data lives in `chrome.storage.local` and is tied to your Chrome profile
- Times are handled in IST (UTC+5:30)
