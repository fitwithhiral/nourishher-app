// ============================================
// VERCEL SERVERLESS FUNCTION — CLAUDE PROXY
// Node.js Runtime Version (works with free Vercel tier)
// ============================================

export const config = {
  runtime: 'nodejs',
  maxDuration: 60, // 60 seconds (max on free tier)
};

// Rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
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

export default async function handler(req, res) {
  // ─── CORS ───
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://app.nourishyou.ca',
    'https://nourishyou.ca',
    'https://app.fitwithhiral.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  res.setHeader('Access-Control-Allow-Origin',
    allowedOrigins.includes(origin) ? origin : 'https://app.nourishyou.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── RATE LIMITING ───
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  // ─── VALIDATE ───
  const { prompt, max_tokens } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt' });
  }

  const safeMaxTokens = Math.min(parseInt(max_tokens) || 20000, 60000);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ─── CALL ANTHROPIC WITH STREAMING ───
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
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      const errTxt = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errTxt);
      return res.status(anthropicResponse.status).json({
        error: 'AI service error',
        details: anthropicResponse.status,
      });
    }

    // Read the stream
    const reader = anthropicResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let stopReason = null;
    let usage = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullText += event.delta.text;
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            if (event.usage) usage = event.usage;
          }
        } catch (e) {
          // Ignore malformed JSON
        }
      }
    }

    return res.status(200).json({
      content: [{ type: 'text', text: fullText }],
      stop_reason: stopReason,
      usage: usage,
    });

  } catch (error) {
    console.error('Generation error:', error.message);
    return res.status(500).json({
      error: 'Service temporarily unavailable',
      details: error.message,
    });
  }
}
