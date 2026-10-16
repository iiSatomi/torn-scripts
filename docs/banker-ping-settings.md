# Banker Ping: configure the Discord destination

Banker Ping 1.4.1 reads its Discord webhook from userscript settings instead of embedding a working credential in source.

Open the userscript manager's menu for **Torn Faction Chat – Banker Ping to Discord** and choose **Configure Discord webhook**. Paste your own HTTPS `discord.com` webhook destination. Cancel keeps the existing setting; blank disables forwarding. Invalid destinations are rejected. The script does not display or log the saved URL.

Until a valid destination is configured, no Discord requests are sent. Desktop userscript managers own the setting. Torn PDA's GM compatibility storage uses shared WebView storage; it is not a secret vault.

A working webhook existed in an older public source copy. Remove or rotate that webhook in Discord before configuring its replacement. Removing a literal from the current file does not revoke a credential or erase old repository versions. Never paste the replacement into source or public documentation.
