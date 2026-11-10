## Latest threat intelligence reports

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/alex0x90)

A collection of the most recent cybersecurity threat intelligence reports. This repository provides insights into emerging threats, attack patterns, and security trends to help organizations stay informed and enhance their defensive posture.

This repository serves security professionals, threat hunters, incident responders, and cybersecurity researchers who need access to actionable threat intelligence for:

- Threat hunting and detection
- Security awareness and training
- Risk assessment and mitigation
- Strategic security planning

## Data format

One file per report date: `reports_by_date/YYYY-MM-DD.json`, a list of `{"parsed": {...}}` records with the fields `report_date`, `title`, `summary` (short English summary of the report, for reports added from November 2026), `completeness`, `threats`, `geo`, `ttp_tactics`, `ttp_techniques`, `software`, `algorithms`, `functions`, `languages`, `crypto`, `wallets` and `links` (the report URL first). Fields that are empty in the source are omitted.

## How it is updated

The dataset is refreshed automatically every day: new reports are collected, summarized and committed to `reports_by_date/`, and the website is rebuilt from them.

## Support the project

This dataset is free. Every day it collects new reports, writes a short summary for each one and publishes them here, and the summaries cost money in model usage. If it saves you time, you can help keep it running:

- ☕ [Buy me a coffee](https://buymeacoffee.com/alex0x90)
