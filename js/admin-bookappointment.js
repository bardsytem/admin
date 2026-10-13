(function () {
  // These labels should match the time slots on the public BookAppointment page
  const TIME_SLOTS = [
    "All Day",
    "10:00 - 11:00 AM",
    "01:00 - 02:00 PM",
    "03:00 - 04:00 PM",
    "05:00 - 06:00 PM",
  ];

  let bookings = []; // all bookings loaded from Supabase
  let bookingsSort = "recent";

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

  // ---------- Blocked dates ----------
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

    el.blockedTitle.textContent = `Active Blocked Windows (${data.length})`;

    if (!data.length) {
      el.blockedState.textContent = "No blocked windows.";
      el.blockedList.innerHTML = "";
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
  }

  async function addBlock() {
    const start = el.blockDate.value;
    const end = el.blockEnd.value || start;

    if (!start) {
      toast("Pick a date first.", true);
      return;
    }
    if (end < start) {
      toast("The end date can't be before the start date.", true);
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

  function sortedBookings() {
    const list = [...bookings];

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

  function renderBookings() {
    if (!bookings.length) {
      el.bookingsState.textContent = "No client bookings yet.";
      el.bookingsWrap.hidden = true;
      return;
    }

    el.bookingsState.textContent = "";
    el.bookingsWrap.hidden = false;
    el.bookingsBody.innerHTML = sortedBookings()
      .map(
        (b) => `
          <tr>
            <td>${esc(b.booking_date)}</td>
            <td>${esc(b.time_slot)}</td>
            <td>
              ${esc(b.client_name)}<br />
              <a href="mailto:${esc(b.client_email)}">${esc(b.client_email)}</a>
              ${b.client_phone ? `<br />${esc(b.client_phone)}` : ""}
            </td>
            <td>${esc(b.meeting_type)}</td>
            <td class="details-cell">${esc(b.details)}</td>
            <td><button type="button" class="btn-link" data-id="${b.id}">Cancel</button></td>
          </tr>
        `,
      )
      .join("");
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
      const btn = e.target.closest(".btn-link");
      if (btn) cancelBooking(btn.dataset.id);
    });
  }

  initTimeSelect();
  bindEvents();
  loadBlocks();
  loadBookings();
})();
