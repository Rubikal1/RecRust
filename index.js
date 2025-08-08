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

  // Strict check: if channel is archived or closed, prevent DM forwarding
if (!channel || ARCHIVE_CATEGORY_IDS.includes(channel.parentId) || channel.name.startsWith('closed-')) return;


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
const REMINDER_INTERVAL_MS = 60 * 1000; // check every 1 min
const REM_THRESHOLDS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000]; // 5m, 30m, 1h
const STAFF_ROLE_ID = '1384325547097849956';

// Helpers: store reminder stage in channel topic as "[rem:N]"
function getReminderStageFromTopic(topic) {
  if (!topic) return 0;
  const m = topic.match(/\[rem:(\d)\]/);
  const n = m ? parseInt(m[1], 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function setReminderStageInTopic(channel, stage) {
  try {
    const current = channel.topic || '';
    const next = current.includes('[rem:')
      ? current.replace(/\[rem:\d\]/, `[rem:${stage}]`)
      : (current ? `${current} [rem:${stage}]` : `[rem:${stage}]`);
    if (next !== current) await channel.setTopic(next);
  } catch (e) {
    console.warn('[Reminders] Unable to set topic for channel', channel.id, e?.message || e);
  }
}

setInterval(async () => {
  let userMap = {};
  if (fs.existsSync(USER_MAP_PATH)) {
    try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
  }
  const now = Date.now();

  for (const [ticketId, data] of Object.entries(userMap)) {
    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel) continue;

    // Skip archived channels
    if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) continue;

    // Determine status: Pending via name; Unclaimed via embed text
    const isPending = channel.name.startsWith('pending-');

    // Fetch a handful of recent messages to find the staff embed
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const botMsg = msgs ? Array.from(msgs.values()).find(m => m.author?.id === client.user.id && m.embeds?.length) : null;
    const embed = botMsg?.embeds?.[0];
    const desc = embed?.description || '';
    const isUnclaimed = /\*\*Assigned to:\*\*\s*Unclaimed/i.test(desc);

    // If neither pending nor unclaimed, no reminders needed
    if (!isPending && !isUnclaimed) continue;

    // Elapsed since channel creation
    const createdAt = channel.createdTimestamp || (Date.parse(channel.createdAt) || now);
    const elapsed = now - createdAt;

    // Compute which threshold we're at: 0 (none), 1 (5m), 2 (30m), 3 (1h)
    let targetStage = 0;
    if (elapsed >= REM_THRESHOLDS_MS[0]) targetStage = 1;
    if (elapsed >= REM_THRESHOLDS_MS[1]) targetStage = 2;
    if (elapsed >= REM_THRESHOLDS_MS[2]) targetStage = 3;

    const currentStage = getReminderStageFromTopic(channel.topic);
    if (targetStage > currentStage) {
      // Send the appropriate reminder once per stage
      try {
        if (targetStage === 1) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⚠️ This ticket has not been handled for **5 minutes** (${isPending ? 'pending approval' : 'unclaimed'}).`);
        } else if (targetStage === 2) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⏰ **30 minutes** elapsed and this ticket is still ${isPending ? 'pending' : 'unclaimed'}. Please take action.`);
        } else if (targetStage === 3) {
          await channel.send(`<@&${STAFF_ROLE_ID}> ⛳ **1 hour** elapsed — ticket remains ${isPending ? 'pending approval' : 'unclaimed'}. Prioritize this.`);
        }
      } catch (e) {
        console.warn('[Reminders] Failed to send reminder in', channel.id, e?.message || e);
      }
      await setReminderStageInTopic(channel, targetStage);
    }
  }
}, REMINDER_INTERVAL_MS);



client.login(process.env.TOKEN);
