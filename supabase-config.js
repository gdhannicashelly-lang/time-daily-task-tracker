// Supabase browser configuration. Publishable/anon keys are designed for frontend use.
// Never put a service_role or secret key in this file.
window.SUPABASE_URL = 'https://jgjkzpttxvnxmxusalje.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_CmaHdXn8PoIcfL1hKtoyUQ_X0enFpyY';
if (!window.supabase?.createClient) { console.error('Supabase JS failed to load. Check your internet connection.'); }
else { window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); }
