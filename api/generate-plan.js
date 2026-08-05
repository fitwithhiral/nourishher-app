// ============================================
// VERCEL EDGE FUNCTION — CLAUDE PROXY (STREAMING)
// ============================================
// Location: api/generate-plan.js (in repo ROOT, not inside src/)
//
// STREAMING VERSION — solves the 25s Vercel Edge timeout.
//
// How it works:
// 1. Calls Anthropic with stream:true (chunks come back progressively)
// 2. Immediately starts streaming response back to browser (first byte in ~1s)
// 3. This avoids Vercel's "no response in 25s → kill it" rule
// 4. As Anthropic chunks arrive, we forward them as SSE (Server-Sent Events)
// 5. At the end, we send a final "done" event with the assembled JSON
//
// SECURITY: API key stays server-side. Nothing changes about how the key is
// stored or exposed. Frontend still just calls /api/generate-plan.
// ============================================

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // CORS headers - allow your domains
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Parse request body
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

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get API key from server environment
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Cap tokens (safety) — with streaming, we can afford up to 16000
  const safeMaxTokens = Math.min(parseInt(max_tokens) || 12000, 16000);

  // Create a TransformStream we can write to as chunks arrive
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Helper: send an SSE event to the browser
  const sendEvent = async (eventType, data) => {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(payload));
  };

  // Start the Anthropic call and streaming in the background (do not await here)
  (async () => {
    try {
      // Send an initial "started" event immediately (< 1s) so Vercel doesn't
      // kill us for taking too long to respond.
      await sendEvent('start', { ok: true });

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
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!anthropicResponse.ok) {
        const errText = await anthropicResponse.text();
        await sendEvent('error', {
          error: 'Anthropic API error',
          status: anthropicResponse.status,
          details: errText.substring(0, 500),
        });
        await writer.close();
        return;
      }

      // Read the SSE stream from Anthropic and assemble the final response.
      // Anthropic streams events like:
      //   event: message_start   { message: {...} }
      //   event: content_block_delta   { delta: { text: "..." } }
      //   event: message_delta   { delta: { stop_reason: "end_turn" }, usage: {...} }
      //   event: message_stop
      const reader = anthropicResponse.body.getReader();
      const decoder = new TextDecoder();

      let assembledText = '';
      let stopReason = null;
      let usage = null;
      let buffer = '';
      let lastPingAt = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Anthropic SSE frames are separated by blank lines
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || ''; // keep the last (possibly-incomplete) frame

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventName = null;
          let dataLine = null;
          for (const ln of lines) {
            if (ln.startsWith('event: ')) eventName = ln.slice(7).trim();
            else if (ln.startsWith('data: ')) dataLine = ln.slice(6);
          }
          if (!dataLine) continue;

          try {
            const evt = JSON.parse(dataLine);

            if (eventName === 'content_block_delta' && evt.delta?.text) {
              assembledText += evt.delta.text;

              // Every ~2s, ping the browser so the connection stays lively
              // and the user's fetch() doesn't sit silent.
              const now = Date.now();
              if (now - lastPingAt > 2000) {
                await sendEvent('progress', {
                  chars: assembledText.length
                });
                lastPingAt = now;
              }
            } else if (eventName === 'message_delta') {
              if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
              if (evt.usage) usage = evt.usage;
            } else if (eventName === 'message_start' && evt.message?.usage) {
              usage = { ...(usage || {}), ...evt.message.usage };
            }
          } catch (parseErr) {
            // Skip malformed frames silently
          }
        }
      }

      // Send the final assembled result in the same shape the frontend expects
      await sendEvent('done', {
        content: [{ type: 'text', text: assembledText }],
        stop_reason: stopReason,
        usage: usage,
      });

      await writer.close();
    } catch (err) {
      try {
        await sendEvent('error', {
          error: 'Server error',
          message: err.message || String(err),
        });
      } catch (_) {}
      try { await writer.close(); } catch (_) {}
    }
  })();

  // Return the streaming response immediately — this is what beats the 25s rule.
  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering
    },
  });
}
