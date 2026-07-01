import { GoogleGenAI } from "@google/genai";
import { encodeBase64 } from "@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "OBJECT" as const, properties, required });
const arr = (items: Record<string, unknown>) => ({ type: "ARRAY" as const, items });
const str = (desc?: string) => ({ type: "STRING" as const, ...(desc ? { description: desc } : {}) });

const qSchema = obj({ question: str(), intention: str(), answer: str() }, ["question", "intention", "answer"]);
const reportSchema = obj({
  matchScore: { type: "INTEGER" as const, description: "0-100 match rating" },
  title: str("Job title"),
  resumeText: str("Resume text content"),
  technicalQuestions: arr(qSchema),
  behavioralQuestions: arr(qSchema),
  skillGaps: arr(obj({ skill: str(), severity: { type: "STRING" as const, enum: ["low", "medium", "high"] } }, ["skill", "severity"])),
  preparationPlan: arr(obj({ day: { type: "INTEGER" as const }, focus: str(), tasks: arr(str()) }, ["day", "focus", "tasks"])),
}, ["matchScore", "title", "resumeText", "technicalQuestions", "behavioralQuestions", "skillGaps", "preparationPlan"]);

const SYSTEM_INSTRUCTION = `You are a recruiter. Analyze candidate profile vs job description.
1. Strict Scoring: Fierce/realistic (0-100).
2. Pivot Framing: If lacking a skill, ask hypothetical/comparative questions. Don't ask for experience they don't have.
3. Reality Check: If score < 30%, generate 1 day (day 0, focus: "Reality Check & Pivot Strategy", tasks: why they aren't ready).
4. Tone: 'question' in 2nd person ("you"). 'intention'/'answer' in 3rd person. Plan in professional 2nd person.`;

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      const fd = await req.formData();
      const file = fd.get("resume") as File;
      const jd = fd.get("jobDescription") as string;
      if (!file || !jd) return new Response(JSON.stringify({ error: "Missing fields." }), { status: 400, headers: corsHeaders });

      const ai = new GoogleGenAI({ apiKey: Deno.env.get("GOOGLE_GENAI_API_KEY") || "" });
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ inlineData: { mimeType: "application/pdf", data: encodeBase64(await file.arrayBuffer()) } }, `Job Description:\n${jd}`],
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", responseSchema: reportSchema },
      });
      const report = JSON.parse(res.text || "{}");
      return new Response(JSON.stringify({ report, resumeText: report.resumeText }), { headers: corsHeaders });
    } catch (e: unknown) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
    }
  },
};
