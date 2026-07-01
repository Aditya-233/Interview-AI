# InterviewAI

A sleek, lightweight web application that generates custom, hyper-realistic interview preparation plans and skill gap strategies by matching your resume against target job descriptions.

---

## 🚀 Features

- **Resume Match Score**: Instantly calculates your match percentage against the target role.
- **Skill Gaps Assessment**: Pinpoints your technical/behavioral skill gaps with severity ratings.
- **Unified Timeline (Roadmap)**: Generates a sequential preparation guide for targeted study.
- **Interactive Question Cards**: Generates custom technical/behavioral questions with model answers and intention summaries.
- **History Panel**: Slides out to access previous preparation reports.
- **Secure Authentication**: Built with Google Sign-in via Supabase OAuth.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla TypeScript & Tailwind CSS v4 (compiles dynamically for development).
- **Backend & Database**: Supabase Database (PostgreSQL), Auth, and Edge Functions.
- **Runtime**: [Deno v2](https://deno.com) (provides native bundler and runtime compilation).
- **Hosting**: GitHub Pages (frontend) & Supabase (serverless Edge Functions).

---

## 💻 Local Development

### 1. Prerequisites

Make sure you have Deno installed:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### 2. Environment Setup

Create a `.env` file in the root folder:

```ini
SUPABASE_URL='https://your-project-ref.supabase.co'
SUPABASE_ANON_KEY='your-anon-key'
GOOGLE_GENAI_API_KEY='your-api-key'
```

### 3. Run Development Server

Start the local server in watch mode:

```bash
deno task dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Building and Deploying

### Production Build

To compile the static files manually:

```bash
deno task build
```

This minifies the JavaScript and compiles Tailwind CSS into the `dist/` directory.

### 🌐 GitHub Pages Deployment

This project is configured with a GitHub Actions workflow to deploy automatically on push:

1. Push your code to the `main` branch of your GitHub repository.
2. In your GitHub repository, go to **Settings** -> **Pages**.
3. Under _Build and deployment_, set the Source to **GitHub Actions**.
4. The workflow will build and host your site automatically!
