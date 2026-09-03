-- Garante que anon/authenticated podem fazer SELECT em banned_users
-- (necessario para a checagem no startup do app). RLS ja filtra via policy.
grant select on table public.banned_users to anon, authenticated;
