# Taste
- Wants dommief to satisfy both goals: replace dumi for component libraries and remain a lightweight Vite-native docs/demo site generator; keep core lightweight and implement component-library features via first-party plugins/presets/config (`preset: 'library' | 'docs'`). Confidence: 0.8
- When wrapping up work, prefers committing and pushing all current changes (including already-tracked generated files) in one go, but excludes unrelated `.pi/taste` changes. Confidence: 0.8
- Prefers spawning agents to execute all remaining phases/work in parallel (one agent per phase, each in its own worktree) rather than sequentially. Confidence: 0.9
- Communicates with Claude in Vietnamese. Confidence: 0.75
- When told to continue, expects the assistant to keep working autonomously through all remaining issues/phases to completion rather than stopping after each one to ask which to do next. Confidence: 0.8
- Uses a "quick task" as a gating/checkpoint step between phases of work. Confidence: 0.7
- Prioritizes shipping a usable/working state over exhaustive completion; avoids scope creep and stops when remaining items are non-blocking. Confidence: 0.8
- When asked to merge a PR, expects the assistant to perform the merge directly (not just create/open the PR), clean up the feature branch locally and remotely, and then proceed to the next task without asking for confirmation. Confidence: 0.9
- Prefers CI workflows to be triggered manually (workflow_dispatch) rather than automatically on push/pull_request. Confidence: 0.8
