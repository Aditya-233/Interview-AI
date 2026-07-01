import { createClient, User } from "@supabase/supabase-js";
import "iconify-icon";

interface Question { question: string; intention: string; answer: string; }
interface SkillGap { skill: string; severity: "high" | "medium" | "low"; }
interface TaskDay { day: number; focus: string; tasks: string[]; }
interface ReportData { id: string; title: string; matchScore: number; jobDescription: string; resume: string; technicalQuestions: Question[]; behavioralQuestions: Question[]; skillGaps: SkillGap[]; preparationPlan: TaskDay[]; createdAt: string; }
interface RecentPlan { id: string; title: string; matchScore: number; createdAt: string; }

const supabase = createClient("https://cuvqdoxebbgtxevxgmal.supabase.co", "sb_publishable_bUuA4ZBTLb4WkMWap0x4vw_GZ7HMouV");
const state = {
  route: "loading" as "loading" | "login" | "dashboard" | "interview",
  user: null as User | null, reports: [] as RecentPlan[], reportData: null as ReportData | null,
  activeDayIndex: 0, activeTab: "technical" as "technical" | "behavioral" | "roadmap",
  drawerOpen: false, isGenerating: false, isDetailLoading: false, selectedFile: null as File | null,
};

function init() {
  const chk = async () => {
    state.user = (await supabase.auth.getSession()).data.session?.user || null;
    if (state.user) fetchRecentPlans();
    handleRouting();
  };
  chk();
  supabase.auth.onAuthStateChange((_, session) => {
    const prev = state.user; state.user = session?.user || null;
    if (state.user && !prev) fetchRecentPlans();
    handleRouting();
  });
  globalThis.addEventListener("hashchange", handleRouting);
  setupEventDelegation();
}

async function handleRouting() {
  const hash = globalThis.location.hash || "#/";
  state.drawerOpen = false;
  if (hash === "#/" || hash === "#/dashboard") {
    if (!state.user) { globalThis.location.hash = "#/login"; return; }
    state.route = "dashboard"; state.reportData = null; render();
  } else if (hash === "#/login") {
    if (state.user) { globalThis.location.hash = "#/dashboard"; return; }
    state.route = "login"; render();
  } else if (hash.startsWith("#/interview/")) {
    if (!state.user) { globalThis.location.hash = "#/login"; return; }
    state.route = "interview"; await fetchInterviewDetail(hash.split("/").pop() || "");
  }
}

async function fetchRecentPlans() {
  const { data } = await supabase.from("reports").select("id, title, matchScore, createdAt").eq("user_id", state.user!.id).order("createdAt", { ascending: false });
  state.reports = (data || []) as RecentPlan[]; render();
}

async function fetchInterviewDetail(id: string) {
  state.isDetailLoading = true; render();
  try {
    const { data } = await supabase.from("reports").select("*").eq("id", id).single();
    if (data) { state.reportData = data as ReportData; state.activeDayIndex = 0; state.activeTab = "technical"; }
    else globalThis.location.hash = "#/dashboard";
  } catch {
    globalThis.location.hash = "#/dashboard";
  } finally { state.isDetailLoading = false; render(); }
}

async function generateReport(jd: string) {
  if (!jd.trim() || !state.selectedFile) return alert("Description and resume PDF are required.");
  state.isGenerating = true; render();
  const fd = new FormData(); fd.append("jobDescription", jd.trim()); fd.append("resume", state.selectedFile);

  try {
    const { data } = await supabase.functions.invoke("generate-report", { body: fd });
    const { data: newReport } = await supabase.from("reports").insert({
      user_id: state.user!.id, title: data.report.title, jobDescription: jd.trim(), resume: data.resumeText,
      matchScore: data.report.matchScore, technicalQuestions: data.report.technicalQuestions,
      behavioralQuestions: data.report.behavioralQuestions || [], skillGaps: data.report.skillGaps, preparationPlan: data.report.preparationPlan,
    }).select().single();
    state.selectedFile = null; await fetchRecentPlans();
    globalThis.location.hash = `#/interview/${newReport.id}`;
  } catch (e: unknown) {
    alert((e as Error).message || "Generation failed.");
  } finally { state.isGenerating = false; render(); }
}

function render() {
  const root = document.getElementById("root");
  if (!root) return;

  if (state.route === "loading" || state.isDetailLoading) {
    root.innerHTML = `<div class="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg-page text-text-primary"><div class="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div><h1 class="text-sm font-bold font-display">${state.isDetailLoading ? "Loading details..." : "Initializing session..."}</h1></div>`;
    return;
  }

  if (state.route === "login") {
    root.innerHTML = `<div class="min-h-screen flex items-center justify-center bg-bg-page text-text-primary p-4"><div class="w-full max-w-sm bg-bg-card border border-border-color rounded-xl p-7 shadow-none text-center"><h1 class="text-xl font-display font-semibold mb-1.5 tracking-tight">Welcome Back</h1><p class="text-text-muted text-xs mb-6 font-sans">Sign in to access your interview plans</p><button id="btn-login" class="w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-neutral-200 text-xs font-semibold py-2.5 px-4 rounded-md shadow-sm transition duration-150 transform active:scale-[0.98]"><iconify-icon icon="flat-color-icons:google" class="text-lg"></iconify-icon><span>Continue with Google</span></button></div></div>`;
    return;
  }

  const reportsBadge = state.reports.length > 0 ? `<button id="btn-toggle-drawer" class="text-[11px] font-medium text-text-muted hover:text-text-primary bg-white/[0.02] border border-border-color/60 hover:border-border-color hover:bg-white/[0.06] px-2.5 py-1 rounded-md transition duration-150 flex items-center gap-1.5 active:scale-95"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>History</button>` : "";
  const displayName = state.user?.email || "User";
  const navHtml = `<nav class="sticky top-0 z-50 w-full backdrop-blur-md bg-bg-page/80 border-b border-border-color px-6 py-2.5 flex items-center justify-between"><a href="#/dashboard" class="text-sm font-display font-semibold tracking-tight flex items-center gap-1.5"><svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>Interview<span class="text-accent">AI</span></a><div class="flex items-center gap-2">${reportsBadge}<span class="text-[11px] font-medium text-text-primary bg-white/[0.04] px-2.5 py-1 rounded-md border border-border-color/80 select-none max-w-[150px] truncate hidden sm:inline">${displayName}</span><button id="btn-logout" class="text-[11px] font-medium text-text-muted hover:text-text-primary px-2.5 py-1 hover:bg-white/[0.04] border border-transparent hover:border-border-color rounded-md transition duration-150">Logout</button></div></nav>`;

  const drawerHtml = !state.drawerOpen ? "" : `<div class="fixed inset-0 z-50 overflow-hidden"><div id="drawer-backdrop" class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"></div><aside class="fixed top-0 right-0 h-full w-full max-w-sm bg-bg-card border-l border-border-color shadow-xl z-50 flex flex-col transition-transform duration-300 ease-in-out"><div class="flex items-center justify-between px-5 py-4 border-b border-border-color flex-shrink-0 bg-white/[0.01]"><div class="flex items-center gap-2"><svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg><h2 class="text-sm font-display font-semibold tracking-tight text-text-primary">History</h2></div><button id="btn-close-drawer" class="text-text-muted hover:text-white transition p-1 rounded-lg hover:bg-bg-panel"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div><ul class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">${state.reports.map((p) => `<li class="bg-bg-panel border border-border-color rounded-md p-3 hover:border-text-muted/40 cursor-pointer flex flex-col gap-1.5 transition duration-150"><a href="#/interview/${p.id}" class="flex flex-col gap-1.5"><h3 class="font-display font-semibold text-xs line-clamp-1 text-text-primary">${p.title}</h3><p class="text-[10px] text-text-muted">Generated on ${new Date(p.createdAt).toLocaleDateString()}</p><div class="text-[11px] font-medium mt-1 flex items-center justify-between"><span>Match Score: <span class="${p.matchScore >= 80 ? "text-severity-low" : p.matchScore >= 60 ? "text-severity-medium" : "text-severity-high"}">${p.matchScore}%</span></span><span class="text-accent hover:underline flex items-center gap-0.5">View Plan <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg></span></div></a></li>`).join("") || '<p class="text-xs text-text-muted text-center py-8">No previous plans.</p>'}</ul></aside></div>`;

  let contentHtml = "";
  if (state.route === "dashboard") {
    const fileText = state.selectedFile ? state.selectedFile.name : "Attach Resume PDF";
    const fileClass = state.selectedFile ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-border-color bg-white/[0.04] text-text-muted hover:bg-white/[0.08] hover:border-text-muted/40";

    contentHtml = `<main class="flex-grow max-w-5xl w-full mx-auto p-6 md:p-8 flex flex-col items-center justify-center gap-10"><header class="text-center"><h1 class="text-3xl md:text-4xl font-display font-bold mb-2 tracking-tight">Create Your Custom <span class="text-accent">Interview Plan</span></h1><p class="text-text-muted text-sm md:text-base max-w-lg mx-auto leading-relaxed font-sans">Let our AI analyze the job requirements and your unique profile to build a winning strategy.</p></header><div class="w-full bg-bg-card border border-border-color rounded-xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col max-w-2xl"><div class="flex items-center justify-between px-5 py-3 border-b border-border-color bg-white/[0.01]"><div class="flex items-center gap-2"><span class="text-accent"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg></span><h2 class="text-xs font-display font-semibold tracking-tight text-text-primary">New Interview Strategy</h2></div><span class="text-[9px] font-bold tracking-wider text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-md uppercase">AI Strategy</span></div><div class="flex flex-col relative bg-white/[0.005]"><textarea id="jd-input" maxLength="5000" placeholder="Paste target job description here...&#10;e.g. 'Senior Frontend Engineer requires proficiency in React, TypeScript, and large-scale system design...'" class="w-full min-h-[260px] bg-transparent text-text-primary placeholder-text-muted/45 px-5 py-4 focus:outline-none resize-none text-xs leading-relaxed border-0"></textarea><div class="text-[9px] text-text-muted px-5 pb-3 self-end select-none"><span id="jd-count">0</span> / 5000 chars</div></div><div class="flex items-center justify-between border-t border-border-color px-5 py-3 bg-white/[0.01]"><div class="flex items-center gap-3"><label id="resumeLabel" for="file-input" class="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition duration-150 cursor-pointer ${fileClass}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg><span id="resumeLabelText">${fileText}</span></label><input type="file" id="file-input" accept=".pdf" class="hidden" /><span class="hidden md:inline text-[10px] text-text-muted select-none">PDF required &bull; Max 3MB</span></div><button id="btn-generate" class="bg-accent hover:bg-accent-hover text-white text-[11px] font-medium px-3.5 py-1.5 rounded-md border border-white/10 shadow-sm transition duration-150 transform active:scale-[0.98] flex items-center gap-1.5"><svg class="w-3 h-3 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>Generate Strategy</button></div></div></main>`;
  } else if (state.route === "interview" && state.reportData) {
    const r = state.reportData;
    const isReality = r.matchScore < 30 || (r.preparationPlan.length === 1 && r.preparationPlan[0].day === 0);
    const ringColor = r.matchScore >= 80 ? "border-severity-low" : r.matchScore >= 60 ? "border-severity-medium" : "border-severity-high";
    const scoreMsgColor = r.matchScore >= 80 ? "text-severity-low" : r.matchScore >= 60 ? "text-severity-medium" : "text-severity-high";
    const scoreMessage = r.matchScore >= 80 ? "Strong match for this role" : r.matchScore >= 60 ? "Moderate match" : "Action needed: Skill gaps";

    let tabContent = "";
    if (state.activeTab === "technical" || state.activeTab === "behavioral") {
      const qs = state.activeTab === "technical" ? r.technicalQuestions : r.behavioralQuestions;
      tabContent = `<div class="flex flex-col gap-5"><div class="flex items-baseline gap-3 border-b border-border-color pb-3"><h2 class="text-sm font-display font-semibold tracking-tight">${state.activeTab === "technical" ? "Technical Questions" : "Behavioral Questions"}</h2><span class="text-[10px] text-text-muted bg-bg-panel border border-border-color px-2 py-0.5 rounded-full">${qs.length} questions</span></div><div class="flex flex-col gap-3.5">${qs.map((q: Question, idx: number) => `<div class="bg-bg-panel border border-border-color rounded-md overflow-hidden transition duration-150"><div data-accordion-id="${state.activeTab}-${idx}" class="flex items-start gap-2.5 p-3 cursor-pointer select-none hover:bg-white/[0.02] transition duration-150"><span class="flex-shrink-0 text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md mt-0.5">Q${idx + 1}</span><p class="flex-1 font-semibold text-xs leading-relaxed">${q.question}</p><span class="chevron text-text-muted mt-0.5 transform transition-transform duration-200"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg></span></div><div id="content-${state.activeTab}-${idx}" class="hidden border-t border-border-color p-3 flex flex-col gap-3.5 bg-bg-page/40"><div class="flex flex-col gap-1.5"><span class="text-[9px] font-bold tracking-wider text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded w-max uppercase">Intention</span><p class="text-[11px] text-text-muted leading-relaxed">${q.intention}</p></div><div class="flex flex-col gap-1.5"><span class="text-[9px] font-bold tracking-wider text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded w-max uppercase">Model Answer</span><p class="text-[11px] text-text-muted leading-relaxed">${q.answer}</p></div></div></div>`).join("") || `<p class="text-xs text-text-muted text-center py-8">No questions.</p>`}</div>`;
    } else if (state.activeTab === "roadmap") {
      tabContent = `<div class="flex flex-col gap-5"><div class="flex items-baseline gap-3 border-b border-border-color pb-3"><h2 class="text-sm font-display font-semibold tracking-tight">Road Map</h2><span class="text-[10px] text-text-muted bg-bg-panel border border-border-color px-2 py-0.5 rounded-full">${isReality ? "Long-Term Strategy" : `${r.preparationPlan.length}-day plan`}</span></div><div class="relative pl-8 border-l border-border-color/60 ml-3 space-y-5">${isReality && r.preparationPlan[0] ? `<div class="relative flex flex-col gap-2 pb-1.5"><div class="absolute -left-[39px] top-1.5 w-3.5 h-3.5 rounded-full bg-bg-card border-2 border-accent"></div><div class="flex items-center gap-2"><span class="text-[9px] font-bold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">Pivot</span><h3 class="font-display font-semibold text-xs text-text-primary">Pivot Strategy & Reality Check</h3></div><p class="text-xs text-text-muted leading-relaxed px-5">The mismatch between job requirements and your profile is high.</p><ul class="list-disc pl-10 text-[11px] text-text-muted space-y-1">${r.preparationPlan[0].tasks.map((task: string) => `<li>${task}</li>`).join("")}</ul></div>` : r.preparationPlan.map((day: TaskDay) => `
        <div class="relative flex flex-col gap-2 pb-1.5">
          <div class="absolute -left-[39px] top-1.5 w-3.5 h-3.5 rounded-full bg-bg-card border-2 border-accent"></div>
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-bold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">Day ${day.day}</span>
            <h3 class="font-display font-semibold text-xs text-text-primary">${day.focus}</h3>
          </div>
          <ul class="list-disc pl-5 text-[11px] text-text-muted space-y-1">
            ${day.tasks.map((task: string) => `<li>${task}</li>`).join("")}
          </ul>
        </div>`).join("")}</div></div>`;
    }

    contentHtml = `<main class="flex-grow max-w-7xl w-full mx-auto p-4 md:p-5 flex flex-col md:flex-row gap-5"><nav class="w-full md:w-52 flex-shrink-0 flex flex-col justify-between gap-6 bg-bg-card border border-border-color rounded-xl p-4 md:h-[calc(100vh-6.5rem)] shadow-none"><div class="flex flex-col gap-1"><p class="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-2">Sections</p><button id="tab-technical" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "technical" ? "bg-white/[0.06] text-text-primary" : "text-text-muted"} hover:bg-white/[0.04] hover:text-text-primary transition duration-150"><svg class="w-3.5 h-3.5 ${state.activeTab === "technical" ? "text-accent" : "text-text-muted"} transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>Technical</button><button id="tab-behavioral" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "behavioral" ? "bg-white/[0.06] text-text-primary" : "text-text-muted"} hover:bg-white/[0.04] hover:text-text-primary transition duration-150"><svg class="w-3.5 h-3.5 ${state.activeTab === "behavioral" ? "text-accent" : "text-text-muted"} transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>Behavioral</button><button id="tab-roadmap" class="tab-btn w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md ${state.activeTab === "roadmap" ? "bg-white/[0.06] text-text-primary" : "text-text-muted"} hover:bg-white/[0.04] hover:text-text-primary transition duration-150"><svg class="w-3.5 h-3.5 ${state.activeTab === "roadmap" ? "text-accent" : "text-text-muted"} transition duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>Road Map</button></div></nav><section class="flex-1 bg-bg-card border border-border-color rounded-xl p-5 overflow-y-auto md:h-[calc(100vh-6.5rem)] shadow-none">${tabContent}</section><aside class="w-full md:w-56 flex-shrink-0 flex flex-col gap-4 md:h-[calc(100vh-6.5rem)] md:overflow-y-auto pr-1"><div class="bg-bg-card border border-border-color rounded-xl p-4 flex flex-col items-center gap-3.5 text-center shadow-none"><h3 class="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wider self-start">Match Score</h3><div id="scoreRing" class="w-20 h-20 border-2 rounded-full flex flex-col items-center justify-center bg-white/[0.01] ${ringColor}"><span id="scoreValue" class="text-xl font-display font-bold leading-none">${r.matchScore}</span></div><p id="scoreMessage" class="text-[11px] font-medium ${scoreMsgColor}">${scoreMessage}</p></div><div class="bg-bg-card border border-border-color rounded-xl p-4 flex flex-col gap-3.5 shadow-none"><h3 class="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wider">Skill Gaps</h3><div id="skillGapsList" class="flex flex-wrap gap-1.5">${r.skillGaps.map((gap: SkillGap) => `<span class="text-[9px] font-semibold px-2 py-0.5 rounded-md border ${gap.severity === "high" ? "text-severity-high bg-severity-high/10 border-severity-high/20" : gap.severity === "medium" ? "text-severity-medium bg-severity-medium/10 border-severity-medium/20" : "text-severity-low bg-severity-low/10 border-severity-low/20"}">${gap.skill}</span>`).join("") || '<span class="text-[10px] text-text-muted">No gaps</span>'}</div></div></aside></main>`;
  }

  root.innerHTML = `<div class="bg-bg-page text-text-primary min-h-screen flex flex-col font-sans antialiased">${navHtml} ${contentHtml} ${drawerHtml} ${!state.isGenerating ? "" : `<div class="fixed inset-0 bg-bg-page/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-50 select-none"><div class="w-14 h-14 border-4 border-accent border-t-transparent rounded-full animate-spin"></div><h2 class="text-xl font-bold font-display text-text-primary tracking-tight">Designing your preparation plan...</h2><p class="text-text-muted text-xs max-w-xs text-center leading-relaxed font-sans">Parsing resume against requirements.</p></div>`}</div>`;
}

function setupEventDelegation() {
  const root = document.getElementById("root")!;
  root.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest("#btn-login")) { supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: globalThis.location.href.split("#")[0] } }); return; }
    if (target.closest("#btn-logout")) {
      supabase.auth.signOut(); state.reports = []; state.reportData = null; state.drawerOpen = false; globalThis.location.hash = "#/login"; return;
    }
    if (target.closest("#btn-toggle-drawer")) { state.drawerOpen = !state.drawerOpen; render(); return; }
    if (target.closest("#btn-close-drawer") || target.closest("#drawer-backdrop")) { state.drawerOpen = false; render(); return; }

    const dayBtn = target.closest("[data-day-index]");
    if (dayBtn) { state.activeDayIndex = parseInt(dayBtn.getAttribute("data-day-index") || "0", 10); render(); return; }

    const tabs = ["technical", "behavioral", "roadmap"] as const;
    for (const t of tabs) {
      if (target.closest(`#tab-${t}`)) { state.activeTab = t; render(); return; }
    }

    const accordion = target.closest("[data-accordion-id]");
    if (accordion) {
      const content = document.getElementById(`content-${accordion.getAttribute("data-accordion-id")}`);
      const chevron = accordion.querySelector(".chevron");
      if (content) {
        const isHidden = content.classList.contains("hidden");
        content.classList.toggle("hidden");
        if (chevron) chevron.classList.toggle("rotate-180", isHidden);
      }
      return;
    }

    if (target.closest("#btn-generate")) { generateReport((document.getElementById("jd-input") as HTMLTextAreaElement)?.value || ""); return; }
  });

  root.addEventListener("input", (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    if (target.id === "jd-input") {
      const count = document.getElementById("jd-count"); if (count) count.textContent = target.value.length.toString();
    }
  });

  root.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.id === "file-input" && target.files && target.files.length > 0) {
      state.selectedFile = target.files[0];
      const lbl = document.getElementById("resumeLabelText");
      if (lbl) {
        lbl.textContent = target.files[0].name;
        lbl.classList.add("text-emerald-400");
        const resumeLabel = document.getElementById("resumeLabel");
        if (resumeLabel) {
          resumeLabel.classList.add("border-emerald-500/30", "bg-emerald-500/5");
          resumeLabel.classList.remove("border-border-color", "bg-white/[0.04]");
        }
      }
      render();
    }
  });
}

init();
