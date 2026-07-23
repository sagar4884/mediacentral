const axios = require('axios');

async function getLogs() {
  try {
    const runs = await axios.get('https://api.github.com/repos/sagar4884/mediacentral/actions/runs');
    const latestRun = runs.data.workflow_runs[0];
    
    console.log(`Latest Run ID: ${latestRun.id}, Status: ${latestRun.status}, Conclusion: ${latestRun.conclusion}`);
    
    const jobs = await axios.get(latestRun.jobs_url);
    const job = jobs.data.jobs[0];
    
    console.log(`Job ID: ${job.id}`);
    
    // Attempt to download logs zip
    console.log(`Logs URL: https://api.github.com/repos/sagar4884/mediacentral/actions/jobs/${job.id}/logs`);
  } catch (e) {
    console.error(e.message);
  }
}
getLogs();
