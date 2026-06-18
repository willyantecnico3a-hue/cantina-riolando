// CONFIGURAÇÃO DO SUPABASE
// Troque pelos dados do seu projeto Supabase.
// Supabase URL: Project Settings > API > Project URL
// Supabase Anon Key: Project Settings > API > Project API keys > anon/public

const SUPABASE_URL = # Connect to Postgres via the shared transaction-mode pooler (IPv4-only)
DATABASE_URL="postgresql://postgres.zozybbovlhxtnmjnunhu:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Connect to Postgres via the shared session-mode pooler (used for migrations)
DIRECT_URL="postgresql://postgres.zozybbovlhxtnmjnunhu:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres",
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvenliYm92bGh4dG5tam51bmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Njk5MjUsImV4cCI6MjA5NzM0NTkyNX0.vlvwmN2SLO8Fx4ECeCf3Dedn52yMTS5Euq58ashWLRo";