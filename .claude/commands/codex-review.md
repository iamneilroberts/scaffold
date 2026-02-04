# Codex External Review

You are invoking Codex (OpenAI's CLI agent) as an external reviewer to get a second opinion on the current work.

## Your Task

1. **Gather Context** - Collect information about the current project and recent work:
   - Read the project's CLAUDE.md if it exists
   - Check for memory-bank/, docs/, or .claude/worklog/ for project context
   - Run `git status` and `git diff --stat` to see current changes
   - Run `git diff` to get the actual diff content (limit to reasonable size)
   - Run `git log --oneline -10` to see recent commits
   - Identify the main technologies (check package.json, Cargo.toml, pyproject.toml, etc.)
   - Note the current working directory and project structure

2. **Prepare the Review Request** - Create a detailed prompt for Codex that includes:
   - Project name and description (infer from context)
   - Main technologies detected
   - Summary of recent changes (staged and unstaged)
   - The actual diff or code changes
   - Specific questions or areas where review is needed
   - Ask Codex to act as a senior engineer reviewer

3. **Execute Codex Review** - Run Codex in non-interactive mode:
   ```bash
   codex exec -s read-only -C "$(pwd)" "PROMPT_HERE"
   ```

   The prompt should ask Codex to:
   - Review the current changes for bugs, security issues, and best practices
   - Identify any architectural concerns
   - Suggest improvements or alternative approaches
   - Point out anything that looks problematic
   - Be direct and critical - this is a code review, not a validation

4. **Present Results** - After getting Codex's response:
   - Summarize the key findings
   - Highlight any critical issues or concerns raised
   - Note any disagreements you have with Codex's assessment
   - Provide your own analysis of whether their suggestions are valid
   - Ask the user if they want to implement any of the suggestions

## Important Notes

- Use `codex exec` with `-s read-only` for safety (read-only sandbox)
- If the diff is very large, summarize the key changes instead of including everything
- If Codex raises concerns, critically evaluate them - they may or may not be valid
- Present both Codex's opinion AND your own analysis
- Be honest if you disagree with Codex's assessment

## Example Codex Prompt Structure

```
You are reviewing code changes in [PROJECT_NAME].

Tech stack: [DETECTED_TECHNOLOGIES]
Project description: [INFERRED_FROM_CONTEXT]

Recent commits:
[GIT LOG]

Current changes to review:
[GIT DIFF]

Please provide a thorough code review:
1. Are there any bugs or logic errors?
2. Security concerns?
3. Performance issues?
4. Code quality/maintainability issues?
5. Does this follow consistent patterns with the rest of the codebase?
6. Suggestions for improvement?

Be direct and critical. This is a real code review.
```

Now gather the context and execute the Codex review.
