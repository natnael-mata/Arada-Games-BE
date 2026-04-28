function createGames(config) {
  return [
    {
      slug: 'escape-demb',
      name: 'Escape Demb',
      image: '/assets/images/escape-demb.png',
      route: '/aradagame/escape-demb',
      modeLabel: 'Multiplayer',
      playerCountLabel: '1k players',
      rating: 5,
      launch: {
        type: 'asset',
        url: '/assets/aradaGameWB/escape-d/index.html',
        requiresHealthCheck: false,
      },
    },
    {
      slug: 'archerswebb',
      name: 'ArchersWebb',
      image: '/assets/aradaGameWB/ArchersWebb/client/index.png',
      route: '/aradagame/archerswebb',
      modeLabel: 'Multiplayer',
      playerCountLabel: 'Live server',
      rating: 5,
      launch: {
        type: 'external',
        url: config.archersWebUrl,
        requiresHealthCheck: true,
      },
    },
    {
      slug: 'xo',
      name: 'XO',
      image: '/assets/images/XO.png',
      route: '/aradagame/xo',
      modeLabel: 'Multiplayer',
      playerCountLabel: '1k players',
      rating: 5,
      launch: {
        type: 'asset',
        url: '/assets/aradaGameWB/xo/index.html',
        requiresHealthCheck: false,
      },
    },
    {
      slug: 'my-planet',
      name: 'My Planet',
      image: '/assets/images/My Planet.png',
      route: '/aradagame/my-planet',
      modeLabel: 'Multiplayer',
      playerCountLabel: '1k players',
      rating: 5,
      launch: {
        type: 'asset',
        url: '/assets/aradaGameWB/my_plante_defence/index.html',
        requiresHealthCheck: false,
      },
    },
    {
      slug: 'one-eye',
      name: 'One Eye',
      image: '/assets/images/One Eye.png',
      route: '/aradagame/one-eye',
      modeLabel: 'Multiplayer',
      playerCountLabel: '1k players',
      rating: 5,
      launch: {
        type: 'asset',
        url: '/assets/aradaGameWB/one_eye/index.html',
        requiresHealthCheck: false,
      },
    },
  ];
}

module.exports = {
  createGames,
};
