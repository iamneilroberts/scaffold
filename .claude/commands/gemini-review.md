# Gemini External Review

You are invoking Google Gemini CLI as an external reviewer to get a second opinion on the current work.

## Your Task

1. **Gather Context** - Collect information about the current project and recent work:
   - Read the project's CLAUDE.md if it exists
   - Check for memory-bank/, docs/, or .claude/worklog/ for project context
   - Run `git status` and `git diff --stat` to see current changes
   - Run `git diff` to get the actual diff content (limit to reasonable size)
   - Run `git log --oneline -10` to see recent commits
   - Identify the main technologies (check package.json, Cargo.toml, pyproject.toml, etc.)
   - Note the current working directory and project structure

2. **Prepare the Review Request** - Create a detailed prompt for Gemini that includes:
   - Project name and description (infer from context)
   - Main technologies detected
   - Summary of recent changes (staged and unstaged)
   - The actual diff or code changes
   - Specific questions or areas where review is needed
   - Ask Gemini to act as a senior engineer reviewer

3. **Execute Gemini Review** - Run Gemini in non-interactive mode:
   ```bash
   gemini -p "PROMPT_HERE"
   ```

   The prompt should ask Gemini to:
   - Review the current changes for bugs, security issues, and best practices
   - Identify any architectural concerns
   - Suggest improvements or alternative approaches
   - Point out anything that looks problematic
   - Be direct and critical - this is a code review, not a validation

4. **Present Results** - After getting Gemini's response:
   - Summarize the key findings
   - Highlight any critical issues or concerns raised
   - Note any disagreements you have with Gemini's assessment
   - Provide your own analysis of whether their suggestions are valid
   - Ask the user if they want to implement any of the suggestions

## Important Notes

- Use `gemini -p` for non-interactive prompt mode
- If the diff is very large, summarize the key changes instead of including everything
- If Gemini raises concerns, critically evaluate them - they may or may not be valid
- Present both Gemini's opinion AND your own analysis
- Be honest if you disagree with Gemini's assessment

## Example Gemini Prompt Structure

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

Now gather the context and execute the Gemini review.
