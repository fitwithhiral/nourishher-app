// ============================================
// VERCEL SERVERLESS FUNCTION — CLAUDE PROXY V3
// Simpler, more reliable version
// ============================================

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body
  const { prompt, max_tokens } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not found in env');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const safeMaxTokens = Math.min(parseInt(max_tokens) || 20000, 60000);

  console.log('Calling Anthropic with max_tokens:', safeMaxTokens);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return res.status(response.status).json({
        error: 'Anthropic API error',
        status: response.status,
        details: errText.substring(0, 500),
      });
    }

    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let stopReason = null;
    let usage = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
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
          // Skip malformed JSON
        }
      }
    }

    console.log('Generation complete. Length:', fullText.length, 'Stop reason:', stopReason);

    return res.status(200).json({
      content: [{ type: 'text', text: fullText }],
      stop_reason: stopReason,
      usage: usage,
    });

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({
      error: 'Server error',
      message: error.message,
    });
  }
}
