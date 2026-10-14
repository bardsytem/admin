// ---------- Contact info from the admin----------
(async function loadContact() {
  const { data, error } = await supabaseClient
    .from("site_profile")
    .select("contact_name, contact_phone, contact_facebook")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return; // keep the text already written in index.html

  const fbBtn = document.getElementById("contact-fb");
  const callBtn = document.getElementById("contact-call");

  // Facebook: name on the button, link is what gets copied
  if (fbBtn && data.contact_facebook !== null) {
    if (data.contact_facebook) {
      fbBtn.dataset.copy = data.contact_facebook;
      document.getElementById("contact-name").textContent =
        data.contact_name || "Facebook";
    } else {
      fbBtn.style.display = "none";
    }
  }

  // Phone: shown as typed, copied with only digits and +
  if (callBtn && data.contact_phone !== null) {
    if (data.contact_phone) {
      callBtn.dataset.copy = data.contact_phone.replace(/[^0-9+]/g, "");
      document.getElementById("contact-phone").textContent = data.contact_phone;
    } else {
      callBtn.style.display = "none";
    }
  }
})();
