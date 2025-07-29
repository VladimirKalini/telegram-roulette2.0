import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT as string, 10),
});

// --- Функции создания таблиц ---
const createUsersTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      ton_address VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(queryText);
};

const createGiftsTable = async () => {
    const queryText = `
      CREATE TABLE IF NOT EXISTS gifts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        price_ton NUMERIC(10, 2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );
    `;
    await pool.query(queryText);
  };

const createUserGiftsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS user_gifts (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      gift_id INTEGER NOT NULL REFERENCES gifts(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await pool.query(queryText);
};

const createRoundsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS roulette_rounds (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) NOT NULL DEFAULT 'waiting',
        winner_id BIGINT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    );
  `;
  await pool.query(queryText);
};

const createBetsTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS roulette_bets (
        id SERIAL PRIMARY KEY,
        round_id INTEGER NOT NULL REFERENCES roulette_rounds(id),
        user_gift_id INTEGER NOT NULL REFERENCES user_gifts(id) UNIQUE,
        user_id BIGINT NOT NULL REFERENCES users(id)
    );
  `;
  await pool.query(queryText);
};


// --- Функции для работы с данными ---
const findOrCreateUser = async (id: number, username?: string) => {
  const queryText = `
    INSERT INTO users (id, username)
    VALUES ($1, $2)
    ON CONFLICT (id) DO NOTHING;
  `;
  await pool.query(queryText, [id, username]);
};

const getAllGifts = async () => {
  const result = await pool.query('SELECT * FROM gifts WHERE is_active = TRUE ORDER BY price_ton ASC;');
  return result.rows;
};

const getGiftById = async (giftId: number) => {
    const result = await pool.query('SELECT * FROM gifts WHERE id = $1', [giftId]);
    return result.rows[0]; 
};

const grantGiftToUser = async (userId: number, giftId: number) => {
    const queryText = `
      INSERT INTO user_gifts (user_id, gift_id)
      VALUES ($1, $2);
    `;
    await pool.query(queryText, [userId, giftId]);
};

const getUserGifts = async (userId: number) => {
  const queryText = `
    SELECT ug.id as user_gift_id, g.id, g.name, g.description, g.price_ton FROM user_gifts ug
    JOIN gifts g ON ug.gift_id = g.id
    WHERE ug.user_id = $1;
  `;
  const result = await pool.query(queryText, [userId]);
  return result.rows;
};

const seedGifts = async () => {
  const giftsToSeed = [
    { name: 'Кофе-латте', description: 'Согревающий напиток', price_ton: 1.50 },
    { name: 'Праздничный коктейль', description: 'Для особого случая', price_ton: 5.00 },
    { name: 'Золотой билет', description: 'Редкий коллекционный предмет', price_ton: 25.00 }
  ];

  const client = await pool.connect();
  try {
    for (const gift of giftsToSeed) {
      await client.query(
        'INSERT INTO gifts (name, description, price_ton) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [gift.name, gift.description, gift.price_ton]
      );
    }
  } finally {
    client.release();
  }
};

const getCurrentRound = async () => {
  let result = await pool.query("SELECT * FROM roulette_rounds WHERE status = 'waiting' ORDER BY created_at DESC LIMIT 1");
  if (result.rows.length === 0) {
    result = await pool.query("INSERT INTO roulette_rounds (status) VALUES ('waiting') RETURNING *");
  }
  return result.rows[0];
};

const placeBet = async (roundId: number, userGiftId: number, userId: number) => {
  const queryText = `
    INSERT INTO roulette_bets (round_id, user_gift_id, user_id)
    VALUES ($1, $2, $3);
  `;
  await pool.query(queryText, [roundId, userGiftId, userId]);
};


// Экспортируем все наши функции
export { 
    pool, 
    createUsersTable, 
    findOrCreateUser, 
    createGiftsTable, 
    createUserGiftsTable, 
    getAllGifts, 
    seedGifts, 
    getGiftById, 
    grantGiftToUser,
    getUserGifts,
    createRoundsTable,
    createBetsTable,
    getCurrentRound,
    placeBet
};
