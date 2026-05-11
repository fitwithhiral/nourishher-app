// ============================================
// VERCEL SERVERLESS FUNCTION — CLAUDE PROXY
// ============================================
// This file lives at: api/generate-plan.js (in your repo root)
// Vercel automatically deploys it as: https://app.nourishyou.ca/api/generate-plan
//
// PURPOSE:
// The frontend calls THIS endpoint instead of Anthropic directly.
// The API key never touches the browser — it stays on Vercel servers only.
//
// SECURITY:
// - API key read from process.env (server-only, never exposed)
// - Basic rate limiting via simple in-memory counter
// - CORS headers to allow only your domain
// ============================================

export const config = {
  // Run as Edge Function for faster cold starts
  // and longer timeout (up to 5 min for plan generation)
  runtime: 'nodejs',
  maxDuration: 300, // 5 minutes (matches Anthropic's max)
};

// Simple in-memory rate limiter (per-instance — resets on cold start)
// More robust solution: use Upstash Redis or Vercel KV
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const userRecord = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > userRecord.resetAt) {
    userRecord.count = 0;
    userRecord.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  userRecord.count++;
  rateLimitMap.set(ip, userRecord);

  return userRecord.count <= MAX_REQUESTS_PER_WINDOW;
}

export default async function handler(request) {
  // ─── CORS HEADERS ───
  // Only allow requests from your domains
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://app.nourishyou.ca',
    'https://nourishyou.ca',
    'https://app.fitwithhiral.com', // Keep old domain working during migration
    'http://localhost:3000',         // For local dev
    'http://localhost:5173',         // For Vite local dev
  ];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://app.nourishyou.ca',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // ─── HANDLE PREFLIGHT (OPTIONS REQUEST) ───
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ─── ONLY ALLOW POST ───
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ─── RATE LIMITING ───
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({
      error: 'Too many requests. Please wait a minute and try again.'
    }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ─── VALIDATE REQUEST BODY ───
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { prompt, max_tokens } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing or invalid prompt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Cap max_tokens to prevent abuse (60k = max for paid full plan)
  const safeMaxTokens = Math.min(parseInt(max_tokens) || 20000, 60000);

  // ─── CALL ANTHROPIC API (server-side, key hidden) ───
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'Server configuration error. Please contact support.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: safeMaxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errTxt = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errTxt);
      return new Response(JSON.stringify({
        error: 'AI service error. Please try again in a moment.'
      }), {
        status: anthropicResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await anthropicResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generation error:', error);
    return new Response(JSON.stringify({
      error: 'Service temporarily unavailable. Please try again.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
