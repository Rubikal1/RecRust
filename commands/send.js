const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const USER_MAP_PATH = path.join(__dirname, '../utils/ticketUserMap.json');

const ARCHIVE_CATEGORY_IDS = [
 '1415094996721336449',
'1415094996721336448',
'1415094996721336450',
'1415094996893438086',
'1415094996893438087'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a DM to the ticket opener if ticket is open and post in ticket channel')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message to send')
        .setRequired(true)
    ),
  async execute(interaction) {
    const channel = interaction.channel;
    if (!channel) {
      return interaction.reply({ content: '❌ This command can only be used in a ticket channel.', ephemeral: true });
    }

    if (ARCHIVE_CATEGORY_IDS.includes(channel.parentId)) {
      return interaction.reply({ content: '❌ This ticket is closed or archived. Cannot send message.', ephemeral: true });
    }

    // Extract ticket ID (strip claimed- or pending- prefixes)
    const ticketId = channel.name.replace(/^(claimed-|pending-)/, '').toUpperCase();

    let userMap = {};
    if (fs.existsSync(USER_MAP_PATH)) {
      try {
        userMap = JSON.parse(fs.readFileSync(USER_MAP_PATH, 'utf8'));
      } catch {
        userMap = {};
      }
    }

    if (!userMap[ticketId]) {
      return interaction.reply({ content: '❌ No user info found for this ticket.', ephemeral: true });
    }

    const userId = userMap[ticketId].userId;
    const messageToSend = interaction.options.getString('message');

    try {
      const user = await interaction.client.users.fetch(userId);
      const senderUser = await interaction.client.users.fetch(interaction.user.id);
      // DM the user
      await user.send(`**${senderUser.username.toLowerCase()}**: ${messageToSend}`);
      // Post in the staff ticket channel as well
      await channel.send({
        content: `**[DM Sent to <@${userId}>]**\n**${senderUser.username}:** ${messageToSend}`
      });
      await interaction.reply({ content: `✅ Message sent to <@${userId}> and posted in this ticket.`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ Failed to send message: ${error.message}`, ephemeral: true });
    }
  },
};
