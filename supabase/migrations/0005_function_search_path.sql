-- EMADECO — fixe le search_path des fonctions utilitaires (alerte Supabase "function_search_path_mutable")
alter function public.set_updated_at() set search_path = '';
alter function public.request_transition_allowed(public.request_status, public.request_status) set search_path = '';
alter function public.enforce_request_transition() set search_path = '';
