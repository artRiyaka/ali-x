/* ALI-X demo. Profiles, tasks, and chat stay in this browser. */

const KEY = "alix.demo.v1";
const LOCATIONS = ["Tripoli", "Beirut", "Jounieh", "Saida", "Byblos", "Zahle"];

const USERS = [
  { id: "nour", name: "Nour Haddad", role: "owner", phone: "+961 70 218 440", area: "Tripoli", color: "#1c2420" },
  { id: "karim", name: "Karim Saad", role: "helper", phone: "+961 71 903 552", area: "Tripoli", color: "#1e4f86" },
  { id: "layla", name: "Layla Khoury", role: "owner", phone: "+961 76 114 903", area: "Beirut", color: "#9a3412" },
  { id: "omar", name: "Omar Diab", role: "owner", phone: "+961 3 662 118", area: "Jounieh", color: "#1f6b4a" },
  { id: "maya", name: "Maya Frem", role: "helper", phone: "+961 81 330 721", area: "Saida", color: "#6d4c41" },
];

const state = {
  session: null,
  loginRole: "owner",
  view: { name: "feed" },
  stack: [],
  filter: "all",
  accountOpen: false,
  pendingRemove: "",
  pendingReset: false,
  formError: "",
  draft: null,
  toast: "",
  flashId: "",
  focusChat: false,
  stickChat: false,
  keepScroll: false,
  data: { tasks: [], messages: [] },
};

let toastTimer = 0;
const root = document.getElementById("root");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function isoHours(offsetHours) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString();
}

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultDeadlineValue() {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  if (date.getTime() - Date.now() < 60 * 60 * 1000) date.setDate(date.getDate() + 1);
  return toLocalInput(date);
}

function money(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "$0";
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function formatWhen(iso) {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  let day;
  if (date.toDateString() === now.toDateString()) day = "Today";
  else if (date.toDateString() === tomorrow.toDateString()) day = "Tomorrow";
  else day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function dayLabel(iso) {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ago(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function initials(name) {
  const parts = String(name).split(" ").filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function userById(id) {
  return USERS.find((user) => user.id === id) || {
    id,
    name: "Someone",
    phone: "",
    area: "",
    role: "owner",
    color: "#333",
  };
}

function current() {
  return userById(state.session?.userId);
}

function roleLabel(role) {
  return role === "helper" ? "Helper" : "Task Owner";
}

function taskById(id) {
  return state.data.tasks.find((task) => task.id === id) || null;
}

function isParty(task) {
  const id = current().id;
  return task.ownerId === id || task.helperId === id;
}

function canAccept(task) {
  return current().role === "helper" && task.status === "open" && task.ownerId !== current().id;
}

function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, "")}`;
}

function dueHint(task) {
  if (task.status !== "open") return "";
  const delta = new Date(task.deadline).getTime() - Date.now();
  if (delta < 0) return "Past due";
  if (delta <= 3 * 60 * 60 * 1000) return "Due soon";
  return "";
}

function icon(name) {
  const paths = {
    pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8.2V12l2.8 2"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5 9.2 16.5 19 7.5"/>',
    chat: '<path d="M8 18.2 4.6 20.6v-3.6A7.4 7.4 0 1 1 8 18.2z"/>',
    back: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function seed() {
  return {
    tasks: [
      {
        id: "t1",
        title: "Need someone to buy groceries from Tripoli",
        description: "Milk, bread, eggs, tomatoes, and a bag of fruit. I can meet you near the shop.",
        price: 5,
        location: "Tripoli",
        deadline: isoHours(4),
        status: "open",
        ownerId: "nour",
        helperId: null,
        createdAt: isoHours(-2),
        updatedAt: isoHours(-2),
      },
      {
        id: "t2",
        title: "Pharmacy run on Hamra",
        description: "A small pickup from the pharmacy beside the main street. I will send the name in chat. Nothing heavy.",
        price: 6,
        location: "Beirut",
        deadline: isoHours(7),
        status: "open",
        ownerId: "layla",
        helperId: null,
        createdAt: isoHours(-5),
        updatedAt: isoHours(-5),
      },
      {
        id: "t3",
        title: "Drop documents at the campus office",
        description: "A sealed envelope for the front desk. The office closes at 3 PM.",
        price: 4,
        location: "Tripoli",
        deadline: isoHours(28),
        status: "open",
        ownerId: "omar",
        helperId: null,
        createdAt: isoHours(-6),
        updatedAt: isoHours(-6),
      },
      {
        id: "t4",
        title: "Carry two boxes to the third floor",
        description: "No elevator. From the car to apartment 3B. It should take about twenty minutes.",
        price: 12,
        location: "Jounieh",
        deadline: isoHours(36),
        status: "open",
        ownerId: "layla",
        helperId: null,
        createdAt: isoHours(-8),
        updatedAt: isoHours(-8),
      },
      {
        id: "t5",
        title: "Pick up a phone charger at ABC",
        description: "The service desk is holding a charger under the name Diab. Please bring it to the seaside parking.",
        price: 8,
        location: "Byblos",
        deadline: isoHours(6),
        status: "progress",
        ownerId: "omar",
        helperId: "karim",
        createdAt: isoHours(-5),
        updatedAt: isoHours(-1.5),
      },
      {
        id: "t6",
        title: "Office water refill",
        description: "Six large bottles from the corner shop to the studio on the second floor.",
        price: 7,
        location: "Saida",
        deadline: isoHours(-20),
        status: "done",
        ownerId: "nour",
        helperId: "maya",
        createdAt: isoHours(-30),
        updatedAt: isoHours(-21),
      },
      {
        id: "t7",
        title: "Pick up a book from the library",
        description: "It is held at the front desk under Diab. A short walk from the old souk.",
        price: 3,
        location: "Byblos",
        deadline: isoHours(22),
        status: "open",
        ownerId: "omar",
        helperId: null,
        createdAt: isoHours(-4),
        updatedAt: isoHours(-4),
      },
      {
        id: "t8",
        title: "Bring coffee to the workshop",
        description: "Two cappuccinos and one water, then up to the workshop on the first floor.",
        price: 4,
        location: "Zahle",
        deadline: isoHours(14),
        status: "open",
        ownerId: "layla",
        helperId: null,
        createdAt: isoHours(-1),
        updatedAt: isoHours(-1),
      },
      {
        id: "t9",
        title: "Pick up pastries from the bakery",
        description: "A box of cheese manakish and one zaatar. Drop them at the studio door.",
        price: 5,
        location: "Saida",
        deadline: isoHours(10),
        status: "open",
        ownerId: "nour",
        helperId: null,
        createdAt: isoHours(-3),
        updatedAt: isoHours(-3),
      },
    ],
    messages: [
      { id: "m1", taskId: "t5", senderId: "omar", text: "The charger is at the service desk, under the name Diab.", at: isoHours(-2) },
      { id: "m2", taskId: "t5", senderId: "karim", text: "On my way. I should be there in about twenty minutes.", at: isoHours(-1.6) },
      { id: "m3", taskId: "t5", senderId: "omar", text: "I will wait by the seaside parking.", at: isoHours(-1.5) },
      { id: "m4", taskId: "t6", senderId: "maya", text: "The bottles are at the studio door.", at: isoHours(-22) },
      { id: "m5", taskId: "t6", senderId: "nour", text: "Got them. Thank you.", at: isoHours(-21.5) },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      state.data = seed();
      state.session = null;
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.messages)) throw new Error("bad data");
    state.data = { tasks: parsed.tasks, messages: parsed.messages };
    const sessionUser = USERS.find((user) => user.id === parsed.session?.userId);
    state.session = sessionUser ? { userId: sessionUser.id } : null;
  } catch {
    state.data = seed();
    state.session = null;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      session: state.session,
      tasks: state.data.tasks,
      messages: state.data.messages,
    }));
  } catch {
    /* The demo still runs if storage is blocked. */
  }
}

function notify(message) {
  state.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    const el = document.querySelector(".toast");
    if (!el) return;
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 180);
  }, 2500);
}

function render() {
  const y = state.keepScroll ? window.scrollY : 0;
  document.title = state.session ? `${viewTitle()} · ALI-X` : "Login · ALI-X";
  root.innerHTML = state.session ? renderShell() : renderLogin();
  if (state.stickChat) {
    document.querySelector("#thread-end")?.scrollIntoView({ block: "end" });
  } else {
    window.scrollTo(0, y);
  }
  state.keepScroll = false;
  state.stickChat = false;
  state.flashId = "";
  if (state.focusChat) {
    document.querySelector("#chat-input")?.focus();
    state.focusChat = false;
  }
}

function viewTitle() {
  const name = state.view.name;
  if (name === "post") return "Post a task";
  if (name === "mine") return "My tasks";
  if (name === "inbox") return "Messages";
  if (name === "chat") return "Chat";
  if (name === "task") return "Task";
  return "Open tasks";
}

function enter(role) {
  const user = role === "helper" ? userById("karim") : userById("nour");
  state.session = { userId: user.id };
  state.view = { name: "feed" };
  state.stack = [];
  state.filter = "all";
  state.accountOpen = false;
  state.draft = null;
  state.formError = "";
  save();
  notify(`Hello, ${user.name}`);
  render();
}

function logout() {
  state.session = null;
  state.accountOpen = false;
  state.view = { name: "feed" };
  state.stack = [];
  state.loginRole = "owner";
  save();
  render();
}

function switchRole() {
  const next = state.session.userId === "nour" ? userById("karim") : userById("nour");
  state.session = { userId: next.id };
  state.accountOpen = false;
  state.pendingRemove = "";
  state.pendingReset = false;
  if (state.view.name === "post" && next.role !== "owner") {
    state.view = { name: "feed" };
    state.stack = [];
  }
  if (state.view.name === "chat" || state.view.name === "task") {
    const task = taskById(state.view.id);
    const inTask = task && (task.ownerId === next.id || task.helperId === next.id);
    const publicOpen = task && task.status === "open";
    const allowed = state.view.name === "chat" ? inTask && task.status !== "open" : inTask || publicOpen;
    if (!allowed) {
      state.view = { name: "feed" };
      state.stack = [];
    }
  }
  save();
  notify(`Switched to ${roleLabel(next.role)} · ${next.name}`);
  render();
}

function go(name) {
  if (name === "post" && current().role !== "owner") name = "feed";
  state.stack = [];
  state.view = { name };
  state.accountOpen = false;
  state.pendingRemove = "";
  state.formError = "";
  if (name === "post") state.draft = null;
  render();
}

function push(view) {
  state.stack.push(state.view);
  state.view = view;
  state.accountOpen = false;
  state.pendingRemove = "";
  render();
}

function back() {
  state.view = state.stack.pop() || { name: "feed" };
  state.accountOpen = false;
  state.pendingRemove = "";
  render();
}

function acceptTask(id) {
  const task = taskById(id);
  if (!task || !canAccept(task)) return;
  task.status = "progress";
  task.helperId = current().id;
  task.updatedAt = new Date().toISOString();
  state.flashId = id;
  save();
  notify("Task accepted. You can chat now.");
  if (state.view.name === "task" && state.view.id === id) render();
  else push({ name: "task", id });
}

function completeTask(id) {
  const task = taskById(id);
  if (!task || task.status !== "progress" || !isParty(task)) return;
  task.status = "done";
  task.updatedAt = new Date().toISOString();
  state.flashId = id;
  save();
  notify("Task completed.");
  if (state.view.name === "task" && state.view.id === id) render();
  else push({ name: "task", id });
}

function removeTask(id) {
  const task = taskById(id);
  if (!task || task.status !== "open" || task.ownerId !== current().id) return;
  if (state.pendingRemove !== id) {
    state.pendingRemove = id;
    state.keepScroll = true;
    render();
    return;
  }
  state.data.tasks = state.data.tasks.filter((item) => item.id !== id);
  state.data.messages = state.data.messages.filter((item) => item.taskId !== id);
  state.pendingRemove = "";
  save();
  notify("Task removed.");
  back();
}

function postDefaults() {
  return {
    title: "Buy groceries from Tripoli",
    description: "Pick up milk, bread, eggs, and fruit, then drop them off nearby. I will share the short list in chat.",
    price: "5",
    location: current().area || "Tripoli",
    deadline: defaultDeadlineValue(),
  };
}

function submitTask(form) {
  const data = new FormData(form);
  const draft = {
    title: String(data.get("title") || "").trim(),
    description: String(data.get("description") || "").trim(),
    price: String(data.get("price") || "").trim(),
    location: String(data.get("location") || ""),
    deadline: String(data.get("deadline") || ""),
  };
  const price = Number(draft.price);
  const deadline = new Date(draft.deadline);
  let error = "";
  if (draft.title.length < 3) error = "Add a short title.";
  else if (draft.description.length < 3) error = "Add a short description.";
  else if (!Number.isFinite(price) || price < 1 || price > 500) error = "Enter a price from $1 to $500.";
  else if (!LOCATIONS.includes(draft.location)) error = "Choose a location.";
  else if (Number.isNaN(deadline.getTime()) || deadline.getTime() < Date.now() - 60 * 1000) error = "Choose a deadline that is still ahead.";
  if (error) {
    state.draft = draft;
    state.formError = error;
    render();
    return;
  }
  const task = {
    id: uid("t"),
    title: draft.title.slice(0, 80),
    description: draft.description.slice(0, 400),
    price: Math.round(price),
    location: draft.location,
    deadline: deadline.toISOString(),
    status: "open",
    ownerId: current().id,
    helperId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.data.tasks.unshift(task);
  state.draft = null;
  state.formError = "";
  state.stack = [{ name: "feed" }];
  state.view = { name: "task", id: task.id };
  save();
  notify("Task posted.");
  render();
}

function submitMessage(form) {
  const id = form.dataset.id;
  const text = String(new FormData(form).get("text") || "").trim();
  const task = taskById(id);
  if (!text || !task || task.status === "open" || !isParty(task)) return;
  state.data.messages.push({
    id: uid("m"),
    taskId: id,
    senderId: current().id,
    text: text.slice(0, 500),
    at: new Date().toISOString(),
  });
  task.updatedAt = new Date().toISOString();
  state.stickChat = true;
  state.focusChat = true;
  save();
  render();
}

function resetDemo() {
  state.data = seed();
  state.pendingReset = false;
  state.filter = "all";
  state.draft = null;
  state.formError = "";
  state.accountOpen = false;
  save();
  notify("Demo data restored.");
  go("feed");
}

function navItems() {
  const items = [
    { id: "feed", label: "Feed", icon: "grid" },
    ...(current().role === "owner" ? [{ id: "post", label: "Post", icon: "plus" }] : []),
    { id: "mine", label: "Tasks", icon: "check" },
    { id: "inbox", label: "Chat", icon: "chat" },
  ];
  return items;
}

function navKey() {
  if (state.view.name === "chat" || state.view.name === "inbox") return "inbox";
  if (state.view.name === "post") return "post";
  if (state.view.name === "mine") return "mine";
  if (state.view.name === "task" && state.stack[0]?.name === "mine") return "mine";
  return "feed";
}

function inboxCount() {
  const me = current().id;
  return state.data.tasks.filter((task) => task.status === "progress" && (task.ownerId === me || task.helperId === me)).length;
}

function pill(status, flash) {
  const label = status === "progress" ? "In Progress" : status === "done" ? "Completed" : "Open";
  const cls = status === "progress" ? "progress" : status === "done" ? "done" : "open";
  return `<span class="pill pill-${cls}${flash ? " is-flash" : ""}">${label}</span>`;
}

function avatar(user, size) {
  return `<span class="avatar ${size || ""}" style="background:${esc(user.color)}">${esc(initials(user.name))}</span>`;
}

function renderLogin() {
  const openTasks = state.data.tasks
    .filter((task) => task.status === "open")
    .slice()
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const ownerOn = state.loginRole === "owner";
  const cards = openTasks.slice(0, 3).map((task, index) => `
    <article class="float-card" style="animation-delay:${index * 0.45}s" aria-hidden="true">
      <span>${esc(task.location)}</span>
      <strong>${esc(task.title)}</strong>
      <em>${money(task.price)}</em>
    </article>
  `).join("");
  return `
    <div class="login">
      <section class="showcase">
        <div>
          <p class="eyebrow">ALI-X</p>
          <h1>Small tasks,<br>handled nearby.</h1>
          <p class="lede">Delivery, shopping, and small favors. Post a task, a helper accepts, and you sort out the details in chat.</p>
          <p class="city-line">${openTasks.length} open tasks · ${LOCATIONS.join(", ")}</p>
        </div>
        <div class="showcase-cards">${cards}</div>
      </section>
      <section class="login-pane">
        <form class="login-card" data-action="login-form" autocomplete="off">
          <h2>Login</h2>
          <p class="fine">Already filled in. Nothing to type.</p>
          <label class="field">
            <span>Username</span>
            <input class="is-masked" name="alix-demo-user" type="text" value="********" readonly tabindex="-1" autocomplete="off" autocapitalize="off" spellcheck="false" aria-readonly="true" data-1p-ignore="true" data-lpignore="true" />
          </label>
          <label class="field">
            <span>Password</span>
            <input class="is-masked" name="alix-demo-code" type="text" value="********" readonly tabindex="-1" autocomplete="off" autocapitalize="off" spellcheck="false" aria-readonly="true" data-1p-ignore="true" data-lpignore="true" />
          </label>
          <div class="segment" role="radiogroup" aria-label="Role">
            <button type="button" data-action="pick-role" data-role="owner" role="radio" aria-checked="${ownerOn ? "true" : "false"}">Task Owner</button>
            <button type="button" data-action="pick-role" data-role="helper" role="radio" aria-checked="${ownerOn ? "false" : "true"}">Helper</button>
          </div>
          <p class="fine role-help">${ownerOn ? "Post tasks and follow them until they are done." : "Browse open tasks and accept one nearby."}</p>
          <button class="btn btn-primary btn-block" type="submit">Login</button>
          <p class="fine footnote">Demo only. Prices are shown, never charged.</p>
        </form>
      </section>
    </div>
  `;
}

function renderShell() {
  return `
    <div class="shell">
      <a class="skip" href="#main">Skip to content</a>
      ${renderSidebar()}
      <div class="workspace">
        ${renderTopbar()}
        <main id="main" class="content">
          <div class="content-inner view">${renderView()}</div>
        </main>
      </div>
      ${renderTabbar()}
      ${state.accountOpen ? renderMenu() : ""}
      ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ""}
    </div>
  `;
}

function renderSidebar() {
  const user = current();
  const active = navKey();
  const links = navItems().map((item) => {
    const on = item.id === active;
    const count = item.id === "inbox" ? inboxCount() : 0;
    return `<button class="nav-link${on ? " active" : ""}" type="button" data-action="nav" data-id="${item.id}" ${on ? 'aria-current="page"' : ""}>
      ${icon(item.icon)}
      <span>${item.label}</span>
      ${count ? `<em class="badge">${count}</em>` : ""}
    </button>`;
  }).join("");
  return `
    <aside class="sidebar">
      <div class="brand-row">
        <button class="logo" type="button" data-action="nav" data-id="feed">ALI<i>-X</i></button>
        <span class="demo-pill">Demo</span>
      </div>
      <nav class="side-nav" aria-label="Primary">${links}</nav>
      <button class="side-user" type="button" data-action="toggle-menu" aria-expanded="${state.accountOpen ? "true" : "false"}">
        ${avatar(user)}
        <span>
          <strong>${esc(user.name)}</strong>
          <small>${roleLabel(user.role)} · ${esc(user.area)}</small>
        </span>
      </button>
    </aside>
  `;
}

function renderTopbar() {
  const user = current();
  return `
    <header class="topbar">
      <div class="brand-row">
        <button class="logo" type="button" data-action="nav" data-id="feed">ALI<i>-X</i></button>
        <span class="demo-pill">Demo</span>
      </div>
      <button class="avatar-btn" type="button" data-action="toggle-menu" aria-label="Account" aria-expanded="${state.accountOpen ? "true" : "false"}" style="background:${esc(user.color)}">${esc(initials(user.name))}</button>
    </header>
  `;
}

function renderTabbar() {
  const active = navKey();
  const buttons = navItems().map((item) => {
    const on = item.id === active;
    const count = item.id === "inbox" ? inboxCount() : 0;
    return `<button type="button" class="${on ? "active" : ""}" data-action="nav" data-id="${item.id}" ${on ? 'aria-current="page"' : ""}>
      ${icon(item.icon)}
      <span>${item.label}</span>
      ${count ? `<em class="badge">${count}</em>` : ""}
    </button>`;
  }).join("");
  return `<nav class="tabbar" aria-label="Primary">${buttons}</nav>`;
}

function renderMenu() {
  const user = current();
  const other = user.id === "nour" ? userById("karim") : userById("nour");
  return `
    <button class="backdrop" type="button" data-action="close-menu" aria-label="Close account menu"></button>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Account">
      <div class="grabber"></div>
      <div class="sheet-user">
        ${avatar(user, "lg")}
        <div>
          <strong>${esc(user.name)}</strong>
          <small>${roleLabel(user.role)} · ${esc(user.area)}</small>
          <small>${esc(user.phone)}</small>
        </div>
      </div>
      <p class="fine">Same demo, two sides. Switch to see the other role.</p>
      <button class="btn btn-primary btn-block" type="button" data-action="switch-role">Continue as ${roleLabel(other.role)}</button>
      <button class="btn ${state.pendingReset ? "btn-danger" : "btn-ghost"} btn-block" type="button" data-action="reset">${state.pendingReset ? "Confirm reset" : "Reset demo data"}</button>
      <button class="btn btn-ghost btn-block" type="button" data-action="logout">Log out</button>
    </div>
  `;
}

function renderView() {
  const name = state.view.name;
  if ((name === "task" || name === "chat") && !taskById(state.view.id)) return renderMissing();
  if (name === "post") return renderPost();
  if (name === "mine") return renderMine();
  if (name === "inbox") return renderInbox();
  if (name === "task") return renderDetail(taskById(state.view.id));
  if (name === "chat") return renderChat(taskById(state.view.id));
  return renderFeed();
}

function renderMissing() {
  return `
    <div class="empty">
      <h1>Task unavailable</h1>
      <p>It may have been removed.</p>
      <button class="btn btn-primary" type="button" data-action="nav" data-id="feed">Back to feed</button>
    </div>
  `;
}

function renderFeed() {
  const tasks = state.data.tasks
    .filter((task) => task.status === "open" && (state.filter === "all" || task.location === state.filter))
    .slice()
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const noun = tasks.length === 1 ? "task" : "tasks";
  const summary = state.filter === "all"
    ? `${tasks.length} ${noun} open.`
    : `${tasks.length} ${noun} in ${state.filter}.`;
  return `
    <div class="page-head">
      <h1>Open tasks</h1>
      <p class="sub">${esc(summary)}</p>
    </div>
    ${renderFilters()}
    ${tasks.length ? `<div class="feed-grid">${tasks.map((task) => renderCard(task, "feed")).join("")}</div>` : renderEmptyFeed()}
  `;
}

function renderFilters() {
  const chips = ["all", ...LOCATIONS].map((loc) => {
    const on = state.filter === loc;
    const label = loc === "all" ? "All" : loc;
    return `<button class="chip${on ? " on" : ""}" type="button" data-action="filter" data-id="${esc(loc)}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
  }).join("");
  return `
    <div class="filter-row">
      <div class="filter-label">${icon("pin")} Location</div>
      <div class="chips" role="group" aria-label="Filter by location">${chips}</div>
    </div>
  `;
}

function renderEmptyFeed() {
  const where = state.filter === "all" ? "right now" : `in ${state.filter}`;
  return `
    <div class="empty">
      <div class="empty-mark">${icon("pin")}</div>
      <h2>No open tasks ${esc(where)}</h2>
      <p>${state.filter === "all" ? "New tasks will show up here." : "Try another area, or check back in a little while."}</p>
      ${state.filter !== "all" ? `<button class="btn btn-primary" type="button" data-action="filter" data-id="all">Show all areas</button>` : ""}
    </div>
  `;
}

function renderCard(task, context) {
  const owner = userById(task.ownerId);
  const mine = task.ownerId === current().id;
  const accept = context === "feed" && canAccept(task);
  const complete = context === "mine" && task.status === "progress" && isParty(task);
  const hint = dueHint(task);
  let tag = "";
  if (mine) tag = "Your task";
  else if (task.location === current().area) tag = "Near you";
  const who = mine ? "You" : owner.name;
  let statusNote = "";
  if (context === "mine") {
    if (task.status === "open") statusNote = "Waiting for a helper";
    else if (task.status === "progress" && task.helperId === current().id) statusNote = "You are on this task";
    else if (task.status === "progress") statusNote = `${userById(task.helperId).name.split(" ")[0]} is on it`;
    else statusNote = "Completed";
  }
  const extra = context === "mine"
    ? (statusNote ? `<span class="quiet">${esc(statusNote)}</span>` : "")
    : (tag ? `<span class="tag">${tag}</span>` : "");
  const action = accept
    ? `<div class="card-actions"><button class="btn btn-primary btn-block raise" type="button" data-action="accept" data-id="${task.id}">Accept</button></div>`
    : complete
      ? `<div class="card-actions"><button class="btn btn-primary btn-block raise" type="button" data-action="complete" data-id="${task.id}">Mark completed</button></div>`
      : "";
  return `
    <article class="task-card">
      <button class="card-hit" type="button" data-action="open-task" data-id="${task.id}" aria-label="View task: ${esc(task.title)}"></button>
      <div class="card-top">
        ${pill(task.status, state.flashId === task.id)}
        <span class="price">${money(task.price)}</span>
      </div>
      <h3>${esc(task.title)}</h3>
      <p class="clamp">${esc(task.description)}</p>
      <div class="meta">
        <span>${icon("pin")} ${esc(task.location)}</span>
        <span>${icon("clock")} ${esc(formatWhen(task.deadline))}</span>
        ${hint ? `<span class="due">${hint}</span>` : ""}
      </div>
      <div class="card-foot">
        <span class="who">${avatar(owner, "sm")}<strong>${esc(who)}</strong></span>
        ${extra}
      </div>
      ${action}
    </article>
  `;
}

function renderMine() {
  const me = current().id;
  const rank = { progress: 0, open: 1, done: 2 };
  const tasks = state.data.tasks
    .filter((task) => task.ownerId === me || task.helperId === me)
    .slice()
    .sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  const owner = current().role === "owner";
  return `
    <div class="page-head">
      <h1>My tasks</h1>
      <p class="sub">${owner ? "Tasks you posted, from open to completed." : "Tasks you accepted."}</p>
    </div>
    ${tasks.length ? `<div class="feed-grid">${tasks.map((task) => renderCard(task, "mine")).join("")}</div>` : `
      <div class="empty">
        <h2>${owner ? "You have not posted a task yet" : "You have not accepted a task yet"}</h2>
        <p>${owner ? "Post one and it will show up in the feed." : "Open the feed and accept a task nearby."}</p>
        <button class="btn btn-primary" type="button" data-action="nav" data-id="${owner ? "post" : "feed"}">${owner ? "Post a task" : "Browse the feed"}</button>
      </div>
    `}
  `;
}

function renderPost() {
  if (current().role !== "owner") {
    return `
      <div class="empty">
        <h1>Helpers pick up tasks</h1>
        <p>Switch to the task owner side if you want to post one.</p>
        <button class="btn btn-primary" type="button" data-action="nav" data-id="feed">Back to feed</button>
      </div>
    `;
  }
  const draft = { ...postDefaults(), ...(state.draft || {}) };
  const minDeadline = toLocalInput(new Date());
  return `
    <form class="form-narrow" data-action="create-task" autocomplete="off">
      <div class="page-head">
        <h1>Post a task</h1>
        <p class="sub">Sample text is ready. Edit it, or publish as is.</p>
      </div>
      ${state.formError ? `<div class="form-error" role="alert">${esc(state.formError)}</div>` : ""}
      <label class="field">
        <span>Title</span>
        <input name="title" maxlength="80" required value="${esc(draft.title)}" />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea name="description" maxlength="400" required>${esc(draft.description)}</textarea>
      </label>
      <label class="field">
        <span>Price</span>
        <div class="money-input">
          <span aria-hidden="true">$</span>
          <input name="price" type="number" min="1" max="500" step="1" inputmode="numeric" required value="${esc(draft.price)}" />
        </div>
        <span class="fine">Shown on the task. No payment is taken in this demo.</span>
      </label>
      <label class="field">
        <span>Location</span>
        <select name="location" required>
          ${LOCATIONS.map((loc) => `<option value="${esc(loc)}" ${loc === draft.location ? "selected" : ""}>${esc(loc)}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        <span>Deadline</span>
        <input name="deadline" type="datetime-local" required min="${esc(minDeadline)}" value="${esc(draft.deadline)}" />
      </label>
      <button class="btn btn-primary btn-block" type="submit">Publish task</button>
    </form>
  `;
}

function stepper(status) {
  const steps = [
    { id: "open", label: "Open" },
    { id: "progress", label: "In Progress" },
    { id: "done", label: "Completed" },
  ];
  const index = steps.findIndex((step) => step.id === status);
  return `<ol class="stepper">${steps.map((step, i) => {
    const cls = i < index ? "is-done" : i === index ? "is-current" : "";
    return `<li class="${cls}">${step.label}</li>`;
  }).join("")}</ol>`;
}

function lockedCopy(task) {
  if (task.ownerId === current().id) return "A helper will see your phone number after they accept.";
  if (current().role === "helper") return "Phone number and chat unlock after you accept.";
  return "Contact details stay hidden until a helper accepts.";
}

function renderParty(user, label, showPhone) {
  return `
    <div class="party">
      ${avatar(user)}
      <div>
        <small>${label}</small>
        <strong>${esc(user.name)}</strong>
        ${showPhone && user.phone ? `<a href="${telHref(user.phone)}">${esc(user.phone)}</a>` : ""}
      </div>
    </div>
  `;
}

function renderDetail(task) {
  const owner = userById(task.ownerId);
  const helper = task.helperId ? userById(task.helperId) : null;
  const unlocked = task.status !== "open" && isParty(task);
  const hint = dueHint(task);
  let actions = "";
  if (task.status === "open" && canAccept(task)) {
    actions = `<button class="btn btn-primary btn-block" type="button" data-action="accept" data-id="${task.id}">Accept task</button>`;
  } else if (task.status === "open" && task.ownerId === current().id) {
    actions = `
      <p class="quiet">Waiting for a helper to accept.</p>
      <button class="btn ${state.pendingRemove === task.id ? "btn-danger" : "btn-ghost"} btn-block" type="button" data-action="remove" data-id="${task.id}">${state.pendingRemove === task.id ? "Confirm remove" : "Remove task"}</button>
    `;
  } else if (task.status === "progress" && isParty(task)) {
    actions = `
      <button class="btn btn-primary btn-block" type="button" data-action="open-chat" data-id="${task.id}">Open chat</button>
      <button class="btn btn-ghost btn-block" type="button" data-action="complete" data-id="${task.id}">Mark completed</button>
    `;
  } else if (task.status === "done" && isParty(task)) {
    actions = `
      <p class="done-banner">This task is complete.</p>
      <button class="btn btn-ghost btn-block" type="button" data-action="open-chat" data-id="${task.id}">View chat</button>
    `;
  } else if (task.status === "progress") {
    actions = `<p class="quiet">This task is already taken.</p>`;
  } else if (task.status === "done") {
    actions = `<p class="done-banner">This task is complete.</p>`;
  } else {
    actions = `<p class="quiet">Helpers can accept this task.</p>`;
  }
  return `
    <article class="narrow">
      <button class="back" type="button" data-action="back">${icon("back")} Back</button>
      ${stepper(task.status)}
      <div class="detail-top">
        ${pill(task.status, state.flashId === task.id)}
        <div>
          <div class="price lg">${money(task.price)}</div>
          <p class="fine">Shown only. Nothing is charged.</p>
        </div>
      </div>
      <h1>${esc(task.title)}</h1>
      <div class="meta" style="margin-top:10px">
        <span>${icon("pin")} ${esc(task.location)}</span>
        <span>${icon("clock")} ${esc(formatWhen(task.deadline))}</span>
        <span>Posted ${esc(ago(task.createdAt))}</span>
        ${hint ? `<span class="due">${hint}</span>` : ""}
      </div>
      <p class="prose">${esc(task.description)}</p>
      <section class="panel">
        <h2>People</h2>
        ${renderParty(owner, "Task owner", unlocked)}
        ${helper ? renderParty(helper, "Helper", unlocked) : ""}
        ${!unlocked ? `<p class="locked">${esc(lockedCopy(task))}</p>` : ""}
      </section>
      <div class="actions">${actions}</div>
    </article>
  `;
}

function lastMessage(taskId) {
  return state.data.messages
    .filter((message) => message.taskId === taskId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1) || null;
}

function renderInbox() {
  const me = current().id;
  const tasks = state.data.tasks
    .filter((task) => task.status !== "open" && (task.ownerId === me || task.helperId === me))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = tasks.map((task) => {
    const otherId = task.ownerId === me ? task.helperId : task.ownerId;
    const other = userById(otherId);
    const last = lastMessage(task.id);
    return `
      <button class="thread-item" type="button" data-action="open-chat" data-id="${task.id}">
        ${avatar(other)}
        <span>
          <strong>${esc(other.name)}</strong>
          <small>${esc(task.title)}</small>
          <em>${last ? esc(last.text) : "No messages yet"}</em>
        </span>
        <time>${esc(last ? clock(last.at) : "")}</time>
      </button>
    `;
  }).join("");
  return `
    <div class="page-head narrow">
      <h1>Messages</h1>
      <p class="sub">${current().role === "owner" ? "When a helper accepts, you can message them here." : "When you accept a task, the conversation shows up here."}</p>
    </div>
    <div class="narrow">
      ${tasks.length ? rows : `
        <div class="empty">
          <div class="empty-mark">${icon("chat")}</div>
          <h2>No conversations yet</h2>
          <p>Chat opens after a task is accepted.</p>
          <button class="btn btn-primary" type="button" data-action="nav" data-id="feed">Browse tasks</button>
        </div>
      `}
    </div>
  `;
}

function renderChat(task) {
  if (task.status === "open" || !isParty(task)) {
    return `
      <div class="empty">
        <h1>Chat is locked</h1>
        <p>It opens after a helper accepts the task.</p>
        <button class="btn btn-primary" type="button" data-action="back">Go back</button>
      </div>
    `;
  }
  const me = current().id;
  const other = userById(task.ownerId === me ? task.helperId : task.ownerId);
  const messages = state.data.messages
    .filter((message) => message.taskId === task.id)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  let lastDay = "";
  const bubbles = messages.map((message) => {
    const day = new Date(message.at).toDateString();
    const divider = day !== lastDay ? `<p class="day-divider">${esc(dayLabel(message.at))}</p>` : "";
    lastDay = day;
    const mine = message.senderId === me;
    const sender = userById(message.senderId);
    return `
      ${divider}
      <div class="bubble-row${mine ? " mine" : ""}">
        ${mine ? "" : avatar(sender, "sm")}
        <div class="bubble">
          <p>${esc(message.text)}</p>
          <time>${esc(clock(message.at))}</time>
        </div>
      </div>
    `;
  }).join("");
  return `
    <section class="narrow chat-screen">
      <button class="back" type="button" data-action="back">${icon("back")} Back</button>
      <div class="chat-head panel">
        <div class="party">
          ${avatar(other)}
          <div>
            <strong>${esc(other.name)}</strong>
            <small>${esc(task.title)} · ${pill(task.status, false)}</small>
            <a href="${telHref(other.phone)}">${esc(other.phone)}</a>
          </div>
        </div>
      </div>
      ${bubbles || `<div class="empty"><h2>No messages yet</h2><p>Say hello and confirm the details.</p></div>`}
      <div id="thread-end"></div>
      <form class="composer" data-action="send-message" data-id="${task.id}">
        <label class="sr" for="chat-input" style="position:absolute;left:-999px">Message</label>
        <input id="chat-input" name="text" maxlength="500" placeholder="Write a message" enterkeyhint="send" autocomplete="off" />
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
    </section>
  `;
}

function onClick(event) {
  const el = event.target.closest("[data-action]");
  if (!el || !root.contains(el)) return;
  const action = el.dataset.action;
  const id = el.dataset.id || "";

  if (action === "pick-role") {
    if (state.session) return;
    state.loginRole = el.dataset.role === "helper" ? "helper" : "owner";
    render();
    return;
  }
  if (action === "close-menu") {
    state.accountOpen = false;
    state.pendingReset = false;
    state.keepScroll = true;
    render();
    return;
  }
  if (!state.session) return;

  if (action === "toggle-menu") {
    state.accountOpen = !state.accountOpen;
    state.pendingReset = false;
    state.pendingRemove = "";
    state.keepScroll = true;
    render();
    return;
  }
  if (action === "logout") {
    logout();
    return;
  }
  if (action === "switch-role") {
    switchRole();
    return;
  }
  if (action === "reset") {
    if (!state.pendingReset) {
      state.pendingReset = true;
      state.keepScroll = true;
      render();
      return;
    }
    resetDemo();
    return;
  }
  if (action === "nav") {
    go(id);
    return;
  }
  if (action === "filter") {
    state.filter = id || "all";
    render();
    return;
  }
  if (action === "open-task") {
    if (state.view.name === "task" && state.view.id === id) return;
    push({ name: "task", id });
    return;
  }
  if (action === "accept") {
    acceptTask(id);
    return;
  }
  if (action === "complete") {
    completeTask(id);
    return;
  }
  if (action === "remove") {
    removeTask(id);
    return;
  }
  if (action === "back") {
    back();
    return;
  }
  if (action === "open-chat") {
    const task = taskById(id);
    if (!task) return;
    state.stickChat = true;
    state.focusChat = window.matchMedia("(min-width: 960px)").matches;
    push({ name: "chat", id });
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const action = form.dataset.action;
  if (action === "login-form") {
    enter(state.loginRole);
    return;
  }
  if (!state.session) return;
  if (action === "create-task") submitTask(form);
  if (action === "send-message") submitMessage(form);
}

function lockMasked(event) {
  const el = event.target;
  if (el?.classList?.contains("is-masked")) el.value = "********";
}

function mount() {
  load();
  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("input", lockMasked);
  root.addEventListener("focusin", lockMasked);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.accountOpen) {
      state.accountOpen = false;
      state.pendingReset = false;
      state.keepScroll = true;
      render();
    }
  });
  render();
}

mount();
