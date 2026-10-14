(function () {
  const TIME_SLOTS = [
    "All Day",
    "10:00 - 11:00 AM",
    "01:00 - 02:00 PM",
    "03:00 - 04:00 PM",
    "05:00 - 06:00 PM",
  ];

  const MAX_VISIBLE = 5;

  let bookings = [];
  let blocks = [];
  let bookingsSort = "recent";
  let bookingsFilter = "pending";
  let gmeetLink = "";

  const el = {
    bookingsSort: document.getElementById("bookings-sort"),
    blockDate: document.getElementById("block-date"),
    blockEnd: document.getElementById("block-end"),
    blockTime: document.getElementById("block-time"),
    blockNote: document.getElementById("block-note"),
    blockBtn: document.getElementById("block-btn"),
    blockedList: document.getElementById("blocked-list"),
    blockedState: document.getElementById("blocked-state"),
    blockedTitle: document.getElementById("blocked-title"),
    bookingsState: document.getElementById("bookings-state"),
    bookingsWrap: document.getElementById("bookings-wrap"),
    bookingsBody: document.getElementById("bookings-body"),
    toast: document.getElementById("toast"),
    tabs: document.querySelectorAll(".tabs .tab"),
    gmeetInput: document.getElementById("gmeet-input"),
    gmeetSave: document.getElementById("gmeet-save"),
    gmeetDelete: document.getElementById("gmeet-delete"),
  };

  // ---------- Helpers ----------
  function toast(message, isError) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className = isError ? "toast show error" : "toast show";
    clearTimeout(el.toast._timer);
    el.toast._timer = setTimeout(() => {
      el.toast.className = "toast";
    }, 3000);
  }

  // Stops client-written text from running as HTML
  function esc(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  }

  function initTimeSelect() {
    el.blockTime.innerHTML = TIME_SLOTS.map(
      (slot) => `<option value="${slot}">${slot}</option>`,
    ).join("");
  }

  // Today as YYYY-MM-DD in the user's local time
  function todayString() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  // Limits a box to the height of its first `max` rows, then it scrolls
  function capHeight(box, rows, max, extra) {
    if (rows.length <= max) {
      box.style.maxHeight = "";
      return;
    }
    let height = extra || 0;
    for (let i = 0; i < max; i++) height += rows[i].offsetHeight;
    box.style.maxHeight = height + "px";
  }

  function limitBlockedList() {
    const items = el.blockedList.querySelectorAll(".block-item");
    // 10px = the gap between items, so 4 gaps between 5 items
    capHeight(el.blockedList, items, MAX_VISIBLE, (MAX_VISIBLE - 1) * 10);
  }

  function limitBookingsTable() {
    const rows = el.bookingsBody.querySelectorAll("tr");
    const head = el.bookingsWrap.querySelector("thead");
    capHeight(el.bookingsWrap, rows, MAX_VISIBLE, head.offsetHeight + 2);
  }

  // ---------- Blocked dates ----------
  // Same date range overlaps AND the time slots clash
  // ("All Day" clashes with every slot)
  function findConflict(start, end, slot) {
    return blocks.find(
      (b) =>
        b.start_date <= end &&
        b.end_date >= start &&
        (b.time_range === slot ||
          b.time_range === "All Day" ||
          slot === "All Day"),
    );
  }

  async function loadBlocks() {
    const { data, error } = await supabaseClient
      .from("blocked_dates")
      .select("*")
      .order("start_date", { ascending: true });

    if (error) {
      console.error(error);
      el.blockedState.textContent = "Could not load blocked windows.";
      return;
    }

    blocks = data;
    el.blockedTitle.textContent = `Active Blocked Windows (${data.length})`;

    if (!data.length) {
      el.blockedState.textContent = "No blocked windows.";
      el.blockedList.innerHTML = "";
      limitBlockedList();
      return;
    }

    el.blockedState.textContent = "";
    el.blockedList.innerHTML = data
      .map((block) => {
        const range =
          block.end_date !== block.start_date
            ? `${block.start_date} to ${block.end_date}`
            : block.start_date;
        const note = block.note ? `<span>${esc(block.note)}</span>` : "";
        return `
          <li class="block-item">
            <span class="dot"></span>
            <div class="block-text">
              <strong>${esc(range)}</strong>
              <span>${esc(block.time_range)}</span>
              ${note}
            </div>
            <button type="button" class="btn-small" data-id="${block.id}">Remove</button>
          </li>
        `;
      })
      .join("");

    limitBlockedList();
  }

  async function addBlock() {
    const start = el.blockDate.value;
    const end = el.blockEnd.value || start;

    if (!start) {
      toast("Pick a date first.", true);
      return;
    }
    if (start < todayString()) {
      toast("You can't block a date that already passed.", true);
      return;
    }
    if (end < start) {
      toast("The end date can't be before the start date.", true);
      return;
    }
    if (findConflict(start, end, el.blockTime.value)) {
      toast("That date and time is already blocked.", true);
      return;
    }

    el.blockBtn.disabled = true;

    const { error } = await supabaseClient.from("blocked_dates").insert([
      {
        start_date: start,
        end_date: end,
        time_range: el.blockTime.value,
        note: el.blockNote.value.trim(),
      },
    ]);

    el.blockBtn.disabled = false;

    if (error) {
      console.error(error);
      toast("Could not block that time.", true);
      return;
    }

    el.blockDate.value = "";
    el.blockEnd.value = "";
    el.blockNote.value = "";
    el.blockEnd.min = todayString();
    toast("Time blocked successfully.");
    loadBlocks();
  }

  async function removeBlock(id) {
    const { error } = await supabaseClient
      .from("blocked_dates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("Could not remove it.", true);
      return;
    }

    toast("Blocked window removed.");
    loadBlocks();
  }

  // Past dates can't be picked in the calendar
  function initDateLimits() {
    const today = todayString();
    el.blockDate.min = today;
    el.blockEnd.min = today;

    el.blockDate.addEventListener("change", () => {
      el.blockEnd.min = el.blockDate.value || today;
      if (el.blockEnd.value && el.blockEnd.value < el.blockEnd.min) {
        el.blockEnd.value = "";
      }
    });
  }

  // ---------- Client bookings ----------
  // "10:00 - 11:00 AM" -> minutes since midnight, so slots sort within a day
  function slotMinutes(slot) {
    const match = String(slot || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    let hour = Number(match[1]);
    if (/PM/i.test(slot) && hour < 12) hour += 12;
    return hour * 60 + Number(match[2]);
  }

  function dateValue(b) {
    const t = new Date(b.booking_date).getTime();
    return isNaN(t) ? 0 : t;
  }

  function isConfirmed(b) {
    return b.status === "confirmed";
  }

  function findBooking(id) {
    return bookings.find((b) => String(b.id) === String(id));
  }

  // "virtual" | "studio" | "onsite" (anything else counts as onsite)
  function meetingKind(type) {
    const t = String(type || "").toLowerCase();
    if (/virtual|online|meet/.test(t)) return "virtual";
    if (/studio/.test(t)) return "studio";
    return "onsite";
  }

  function sortedBookings() {
    let list = [...bookings];

    if (bookingsFilter === "pending")
      list = list.filter((b) => !isConfirmed(b));
    if (bookingsFilter === "confirmed") list = list.filter(isConfirmed);

    if (bookingsSort === "oldest") {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (bookingsSort === "date-asc") {
      list.sort(
        (a, b) =>
          dateValue(a) - dateValue(b) ||
          slotMinutes(a.time_slot) - slotMinutes(b.time_slot),
      );
    } else if (bookingsSort === "date-desc") {
      list.sort(
        (a, b) =>
          dateValue(b) - dateValue(a) ||
          slotMinutes(b.time_slot) - slotMinutes(a.time_slot),
      );
    } else {
      // "recent": newest inquiry first
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return list;
  }

  function updateTabCounts() {
    const confirmed = bookings.filter(isConfirmed).length;
    const labels = {
      pending: `To be confirmed (${bookings.length - confirmed})`,
      confirmed: `Confirmed (${confirmed})`,
      all: `All (${bookings.length})`,
    };
    el.tabs.forEach((tab) => {
      tab.textContent = labels[tab.dataset.filter];
      tab.classList.toggle("is-active", tab.dataset.filter === bookingsFilter);
    });
  }

  function renderBookings() {
    updateTabCounts();
    const list = sortedBookings();

    if (!list.length) {
      el.bookingsState.textContent = !bookings.length
        ? "No client bookings yet."
        : bookingsFilter === "confirmed"
          ? "No confirmed bookings yet."
          : "Nothing waiting to be confirmed.";
      el.bookingsWrap.hidden = true;
      return;
    }

    el.bookingsState.textContent = "";
    el.bookingsWrap.hidden = false;
    el.bookingsBody.innerHTML = list
      .map((b) => {
        return `
          <tr>
            <td>${esc(b.booking_date)}</td>
            <td>${esc(b.time_slot)}</td>
            <td>
              ${esc(b.client_name)}<br />
              <a href="mailto:${esc(b.client_email)}">${esc(b.client_email)}</a>
              ${b.client_phone ? `<br />${esc(b.client_phone)}` : ""}
            </td>
            <td>
              ${esc(b.meeting_type)}
            </td>
            <td class="details-cell">${esc(b.details)}</td>
            <td>
              <div class="row-actions">
                ${
                  isConfirmed(b)
                    ? `<span class="status-pill">Confirmed</span>`
                    : `<button type="button" class="btn-confirm" data-act="confirm" data-id="${b.id}">Confirm</button>`
                }
                <button type="button" class="btn-link" data-act="cancel" data-id="${b.id}">Cancel</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    // The wrapper is visible now, so the row heights can be measured
    limitBookingsTable();
  }

  async function loadBookings() {
    const { data, error } = await supabaseClient
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      el.bookingsState.textContent = "Could not load bookings.";
      el.bookingsWrap.hidden = true;
      return;
    }

    bookings = data;
    renderBookings();
  }

  // ---------- Emails (EmailJS) ----------
  function buildEmail(b) {
    const kind = meetingKind(b.meeting_type);
    const link = gmeetLink;
    const accepted = kind === "studio" || (kind === "virtual" && link);

    return {
      to_email: b.client_email,
      to_name: b.client_name,
      subject: accepted
        ? "Your booking has been accepted"
        : "Your request has been acknowledged",
      message: accepted
        ? "Your booking has been accepted. Please be on time in the said time."
        : "The request has been acknowledged. Bard will contact you within a day, between 10:00 AM and 12:00 MN.",
      booking_date: b.booking_date,
      time_slot: b.time_slot,
      meeting_type: b.meeting_type,
      meet_link_line:
        kind === "virtual" && link ? `Google Meet link: ${link}` : "",
    };
  }

  function sendEmail(b) {
    return emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_BOOKING_CONFIRM_TEMPLATE_ID,
      buildEmail(b),
    );
  }

  // ---------- Confirm / cancel ----------
  async function confirmBooking(id, btn) {
    const b = findBooking(id);
    if (!b) return;
    const noLink = meetingKind(b.meeting_type) === "virtual" && !gmeetLink;
    const question = noLink
      ? `No Gmeet link is saved, so ${b.client_email} will get the "Bard will contact you" notice. Continue?`
      : `Confirm this booking and email ${b.client_email}?`;
    if (!confirm(question)) return;

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      await sendEmail(b);
    } catch (err) {
      console.error("EmailJS error:", err);
      const reason =
        err && (err.text || err.message)
          ? ` (${err.status || ""} ${err.text || err.message})`
          : "";
      toast(
        "Could not send the email" + reason + ". Booking was not confirmed.",
        true,
      );
      btn.disabled = false;
      btn.textContent = "Confirm";
      return;
    }

    const { error } = await supabaseClient
      .from("appointments")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("Email sent, but could not save the status.", true);
      btn.disabled = false;
      btn.textContent = "Confirm";
      return;
    }

    toast("Booking confirmed and client notified.");
    loadBookings();
  }

  async function cancelBooking(id) {
    if (!confirm("Cancel this booking? This can't be undone.")) return;

    const { error } = await supabaseClient
      .from("appointments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("Could not cancel the booking.", true);
      return;
    }

    toast("Booking cancelled.");
    loadBookings();
  }

  // ---------- Gmeet link (one link for all virtual meetings) ----------
  function showGmeet() {
    el.gmeetInput.value = gmeetLink;
    el.gmeetDelete.disabled = !gmeetLink;
  }

  async function loadGmeet() {
    const { data, error } = await supabaseClient
      .from("site_settings")
      .select("value")
      .eq("key", "gmeet_link")
      .maybeSingle();

    if (error) {
      console.error(error);
      toast("Could not load the Gmeet link.", true);
      return;
    }
    gmeetLink = data?.value || "";
    showGmeet();
  }

  async function saveGmeet() {
    const link = el.gmeetInput.value.trim();
    if (!/^https?:\/\/\S+$/i.test(link)) {
      toast(
        "Paste a valid link, e.g. https://meet.google.com/abc-defg-hij",
        true,
      );
      return;
    }

    el.gmeetSave.disabled = true;
    const { error } = await supabaseClient
      .from("site_settings")
      .upsert({ key: "gmeet_link", value: link }, { onConflict: "key" });
    el.gmeetSave.disabled = false;

    if (error) {
      console.error(error);
      toast("Could not save the link.", true);
      return;
    }
    gmeetLink = link;
    showGmeet();
    toast("Gmeet link saved. It goes out when you confirm a virtual meeting.");
  }

  async function deleteGmeet() {
    if (
      !confirm(
        "Remove the Gmeet link? Virtual meetings you confirm will get the 'Bard will contact you' notice until you add a new link.",
      )
    )
      return;

    const { error } = await supabaseClient
      .from("site_settings")
      .delete()
      .eq("key", "gmeet_link");

    if (error) {
      console.error(error);
      toast("Could not remove the link.", true);
      return;
    }
    gmeetLink = "";
    showGmeet();
    toast("Gmeet link removed.");
  }

  // ---------- Events ----------
  function bindEvents() {
    el.blockBtn.addEventListener("click", addBlock);

    if (el.bookingsSort) {
      el.bookingsSort.addEventListener("change", (e) => {
        bookingsSort = e.target.value;
        renderBookings();
      });
    }

    // One listener each, because the lists are rebuilt on every load
    el.blockedList.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-small");
      if (btn) removeBlock(btn.dataset.id);
    });

    el.bookingsBody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === "confirm") confirmBooking(id, btn);
      if (btn.dataset.act === "cancel") cancelBooking(id);
    });

    el.tabs.forEach((tab) =>
      tab.addEventListener("click", () => {
        bookingsFilter = tab.dataset.filter;
        renderBookings();
      }),
    );

    el.gmeetSave.addEventListener("click", saveGmeet);
    el.gmeetDelete.addEventListener("click", deleteGmeet);

    // Row heights change when the window is resized, so measure again
    window.addEventListener("resize", () => {
      limitBlockedList();
      limitBookingsTable();
    });
  }

  initTimeSelect();
  initDateLimits();
  bindEvents();
  loadBlocks();
  loadBookings();
  loadGmeet();
})();
