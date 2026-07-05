/**
 * Native Deno/TypeScript Edge Latency Benchmark for InterviewAI
 * Rate-Limit Compliant Strategy for Gemini 2.5 Flash API Limits
 *
 * HOW TO EXECUTE:
 *   1. From InterviewAI root directory:
 *      deno task bench
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "your-anon-key-here";
const endpointUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-report`;

// Rate Limiting Parameters based on Gemini 2.5 Flash Free Tier (15 RPM max)
const REQUEST_DELAY_MS = 5000;
const MAX_RETRIES = 3;
const TOTAL_BENCHMARK_SAMPLES = 5;

// Load real PDF resume provided for the benchmark
const pdfUrl = new URL("./software-engineer-resume-example.pdf", import.meta.url);
const pdfBuffer = await Deno.readFile(pdfUrl);

function buildFormData(pdfBuffer: Uint8Array): FormData {
  const fd = new FormData();
  fd.append(
    "jobDescription",
    "Senior Systems Engineer skilled in C++, Rust, TypeScript, Deno, Distributed Architecture.",
  );
  const blob = new Blob([pdfBuffer as unknown as BlobPart], { type: "application/pdf" });
  fd.append("resume", blob, "software-engineer-resume-example.pdf");
  return fd;
}

interface RequestMetric {
  sample_id: number;
  ttfb_ms: number;
  rtt_ms: number;
  status: number;
  success: boolean;
  retries: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendRateLimitAwareRequest(
  sampleId: number,
  endpoint: string,
  pdfBuffer: Uint8Array,
): Promise<RequestMetric> {
  const formData = buildFormData(pdfBuffer);
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    attempts++;
    const tStart = performance.now();
    let ttfb = 0;
    let rtt = 0;
    let status = 0;
    let success = false;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: formData,
      });

      const tTtfb = performance.now();
      ttfb = tTtfb - tStart;

      const resBody = await response.text();
      const tEnd = performance.now();
      rtt = tEnd - tStart;

      status = response.status;
      success = response.ok;

      if (status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const backoffSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 60 : 61;
        console.warn(`[!] HTTP 429 Rate Limit Exceeded on sample #${sampleId}. Waiting ${backoffSec}s for Gemini quota window reset... (Attempt ${attempts}/${MAX_RETRIES})`);
        await sleep(backoffSec * 1000);
        continue;
      }

      if (success) {
        return { sample_id: sampleId, ttfb_ms: ttfb, rtt_ms: rtt, status, success: true, retries: attempts - 1 };
      } else {
        let errDetail = resBody.slice(0, 150);
        try {
          const parsedErr = JSON.parse(resBody);
          if (parsedErr.error) errDetail = parsedErr.error;
        } catch (_unused) {
          // Fallback to sliced response body if JSON parsing fails
        }
        console.error(`[-] Sample #${sampleId} failed with HTTP status ${status}: ${errDetail}`);
        return { sample_id: sampleId, ttfb_ms: ttfb, rtt_ms: rtt, status, success: false, retries: attempts - 1 };
      }
    } catch (err) {
      const tEnd = performance.now();
      rtt = tEnd - tStart;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[-] Sample #${sampleId} network error: ${msg}`);
      return { sample_id: sampleId, ttfb_ms: rtt, rtt_ms: rtt, status: 0, success: false, retries: attempts - 1 };
    }
  }

  return { sample_id: sampleId, ttfb_ms: 0, rtt_ms: 0, status: 429, success: false, retries: MAX_RETRIES };
}

async function main() {
  console.log("=================================================================");
  console.log("    INTERVIEW-AI GEMINI 3.1 FLASH LITE RATE-LIMIT BENCHMARK     ");
  console.log("=================================================================");
  console.log(`Target Endpoint: ${endpointUrl}`);
  console.log(`Payload File: benchmark/software-engineer-resume-example.pdf (${(pdfBuffer.byteLength / 1024).toFixed(1)}KB)`);
  console.log(`Throttling: Paced at 1 request every ${(REQUEST_DELAY_MS / 1000).toFixed(1)}s (~12 RPM)`);
  console.log(`Model Target: Gemini 3.1 Flash Lite\n`);

  const metrics: RequestMetric[] = [];
  const t0 = performance.now();

  for (let i = 1; i <= TOTAL_BENCHMARK_SAMPLES; i++) {
    console.log(`[*] Executing Sample Request ${i}/${TOTAL_BENCHMARK_SAMPLES}...`);
    const res = await sendRateLimitAwareRequest(i, endpointUrl, pdfBuffer);
    metrics.push(res);
    console.log(`    TTFB: ${res.ttfb_ms.toFixed(2)}ms | RTT: ${res.rtt_ms.toFixed(2)}ms | Status: ${res.status} | Success: ${res.success}`);

    if (i < TOTAL_BENCHMARK_SAMPLES) {
      console.log(`    [~] Rate limit throttle: Waiting ${(REQUEST_DELAY_MS / 1000).toFixed(1)}s before next request...`);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const totalDurationSec = (performance.now() - t0) / 1000;
  const successfulMetrics = metrics.filter((m) => m.success);
  const ttfbList = successfulMetrics.map((m) => m.ttfb_ms).sort((a, b) => a - b);
  const rttList = successfulMetrics.map((m) => m.rtt_ms).sort((a, b) => a - b);

  const median = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length * 0.5)] : 0);
  const p95 = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length * 0.95)] : 0);

  const summary = {
    model: "gemini-3.1-flash-lite",
    total_samples: TOTAL_BENCHMARK_SAMPLES,
    successful_samples: successfulMetrics.length,
    total_duration_sec: Number(totalDurationSec.toFixed(2)),
    rate_limit_throttle_ms: REQUEST_DELAY_MS,
    ttfb_p50_ms: Number(median(ttfbList).toFixed(2)),
    ttfb_p95_ms: Number(p95(ttfbList).toFixed(2)),
    rtt_p50_ms: Number(median(rttList).toFixed(2)),
    rtt_p95_ms: Number(p95(rttList).toFixed(2)),
  };

  console.log("\n[+] Structured Execution Summary:");
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
