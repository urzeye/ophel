# Usage Monitor

For AI services with daily usage limits, Ophel provides a local counter to help you track how many turns you've used today and roughly how many tokens were consumed.

## How It Works

The usage monitor runs entirely locally. It doesn't call any external APIs and doesn't rely on usage data from the platform — Ophel counts and estimates by observing messages on the page.

The counter is displayed near the input field on supported sites and shows:

- Number of conversation turns today (messages sent)
- Estimated input token count
- Estimated output token count
- A progress bar showing used / daily limit (optional)

> Token estimates are based on simple character counting and may differ from the platform's actual billing. Treat them as a rough reference only.

## Enabling the Monitor

**Settings → Features → Usage Monitor**:

| Setting     | Description                                                        | Default |
| ----------- | ------------------------------------------------------------------ | ------- |
| Enable      | Show the usage monitor widget                                      | Off     |
| Daily limit | Your expected daily usage cap (used to calculate the progress bar) | 100     |
| Auto reset  | Automatically reset the count at midnight                          | Off     |

## Use Cases

- Subscription plans with quotas, such as Gemini Advanced
- Situations where you're distributing usage across multiple accounts
- Getting a rough picture of your AI usage habits

The usage monitor is a reference tool only. It cannot prevent you from exceeding a platform's limit, and does not represent the platform's actual billing or quota consumption.
