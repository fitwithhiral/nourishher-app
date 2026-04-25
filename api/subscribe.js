// Vercel Serverless Function: /api/subscribe
// This runs on Vercel's servers (not in the browser) so Mailchimp accepts it.

import crypto from 'crypto';

export default async function handler(req, res) {
  // Allow CORS for your own frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const server = process.env.MAILCHIMP_SERVER;

  if (!apiKey || !audienceId || !server) {
    return res.status(500).json({ error: 'Mailchimp env vars missing on server' });
  }

  try {
    const emailLower = email.trim().toLowerCase();
    const subscriberHash = crypto.createHash('md5').update(emailLower).digest('hex');

    const url = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from('anystring:' + apiKey).toString('base64')}`
      },
      body: JSON.stringify({
        email_address: emailLower,
        status_if_new: 'subscribed',
        merge_fields: { FNAME: name || '' },
        tags: ['NourishHer-FreeUser']
      })
    });

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      const errText = await response.text();
      console.error('Mailchimp error:', response.status, errText);
      return res.status(response.status).json({ error: errText });
    }
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}
