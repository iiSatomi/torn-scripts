# Torn scripting rules and API ToS reference

Checked against Torn's official pages on 2026-10-10. Use the links below as the current authority; Torn may revise the rules after this package is made.

## Official references

- [Rules for Scripts, Addons, Extensions & Tools](https://www.torn.com/forums.php?a=0&b=0&f=67&p=threads&t=16037108)
- [Updated Rules Page: Scripting & Scraping](https://www.torn.com/forums.php?a=0&b=0&f=1&p=threads&t=16534470)
- [Torn API documentation and API Terms of Service Guidelines](https://www.torn.com/api.html)
- [API v2 playground](https://api-playground.torn.com/)

## Working summary for script development

- Use data from Torn's API or from a page the player manually loaded and is actively viewing.
- Do not make additional non-API Torn requests unless the player directly and manually initiates them. Do not fetch or scrape pages the player is not actively viewing, bypass CAPTCHA, or automate gameplay actions.
- Torn's January 2026 clarification says actively viewing means the page is foreground, visible, and directly interacted with. Data extracted from background pages must not be used to send elsewhere, generate alerts, or draw attention to another page or window. The clarification also addresses WebSocket data.
- API tools must tell users how their API key and data are used. When storing or sharing either, Torn requires a clear disclosure at the key entry point covering data storage, sharing, purpose, key storage/sharing, and access level or selections.
- Request only the API selections needed. Protect keys and data, do not ask for Torn passwords, and avoid exposing keys in logs, source, screenshots, or shared fixtures.
- Recheck the official pages when designing or releasing a script. This note is a development aid, not a substitute for Torn's current rules.
