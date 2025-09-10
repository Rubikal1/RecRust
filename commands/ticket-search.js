// commands/ticket-search.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');

const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');
const ICON_URL = 'https://cdn3.mapstr.gg/07fbafb53502931e3416fe9a8b8b734d.png';

// These are the archived category IDs
const ARCHIVE_CATEGORY_IDS = [
 '1415094996721336449',
'1415094996721336448',
'1415094996721336450',
'1415094996893438086',
'1415094996893438087'
];

function formatTicketLine(ticketId, data, channel, status) {
  return `\n\u200b\n> **Ticket:** \`${ticketId}\`\n> **Type:** ${data.type?.charAt(0).toUpperCase() + data.type?.slice(1) || 'Unknown'}\n> **Channel:** <#${data.channelId}>\n> **Status:** ${status}`;
}

async function getStatusEmoji(channel) {
  if (!channel) return '❓ Unknown';
  if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) return '🗄️ Closed';
  if (channel.name.startsWith('claimed-')) return '🟡 Claimed';
  return '🟢 Open';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-search')
    .setDescription('Find all tickets by Steam64 ID or Discord User ID')
    .addStringOption(option =>
      option.setName('input')
        .setDescription('Steam64 ID (17 digits) or Discord User ID')
        .setMaxLength(25)
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const input = interaction.options.getString('input');
    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try {
        userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
      } catch {
        userMap = {};
      }
    }

    // 0. Try matching Ticket ID directly
    let matches = [];
    let matchType = '';
    if (userMap[input]) {
      matches = [[input, userMap[input]]];
      matchType = 'Ticket ID';
    } else {
      // 1. Try matching SteamID
      matches = Object.entries(userMap).filter(
        ([, data]) => data.steamid === input
      );
      matchType = 'SteamID';
      // 2. If no steamid matches, try Discord userId
      if (!matches.length) {
        matches = Object.entries(userMap).filter(
          ([, data]) => data.userId === input
        );
        if (!matches.length) {
          return interaction.reply({ content: `No tickets found for \`${input}\`.`, ephemeral: true });
        }
        matchType = 'Discord ID';
      }
    }

    // 3. Load channel status
    const resultLines = [];
    for (const [ticketId, data] of matches) {
      const channel = await interaction.client.channels.fetch(data.channelId).catch(() => null);
      const status = await getStatusEmoji(channel);
      resultLines.push(formatTicketLine(ticketId, data, channel, status));
    }

    // 4. Respond with formatted embed
    const embed = new EmbedBuilder()
      .setTitle(`Tickets for ${matchType}: ${input}`)
      .setColor(0x3498db)
      .setDescription(resultLines.join('\n'))
      .setFooter({ text: 'Inferno Search', iconURL: ICON_URL })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
