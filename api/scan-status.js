const OWNER = "SE7EN2606";
const REPO = "job-radar";
const WORKFLOW = "scan-careerops.yml";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "job-radar-vercel"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=1`,
      { headers }
    );

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: "Unable to read scan status.",
        details: body.slice(0, 1000)
      });
    }

    const data = await response.json();
    const run = data.workflow_runs?.[0];

    if (!run) {
      return res.status(200).json({ status: "none", conclusion: null });
    }

    return res.status(200).json({
      status: run.status,
      conclusion: run.conclusion,
      runId: run.id,
      startedAt: run.run_started_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
      event: run.event
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to read scan status.",
      details: String(error?.message || error)
    });
  }
}
