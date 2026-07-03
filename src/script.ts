import { createClient, User } from "@supabase/supabase-js";

// Just for LSP support and TS error handling, kinda structs
interface Question {
  question: string; // question text
  intention: string; // core concept
  answer: string; // optimal response
}

interface SkillGap {
  skill: string; // missing skill
  severity: "high" | "medium" | "low"; // impact level
}

interface TaskDay {
  day: number; // study program (e.g., Day 1, Day 2)
  focus: string; // primary topic
  tasks: string[]; // specific steps
}

interface ReportData {
  id: string; // Unique database ID
  title: string; // Role name (e.g., Senior React Developer)
  matchScore: number; // Percentage score (0-100)
  jobDescription: string; // Job description text by user
  technicalQuestions: Question[]; // List of technical questions
  behavioralQuestions: Question[]; // List of behavioral questions
  skillGaps: SkillGap[]; // Identified gaps
  preparationPlan: TaskDay[]; // study roadmap for prep
  createdAt: string; // ISO date string of when the plan was generated
}

interface RecentPlan {
  id: string; // Unique identifier matching the main report row
  title: string; // Job title used for listing in the history panel
  matchScore: number; // The score shown on the summary card
  createdAt: string; // Date used to sort and display generation timing
}

// https://supabase.com/docs/reference/javascript/initializing
const supabase = createClient("https://cuvqdoxebbgtxevxgmal.supabase.co", "sb_publishable_bUuA4ZBTLb4WkMWap0x4vw_GZ7HMouV"); // Supabase JS SDK client instance

// We can create a interface but we have to again define state for default values and this is way concise
// Single Source of Truth
const state = {
  route: "initialLoading" as "initialLoading" | "login" | "dashboard" | "interview", // Active page route determining visible UI view
  user: null as User | null, // Current logged-in Supabase Auth user session info
  reports: [] as RecentPlan[], // Lightweight list of all past plans for sidebar drawer
  reportData: null as ReportData | null, // Full data details of the currently loaded plan
  activeTab: "technical" as "technical" | "behavioral" | "roadmap", // Currently selected tab in the interview view
  isGenerating: false, // Loading flag showing the fullscreen AI generation spinner overlay
  selectedFile: null as File | null, // The resume PDF File object uploaded by user
  jobDescription: "", // Text value typed inside the job description textarea
};

function resetState() {
  state.route = "login";
  state.user = null;
  state.reports = [];
  state.reportData = null;
  state.activeTab = "technical";
  state.isGenerating = false;
  state.selectedFile = null;
  state.jobDescription = "";
}

// Starting point for app
function init() {
  // Need to look out for old users entering in, new users login and anyone logging out
  // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      // Helps to evaluate whether user is new or old
      state.user = session ? session.user : null;
      if (state.user) {
        fetchRecentPlans();
      }
      handleRouting();
    } else if (event === "SIGNED_OUT") {
      resetState();
      handleRouting();
    }
  });

  // globalThis is a standard keyword in modern JavaScript that always points to the global object, no matter where the code is running.
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event
  globalThis.addEventListener("hashchange", handleRouting);
  clickManager();
}

// Function which puts users in correct URLs
async function handleRouting() {
  // https://developer.mozilla.org/en-US/docs/Web/API/Location/hash
  const hash = globalThis.location.hash || "#/";

  // If user is coming from google login then they must have token
  if (hash.includes("access_token=")) {
    globalThis.location.hash = "#/";
    return;
  }

  // We need to check for user state since they can hackin the URL and onAuthStateChange will not respond but hashchange will be fired
  // Homepage
  if (hash === "#/") {
    if (!state.user) {
      globalThis.location.hash = "#/login";
      return;
    }

    state.route = "dashboard";
    state.reportData = null;
    render();
  } // Login page
  else if (hash === "#/login") {
    if (state.user) {
      globalThis.location.hash = "#/";
      return;
    }

    state.route = "login";
    render();
  } // Interview plans
  else if (hash.startsWith("#/interview/")) {
    if (!state.user) {
      globalThis.location.hash = "#/login";
      return;
    }

    state.route = "interview";
    // Pass in the Supabase uniqueID (#/interview/uniqueID -> [#, interview, uniqueID] -> uniqueID)
    await fetchInterviewDetail(hash.split("/").pop() ?? "");
  }
}

// Query DB to get the recentInterviewPlans
async function fetchRecentPlans() {
  // https://supabase.com/docs/reference/javascript/select
  // https://supabase.com/docs/reference/javascript/using-filters-eq
  // https://supabase.com/docs/reference/javascript/using-modifiers-order
  // Just extract the relevant info from recent to oldest for plans
  const { data } = await supabase.from("reports").select("id, title, matchScore, createdAt").eq("user_id", state.user!.id).order("createdAt", { ascending: false });

  // data is not of type/interface Recentplan[] since we didn't generated database.types.ts for SQL Table types
  state.reports = (data ?? []) as RecentPlan[];
  render();
}

async function fetchInterviewDetail(id: string) {
  state.reportData = null;
  render();

  // https://supabase.com/docs/reference/javascript/using-modifiers-single
  // We query via  UUID v4 from the DB, duplication chances ~0 for the InterviewPlans
  const { data, error } = await supabase.from("reports").select("*").eq("id", id).single();

  // If any issues redirect to home-page
  if (error || !data) {
    globalThis.location.hash = "#/";
  } // Show them the actual plan now
  else {
    state.reportData = data as ReportData;
    state.activeTab = "technical";
    render();
  }
}

async function generateReport(jd: string) {
  // If job description or file is not attached
  if (!jd.trim() || !state.selectedFile) {
    return alert("Description and resume PDF are required.");
  }

  state.isGenerating = true;
  render();

  // https://developer.mozilla.org/en-US/docs/Web/API/FormData
  // https://stackoverflow.com/questions/52140939/how-to-send-pdf-file-from-front-end-to-nodejs-server
  // This web-API is industry standard for transferring .pdf from frontend to DB
  const fd = new FormData();
  fd.append("jobDescription", jd.trim());
  fd.append("resume", state.selectedFile);

  // https://supabase.com/docs/reference/javascript/functions-invoke
  const { data, error } = await supabase.functions.invoke("generate-report", {
    body: fd,
  });

  if (error || !data?.report) {
    alert("Invalid response from generation function.");
    state.isGenerating = false;
    render();
    return;
  }

  // REPORT_SCHEMA from supabase/functions/generate-report/index.ts
  // We are destructuring with a default value if something fails
  const {
    matchScore = 0,
    title = "Untitled Plan",
    technicalQuestions = [],
    behavioralQuestions = [],
    skillGaps = [],
    preparationPlan = [],
  } = data.report;

  // Now to insert our response into DB to show as user's history
  // https://supabase.com/docs/reference/javascript/insert
  const { data: newReportObj, error: insertError } = await supabase.from("reports").insert({
    user_id: state.user!.id,
    jobDescription: jd.trim(),
    title,
    matchScore,
    technicalQuestions,
    behavioralQuestions,
    skillGaps,
    preparationPlan,
  }).select();

  const newReport = newReportObj ? newReportObj[0] : null;

  if (insertError || !newReport) {
    alert("Failed to save plan.");
    state.isGenerating = false;
    render();
    return;
  }

  // When Generation is over we clean up the JD, uploadedFile then update the History and redirect to the URL
  state.selectedFile = null;
  state.jobDescription = "";
  await fetchRecentPlans();
  state.isGenerating = false;
  globalThis.location.hash = `#/interview/${newReport.id}`;
}

function renderLoading(): string {
  let title = "Initializing session...";
  let sub = "";

  if (state.isGenerating) {
    title = "Designing your preparation plan...";
    sub = "Parsing resume against requirements.";
  } else if (state.route === "interview") {
    title = "Loading details...";
  }

  const subHtml = sub ? `<p class="text-text-muted text-xs max-w-xs text-center leading-relaxed font-txt">${sub}</p>` : "";

  return `<div class="min-h-screen flex flex-col items-center justify-center gap-4 bg-main-back text-main-txt"><div class="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div><h1 class="text-sm font-bold font-display text-center">${title}</h1>${subHtml}</div>`;
}

function renderLogin(): string {
  return `<div class="min-h-screen flex items-center justify-center bg-main-back text-main-txt p-4"><div class="w-full max-w-sm bg-bg-card border border-border-color rounded-xl p-7 shadow-none text-center"><h1 class="text-xl font-display font-semibold mb-1.5 tracking-tight">Welcome Back</h1><p class="text-text-muted text-xs mb-6 font-txt">Sign in to access your interview plans</p><button id="btn-login" class="w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-neutral-200 text-xs font-semibold py-2.5 px-4 rounded-md shadow-sm transition duration-150 transform active:scale-[0.98]"><svg class="w-4.5 h-4.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.14C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.59H1.29C.47 8.22 0 10.06 0 12s.47 3.78 1.29 5.41l3.99-3.14z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.59l3.99 3.14c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span>Continue with Google</span></button></div></div>`;
}

function renderNavbar(): string {
  const reportsBadge = state.reports.length > 0 ? `<button id="btn-toggle-drawer" class="text-[11px] font-medium text-text-muted hover:text-main-txt bg-white/[0.02] border border-border-color/60 hover:border-border-color hover:bg-white/[0.06] px-2.5 py-1 rounded-md transition duration-150 flex items-center gap-1.5 active:scale-95"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>History</button>` : "";
  const displayName = (state.user?.email ?? "User").split("@")[0];
  return `<nav class="sticky top-0 z-50 w-full backdrop-blur-md bg-main-back/80 border-b border-border-color px-6 py-2.5 flex items-center justify-between"><a href="#/" class="text-sm font-display font-semibold tracking-tight flex items-center gap-1.5"><svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>Interview<span class="text-accent">AI</span></a><div class="flex items-center gap-2">${reportsBadge}<span class="text-[11px] font-medium text-main-txt bg-white/[0.04] px-2.5 py-1 rounded-md border border-border-color/80 select-none max-w-[150px] truncate hidden sm:inline">${displayName}</span><button id="btn-logout" class="text-[11px] font-medium text-text-muted hover:text-main-txt px-2.5 py-1 hover:bg-white/[0.04] border border-transparent hover:border-border-color rounded-md transition duration-150">Logout</button></div></nav>`;
}

function renderDrawer(): string {
  const listItems =
    state.reports.map((p) =>
      `<li class="bg-bg-panel border border-border-color rounded-md p-3 hover:border-text-muted/40 cursor-pointer flex flex-col gap-1.5 transition duration-150"><a href="#/interview/${p.id}" class="flex flex-col gap-1.5"><h3 class="font-display font-semibold text-xs line-clamp-1 text-main-txt">${p.title}</h3><p class="text-[10px] text-text-muted">Generated on ${new Date(p.createdAt).toLocaleDateString()}</p><div class="text-[11px] font-medium mt-1 flex items-center justify-between"><span>Match Score: <span class="${p.matchScore >= 80 ? "text-severity-low" : p.matchScore >= 60 ? "text-severity-medium" : "text-severity-high"}">${p.matchScore}%</span></span><span class="text-accent hover:underline flex items-center gap-0.5">View Plan <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg></span></div></a></li>`
    ).join("") || '<p class="text-xs text-text-muted text-center py-8">No previous plans.</p>';

  return `<aside class="fixed top-0 right-0 h-full w-full max-w-sm bg-bg-card border-l border-border-color shadow-xl z-50 flex flex-col transition-transform duration-300 ease-in-out"><div class="flex items-center justify-between px-5 py-4 border-b border-border-color flex-shrink-0 bg-white/[0.01]"><div class="flex items-center gap-2"><svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg><h2 class="text-sm font-display font-semibold tracking-tight text-main-txt">History</h2></div><button id="btn-close-drawer" class="text-text-muted hover:text-white transition p-1 rounded-lg hover:bg-bg-panel"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div><ul class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">${listItems}</ul></aside>`;
}

function renderDashboard(): string {
  const fileText = state.selectedFile ? state.selectedFile.name : "Attach Resume PDF";
  const fileClass = state.selectedFile ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-border-color bg-white/[0.04] text-text-muted hover:bg-white/[0.08] hover:border-text-muted/40";
  return `<main class="flex-grow max-w-5xl w-full mx-auto p-6 md:p-8 flex flex-col items-center justify-center gap-10"><header class="text-center"><h1 class="text-3xl md:text-4xl font-display font-bold mb-2 tracking-tight">Create Your Custom <span class="text-accent">Interview Plan</span></h1><p class="text-text-muted text-sm md:text-base max-w-lg mx-auto leading-relaxed font-txt">Let our AI analyze the job requirements and your unique profile to build a winning strategy.</p></header><div class="w-full bg-bg-card border border-border-color rounded-xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col max-w-2xl"><div class="flex items-center justify-between px-5 py-3 border-b border-border-color bg-white/[0.01]"><div class="flex items-center gap-2"><span class="text-accent"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg></span><h2 class="text-xs font-display font-semibold tracking-tight text-main-txt">New Interview Strategy</h2></div><span class="text-[9px] font-bold tracking-wider text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-md uppercase">AI Strategy</span></div><div class="flex flex-col relative bg-white/[0.005]"><textarea id="jd-input" maxLength="5000" placeholder="Paste target job description here...&#10;e.g. 'Senior Frontend Engineer requires proficiency in React, TypeScript, and large-scale system design...'" class="w-full min-h-[260px] bg-transparent text-main-txt placeholder-text-muted/45 px-5 py-4 focus:outline-none resize-none text-xs leading-relaxed border-0">${state.jobDescription}</textarea><div class="text-[9px] text-text-muted px-5 pb-3 self-end select-none"><span id="jd-count">${state.jobDescription.length}</span> / 5000 chars</div></div><div class="flex items-center justify-between border-t border-border-color px-5 py-3 bg-white/[0.01]"><div class="flex items-center gap-3"><label id="resumeLabel" for="file-input" class="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition duration-150 cursor-pointer ${fileClass}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg><span id="resumeLabelText">${fileText}</span></label><input type="file" id="file-input" accept=".pdf" class="hidden" /><span class="hidden md:inline text-[10px] text-text-muted select-none">PDF required &bull; Max 3MB</span></div><button id="btn-generate" class="bg-accent hover:bg-accent-hover text-white text-[11px] font-medium px-3.5 py-1.5 rounded-md border border-white/10 shadow-sm transition duration-150 transform active:scale-[0.98] flex items-center gap-1.5"><svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>Generate Strategy</button></div></div></main>`;
}

function renderTabContent(): string {
  const r = state.reportData;
  if (!r) return "";
  const isReality = r.matchScore < 30 || (r.preparationPlan.length === 1 && r.preparationPlan[0].day === 0);

  if (state.activeTab === "technical" || state.activeTab === "behavioral") {
    const qs = state.activeTab === "technical" ? r.technicalQuestions : r.behavioralQuestions;
    return `<div class="flex flex-col gap-5"><div class="flex items-baseline gap-3 border-b border-border-color pb-3"><h2 class="text-sm font-display font-semibold tracking-tight">${state.activeTab === "technical" ? "Technical Questions" : "Behavioral Questions"}</h2><span class="text-[10px] text-text-muted bg-bg-panel border border-border-color px-2 py-0.5 rounded-full">${qs.length} questions</span></div><div class="flex flex-col gap-3.5">${
      qs.map((q, idx) =>
        `<details class="group bg-bg-panel border border-border-color rounded-md overflow-hidden transition duration-150"><summary class="flex items-start gap-2.5 p-3 cursor-pointer select-none hover:bg-white/[0.02] transition duration-150 list-none [&::-webkit-details-marker]:hidden"><span class="flex-shrink-0 text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md mt-0.5">Q${
          idx + 1
        }</span><p class="flex-1 font-semibold text-xs leading-relaxed">${q.question}</p><span class="chevron text-text-muted mt-0.5 transform transition-transform duration-200 group-open:rotate-180"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg></span></summary><div class="border-t border-border-color p-3 flex flex-col gap-3.5 bg-main-back/40"><div class="flex flex-col gap-1.5"><span class="text-[9px] font-bold tracking-wider text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded w-max uppercase">Intention</span><p class="text-[11px] text-text-muted leading-relaxed">${q.intention}</p></div><div class="flex flex-col gap-1.5"><span class="text-[9px] font-bold tracking-wider text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded w-max uppercase">Model Answer</span><p class="text-[11px] text-text-muted leading-relaxed">${q.answer}</p></div></div></details>`
      ).join("") || '<p class="text-xs text-text-muted text-center py-8">No questions.</p>'
    }</div></div>`;
  }

  return `<div class="flex flex-col gap-5"><div class="flex items-baseline gap-3 border-b border-border-color pb-3"><h2 class="text-sm font-display font-semibold tracking-tight">Road Map</h2><span class="text-[10px] text-text-muted bg-bg-panel border border-border-color px-2 py-0.5 rounded-full">${isReality ? "Long-Term Strategy" : `${r.preparationPlan.length}-day plan`}</span></div><div class="relative pl-8 border-l border-border-color/60 ml-3 space-y-5">${
    isReality && r.preparationPlan[0]
      ? `<div class="relative flex flex-col gap-2 pb-1.5"><div class="absolute -left-[39px] top-1.5 w-3.5 h-3.5 rounded-full bg-bg-card border-2 border-accent"></div><div class="flex items-center gap-2"><span class="text-[9px] font-bold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">Pivot</span><h3 class="font-display font-semibold text-xs text-main-txt">Pivot Strategy & Reality Check</h3></div><p class="text-xs text-text-muted leading-relaxed px-5">The mismatch between job requirements and your profile is high.</p><ul class="list-disc pl-10 text-[11px] text-text-muted space-y-1">${r.preparationPlan[0].tasks.map((task) => `<li>${task}</li>`).join("")}</ul></div>`
      : r.preparationPlan.map((day) => `<div class="relative flex flex-col gap-2 pb-1.5"><div class="absolute -left-[39px] top-1.5 w-3.5 h-3.5 rounded-full bg-bg-card border-2 border-accent"></div><div class="flex items-center gap-2"><span class="text-[9px] font-bold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">Day ${day.day}</span><h3 class="font-display font-semibold text-xs text-main-txt">${day.focus}</h3></div><ul class="list-disc pl-5 text-[11px] text-text-muted space-y-1">${day.tasks.map((task) => `<li>${task}</li>`).join("")}</ul></div>`).join("")
  }</div></div>`;
}

function updateActiveTabStyles(activeTab: "technical" | "behavioral" | "roadmap") {
  const tabs = ["technical", "behavioral", "roadmap"] as const;
  for (const tab of tabs) {
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) {
      if (tab === activeTab) {
        btn.setAttribute("class", "tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-white/[0.06] text-main-txt hover:bg-white/[0.04] hover:text-main-txt transition duration-150");
        const svg = btn.querySelector("svg");
        if (svg) svg.setAttribute("class", "w-3.5 h-3.5 text-accent transition duration-150");
      } else {
        btn.setAttribute("class", "tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md text-text-muted hover:bg-white/[0.04] hover:text-main-txt transition duration-150");
        const svg = btn.querySelector("svg");
        if (svg) svg.setAttribute("class", "w-3.5 h-3.5 text-text-muted transition duration-150");
      }
    }
  }
}

function renderInterview(): string {
  const r = state.reportData;
  if (!r) return "";
  const [ringColor, scoreMsgColor, scoreMessage] = r.matchScore >= 80 ? ["border-severity-low", "text-severity-low", "Strong match for this role"] : r.matchScore >= 60 ? ["border-severity-medium", "text-severity-medium", "Moderate match"] : ["border-severity-high", "text-severity-high", "Action needed: Skill gaps"];

  const tabContent = renderTabContent();
  const skillGaps = r.skillGaps.map((gap: SkillGap) => `<span class="text-[9px] font-semibold px-2 py-0.5 rounded-md border ${gap.severity === "high" ? "text-severity-high bg-severity-high/10 border-severity-high/20" : gap.severity === "medium" ? "text-severity-medium bg-severity-medium/10 border-severity-medium/20" : "text-severity-low bg-severity-low/10 border-severity-low/20"}">${gap.skill}</span>`).join("") || '<span class="text-[10px] text-text-muted">No gaps</span>';

  return `<main class="flex-grow max-w-7xl w-full mx-auto p-4 md:p-5 flex flex-col md:flex-row gap-5"><nav class="w-full md:w-52 flex-shrink-0 flex flex-col justify-between gap-6 bg-bg-card border border-border-color rounded-xl p-4 md:h-[calc(100vh-6.5rem)] shadow-none"><div class="flex flex-col gap-1"><p class="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-2">Sections</p><button id="tab-technical" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "technical" ? "bg-white/[0.06] text-main-txt" : "text-text-muted"} hover:bg-white/[0.04] hover:text-main-txt transition duration-150"><svg class="w-3.5 h-3.5 ${
    state.activeTab === "technical" ? "text-accent" : "text-text-muted"
  } transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>Technical</button><button id="tab-behavioral" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "behavioral" ? "bg-white/[0.06] text-main-txt" : "text-text-muted"} hover:bg-white/[0.04] hover:text-main-txt transition duration-150"><svg class="w-3.5 h-3.5 ${
    state.activeTab === "behavioral" ? "text-accent" : "text-text-muted"
  } transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>Behavioral</button><button id="tab-roadmap" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "roadmap" ? "bg-white/[0.06] text-main-txt" : "text-text-muted"} hover:bg-white/[0.04] hover:text-main-txt transition duration-150"><svg class="w-3.5 h-3.5 ${
    state.activeTab === "roadmap" ? "text-accent" : "text-text-muted"
  } transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>Road Map</button></div></nav><section id="tab-content-container" class="flex-1 bg-bg-card border border-border-color rounded-xl p-5 overflow-y-auto md:h-[calc(100vh-6.5rem)] shadow-none">${tabContent}</section><aside class="w-full md:w-56 flex-shrink-0 flex flex-col gap-4 md:h-[calc(100vh-6.5rem)] md:overflow-y-auto pr-1"><div class="bg-bg-card border border-border-color rounded-xl p-4 flex flex-col items-center gap-3.5 text-center shadow-none"><h3 class="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wider self-start">Match Score</h3><div id="scoreRing" class="w-20 h-20 border-2 rounded-full flex flex-col items-center justify-center bg-white/[0.01] ${ringColor}"><span id="scoreValue" class="text-xl font-display font-bold leading-none">${r.matchScore}</span></div><p id="scoreMessage" class="text-[11px] font-medium ${scoreMsgColor}">${scoreMessage}</p></div><div class="bg-bg-card border border-border-color rounded-xl p-4 flex flex-col gap-3.5 shadow-none"><h3 class="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wider">Skill Gaps</h3><div id="skillGapsList" class="flex flex-wrap gap-1.5">${skillGaps}</div></div></aside></main>`;
}

function render() {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  // 3 Loading states initial due to Supabase, isGenerating waiting for AI respone, when user clicks on a item in history
  if (state.route === "initialLoading" || state.isGenerating || (state.route === "interview" && !state.reportData)) {
    root.innerHTML = renderLoading();
    return;
  }

  // Login screen
  if (state.route === "login") {
    root.innerHTML = renderLogin();
    return;
  }

  // Render the rest (2 routes left)
  const navHtml = renderNavbar();
  const contentHtml = state.route === "dashboard" ? renderDashboard() : renderInterview();

  root.innerHTML = `<div class="bg-main-back text-main-txt min-h-screen flex flex-col font-txt antialiased">${navHtml} ${contentHtml} <div id="drawer-container"></div></div>`;
}

// https://www.freecodecamp.org/news/event-delegation-javascript/
function clickManager() {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  // event.target is 99% of the time HTMLElement but sometimes it can be SVGgraphics, resize the browser window etc
  // https://developer.mozilla.org/en-US/docs/Web/API/Element/closest It ensures that anywhere inside the parent's box we click it's gonna work no need for handling edge cases
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;

    // https://supabase.com/docs/reference/javascript/auth-signinwithoauth
    if (t.closest("#btn-login")) {
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: globalThis.location.href.split("#")[0] },
      });
    } // https://supabase.com/docs/reference/javascript/auth-signout
    // onAuthStateChange listen to changes and reports SIGNEDOUT but doesn't do anything so we have to signout the user, onAuthStateChange will handle routing
    else if (t.closest("#btn-logout")) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        alert("Logout failed: " + error.message);
      }
    } // Toggle History bar
    else if (t.closest("#btn-toggle-drawer")) {
      const container = document.getElementById("drawer-container");
      if (container) {
        container.innerHTML = container.innerHTML.trim() ? "" : renderDrawer();
      }
    } // Close History bar
    else if (t.closest("#btn-close-drawer")) {
      const container = document.getElementById("drawer-container");
      if (container) {
        container.innerHTML = "";
      }
    } // Generate analysis
    else if (t.closest("#btn-generate")) {
      generateReport((document.getElementById("jd-input") as HTMLTextAreaElement).value);
    } // Questionare tabs
    else {
      for (const tab of ["technical", "behavioral", "roadmap"] as const) {
        if (t.closest(`#tab-${tab}`)) {
          state.activeTab = tab;
          const container = document.getElementById("tab-content-container");
          if (container) {
            container.innerHTML = renderTabContent();
            updateActiveTabStyles(tab);
          }
          break;
        }
      }
    }
  });

  // For showing the character counter
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.id === "jd-input") {
      state.jobDescription = t.value;
      const jdCount = document.getElementById("jd-count");
      if (jdCount) {
        jdCount.textContent = `${t.value.length}`;
      }
    }
  });

  // For showing the file uploaded status
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "file-input") {
      const maybeFile = t.files;
      if (maybeFile) {
        const file = maybeFile[0];
        state.selectedFile = file;
        const label = document.getElementById("resumeLabel");
        const labelText = document.getElementById("resumeLabelText");
        if (label && labelText) {
          labelText.textContent = file.name;
          label.setAttribute("class", "flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition duration-150 cursor-pointer border-emerald-500/30 bg-emerald-500/5 text-emerald-400");
        }
      }
    }
  });
}

init();
