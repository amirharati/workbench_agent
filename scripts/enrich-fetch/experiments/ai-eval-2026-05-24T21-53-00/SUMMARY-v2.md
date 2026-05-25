# AI extraction eval — v2

- Corpus runs: 2026-05-21T02-02-56, 2026-05-21T03-03-24
- Items evaluated: **124**
- Output: `/Users/amir/Dropbox/CodingProjects/personal_tools/workbench_agent/scripts/enrich-fetch/experiments/ai-eval-2026-05-24T21-53-00`

## Overall metrics

| Metric | Value |
|--------|-------|
| Parse/extract ok | 119/124 (96.0%) |
| Non-empty summary | 119/124 (96.0%) |
| Non-empty improvedTitle | 118/124 (95.2%) |
| Has keyPoints | 113/124 (91.1%) |
| Avg summary length (ok rows) | 495 chars |
| Avg keyPoint count (ok rows) | 4.37 |
| Avg tag count (ok rows) | 5.52 |

## Status buckets

- **ok**: 119
- **empty_response**: 5

## By source kind

| Kind | N | ok | summary | keyPts | avg summary len | avg tags |
|------|---|----|---------|--------|-----------------|----------|
| article | 108 | 104 | 104 | 100 | 525 | 5.63 |
| video | 8 | 7 | 7 | 7 | 401 | 5.29 |
| x | 8 | 8 | 8 | 6 | 185 | 4.25 |
