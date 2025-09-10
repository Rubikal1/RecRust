// utils/ticketConfig.js

module.exports = [
  {
    id: 'general',
    label: 'General Support',
    style: 'Primary', // Changed to blue
    categoryName: 'General Tickets',
    modalTitle: 'Inferno – General Support',
    fields: [
      {
        customId: 'steamid',
        label: 'What is your Steam64 ID?',
        style: 1,
        placeholder: 'Get your Steam64ID at https://steamidcheck.com',
        maxLength: 17
      },
      {
        customId: 'issue',
        label: 'What is your issue?',
        style: 1,
        placeholder: 'Describe your issue here',
        maxLength: 3000
      }
    ]
  },
  {
    id: 'cheater',
    label: 'Cheater Report',
    style: 'Danger', // Red
    categoryName: 'Cheater Reports',
    modalTitle: 'Inferno – Cheater Report',
    fields: [
      {
        customId: 'steamid',
        label: 'What is your Steam64 ID?',
        style: 1,
        placeholder: 'Get your Steam64ID at https://steamidcheck.com',
        maxLength: 17
      },
      {
        customId: 'reportedid',
        label: 'Who are you reporting (Steam64 ID)?',
        style: 2,
        placeholder: 'Steam64ID of the player you are reporting',
        maxLength: 17
      },
      {
        customId: 'reason',
        label: 'Why are you reporting the player?',
        style: 2,
        placeholder: 'Describe what the player is doing',
        maxLength: 3000
      },
      {
        customId: 'evidence',
        label: 'Do you have evidence?',
        style: 2,
        placeholder: 'Provide any evidence you might have here',
        maxLength: 3000
      }
    ]
  },
  {
    id: 'unban',
    label: 'Unban Appeal',
    style: 'Secondary', // Gray
    categoryName: 'Unban Appeals',
    modalTitle: 'Inferno – Unban Appeal',
    fields: [
      {
        customId: 'steamid',
        label: 'What is your Steam64 ID?',
        style: 1,
        placeholder: 'Get your Steam64ID at https://steamidcheck.com',
        maxLength: 17
      },
      {
        customId: 'alts',
        label: 'Do you have any alt accounts?',
        style: 2,
        placeholder: 'Excluding any of your alts will result in denial of your appeal',
        maxLength: 3000
      },
      {
        customId: 'reason',
        label: 'Why should we unban you?',
        style: 2,
        placeholder: 'Describe why we should unban you',
        maxLength: 3000
      }
    ]
  },
  {
    id: 'kit',
    label: 'Kit Support',
    style: 'Success', // Greensss
    categoryName: 'Kit Support Tickets',
    modalTitle: 'Inferno – Kit Support',
    fields: [
      {
        customId: 'steamid',
        label: 'What is your Steam64 ID?',
        style: 1,
        placeholder: 'Get your Steam64ID at https://steamidcheck.com',
        maxLength: 17
      },
      {
        customId: 'description',
        label: 'Describe your kit issue',
        style: 2,
        placeholder: 'Explain the problem you are having with your kit.',
        maxLength: 3000
      }
    ]
  }
];
