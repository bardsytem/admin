(async function () {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.replace("admin-login.html");
    return;
  }

  document.body.classList.remove("is-checking");

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.replace("admin-login.html");
  });
})();
