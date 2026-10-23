# Knowledge

This repository uses a centralized Knowledge Base at `/Users/thanhtu1/my_obsidian_vault101`.

Before making architectural or behavior changes:

1. Run `/Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py preflight "<task description>"` first — it detects
   the task's domain (auth, ui, api, database, architecture) and surfaces required
   knowledge topics + relevant documents. Read them before writing code.
2. Review `.knowledge/project/` for project-specific decisions and conventions.
3. Prefer existing project patterns over introducing new conventions.
4. Do not modify knowledge files unless explicitly requested.
5. After non-trivial changes, optionally run `knowledge.py drift` to check the
   change didn't violate a known project convention (e.g. raw SQL instead of Prisma).

## Quick Knowledge Commands

```bash
# Preflight: what knowledge applies to this task? (run before coding)
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py preflight "add login form"

# Get current project context (AI-ready JSON)
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py context --json

# Get context relevant to a specific file
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py context --file src/features/auth/LoginForm.tsx

# Search knowledge base (add --all-projects to search across every project)
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py search "authentication"

# Get a specific document by path
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py get projects/flowhub/srs-ieee.md

# Check for code/knowledge convention drift
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py drift

# Check knowledge health
python3 /Users/thanhtu1/my_obsidian_vault101/tools/knowledge.py status --json
```
