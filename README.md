
# RecRust-Support Bot

Welcome to your new Ticket Support Bot! This bot is built to help you manage support tickets in your Discord server with ease. It comes packed with features for creating, claiming, closing, archiving, and transferring tickets between categories. Everything is set up so you can quickly make it your own and get started helping your community.

## Main Features

- **Ticket Creation:** Users can create tickets for different support types (general, cheater, unban, kit, etc.) via buttons and modals.
- **Claim/Unclaim Tickets:** Staff can claim or unclaim tickets to indicate responsibility.
- **Close & Archive Tickets:** Tickets can be closed and archived into specific categories, with user notifications.
- **Transfer Tickets:** Tickets can be moved between categories (e.g., from general to cheater).
- **Pending Approval:** Tickets can be marked as pending for staff review.
- **Customizable Embeds:** Ticket messages use custom images and server branding.

## How to Make It Your Own

To customize the bot for your server, follow these steps:

### 1. Update Image Assets
Edit `utils/imageAssets.js` to set your own banner and icon URLs:
```js
module.exports = {
  TICKET_BANNER_URL: 'YOUR_BANNER_IMAGE_URL',
  ICON_URL: 'YOUR_ICON_IMAGE_URL',
};
```
Replace the URLs with links to your server's images.

### 2. Configure Server Constants
Edit `utils/constants.js` to set your server name, category IDs, and staff role/server IDs:
```js
module.exports = {
  SERVER_NAME: 'Your Server Name',
  CATEGORY_IDS: {
    general: 'YOUR_GENERAL_CATEGORY_ID',
    cheater: 'YOUR_CHEATER_CATEGORY_ID',
    unban: 'YOUR_UNBAN_CATEGORY_ID',
    kit: 'YOUR_KIT_CATEGORY_ID',
  },
  ARCHIVE_CATEGORY_IDS: {
    cheater: 'YOUR_ARCHIVE_CHEATER_ID',
    general: 'YOUR_ARCHIVE_GENERAL_ID',
    appeal: 'YOUR_ARCHIVE_APPEAL_ID',
    kit: 'YOUR_ARCHIVE_KIT_ID',
    frivolous: 'YOUR_ARCHIVE_FRIVOLOUS_ID',
  },
  STAFF_ROLE_ID: 'YOUR_STAFF_ROLE_ID',
  STAFF_SERVER_ID: 'YOUR_SERVER_ID',
};
```
Get these IDs from your Discord server settings.

### 3. Add Discord Bot Token
Edit `.env` to set your discord bot token:
```js
TOKEN=<Your Token>
```

### 4. (Optional) Customize Ticket Types
Edit `utils/ticketConfig.js` to change ticket types, labels, and modal fields to fit your needs.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up your bot token and other secrets as needed (see your main bot file).
3. Start the bot:
   ```bash
   node index.js
   ```

## Support
For help, open an issue or contact me on Codefling or discord via discord, my username is "rubikal." (Dont forge the .)
