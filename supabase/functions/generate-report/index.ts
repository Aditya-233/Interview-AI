import { GoogleGenAI } from "@google/genai";
import { encodeBase64 } from "@std/encoding/base64";

const corsHeaders = {
  // Access-Control-Allow-Origin: Checked by the browser's security sandbox to verify if the frontend origin is allowed.
  "Access-Control-Allow-Origin": "*",

  // Access-Control-Allow-Headers:
  // - 'authorization': Requested by Supabase Auth
  // - 'x-client-info': Requested by Supabase Client SDK
  // - 'apikey': Requested by Supabase API Gateway
  // - 'content-type': Requested by Fetch API
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",

  // Access-Control-Allow-Methods: Checked by the browser during preflight OPTIONS requests to verify allowed HTTP verbs.
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Schema for Gemini to follow and answer with...
// https://ai.google.dev/gemini-api/docs/structured-output
const Q_A_ITEM_SCHEMA = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "The question that can be asked in the interview",
    },
    intention: {
      type: "string",
      description: "The intention of the interviewer behind asking this question",
    },
    answer: {
      type: "string",
      description: "How to answer this question, what points to cover, what approach to take etc.",
    },
  },
  required: ["question", "intention", "answer"],
};

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    matchScore: {
      type: "number",
      description: "A score between 0 and 100 indicating how well the candidate's profile matches the job description",
      nullable: false,
    },
    title: {
      type: "string",
      description: "The title of the job for which the interview report is generated",
      nullable: false,
    },
    technicalQuestions: {
      type: "array",
      description: "Technical questions along with their intention and how to answer them",
      items: Q_A_ITEM_SCHEMA,
    },
    behavioralQuestions: {
      type: "array",
      description: "Behavioral questions along with their intention and how to answer them",
      items: Q_A_ITEM_SCHEMA,
    },
    skillGaps: {
      type: "array",
      description: "List of skill gaps in the candidate's profile along with their severity",
      items: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "The skill which the candidate is lacking. Isolate the missing framework, tool, or methodology.",
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "The severity of this skill gap",
          },
        },
        required: ["skill", "severity"],
      },
    },
    preparationPlan: {
      type: "array",
      description: "A day-wise preparation plan for the candidate",
      items: {
        type: "object",
        properties: {
          day: {
            type: "integer",
            description: "The day number in the preparation plan, starting from 1",
          },
          focus: {
            type: "string",
            description: "The main focus of this day",
          },
          tasks: {
            type: "array",
            description: "List of tasks to be done on this day",
            items: { type: "string" },
          },
        },
        required: ["day", "focus", "tasks"],
      },
    },
  },
  required: [
    "matchScore",
    "title",
    "technicalQuestions",
    "behavioralQuestions",
    "skillGaps",
    "preparationPlan",
  ],
};

const SYSTEM_INSTRUCTION =
  "You are a highly experienced, brutally honest technical recruiter and engineering manager. Analyze the candidate profile against the job description to produce a structured interview preparation report.\n\nCRITICAL INSTRUCTIONS:\n1. Strict Scoring (0-100): Be fiercely realistic. Do not act as a simple keyword counter. If the candidate fundamentally lacks the core stack, domain expertise, or seniority required for the role, the match score must be severely penalized.\n2. Pivot Framing & Logic Gates (Universal): Apply this logic to EVERY question generated in both technicalQuestions and behavioralQuestions:\n    - STEP 1: Does the candidate's resume explicitly list the required skill/experience?\n    - STEP 2: If YES, ask them to elaborate on their specific past experience.\n    - STEP 3: If NO, you are STRICTLY FORBIDDEN from asking them to describe their experience with it. You MUST frame the question hypothetically or comparatively based on the skills they DO have (e.g., \"Given your experience with X, how would you approach learning Y?\").\n    - STEP 4: For grouped skills (e.g., \"Skill A and Skill B\"), parse them discretely. If they have A but lack B, acknowledge A and apply STEP 3 to B.\n3. Deep Intentions: The 'intention' field must explain the underlying psychology of the question. Do not just repeat the question. What exact signal or red flag is the interviewer looking for?\n4. The Reality Check (Roadmap): If the match score is below 30%, it is impossible to prepare for this interview in a standard timeframe. Do not generate a daily study plan. Instead, output exactly ONE item in the preparationPlan array:\n   - Set 'day' to 0.\n   - Set 'focus' to \"Reality Check & Pivot Strategy\".\n   - Use the 'tasks' array to ruthlessly but professionally explain why the candidate is not ready for this specific role and detail the long-term foundational shifts required to eventually get there.\n\nCRITICAL FORMATTING RULES:\n  - Perspective Scoping: You must adapt your narrative voice based on the JSON field you are generating:\n      * 'question' fields: MUST be written in the second person (\"you\", \"your\") exactly as an interviewer would ask it face-to-face.\n      * 'intention' and 'answer' fields: MUST be written in the third person (\"the candidate\", \"they\") as an objective evaluation guide.\n      * 'preparationPlan' (Roadmap): MUST be written in a professional, direct second-person tone (\"Your profile\", \"You need to learn\"). Do not use informal greetings or use the candidate's name.\n  - Every 'intention' and 'answer' field must consist of completely formed, grammatically correct sentences.\n  - Never terminate a sentence or an explanation mid-thought.\n  - Ensure each 'answer' field provides a minimum of 2-3 substantive sentences offering concrete, actionable guidance.";

export default {
  // Expose Edge Function as an HTTP server using standard Deno/ES fetch module format
  // https://docs.deno.com/api/deno/http-server/#Deno.ServeDefaultExport
  async fetch(req: Request) {
    // Preflight OPTIONS check is used to verify CORS permissions before the browser sends the actual POST request
    // https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const fd = await req.formData();
    const file = fd.get("resume") as File;
    const jd = fd.get("jobDescription") as string;

    if (!file || !jd) {
      return Response.json({ error: "Missing required fields." }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (file.size > 3 * 1024 * 1024) {
      return Response.json({ error: "Resume PDF size must be 3MB or less." }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (file.type !== "application/pdf") {
      return Response.json({ error: "Only PDF resume files are accepted." }, {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Initialize Google Gen AI client with environment secret key
    // https://www.npmjs.com/package/@google/genai
    const apiKey = Deno.env.get("GOOGLE_GENAI_API_KEY");
    const ai = new GoogleGenAI({ apiKey });

    // Send prompt instructions along with the resume PDF binary inline data to the Gemini model to get structured JSON plan
    // https://ai.google.dev/gemini-api/docs/generate-content/document-processing#inline_data
    const res = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            // Convert binary bytes to base64 encoding format so that it can be transmitted inline inside the JSON payload
            // https://jsr.io/@std/encoding
            data: encodeBase64(await file.arrayBuffer()),
          },
        },
        `Job Description:\n${jd.trim()}`,
      ],
      // config: Configure system instructions, response MIME, and schema
      // https://ai.google.dev/gemini-api/docs/structured-output
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: REPORT_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    if (res.text) {
      return Response.json({ report: JSON.parse(res.text) }, { headers: corsHeaders });
    } else {
      return Response.json({ error: "Failed to generate report from LLM." }, { status: 502, headers: corsHeaders });
    }
  },
};
