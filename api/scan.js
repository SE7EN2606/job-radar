const OWNER = "SE7EN2606";
const REPO = "job-radar";
const WORKFLOW = "scan-jobs.yml";

async function latestRun(headers) {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=1`,
    { headers }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.workflow_runs?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "GITHUB_TOKEN is not configured in Vercel." });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "job-radar-vercel"
  };

  try {
    const run = await latestRun(headers);
    if (run) {
      const started = new Date(run.run_started_at || run.created_at).getTime();
      const ageMs = Date.now() - started;
      const stillActive = ["queued", "in_progress"].includes(run.status);
      const recentlyStarted = ageMs >= 0 && ageMs < 10 * 60 * 1000;

      if (stillActive || recentlyStarted) {
        return res.status(202).json({
          ok: true,
          alreadyRunning: stillActive,
          message: stillActive ? "A scan is already running." : "A scan was started recently.",
          runId: run.id,
          status: run.status,
          htmlUrl: run.html_url
        });
      }
    }

    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: "main" })
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: "GitHub rejected the workflow dispatch.",
        details: body.slice(0, 1000)
      });
    }

    return res.status(202).json({
      ok: true,
      message: "Job scan started."
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to start scan.",
      details: String(error?.message || error)
    });
  }
}
