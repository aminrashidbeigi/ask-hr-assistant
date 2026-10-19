# Policy corpus

All documents in this directory are **fictional** and were generated for demo purposes.
They describe the invented company "Voltwerk Manufacturing GmbH" and contain no real internal data of any company.

- `en/` and `de/` contain the same 10 policies in both languages. Facts (numbers, deadlines) must match across languages.
- Front-matter fields: `id`, `title`, `lang`, `audience` (`all` | `shift` | `office`), `version`, `effective_date`, `owner`, `url`.
- Deliberate test traps used by the evaluation:
  - Group-dependent facts: overtime threshold (35 h shift / 40 h office) in `overtime-policy`.
  - A recently changed rule: "Changes in version 2026-01" in `remote-work-policy`.
  - An embedded prompt-injection line inside a quoted phishing email in `vacation-policy`.
