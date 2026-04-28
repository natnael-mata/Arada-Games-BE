const db = require('./db');
const { createGames } = require('./data/games');

async function init() {
  try {
    console.log('Initializing database...');

    // Drop tables for a clean start (be careful in production!)
    await db.query('DROP TABLE IF EXISTS games');
    await db.query('DROP TABLE IF EXISTS contact_submissions');
    await db.query('DROP TABLE IF EXISTS users');

    // Create games table
    await db.query(`
      CREATE TABLE games (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        image VARCHAR(255),
        route VARCHAR(255),
        modeLabel VARCHAR(255),
        playerCountLabel VARCHAR(255),
        rating INT,
        launchType VARCHAR(50),
        launchUrl VARCHAR(255),
        requiresHealthCheck BOOLEAN DEFAULT FALSE
      )
    `);

    // Create contact_submissions table
    await db.query(`
      CREATE TABLE contact_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        phoneNumber VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await db.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed games
    console.log('Seeding games...');
    const games = createGames({ archersWebUrl: 'http://localhost:8081/' });
    
    for (const game of games) {
      await db.query(
        'INSERT INTO games (slug, name, image, route, modeLabel, playerCountLabel, rating, launchType, launchUrl, requiresHealthCheck) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          game.slug,
          game.name,
          game.image,
          game.route,
          game.modeLabel,
          game.playerCountLabel,
          game.rating,
          game.launch.type,
          game.launch.url,
          game.launch.requiresHealthCheck
        ]
      );
    }

    // Seed a default admin user
    console.log('Seeding admin user...');
    await db.query(
      'INSERT INTO users (user_id, password, status) VALUES (?, ?, ?)',
      ['admin', 'admin123', 'active']
    );

    // Seed the user requested by the user for testing
    console.log('Seeding test user...');
    await db.query(
      'INSERT INTO users (user_id, password, status) VALUES (?, ?, ?)',
      ['251943016897', 'pass1234', 'active']
    );

    console.log('Database initialization successful.');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

init();
