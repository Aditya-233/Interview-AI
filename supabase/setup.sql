-- 1. Create the reports table referencing auth.users
create table if not exists public.reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  "jobDescription" text not null,
  resume text,
  "matchScore" integer not null,
  "technicalQuestions" jsonb default '[]'::jsonb,
  "behavioralQuestions" jsonb default '[]'::jsonb,
  "skillGaps" jsonb default '[]'::jsonb,
  "preparationPlan" jsonb default '[]'::jsonb,
  "createdAt" timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS) on the table
alter table public.reports enable row level security;

-- 3. Policy: Allow users to select (read) only their own reports
create policy "Users can read own reports"
  on public.reports for select
  using (auth.uid() = user_id);

-- 4. Policy: Allow users to insert (create) only their own reports
create policy "Users can insert own reports"
  on public.reports for insert
  with check (auth.uid() = user_id);
