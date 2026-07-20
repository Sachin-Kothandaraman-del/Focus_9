/** Store selector: Supabase in production, local JSON in demo/dev. */
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
module.exports = useSupabase ? require("./supabase") : require("./local");
