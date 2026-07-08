#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const environment = process.env.STAGING_ENVIRONMENT ?? 'staging';

function fail(message) {
  console.error(`[staging-gate] ERROR: ${message}`);
  process.exit(1);
}

if (!repository) fail('GITHUB_REPOSITORY is required');
if (!sha) fail('GITHUB_SHA is required');
if (!token) fail('GITHUB_TOKEN is required');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'fuma-lab-staging-gate',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function github(path) {
  const response = await fetch(`${apiUrl}${path}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    fail(`GitHub API request failed: ${response.status} ${body}`);
  }
  return response.json();
}

const params = new URLSearchParams({
  environment,
  per_page: '30',
  sha,
});
const deployments = await github(
  `/repos/${repository}/deployments?${params.toString()}`,
);

if (deployments.length === 0) {
  fail(
    `No ${environment} deployment found for ${sha}. Promote the exact staged commit to production.`,
  );
}

for (const deployment of deployments) {
  const statuses = await github(
    `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`,
  );
  const latest = statuses[0];
  if (latest?.state === 'success') {
    console.log(
      `[staging-gate] ${environment} deployment ${deployment.id} succeeded for ${sha}`,
    );
    process.exit(0);
  }
}

fail(`No successful ${environment} deployment found for ${sha}`);
