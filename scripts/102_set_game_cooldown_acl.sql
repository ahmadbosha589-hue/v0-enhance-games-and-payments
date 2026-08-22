-- 102: set_game_cooldown ACL fix.
--
-- Migration 101's generic function loop skipped this function (shape changed
-- between migrations), leaving it PUBLIC-executable. verify-reward-acl.mjs
-- caught it. This migration applies the same service-role-only posture.

REVOKE ALL ON FUNCTION public.set_game_cooldown(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_game_cooldown(UUID, TEXT, INTEGER) TO service_role;
