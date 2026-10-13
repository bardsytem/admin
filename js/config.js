// EmailJS Credentials
const EMAILJS_PUBLIC_KEY = "mNnKSDb8O20Hl5ctO";
const EMAILJS_SERVICE_ID = "service_4i8715b";
const EMAILJS_BOOKING_CONFIRM_TEMPLATE_ID = "template_7yab7no";
const EMAILJS_COMMISSION_CONFIRM_TEMPLATE_ID = "template_45at9w1";

// Supabase Credentials
const SUPABASE_URL = "https://xakaodpxzahtyohmytao.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhha2FvZHB4emFodHlvaG15dGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NzQ2NDEsImV4cCI6MjEwNjE1MDY0MX0.oVO32U5NtSc_uGQXikNr9hVk4XOAQ3xb8fDluYUlOs8";

// Initialize EmailJS
(function () {
  emailjs.init(EMAILJS_PUBLIC_KEY);
})();

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
