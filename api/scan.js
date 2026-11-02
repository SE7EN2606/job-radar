export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedKey = process.env.SCAN_KEY;
  const providedKey = req.headers['x-scan-key'];

  if (!expectedKey || !process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server is missing SCAN_KEY or GITHUB_TOKEN.' });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid scan key.' });
  }

  try {
    const gh = await fetch(
      'https://api.github.com/repos/SE7EN2606/job-radar/actions/workflows/scan-jobs.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'job-radar-vercel'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );

    if (!gh.ok) {
      const details = await gh.text();
      return res.status(gh.status).json({
        error: 'GitHub workflow dispatch failed.',
        details: details.slice(0, 1000)
      });
    }

    let payload = {};
    try { payload = await gh.json(); } catch {}

    return res.status(200).json({
      ok: true,
      message: 'Scan started.',
      workflowRunId: payload.workflow_run_id || null,
      workflowUrl: payload.html_url || 'https://github.com/SE7EN2606/job-radar/actions/workflows/scan-jobs.yml'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to start scan.', details: String(error) });
  }
}
