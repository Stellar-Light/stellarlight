apiVersion 1.9.95 at start, 1.9.95 at end; 2026-10-23T14:03:29.755Z to 2026-10-23T14:05:00.832Z

| Operation | Request | Status | Rows | Full chars | Fits 24,000 | Compact chars | Fits 24,000 | Cut |
|---|---|---|---|---|---|---|---|---|
| searchProjects | `/projects/search?q=lending` | 200 | 20 | 87,157 | no | 23,091 | yes | 74% |
| searchProjects | `/projects/search?q=wallet` | 200 | 20 | 76,872 | no | 21,706 | yes | 72% |
| searchProjects | `/projects/search?q=oracle` | 200 | 20 | 84,071 | no | 21,720 | yes | 74% |
| searchProjects | `/projects/search?q=anchor` | 200 | 20 | 74,021 | no | 19,508 | yes | 74% |
| searchProjects | `/projects/search?q=payments` | 200 | 20 | 52,110 | no | 17,646 | yes | 66% |
| searchProjects | `/projects/search?q=dex` | 200 | 20 | 94,602 | no | 21,035 | yes | 78% |
| searchProjects | `/projects/search?q=lending&limit=5` | 200 | 5 | 40,870 | no | 9,554 | yes | 77% |
| searchProjects | `/projects/search?type=Wallet` | 200 | 20 | 60,316 | no | 18,090 | yes | 70% |
| searchRepos | `/repos/search?q=soroban` | 200 | 20 | 77,322 | no | 13,096 | yes | 83% |
| searchRepos | `/repos/search?q=oracle` | 200 | 20 | 70,124 | no | 12,806 | yes | 82% |
| searchRepos | `/repos/search?q=wallet` | 200 | 20 | 59,709 | no | 12,840 | yes | 78% |
| searchRepos | `/repos/search?q=passkey` | 200 | 20 | 70,574 | no | 12,803 | yes | 82% |
| searchRepos | `/repos/search?q=soroban&limit=5` | 200 | 5 | 25,868 | no | 4,165 | yes | 84% |
| searchResearch | `/research?q=soroban%20lending` | 200 | 8 | 11,708 | yes |  |  |  |
| searchResearch | `/research?q=passkeys` | 200 | 8 | 9,238 | yes |  |  |  |
| searchResearch | `/research?q=defi%20lending` | 200 | 8 | 21,225 | yes |  |  |  |
| searchResearch | `/research?q=passkeys&limit=25` | 200 | 25 | 24,509 | no |  |  |  |
| searchHackathonBuilds | `/hackathons/builds?q=payments` | 200 | 20 | 19,067 | yes |  |  |  |
| searchHackathonBuilds | `/hackathons/builds?q=wallet` | 200 | 20 | 17,444 | yes |  |  |  |
| searchHackathonBuilds | `/hackathons/builds?q=nft%20marketplace` | 200 | 20 | 18,004 | yes |  |  |  |
| searchHackathonBuilds | `/hackathons/builds?q=payments&limit=50` | 200 | 50 | 43,978 | no |  |  |  |
| getBuilders | `/builders` | 200 | 50 | 50,497 | no |  |  |  |
| getPartners | `/partners` | 200 | 43 | 57,263 | no |  |  |  |
| getLeaderboard | `/leaderboard` | 200 | 50 | 51,727 | no |  |  |  |
| listAudits | `/audits` | 200 | 64 | 39,012 | no |  |  |  |
| getStablecoins | `/stablecoins` | 200 | 41 | 27,391 | no |  |  |  |
| getRfps | `/rfps` | 200 | 17 | 21,513 | yes |  |  |  |
| analyzeEcosystem | `/analyze` | 200 |  | 17,723 | yes |  |  |  |
| listContracts | `/contracts` | 200 | 20 | 17,623 | yes |  |  |  |
| getHackathons | `/hackathons` | 200 | 27 | 16,694 | yes |  |  |  |
| getClusters | `/clusters` | 200 | 7 | 12,069 | yes |  |  |  |
| getPeople | `/people` | 200 | 25 | 5,539 | yes |  |  |  |
| listSkills | `/skills` | 200 | 82 | 83,175 | no |  |  |  |
| resolveProject | `/projects/resolve?q=blend` | 200 |  | 1,280 | yes |  |  |  |
| getRepoTrust | `/repos/trust?repo=blend-capital/blend-contracts-v2` | 200 |  | 5,413 | yes |  |  |  |
