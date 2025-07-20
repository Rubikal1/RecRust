// commands/refresh-buttons.js
// Slash command: /refresh-buttons (staff only, reposts main ticket action row)

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Should match your ticketUserMap.json location
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh-buttons')
    .setDescription('Repost the main ticket action buttons (staff only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    // Only allow in ticket channels
    const channel = interaction.channel;
    const ticketId = channel.name.replace(/^claimed-|^pending-|^/, '').toUpperCase();

    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try { userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8')); } catch { userMap = {}; }
    }
    if (!userMap[ticketId]) {
      return interaction.reply({ content: '❌ This is not a valid ticket channel.', ephemeral: true });
    }

    // Main button row
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${ticketId}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
  .setCustomId(`close_${ticketId}`)
  .setLabel('Close')
  .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`pending_${ticketId}`)
        .setLabel('Pending Approval')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`transfer_${ticketId}`)
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Secondary)
    );
    await channel.send({ content: ':arrows_counterclockwise: Refreshed buttons.', components: [row] });
    await interaction.reply({ content: '✅ Ticket action buttons refreshed!', ephemeral: true });
  },
};
