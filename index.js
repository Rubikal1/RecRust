const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Needed to DM users!
});

// Export client globally for all handlers to use (for DMs)
module.exports.client = client;
global.client = client; // Also attach to global for old handler logic

// --- Command loader ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// --- Interaction handlers ---
const handleButton = require('./interactions/buttons.js');
const handleModal = require('./interactions/modals.js');

client.on('interactionCreate', async interaction => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
      }
      return;
    }
    // Buttons
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    // Modals
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
    // Add select menu, etc as needed
  } catch (err) {
    console.error('Interaction Handler Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
      } catch {}
    }
  }
});

// --- Forward user DMs to their open ticket channel ---
const USER_MAP_PATH = path.join(__dirname, 'utils/ticketUserMap.json');
const ARCHIVE_CATEGORY_IDS = [
  '1394825374902390895', // cheater archive example
  '1394825412114120842', // general archive
  '1394825437489795133', // appeal archive
  '1394825454057164850', // kit archive
  '1394911105427443752', // frivolous archive
];

client.on('messageCreate', async message => {
  // Ignore bots or non-DMs
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // DM channel

  const userId = message.author.id;

  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try {
      userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
    } catch {
      userMap = {};
    }
  }

  // Find open ticket for this user
  const ticketEntry = Object.entries(userMap).find(([ticketId, data]) => data.userId === userId);

if (!ticketEntry) {
  try {
    await message.reply(
      "❌ You don't have any active tickets.\nPlease open one in <#1382846021377462272>."
    );
  } catch (err) {
    console.warn('[DM Handler] Failed to reply to user without ticket:', err);
  }
  return;
}


  const [ticketId, ticketData] = ticketEntry;

  // Fetch the ticket channel
  const channel = await client.channels.fetch(ticketData.channelId).catch(() => null);
  if (!channel) return;

  // Skip if channel archived
  if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) return;

  // Forward message content + attachments to ticket channel
channel.send({
  content: `**${message.author.username}**: ${message.content}`,
  files: message.attachments.size > 0 ? [...message.attachments.values()] : []
});
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// --- Auto Reminder System for Tickets ---
const TICKET_REMINDER_INTERVAL = 60 * 1000; // 1 min check interval
const UNCLAIMED_THRESHOLD = 5 * 60 * 1000; // 5 minutes (adjust as needed)
const PENDING_THRESHOLD = 20 * 60 * 1000; // 20 minutes
const STAFF_ROLE_ID = '1384325547097849956';
setInterval(async () => {
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
  }
  const now = Date.now();

  for (const [ticketId, data] of Object.entries(userMap)) {
    // Fetch channel
    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel) continue;
    // Skip archived
    if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) continue;

    // Get last message in channel for claim/pending status (inefficient but works)
    const msgs = await channel.messages.fetch({ limit: 10 });
    const lastBotMsg = Array.from(msgs.values()).find(m => m.author.id === client.user.id);
    const embed = lastBotMsg?.embeds?.[0];

    // Unclaimed reminder
    if (embed && embed.description && embed.description.includes('Assigned to:** Unclaimed')) {
      // Check for previous reminders (avoid spamming)
      if (!channel.lastUnclaimedReminder || now - (channel.lastUnclaimedReminder || 0) > UNCLAIMED_THRESHOLD) {
        channel.lastUnclaimedReminder = now;
        await channel.send(`<@&${STAFF_ROLE_ID}> ⚠️ This ticket has not been claimed after 5 minutes!`);
      }
    }

    // Pending reminder
    if (channel.name.startsWith('pending-')) {
      if (!channel.lastPendingReminder || now - (channel.lastPendingReminder || 0) > PENDING_THRESHOLD) {
        channel.lastPendingReminder = now;
        await channel.send(`<@&${STAFF_ROLE_ID}> ⏳ This ticket has been pending approval for 20 minutes!`);
      }
    }
  }
}, TICKET_REMINDER_INTERVAL);


client.login(process.env.TOKEN);
