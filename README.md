# sovereignagent

Sovereign Agent — prototype repo scaffold.

This repository contains a minimal prototype for the Search & Analysis Agent (phase 1).

Note: You requested Base chain only for Superfluid tests — keep blockchain scripts configured for Base chain RPCs.

Files:
- `src/search_agent/search_agent.py` — prototype search & threat analysis script
- `requirements.txt` — Python dependencies
- `.gitignore`

How to run (Python 3.10+):

1. Create a virtualenv and install dependencies:

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

2. Run the prototype:

python src/search_agent/search_agent.py "Full Name"

