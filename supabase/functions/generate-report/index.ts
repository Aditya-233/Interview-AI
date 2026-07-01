import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Q_A_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    question: {
      type: Type.STRING,
      description: "The question that can be asked in the interview",
    },
    intention: {
      type: Type.STRING,
      description: "The intention of the interviewer behind asking this question",
    },
    answer: {
      type: Type.STRING,
      description: "How to answer this question, what points to cover, what approach to take etc.",
    },
  },
  required: ["question", "intention", "answer"],
};

const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    matchScore: {
      type: Type.NUMBER,
      description: "A score between 0 and 100 indicating how well the candidate's profile matches the job description",
      nullable: false,
    },
    title: {
      type: Type.STRING,
      description: "The title of the job for which the interview report is generated",
      nullable: false,
    },
    technicalQuestions: {
      type: Type.ARRAY,
      description: "Technical questions along with their intention and how to answer them",
      items: Q_A_ITEM_SCHEMA,
    },
    behavioralQuestions: {
      type: Type.ARRAY,
      description: "Behavioral questions along with their intention and how to answer them",
      items: Q_A_ITEM_SCHEMA,
    },
    skillGaps: {
      type: Type.ARRAY,
      description: "List of skill gaps in the candidate's profile along with their severity",
      items: {
        type: Type.OBJECT,
        properties: {
          skill: {
            type: Type.STRING,
            description: "The skill which the candidate is lacking. Isolate the missing framework, tool, or methodology.",
          },
          severity: {
            type: Type.STRING,
            enum: ["low", "medium", "high"],
            description: "The severity of this skill gap",
          },
        },
        required: ["skill", "severity"],
      },
    },
    preparationPlan: {
      type: Type.ARRAY,
      description: "A day-wise preparation plan for the candidate",
      items: {
        type: Type.OBJECT,
        properties: {
          day: {
            type: Type.INTEGER,
            description: "The day number in the preparation plan, starting from 1",
          },
          focus: {
            type: Type.STRING,
            description: "The main focus of this day",
          },
          tasks: {
            type: Type.ARRAY,
            description: "List of tasks to be done on this day",
            items: { type: Type.STRING },
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
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const fd = await req.formData(),
        file = fd.get("resume") as File,
        jd = fd.get("jobDescription") as string;

      if (!file || !jd) {
        return new Response(JSON.stringify({ error: "Missing fields." }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString(
        "base64",
      );

      const ai = new GoogleGenAI({
        apiKey: Deno.env.get("GOOGLE_GENAI_API_KEY") || "",
      });

      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        }, `Job Description:\n${jd.trim()}`],

        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: REPORT_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      return new Response(
        JSON.stringify({ report: JSON.parse(res.text || "{}") }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    } catch (e: unknown) {
      console.error(e);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
